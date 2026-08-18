begin;

alter table public.support_case_assignments
  add column expires_at timestamptz,
  add column permissions text[] not null default array['read','internal_note','evidence']::text[],
  add column ended_reason text,
  add constraint support_assignment_expiry_check check (expires_at is null or expires_at>assigned_at),
  add constraint support_assignment_permissions_check check (
    permissions<@array['read','internal_note','evidence','exact_location']::text[] and 'read'=any(permissions)
  );

create table public.support_case_access_grants (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.support_cases(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  access_type text not null check (access_type in ('temporary','escalation')),
  permissions text[] not null,
  reason text not null check (char_length(trim(reason)) between 5 and 2000),
  granted_by uuid not null references public.profiles(id),
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id),
  revoked_reason text,
  created_at timestamptz not null default now(),
  check (expires_at>starts_at and expires_at<=starts_at+interval '24 hours'),
  check (permissions<@array['read','internal_note','evidence','exact_location']::text[] and 'read'=any(permissions))
);
create unique index one_active_support_case_grant
  on public.support_case_access_grants(case_id,user_id,access_type)
  where revoked_at is null;
alter table public.support_case_access_grants enable row level security;

insert into public.admin_permissions(key,description,risk_level) values
  ('operations.marketplace.read','Operations-wide marketplace record access','high'),
  ('operations.notifications.read','Operations-wide notification delivery access','high'),
  ('operations.exact_location.read','Reasoned and audited exact-location access','critical')
on conflict(key) do update set description=excluded.description,risk_level=excluded.risk_level;

delete from public.admin_role_permissions arp
using public.admin_roles ar,public.admin_permissions ap
where arp.admin_role_id=ar.id and arp.permission_id=ap.id
  and ar.key='support' and ap.key in ('customer.pii.read','job.exact_location.read');
delete from public.admin_role_permissions arp
using public.admin_roles ar,public.admin_permissions ap
where arp.admin_role_id=ar.id and arp.permission_id=ap.id
  and ar.key='operations' and ap.key in ('support.case.read','job.exact_location.read');
insert into public.admin_role_permissions(admin_role_id,permission_id)
select ar.id,ap.id from public.admin_roles ar cross join public.admin_permissions ap
where (ar.key='operations' and ap.key in (
  'operations.marketplace.read','operations.notifications.read','operations.exact_location.read'
)) or ar.key='super'
on conflict do nothing;

create function private.has_support_case_access_for(
  p_user_id uuid,p_case_id uuid,p_capability text default 'read'
) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.profiles p
    join public.user_roles ur on ur.user_id=p.id
    where p.id=p_user_id and p.status='active' and ur.role='support_agent' and ur.revoked_at is null
      and (
        exists(
          select 1 from public.support_case_assignments a
          where a.case_id=p_case_id and a.assignee_id=p_user_id and a.ended_at is null
            and (a.expires_at is null or a.expires_at>now()) and p_capability=any(a.permissions)
        )
        or exists(
          select 1 from public.support_case_access_grants g
          where g.case_id=p_case_id and g.user_id=p_user_id and g.revoked_at is null
            and g.starts_at<=now() and g.expires_at>now() and p_capability=any(g.permissions)
        )
      )
  )
$$;

create function private.has_support_case_access(
  p_case_id uuid,p_capability text default 'read'
) returns boolean
language sql stable security definer set search_path='' as $$
  select private.has_support_case_access_for(auth.uid(),p_case_id,p_capability)
$$;

create function private.has_linked_support_request_access(
  p_request_id uuid,p_capability text default 'read'
) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.support_cases c
    where (
      c.request_id=p_request_id
      or exists(select 1 from public.jobs j where j.id=c.job_id and j.request_id=p_request_id)
    ) and private.has_support_case_access(c.id,p_capability)
  )
$$;

create function private.has_linked_support_job_access(
  p_job_id uuid,p_capability text default 'read'
) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.support_cases c
    where c.job_id=p_job_id and private.has_support_case_access(c.id,p_capability)
  )
$$;

create function private.has_support_subject_access(p_subject_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.support_cases c
    left join public.jobs j on j.id=c.job_id
    left join public.service_requests r on r.id=coalesce(c.request_id,j.request_id)
    where private.has_support_case_access(c.id,'read')
      and p_subject_id in (c.opened_by,j.customer_id,j.provider_id,r.customer_id)
  )
$$;

create function private.has_cancellation_financial_access(p_cancellation_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select private.has_role(array['finance_reviewer','super_admin']::public.user_role[])
    and exists(select 1 from public.financial_action_intents fai
      where fai.source_type='cancellation' and fai.source_id=p_cancellation_id)
$$;

create function private.guard_support_case_scoped_command() returns trigger
language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid();
  target_job uuid;
  target_request uuid;
begin
  if actor is null or new.actor_id is distinct from actor
    or not private.has_role(array['support_agent']::public.user_role[])
    or private.has_role(array['operations_admin','finance_reviewer','super_admin']::public.user_role[]) then
    return new;
  end if;
  if tg_table_name='resolution_actions' then
    select d.job_id into target_job from public.disputes d where d.id=new.dispute_id;
  elsif tg_table_name='cancellation_decisions' then
    select c.job_id,c.request_id into target_job,target_request
    from public.cancellation_requests c where c.id=new.cancellation_request_id;
  end if;
  if not exists(
    select 1 from public.support_cases c
    where (c.job_id=target_job or c.request_id=target_request)
      and private.has_support_case_access_for(actor,c.id,'read')
  ) then
    raise exception 'SUPPORT_CASE_SCOPE_REQUIRED';
  end if;
  return new;
end $$;
create trigger resolution_actions_support_scope
before insert on public.resolution_actions
for each row execute function private.guard_support_case_scoped_command();
create trigger cancellation_decisions_support_scope
before insert on public.cancellation_decisions
for each row execute function private.guard_support_case_scoped_command();

create or replace function private.can_read_request(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.service_requests r where r.id=target and r.customer_id=auth.uid())
  or exists(select 1 from public.request_provider_matches m where m.request_id=target and m.provider_id=auth.uid()
    and m.status in ('invited','viewed','offered','selected'))
  or private.has_linked_support_request_access(target,'read')
  or private.has_admin_permission('operations.marketplace.read')
$$;

create or replace function private.can_access_job(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.jobs j where j.id=target and auth.uid() in (j.customer_id,j.provider_id))
  or private.has_linked_support_job_access(target,'read')
  or private.has_admin_permission('operations.marketplace.read')
$$;

drop policy profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles for select
using(
  id=auth.uid() or private.has_support_subject_access(id)
  or private.has_admin_permission('operations.marketplace.read')
  or private.has_admin_permission('provider.document.read')
);
drop policy provider_profile_private on public.provider_profiles;
create policy provider_profile_private on public.provider_profiles for select
using(
  user_id=auth.uid() or private.has_support_subject_access(user_id)
  or private.has_admin_permission('operations.marketplace.read')
  or private.has_admin_permission('provider.document.read')
);
drop policy addresses_authorized_read on public.addresses;
create policy addresses_authorized_read on public.addresses for select
using(
  user_id=auth.uid()
  or exists(select 1 from public.jobs j where j.exact_address_id=addresses.id
    and j.provider_id=auth.uid() and j.status not in ('completed','cancelled'))
);
drop policy jobs_participants on public.jobs;
create policy jobs_participants on public.jobs for select using(private.can_access_job(id));
drop policy support_cases_participants on public.support_cases;
create policy support_cases_participants on public.support_cases for select
using(
  opened_by=auth.uid() or private.has_support_case_access(id,'read')
  or private.has_admin_permission('operations.marketplace.read')
);
drop policy support_messages_participants on public.support_case_messages;
create policy support_messages_participants on public.support_case_messages for select
using(
  (visible_to_user and exists(select 1 from public.support_cases c
    where c.id=support_case_messages.case_id and c.opened_by=auth.uid()))
  or private.has_support_case_access(case_id,'read')
  or private.has_admin_permission('operations.marketplace.read')
);
drop policy support_evidence_participants on public.support_case_evidence;
create policy support_evidence_participants on public.support_case_evidence for select
using(
  exists(select 1 from public.support_cases c where c.id=support_case_evidence.case_id and c.opened_by=auth.uid())
  or private.has_support_case_access(case_id,'evidence')
  or private.has_admin_permission('operations.marketplace.read')
);
drop policy support_internal_staff on public.support_internal_notes;
create policy support_internal_staff on public.support_internal_notes for select
using(
  private.has_support_case_access(case_id,'internal_note')
);
create policy support_assignments_scoped_read on public.support_case_assignments for select
using(
  assignee_id=auth.uid() or private.has_support_case_access(case_id,'read')
  or private.has_admin_permission('operations.marketplace.read')
);
create policy support_grants_scoped_read on public.support_case_access_grants for select
using(
  user_id=auth.uid() or private.has_support_case_access(case_id,'read')
  or private.has_admin_permission('operations.marketplace.read')
);
drop policy notification_owner on public.notification_outbox;
create policy notification_owner on public.notification_outbox for select
using(user_id=auth.uid() or private.has_admin_permission('operations.notifications.read'));

-- Remove the remaining legacy `is_admin()` read gateways. Support access is
-- always derived from an active case assignment/grant; operations-wide reads
-- use the distinct operations permissions introduced above.
drop policy job_location_participants on public.job_location_updates;
create policy job_location_participants on public.job_location_updates for select
using(
  expires_at>now()
  and exists(select 1 from public.jobs j where j.id=job_location_updates.job_id
    and auth.uid() in (j.customer_id,j.provider_id))
);

drop policy file_upload_owner_read on public.file_uploads;
create policy file_upload_owner_read on public.file_uploads for select
using(user_id=auth.uid());

drop policy ai_sessions_owner on public.ai_sessions;
create policy ai_sessions_owner on public.ai_sessions for select using(user_id=auth.uid());
drop policy ai_messages_owner on public.ai_messages;
create policy ai_messages_owner on public.ai_messages for select
using(exists(select 1 from public.ai_sessions s where s.id=ai_messages.session_id and s.user_id=auth.uid()));
drop policy ai_diagnostics_owner on public.ai_diagnostics;
create policy ai_diagnostics_owner on public.ai_diagnostics for select
using(exists(select 1 from public.ai_sessions s where s.id=ai_diagnostics.session_id and s.user_id=auth.uid()));
drop policy ai_usage_owner on public.ai_usage_events;
create policy ai_usage_owner on public.ai_usage_events for select using(user_id=auth.uid());
drop policy transcription_owner on public.transcription_jobs;
create policy transcription_owner on public.transcription_jobs for select using(user_id=auth.uid());

drop policy cancellations_participants on public.cancellation_requests;
create policy cancellations_participants on public.cancellation_requests for select
using(
  requester_id=auth.uid()
  or (job_id is not null and private.can_access_job(job_id))
  or (request_id is not null and private.has_linked_support_request_access(request_id,'read'))
  or private.has_cancellation_financial_access(id)
  or private.has_admin_permission('operations.marketplace.read')
);
drop policy cancellation_decisions_participants_read on public.cancellation_decisions;
create policy cancellation_decisions_participants_read on public.cancellation_decisions for select
using(exists(
  select 1 from public.cancellation_requests c
  where c.id=cancellation_decisions.cancellation_request_id and (
    c.requester_id=auth.uid()
    or (c.job_id is not null and private.can_access_job(c.job_id))
    or (c.request_id is not null and private.has_linked_support_request_access(c.request_id,'read'))
    or private.has_cancellation_financial_access(c.id)
    or private.has_admin_permission('operations.marketplace.read')
  )
));

drop policy matching_candidates_provider_staff on public.matching_candidates;
create policy matching_candidates_provider_staff on public.matching_candidates for select
using(
  provider_id=auth.uid()
  or exists(select 1 from public.matching_runs mr where mr.id=matching_candidates.matching_run_id
    and private.has_linked_support_request_access(mr.request_id,'read'))
  or private.has_admin_permission('operations.marketplace.read')
);

drop policy offers_sealed on public.offers;
create policy offers_sealed on public.offers for select
using(
  provider_id=auth.uid()
  or exists(select 1 from public.service_requests r where r.id=offers.request_id and r.customer_id=auth.uid())
  or private.has_linked_support_request_access(request_id,'read')
  or private.has_admin_permission('operations.marketplace.read')
);
drop policy offer_revisions_sealed on public.offer_revisions;
create policy offer_revisions_sealed on public.offer_revisions for select
using(exists(
  select 1 from public.offers o where o.id=offer_revisions.offer_id and (
    o.provider_id=auth.uid()
    or exists(select 1 from public.service_requests r where r.id=o.request_id and r.customer_id=auth.uid())
    or private.has_linked_support_request_access(o.request_id,'read')
    or private.has_admin_permission('operations.marketplace.read')
  )
));
drop policy offer_history_sealed on public.offer_status_history;
create policy offer_history_sealed on public.offer_status_history for select
using(exists(
  select 1 from public.offers o where o.id=offer_status_history.offer_id and (
    o.provider_id=auth.uid()
    or exists(select 1 from public.service_requests r where r.id=o.request_id and r.customer_id=auth.uid())
    or private.has_linked_support_request_access(o.request_id,'read')
    or private.has_admin_permission('operations.marketplace.read')
  )
));
drop policy offer_withdrawals_owner on public.offer_withdrawals;
create policy offer_withdrawals_owner on public.offer_withdrawals for select
using(
  provider_id=auth.uid()
  or exists(select 1 from public.offers o where o.id=offer_withdrawals.offer_id
    and private.has_linked_support_request_access(o.request_id,'read'))
  or private.has_admin_permission('operations.marketplace.read')
);

drop policy message_delivery_members on public.message_delivery_events;
create policy message_delivery_members on public.message_delivery_events for select
using(user_id=auth.uid() or private.has_admin_permission('operations.notifications.read'));
drop policy moderation_reporter_staff on public.message_moderation_events;
create policy moderation_reporter_staff on public.message_moderation_events for select
using(
  reporter_id=auth.uid()
  or exists(
    select 1 from public.messages m join public.conversations c on c.id=m.conversation_id
    where m.id=message_moderation_events.message_id
      and c.job_id is not null and private.has_linked_support_job_access(c.job_id,'read')
  )
  or private.has_admin_permission('operations.marketplace.read')
);

drop policy job_notes_participants on public.job_notes;
create policy job_notes_participants on public.job_notes for select
using(
  author_id=auth.uid()
  or (
    visibility='participants'
    and (
      exists(select 1 from public.jobs j where j.id=job_notes.job_id
        and auth.uid() in (j.customer_id,j.provider_id))
      or private.has_linked_support_job_access(job_id,'read')
      or private.has_admin_permission('operations.marketplace.read')
    )
  )
  or private.has_linked_support_job_access(job_id,'internal_note')
  or private.has_admin_permission('operations.marketplace.read')
);

drop policy provider_services_owner_read on public.provider_services;
create policy provider_services_owner_read on public.provider_services for select
using(
  provider_id=auth.uid()
  or private.has_support_subject_access(provider_id)
  or private.has_admin_permission('operations.marketplace.read')
  or private.has_admin_permission('provider.document.read')
);
drop policy provider_areas_owner on public.provider_service_areas;
create policy provider_areas_owner on public.provider_service_areas for all
using(provider_id=auth.uid()) with check(provider_id=auth.uid());
create policy provider_areas_scoped_read on public.provider_service_areas for select
using(
  private.has_support_subject_access(provider_id)
  or private.has_admin_permission('operations.marketplace.read')
  or private.has_admin_permission('provider.document.read')
);
drop policy provider_availability_owner on public.provider_availability;
create policy provider_availability_owner on public.provider_availability for all
using(provider_id=auth.uid()) with check(provider_id=auth.uid());
create policy provider_availability_scoped_read on public.provider_availability for select
using(
  private.has_support_subject_access(provider_id)
  or private.has_admin_permission('operations.marketplace.read')
  or private.has_admin_permission('provider.document.read')
);
drop policy provider_blackouts_owner on public.provider_blackout_periods;
create policy provider_blackouts_owner on public.provider_blackout_periods for all
using(provider_id=auth.uid()) with check(provider_id=auth.uid());
create policy provider_blackouts_scoped_read on public.provider_blackout_periods for select
using(
  private.has_support_subject_access(provider_id)
  or private.has_admin_permission('operations.marketplace.read')
  or private.has_admin_permission('provider.document.read')
);
drop policy provider_portfolio_owner on public.provider_portfolio_items;
create policy provider_portfolio_owner on public.provider_portfolio_items for all
using(provider_id=auth.uid()) with check(provider_id=auth.uid());
create policy provider_portfolio_scoped_read on public.provider_portfolio_items for select
using(
  private.has_support_subject_access(provider_id)
  or private.has_admin_permission('operations.marketplace.read')
  or private.has_admin_permission('provider.document.read')
);
drop policy provider_performance_read on public.provider_performance_snapshots;
create policy provider_performance_read on public.provider_performance_snapshots for select
using(
  provider_id=auth.uid()
  or private.has_support_subject_access(provider_id)
  or private.has_admin_permission('operations.marketplace.read')
);
drop policy provider_status_history_read on public.provider_status_history;
create policy provider_status_history_read on public.provider_status_history for select
using(
  provider_id=auth.uid()
  or private.has_support_subject_access(provider_id)
  or private.has_admin_permission('operations.marketplace.read')
  or private.has_admin_permission('provider.document.read')
);
drop policy provider_suspensions_read on public.provider_suspensions;
create policy provider_suspensions_read on public.provider_suspensions for select
using(
  provider_id=auth.uid()
  or private.has_support_subject_access(provider_id)
  or private.has_admin_permission('operations.marketplace.read')
  or private.has_admin_permission('provider.document.read')
);

drop policy ratings_participants on public.ratings;
create policy ratings_participants on public.ratings for select
using(
  provider_id=auth.uid() or customer_id=auth.uid() or moderation_status='published'
  or private.has_admin_permission('operations.marketplace.read')
);
drop policy rating_replies_read on public.rating_replies;
create policy rating_replies_read on public.rating_replies for select
using(
  moderation_status='published' or provider_id=auth.uid()
  or private.has_admin_permission('operations.marketplace.read')
);

drop policy deletion_owner_read on public.account_deletion_requests;
create policy deletion_owner_read on public.account_deletion_requests for select
using(user_id=auth.uid() or private.has_admin_permission('customer.pii.read'));
drop policy export_owner_read on public.data_export_requests;
create policy export_owner_read on public.data_export_requests for select
using(user_id=auth.uid() or private.has_admin_permission('customer.pii.read'));
drop policy legal_acceptances_owner on public.legal_acceptances;
create policy legal_acceptances_owner on public.legal_acceptances for select
using(user_id=auth.uid() or private.has_admin_permission('customer.pii.read'));
drop policy privacy_events_owner_read on public.privacy_events;
create policy privacy_events_owner_read on public.privacy_events for select
using(user_id=auth.uid() or private.has_admin_permission('customer.pii.read'));
drop policy upload_events_owner_read on public.upload_security_events;
create policy upload_events_owner_read on public.upload_security_events for select using(user_id=auth.uid());
drop policy roles_self_read on public.user_roles;
create policy roles_self_read on public.user_roles for select
using(user_id=auth.uid() or private.has_admin_permission('operations.marketplace.read'));

create function public.grant_support_case_access(
  p_case_id uuid,p_user_id uuid,p_access_type text,p_permissions text[],p_reason text,
  p_expires_at timestamptz,p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare actor uuid:=auth.uid(); grant_id uuid; request_hash text; replay jsonb; result_payload jsonb;
begin
  if not private.has_role(array['operations_admin','super_admin']::user_role[]) then
    raise exception 'OPERATIONS_PERMISSION_REQUIRED';
  end if;
  if p_access_type not in ('temporary','escalation') then raise exception 'INVALID_ACCESS_TYPE'; end if;
  if p_expires_at<=now() or p_expires_at>now()+interval '24 hours' then raise exception 'INVALID_ACCESS_EXPIRY'; end if;
  if not ('read'=any(p_permissions)) or not (p_permissions<@array['read','internal_note','evidence','exact_location']::text[]) then
    raise exception 'INVALID_CASE_PERMISSIONS';
  end if;
  if length(trim(coalesce(p_reason,'')))<5 then raise exception 'REASON_REQUIRED'; end if;
  if not exists(select 1 from user_roles ur join profiles p on p.id=ur.user_id
    where ur.user_id=p_user_id and ur.role='support_agent' and ur.revoked_at is null and p.status='active') then
    raise exception 'ACTIVE_SUPPORT_AGENT_REQUIRED';
  end if;
  request_hash:=private.canonical_request_hash(jsonb_build_object('caseId',p_case_id,'userId',p_user_id,
    'accessType',p_access_type,'permissions',p_permissions,'reason',trim(p_reason),'expiresAt',p_expires_at));
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':support_access_grant:'||p_idempotency_key,0));
  replay:=private.idempotency_replay(actor,'support_access_grant_v1',p_idempotency_key,request_hash);
  if replay is not null then return replay; end if;
  insert into idempotency_keys(user_id,command,key,request_hash)
  values(actor,'support_access_grant_v1',p_idempotency_key,request_hash) on conflict do nothing;
  insert into support_case_access_grants(
    case_id,user_id,access_type,permissions,reason,granted_by,expires_at
  ) values(p_case_id,p_user_id,p_access_type,p_permissions,trim(p_reason),actor,p_expires_at)
  returning id into grant_id;
  insert into admin_audit_logs(actor_id,action,target_type,target_id,reason,correlation_id,after_snapshot)
  values(actor,'support.case.access.grant','support_case',p_case_id,trim(p_reason),grant_id,
    jsonb_build_object('grantId',grant_id,'userId',p_user_id,'permissions',p_permissions,
      'accessType',p_access_type,'expiresAt',p_expires_at));
  result_payload:=jsonb_build_object('grantId',grant_id,'caseId',p_case_id,'expiresAt',p_expires_at);
  perform private.complete_idempotent_command(actor,'support_access_grant_v1',p_idempotency_key,result_payload);
  return result_payload;
end $$;

create function public.revoke_support_case_access(
  p_grant_id uuid,p_reason text,p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare actor uuid:=auth.uid(); item support_case_access_grants%rowtype; request_hash text; replay jsonb; result_payload jsonb;
begin
  if not private.has_role(array['operations_admin','super_admin']::user_role[]) then raise exception 'OPERATIONS_PERMISSION_REQUIRED'; end if;
  if length(trim(coalesce(p_reason,'')))<5 then raise exception 'REASON_REQUIRED'; end if;
  request_hash:=private.canonical_request_hash(jsonb_build_object('grantId',p_grant_id,'reason',trim(p_reason)));
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':support_access_revoke:'||p_idempotency_key,0));
  replay:=private.idempotency_replay(actor,'support_access_revoke_v1',p_idempotency_key,request_hash);
  if replay is not null then return replay; end if;
  select * into item from support_case_access_grants where id=p_grant_id and revoked_at is null for update;
  if item.id is null then raise exception 'ACTIVE_SUPPORT_GRANT_REQUIRED'; end if;
  insert into idempotency_keys(user_id,command,key,request_hash)
  values(actor,'support_access_revoke_v1',p_idempotency_key,request_hash) on conflict do nothing;
  update support_case_access_grants set revoked_at=now(),revoked_by=actor,revoked_reason=trim(p_reason)
  where id=item.id;
  insert into admin_audit_logs(actor_id,action,target_type,target_id,reason,correlation_id,before_snapshot,after_snapshot)
  values(actor,'support.case.access.revoke','support_case',item.case_id,trim(p_reason),item.id,
    jsonb_build_object('grantId',item.id,'userId',item.user_id,'permissions',item.permissions),
    jsonb_build_object('revoked',true));
  result_payload:=jsonb_build_object('grantId',item.id,'revoked',true);
  perform private.complete_idempotent_command(actor,'support_access_revoke_v1',p_idempotency_key,result_payload);
  return result_payload;
end $$;

create function private.job_location_payload(p_job_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare item public.jobs%rowtype; address public.addresses%rowtype; latest record;
begin
  select * into item from public.jobs where id=p_job_id;
  if item.id is null then raise exception 'JOB_NOT_FOUND'; end if;
  select * into address from public.addresses where id=item.exact_address_id and deleted_at is null;
  select extensions.st_y(u.location::extensions.geometry) latitude,
    extensions.st_x(u.location::extensions.geometry) longitude,u.accuracy_m,u.captured_at,u.expires_at
  into latest from public.job_location_updates u where u.job_id=item.id and u.expires_at>now()
  order by u.captured_at desc limit 1;
  return jsonb_build_object('jobId',item.id,'destination',jsonb_build_object(
    'formattedAddress',address.formatted_address,
    'latitude',extensions.st_y(address.location::extensions.geometry),
    'longitude',extensions.st_x(address.location::extensions.geometry)),
    'providerLocation',case when latest.captured_at is null then null else jsonb_build_object(
      'latitude',latest.latitude,'longitude',latest.longitude,'accuracyM',latest.accuracy_m,
      'capturedAt',latest.captured_at,'expiresAt',latest.expires_at) end);
end $$;

create or replace function public.get_authorized_job_location(p_job_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item public.jobs%rowtype;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into item from public.jobs where id=p_job_id;
  if item.id is null then raise exception 'JOB_NOT_FOUND'; end if;
  if actor<>item.customer_id
    and not (actor=item.provider_id and item.status not in ('completed','cancelled')) then
    raise exception 'EXACT_LOCATION_ACCESS_DENIED';
  end if;
  return private.job_location_payload(p_job_id);
end $$;

create function public.get_authorized_job_location(
  p_job_id uuid,p_case_id uuid,p_reason text
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); audit_id uuid:=gen_random_uuid(); allowed boolean:=false;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if length(trim(coalesce(p_reason,'')))<5 then raise exception 'EXACT_LOCATION_REASON_REQUIRED'; end if;
  allowed:=private.has_admin_permission('operations.exact_location.read')
    or (p_case_id is not null and private.has_support_case_access(p_case_id,'exact_location')
      and exists(select 1 from public.support_cases c where c.id=p_case_id and c.job_id=p_job_id));
  if not allowed then raise exception 'EXACT_LOCATION_ACCESS_DENIED'; end if;
  insert into public.admin_audit_logs(
    id,actor_id,action,target_type,target_id,reason,correlation_id,after_snapshot
  ) values(audit_id,actor,'job.exact_location.read','job',p_job_id,trim(p_reason),audit_id,
    jsonb_build_object('caseId',p_case_id,'accessedAt',now()));
  return private.job_location_payload(p_job_id);
end $$;

create or replace function public.get_completion_proof_manifest(p_job_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not exists(select 1 from public.jobs j where j.id=p_job_id and auth.uid() in (j.customer_id,j.provider_id))
    and not private.has_linked_support_job_access(p_job_id,'evidence')
    and not private.has_admin_permission('operations.marketplace.read') then
    raise exception 'COMPLETION_PROOF_ACCESS_DENIED';
  end if;
  return jsonb_build_object('jobId',p_job_id,'proofs',coalesce((select jsonb_agg(jsonb_build_object(
    'id',p.id,'uploadId',p.file_upload_id,'mimeType',p.mime_type,'sizeBytes',p.size_bytes,
    'description',p.description,'capturedAt',p.captured_at,'createdAt',p.created_at) order by p.created_at)
    from public.completion_proofs p where p.job_id=p_job_id),'[]'::jsonb));
end $$;

create or replace function public.authorize_clean_media(p_user_id uuid,p_upload_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare item public.file_uploads%rowtype; allowed boolean:=false;
begin
  if auth.role()<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select * into item from public.file_uploads where id=p_upload_id and status='clean';
  if item.id is null or item.final_path is null then raise exception 'CLEAN_MEDIA_NOT_FOUND'; end if;
  allowed:=item.user_id=p_user_id;
  if item.purpose='message_attachment' then
    allowed:=allowed or exists(select 1 from public.conversation_members m
      where m.conversation_id=item.resource_id and m.user_id=p_user_id);
  elsif item.purpose='completion_proof' then
    allowed:=allowed or exists(select 1 from public.jobs j where j.id=item.resource_id
      and p_user_id in (j.customer_id,j.provider_id))
      or exists(select 1 from public.support_cases c where c.job_id=item.resource_id
        and private.has_support_case_access_for(p_user_id,c.id,'evidence'))
      or exists(select 1 from public.profiles p join public.user_roles ur on ur.user_id=p.id
        where p.id=p_user_id and p.status='active' and ur.revoked_at is null
          and ur.role in ('operations_admin','super_admin'));
  elsif item.purpose='request_media' then
    allowed:=allowed or exists(select 1 from public.service_requests r where r.id=item.resource_id and r.customer_id=p_user_id)
      or exists(select 1 from public.request_provider_matches m where m.request_id=item.resource_id
        and m.provider_id=p_user_id and m.status in ('invited','viewed','offered','selected'))
      or exists(select 1 from public.support_cases c where c.request_id=item.resource_id
        and private.has_support_case_access_for(p_user_id,c.id,'evidence'));
  elsif item.purpose='support_evidence' then
    allowed:=allowed or exists(select 1 from public.support_cases c where c.id=item.resource_id and c.opened_by=p_user_id)
      or private.has_support_case_access_for(p_user_id,item.resource_id,'evidence');
  elsif item.purpose='provider_document' then
    allowed:=allowed or exists(select 1 from public.user_roles ur where ur.user_id=p_user_id
      and ur.role in ('verification_reviewer','super_admin') and ur.revoked_at is null);
  end if;
  if not allowed then raise exception 'MEDIA_ACCESS_DENIED'; end if;
  return jsonb_build_object('bucket',item.target_bucket,'path',item.final_path,
    'mimeType',coalesce(item.detected_mime_type,item.declared_mime_type),
    'sizeBytes',item.size_bytes,'uploadId',item.id);
end $$;

alter table public.ai_messages
  add column in_reply_to_message_id uuid references public.ai_messages(id);
create unique index ai_authoritative_reply_once
  on public.ai_messages(in_reply_to_message_id)
  where actor='assistant' and in_reply_to_message_id is not null;

alter table public.ai_diagnostics
  add column source_message_id uuid references public.ai_messages(id);
create unique index ai_diagnostic_source_message_once
  on public.ai_diagnostics(source_message_id)
  where source_message_id is not null;
update public.ai_prompt_versions set enabled=false where purpose='diagnostic';
insert into public.ai_prompt_versions(purpose,version,schema_version,system_prompt_hash,enabled)
values(
  'diagnostic','diagnostic-v3','1.0',
  encode(extensions.digest('diagnostic-v3-server-multimodal-controls','sha256'),'hex'),true
)
on conflict(purpose,version) do update set enabled=true,system_prompt_hash=excluded.system_prompt_hash;
grant select on public.ai_prompt_versions to service_role;

create function public.restore_active_ai_intake() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); v_session_id uuid;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  select s.id into v_session_id from public.ai_sessions s
  where s.user_id=actor and s.purpose='service_request_intake' and s.status='active'
  order by s.updated_at desc,s.created_at desc limit 1;
  if v_session_id is null then return jsonb_build_object('session',null,'messages','[]'::jsonb); end if;
  return jsonb_build_object(
    'session',(select jsonb_build_object('id',s.id,'locale',s.locale,'status',s.status,
      'suggestedCategorySlug',s.suggested_category_slug,'confirmedCategorySlug',s.confirmed_category_slug,
      'summaryRequestedAt',s.summary_requested_at,'version',s.version,'updatedAt',s.updated_at)
      from public.ai_sessions s where s.id=v_session_id),
    'messages',coalesce((select jsonb_agg(jsonb_build_object(
      'id',m.id,'actor',m.actor,'content',m.original_content,'sequenceNumber',m.sequence_number,
      'clientMessageId',m.client_message_id,'inputKind',m.input_kind,'metadata',m.metadata,
      'inReplyToMessageId',m.in_reply_to_message_id,
      'mediaUploadIds',coalesce((select jsonb_agg(mm.file_upload_id order by mm.created_at)
        from public.ai_message_media mm where mm.message_id=m.id),'[]'::jsonb),
      'createdAt',m.created_at) order by m.sequence_number)
      from public.ai_messages m where m.session_id=v_session_id),'[]'::jsonb),
    'latestDiagnostic',coalesce((select jsonb_build_object('id',d.id,'output',coalesce(d.customer_edited_output,d.structured_output),
      'provider',d.provider,'model',d.model,'promptVersion',d.prompt_version,'fallbackSource',d.fallback_source,
      'errorCategory',d.error_category,'createdAt',d.created_at)
      from public.ai_diagnostics d where d.session_id=v_session_id order by d.created_at desc,d.id desc limit 1),'null'::jsonb)
  );
end $$;

alter table public.dispute_events
  add column visible_to_participants boolean not null default true;

create or replace function public.get_data_export_manifest() returns jsonb
language sql immutable security definer set search_path='' as $$
  select '[
    "profile","roles","preferences","notificationPreferences","addresses",
    "legalAcceptances","devices","providerProfile","providerServices",
    "providerServiceAreas","providerAvailability","providerBlackouts",
    "providerDocuments","providerPortfolio","serviceRequests","requestAnswers",
    "requestMedia","requestTranslations","aiSessions","aiMessages","aiMessageMedia",
    "aiDiagnostics","aiUsage","transcriptions","matches","offers","jobs","jobHistory",
    "jobEvents","completionProofs","customerAcceptances","conversations","messages",
    "messageAttachments","messageDeliveryHistory","payments","refunds","financialHolds",
    "invoices","receipts","cancellations","cancellationDecisions","disputes","disputeEvents",
    "supportCases","supportMessages","supportEvidence","ratings","notifications",
    "uploadSecurityEvents","privacyRequests"
  ]'::jsonb
$$;

create function public.get_data_export_query_coverage() returns jsonb
language sql immutable security definer set search_path='' as $$
  select '{
    "profile":"profiles p_export","roles":"user_roles roles_export",
    "preferences":"user_preferences preferences_export","notificationPreferences":"notification_preferences notification_preferences_export",
    "addresses":"addresses addresses_export","legalAcceptances":"legal_acceptances legal_export",
    "devices":"user_devices devices_export","providerProfile":"provider_profiles provider_profile_export",
    "providerServices":"provider_services provider_services_export","providerServiceAreas":"provider_service_areas provider_areas_export",
    "providerAvailability":"provider_availability provider_availability_export","providerBlackouts":"provider_blackout_periods provider_blackouts_export",
    "providerDocuments":"provider_documents provider_documents_export","providerPortfolio":"provider_portfolio_items provider_portfolio_export",
    "serviceRequests":"service_requests requests_export","requestAnswers":"service_request_answers request_answers_export",
    "requestMedia":"request_media request_media_export","requestTranslations":"request_translations request_translations_export",
    "aiSessions":"ai_sessions ai_sessions_export","aiMessages":"ai_messages ai_messages_export",
    "aiMessageMedia":"ai_message_media ai_media_export","aiDiagnostics":"ai_diagnostics ai_diagnostics_export",
    "aiUsage":"ai_usage_events ai_usage_export","transcriptions":"transcription_jobs transcriptions_export",
    "matches":"request_provider_matches matches_export","offers":"offers offers_export",
    "jobs":"jobs jobs_export","jobHistory":"job_status_history job_history_export",
    "jobEvents":"job_events job_events_export","completionProofs":"completion_proofs completion_proofs_export",
    "customerAcceptances":"customer_acceptances acceptances_export","conversations":"conversation_members conversations_membership_export",
    "messages":"conversation_members messages_membership_export","messageAttachments":"conversation_members attachments_membership_export",
    "messageDeliveryHistory":"message_delivery_events delivery_export","payments":"payments payments_export",
    "refunds":"refunds refunds_export","financialHolds":"financial_holds holds_export",
    "invoices":"invoices invoices_export","receipts":"receipts receipts_export",
    "cancellations":"cancellation_requests cancellations_export","cancellationDecisions":"cancellation_decisions cancellation_decisions_export",
    "disputes":"disputes disputes_export","disputeEvents":"dispute_events dispute_events_export",
    "supportCases":"support_cases support_cases_export","supportMessages":"support_case_messages support_messages_export",
    "supportEvidence":"support_case_evidence support_evidence_export","ratings":"ratings ratings_export",
    "notifications":"notification_outbox notifications_export","uploadSecurityEvents":"upload_security_events upload_events_export",
    "privacyRequests":"data_export_requests privacy_exports_export"
  }'::jsonb
$$;

create or replace function public.build_data_export(p_request_id uuid,p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not exists(select 1 from public.data_export_requests
    where id=p_request_id and user_id=p_user_id and status='processing') then
    raise exception 'EXPORT_REQUEST_NOT_PROCESSING';
  end if;
  return jsonb_build_object(
    'schemaVersion','3','manifest',public.get_data_export_manifest(),'queryCoverage',public.get_data_export_query_coverage(),
    'redactionPolicy',jsonb_build_object(
      'counterpartyContact','removed','counterpartyPrivateIdentity','removed',
      'storagePathsAndSignedUrls','removed','exactCoordinates','omitted_from_portable_export'),
    'generatedAt',now(),'requestId',p_request_id,
    'profile',coalesce((select to_jsonb(p_export) from public.profiles p_export where p_export.id=p_user_id),'{}'::jsonb),
    'roles',coalesce((select jsonb_agg(to_jsonb(roles_export) order by roles_export.granted_at)
      from public.user_roles roles_export where roles_export.user_id=p_user_id),'[]'::jsonb),
    'preferences',coalesce((select to_jsonb(preferences_export) from public.user_preferences preferences_export
      where preferences_export.user_id=p_user_id),'{}'::jsonb),
    'notificationPreferences',coalesce((select to_jsonb(notification_preferences_export)
      from public.notification_preferences notification_preferences_export
      where notification_preferences_export.user_id=p_user_id),'{}'::jsonb),
    'addresses',coalesce((select jsonb_agg(to_jsonb(addresses_export)-'location' order by addresses_export.created_at)
      from public.addresses addresses_export where addresses_export.user_id=p_user_id),'[]'::jsonb),
    'legalAcceptances',coalesce((select jsonb_agg(to_jsonb(legal_export)-'ip_hash'-'user_agent_hash' order by legal_export.accepted_at)
      from public.legal_acceptances legal_export where legal_export.user_id=p_user_id),'[]'::jsonb),
    'devices',coalesce((select jsonb_agg(to_jsonb(devices_export)-'device_hash' order by devices_export.last_seen_at)
      from public.user_devices devices_export where devices_export.user_id=p_user_id),'[]'::jsonb),
    'providerProfile',coalesce((select to_jsonb(provider_profile_export) from public.provider_profiles provider_profile_export
      where provider_profile_export.user_id=p_user_id),'{}'::jsonb),
    'providerServices',coalesce((select jsonb_agg(to_jsonb(provider_services_export)) from public.provider_services provider_services_export
      where provider_services_export.provider_id=p_user_id),'[]'::jsonb),
    'providerServiceAreas',coalesce((select jsonb_agg(to_jsonb(provider_areas_export)-'center')
      from public.provider_service_areas provider_areas_export where provider_areas_export.provider_id=p_user_id),'[]'::jsonb),
    'providerAvailability',coalesce((select jsonb_agg(to_jsonb(provider_availability_export))
      from public.provider_availability provider_availability_export where provider_availability_export.provider_id=p_user_id),'[]'::jsonb),
    'providerBlackouts',coalesce((select jsonb_agg(to_jsonb(provider_blackouts_export))
      from public.provider_blackout_periods provider_blackouts_export where provider_blackouts_export.provider_id=p_user_id),'[]'::jsonb),
    'providerDocuments',coalesce((select jsonb_agg(to_jsonb(provider_documents_export)-'storage_path'-'content_hash')
      from public.provider_documents provider_documents_export where provider_documents_export.provider_id=p_user_id),'[]'::jsonb),
    'providerPortfolio',coalesce((select jsonb_agg(to_jsonb(provider_portfolio_export)-'storage_path')
      from public.provider_portfolio_items provider_portfolio_export where provider_portfolio_export.provider_id=p_user_id),'[]'::jsonb),
    'serviceRequests',coalesce((select jsonb_agg(to_jsonb(requests_export)-'approximate_location'-'exact_address_id' order by requests_export.created_at)
      from public.service_requests requests_export where requests_export.customer_id=p_user_id),'[]'::jsonb),
    'requestAnswers',coalesce((select jsonb_agg(to_jsonb(request_answers_export))
      from public.service_request_answers request_answers_export join public.service_requests r on r.id=request_answers_export.request_id
      where r.customer_id=p_user_id),'[]'::jsonb),
    'requestMedia',coalesce((select jsonb_agg(to_jsonb(request_media_export)-'storage_path'-'thumbnail_path'-'content_hash')
      from public.request_media request_media_export join public.service_requests r on r.id=request_media_export.request_id
      where r.customer_id=p_user_id),'[]'::jsonb),
    'requestTranslations',coalesce((select jsonb_agg(to_jsonb(request_translations_export))
      from public.request_translations request_translations_export join public.service_requests r on r.id=request_translations_export.request_id
      where r.customer_id=p_user_id),'[]'::jsonb),
    'aiSessions',coalesce((select jsonb_agg(to_jsonb(ai_sessions_export)) from public.ai_sessions ai_sessions_export
      where ai_sessions_export.user_id=p_user_id),'[]'::jsonb),
    'aiMessages',coalesce((select jsonb_agg(to_jsonb(ai_messages_export) order by ai_messages_export.session_id,ai_messages_export.sequence_number)
      from public.ai_messages ai_messages_export join public.ai_sessions s on s.id=ai_messages_export.session_id
      where s.user_id=p_user_id),'[]'::jsonb),
    'aiMessageMedia',coalesce((select jsonb_agg(jsonb_build_object('id',ai_media_export.id,'messageId',ai_media_export.message_id,
      'uploadId',ai_media_export.file_upload_id,'mediaKind',ai_media_export.media_kind,'createdAt',ai_media_export.created_at))
      from public.ai_message_media ai_media_export join public.ai_messages m on m.id=ai_media_export.message_id
      join public.ai_sessions s on s.id=m.session_id where s.user_id=p_user_id),'[]'::jsonb),
    'aiDiagnostics',coalesce((select jsonb_agg(to_jsonb(ai_diagnostics_export)) from public.ai_diagnostics ai_diagnostics_export
      join public.ai_sessions s on s.id=ai_diagnostics_export.session_id where s.user_id=p_user_id),'[]'::jsonb),
    'aiUsage',coalesce((select jsonb_agg(to_jsonb(ai_usage_export)) from public.ai_usage_events ai_usage_export
      where ai_usage_export.user_id=p_user_id),'[]'::jsonb),
    'transcriptions',coalesce((select jsonb_agg(to_jsonb(transcriptions_export)-'private_audio_path')
      from public.transcription_jobs transcriptions_export where transcriptions_export.user_id=p_user_id),'[]'::jsonb),
    'matches',coalesce((select jsonb_agg(to_jsonb(matches_export)) from public.request_provider_matches matches_export
      left join public.service_requests r on r.id=matches_export.request_id
      where matches_export.provider_id=p_user_id or r.customer_id=p_user_id),'[]'::jsonb),
    'offers',coalesce((select jsonb_agg(to_jsonb(offers_export)) from public.offers offers_export
      join public.service_requests r on r.id=offers_export.request_id
      where offers_export.provider_id=p_user_id or r.customer_id=p_user_id),'[]'::jsonb),
    'jobs',coalesce((select jsonb_agg(jsonb_build_object('id',jobs_export.id,'requestId',jobs_export.request_id,
      'selectedOfferId',jobs_export.selected_offer_id,'role',case when jobs_export.customer_id=p_user_id then 'customer' else 'provider' end,
      'status',jobs_export.status,'scheduledStart',jobs_export.scheduled_start,'scheduledEnd',jobs_export.scheduled_end,
      'approvedTotalMinor',jobs_export.approved_total_minor,'currency',jobs_export.currency,'version',jobs_export.version,
      'createdAt',jobs_export.created_at,'updatedAt',jobs_export.updated_at,'completedAt',jobs_export.completed_at))
      from public.jobs jobs_export where p_user_id in (jobs_export.customer_id,jobs_export.provider_id)),'[]'::jsonb),
    'jobHistory',coalesce((select jsonb_agg(to_jsonb(job_history_export)) from public.job_status_history job_history_export
      join public.jobs j on j.id=job_history_export.job_id where p_user_id in (j.customer_id,j.provider_id)),'[]'::jsonb),
    'jobEvents',coalesce((select jsonb_agg(to_jsonb(job_events_export)) from public.job_events job_events_export
      join public.jobs j on j.id=job_events_export.job_id where p_user_id in (j.customer_id,j.provider_id)),'[]'::jsonb),
    'completionProofs',coalesce((select jsonb_agg(to_jsonb(completion_proofs_export)-'storage_path')
      from public.completion_proofs completion_proofs_export join public.jobs j on j.id=completion_proofs_export.job_id
      where p_user_id in (j.customer_id,j.provider_id)),'[]'::jsonb),
    'customerAcceptances',coalesce((select jsonb_agg(to_jsonb(acceptances_export))
      from public.customer_acceptances acceptances_export join public.jobs j on j.id=acceptances_export.job_id
      where p_user_id in (j.customer_id,j.provider_id)),'[]'::jsonb),
    'conversations',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'jobId',c.job_id,'status',c.status,
      'joinedAt',conversations_membership_export.joined_at,'leftAt',conversations_membership_export.left_at,'createdAt',c.created_at))
      from public.conversation_members conversations_membership_export join public.conversations c on c.id=conversations_membership_export.conversation_id
      where conversations_membership_export.user_id=p_user_id),'[]'::jsonb),
    'messages',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'conversationId',m.conversation_id,
      'senderReference',case when m.sender_id=p_user_id then 'self' else 'counterparty' end,'body',m.body,
      'createdAt',m.created_at,'editedAt',m.edited_at,'deletedAt',m.deleted_at) order by m.created_at)
      from public.messages m where exists(select 1 from public.conversation_members messages_membership_export
        where messages_membership_export.conversation_id=m.conversation_id and messages_membership_export.user_id=p_user_id)),'[]'::jsonb),
    'messageAttachments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'messageId',a.message_id,
      'uploaderReference',case when a.uploader_id=p_user_id then 'self' else 'counterparty' end,
      'mimeType',a.mime_type,'sizeBytes',a.size_bytes,'createdAt',a.created_at))
      from public.message_attachments a join public.messages m on m.id=a.message_id
      where exists(select 1 from public.conversation_members attachments_membership_export
        where attachments_membership_export.conversation_id=m.conversation_id and attachments_membership_export.user_id=p_user_id)),'[]'::jsonb),
    'messageDeliveryHistory',coalesce((select jsonb_agg(to_jsonb(delivery_export))
      from public.message_delivery_events delivery_export join public.messages m on m.id=delivery_export.message_id
      where delivery_export.user_id=p_user_id or exists(select 1 from public.conversation_members cm
        where cm.conversation_id=m.conversation_id and cm.user_id=p_user_id)),'[]'::jsonb)
  ) || jsonb_build_object(
    'payments',coalesce((select jsonb_agg(to_jsonb(payments_export)-'provider_reference') from public.payments payments_export
      where p_user_id in (payments_export.customer_id,payments_export.provider_id)),'[]'::jsonb),
    'refunds',coalesce((select jsonb_agg(to_jsonb(refunds_export)-'provider_reference') from public.refunds refunds_export
      join public.payments p on p.id=refunds_export.payment_id where p_user_id in (p.customer_id,p.provider_id)),'[]'::jsonb),
    'financialHolds',coalesce((select jsonb_agg(to_jsonb(holds_export)) from public.financial_holds holds_export
      join public.jobs j on j.id=holds_export.job_id where p_user_id in (j.customer_id,j.provider_id)),'[]'::jsonb),
    'invoices',coalesce((select jsonb_agg(jsonb_build_object('id',invoices_export.id,'jobId',invoices_export.job_id,
      'invoiceNumber',invoices_export.invoice_number,'sellerSnapshot',invoices_export.seller_snapshot-'email'-'phone'-'identityNumber'-'nationalId'-'address',
      'customerSnapshot',invoices_export.customer_snapshot-'email'-'phone'-'identityNumber'-'nationalId'-'address',
      'subtotalMinor',invoices_export.subtotal_minor,'vatMinor',invoices_export.vat_minor,
      'platformFeeMinor',invoices_export.platform_fee_minor,'totalMinor',invoices_export.total_minor,
      'currency',invoices_export.currency,'status',invoices_export.status,'issuedAt',invoices_export.issued_at))
      from public.invoices invoices_export join public.jobs j on j.id=invoices_export.job_id
      where p_user_id in (j.customer_id,j.provider_id)),'[]'::jsonb),
    'receipts',coalesce((select jsonb_agg(to_jsonb(receipts_export)-'private_pdf_path') from public.receipts receipts_export
      join public.payments p on p.id=receipts_export.payment_id where p_user_id in (p.customer_id,p.provider_id)),'[]'::jsonb),
    'cancellations',coalesce((select jsonb_agg(jsonb_build_object('id',cancellations_export.id,'jobId',cancellations_export.job_id,
      'requestId',cancellations_export.request_id,'requesterReference',case when cancellations_export.requester_id=p_user_id then 'self' else 'counterparty' end,
      'lifecycleState',cancellations_export.lifecycle_state,'reason',cancellations_export.reason,'status',cancellations_export.status,
      'createdAt',cancellations_export.created_at,'resolvedAt',cancellations_export.resolved_at))
      from public.cancellation_requests cancellations_export left join public.jobs j on j.id=cancellations_export.job_id
      left join public.service_requests r on r.id=cancellations_export.request_id
      where p_user_id in (j.customer_id,j.provider_id) or r.customer_id=p_user_id),'[]'::jsonb),
    'cancellationDecisions',coalesce((select jsonb_agg(to_jsonb(cancellation_decisions_export)-'actor_id')
      from public.cancellation_decisions cancellation_decisions_export
      join public.cancellation_requests c on c.id=cancellation_decisions_export.cancellation_request_id
      left join public.jobs j on j.id=c.job_id left join public.service_requests r on r.id=c.request_id
      where p_user_id in (j.customer_id,j.provider_id) or r.customer_id=p_user_id),'[]'::jsonb),
    'disputes',coalesce((select jsonb_agg(jsonb_build_object('id',disputes_export.id,'jobId',disputes_export.job_id,
      'openedByReference',case when disputes_export.opened_by=p_user_id then 'self' else 'counterparty' end,
      'reason',disputes_export.reason,'priority',disputes_export.priority,'status',disputes_export.status,
      'createdAt',disputes_export.created_at,'resolvedAt',disputes_export.resolved_at,
      'preDisputeJobStatus',disputes_export.pre_dispute_job_status,'resolutionOutcome',disputes_export.resolution_outcome))
      from public.disputes disputes_export join public.jobs j on j.id=disputes_export.job_id
      where p_user_id in (j.customer_id,j.provider_id)),'[]'::jsonb),
    'disputeEvents',coalesce((select jsonb_agg(to_jsonb(dispute_events_export)-'actor_id')
      from public.dispute_events dispute_events_export join public.disputes d on d.id=dispute_events_export.dispute_id
      join public.jobs j on j.id=d.job_id where dispute_events_export.visible_to_participants
        and p_user_id in (j.customer_id,j.provider_id)),'[]'::jsonb),
    'supportCases',coalesce((select jsonb_agg(to_jsonb(support_cases_export)) from public.support_cases support_cases_export
      where support_cases_export.opened_by=p_user_id),'[]'::jsonb),
    'supportMessages',coalesce((select jsonb_agg(jsonb_build_object('id',support_messages_export.id,'caseId',support_messages_export.case_id,
      'senderReference',case when support_messages_export.sender_id=p_user_id then 'self' else 'support' end,
      'body',support_messages_export.body,'createdAt',support_messages_export.created_at) order by support_messages_export.created_at)
      from public.support_case_messages support_messages_export join public.support_cases c on c.id=support_messages_export.case_id
      where c.opened_by=p_user_id and support_messages_export.visible_to_user),'[]'::jsonb),
    'supportEvidence',coalesce((select jsonb_agg(jsonb_build_object('id',support_evidence_export.id,'caseId',support_evidence_export.case_id,
      'uploaderReference',case when support_evidence_export.uploader_id=p_user_id then 'self' else 'support' end,
      'mimeType',support_evidence_export.mime_type,'sizeBytes',support_evidence_export.size_bytes,
      'createdAt',support_evidence_export.created_at)) from public.support_case_evidence support_evidence_export
      join public.support_cases c on c.id=support_evidence_export.case_id where c.opened_by=p_user_id),'[]'::jsonb),
    'ratings',coalesce((select jsonb_agg(to_jsonb(ratings_export)-'customer_id'-'provider_id') from public.ratings ratings_export
      where p_user_id in (ratings_export.customer_id,ratings_export.provider_id)),'[]'::jsonb),
    'notifications',coalesce((select jsonb_agg(to_jsonb(notifications_export)) from public.notification_outbox notifications_export
      where notifications_export.user_id=p_user_id),'[]'::jsonb),
    'uploadSecurityEvents',coalesce((select jsonb_agg(jsonb_build_object('id',upload_events_export.id,
      'uploadId',upload_events_export.upload_id,'eventType',upload_events_export.event_type,
      'createdAt',upload_events_export.created_at)) from public.upload_security_events upload_events_export
      where upload_events_export.user_id=p_user_id),'[]'::jsonb),
    'privacyRequests',jsonb_build_object(
      'deletion',coalesce((select jsonb_agg(to_jsonb(d)) from public.account_deletion_requests d where d.user_id=p_user_id),'[]'::jsonb),
      'exports',coalesce((select jsonb_agg(to_jsonb(privacy_exports_export)-'signed_download_url'-'private_storage_path')
        from public.data_export_requests privacy_exports_export where privacy_exports_export.user_id=p_user_id),'[]'::jsonb))
  );
end $$;

revoke all on function private.has_support_case_access_for(uuid,uuid,text) from public,anon,authenticated;
revoke all on function private.has_support_case_access(uuid,text) from public,anon,authenticated;
revoke all on function private.has_linked_support_request_access(uuid,text) from public,anon,authenticated;
revoke all on function private.has_linked_support_job_access(uuid,text) from public,anon,authenticated;
revoke all on function private.has_support_subject_access(uuid) from public,anon,authenticated;
revoke all on function private.has_cancellation_financial_access(uuid) from public,anon,authenticated;
revoke all on function private.guard_support_case_scoped_command() from public,anon,authenticated;
revoke all on function private.job_location_payload(uuid) from public,anon,authenticated;
grant execute on function private.has_support_case_access(uuid,text) to authenticated;
grant execute on function private.has_linked_support_request_access(uuid,text) to authenticated;
grant execute on function private.has_linked_support_job_access(uuid,text) to authenticated;
grant execute on function private.has_support_subject_access(uuid) to authenticated;
grant execute on function private.has_cancellation_financial_access(uuid) to authenticated;
revoke all on function public.grant_support_case_access(uuid,uuid,text,text[],text,timestamptz,text) from public,anon,authenticated;
revoke all on function public.revoke_support_case_access(uuid,text,text) from public,anon,authenticated;
revoke all on function public.get_authorized_job_location(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.grant_support_case_access(uuid,uuid,text,text[],text,timestamptz,text) to authenticated;
grant execute on function public.revoke_support_case_access(uuid,text,text) to authenticated;
grant execute on function public.get_authorized_job_location(uuid,uuid,text) to authenticated;
revoke all on function public.restore_active_ai_intake() from public,anon,authenticated;
grant execute on function public.restore_active_ai_intake() to authenticated;
revoke all on function public.build_data_export(uuid,uuid) from public,anon,authenticated;
grant execute on function public.build_data_export(uuid,uuid) to service_role;

commit;
