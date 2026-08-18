begin;

create table public.account_reauthentications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null,
  method text not null check (method in ('password','otp')),
  verified_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (expires_at>verified_at and expires_at<=verified_at+interval '10 minutes')
);
create index account_reauth_recent_idx
  on public.account_reauthentications(user_id,session_id,expires_at desc);
alter table public.account_reauthentications enable row level security;
revoke all on public.account_reauthentications from public,anon,authenticated;

create function public.record_account_reauthentication(
  p_user_id uuid,
  p_session_id uuid,
  p_method text
) returns timestamptz
language plpgsql
security definer
set search_path=''
as $$
declare
  expiry timestamptz:=now()+interval '10 minutes';
begin
  if auth.role()<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if p_method not in ('password','otp') then raise exception 'UNSUPPORTED_REAUTHENTICATION_METHOD'; end if;
  if not exists(
    select 1 from auth.sessions s
    where s.id=p_session_id and s.user_id=p_user_id
      and (s.not_after is null or s.not_after>now())
  ) then raise exception 'REVOKED_OR_EXPIRED_SESSION'; end if;
  insert into public.account_reauthentications(user_id,session_id,method,expires_at)
  values(p_user_id,p_session_id,p_method,expiry);
  return expiry;
end $$;

create function private.require_recent_reauthentication() returns void
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  actor uuid:=auth.uid();
  current_session_id uuid;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  begin
    current_session_id:=(auth.jwt()->>'session_id')::uuid;
  exception when others then
    raise exception 'RECENT_REAUTHENTICATION_REQUIRED';
  end;
  if current_session_id is null or not exists(
    select 1
    from public.account_reauthentications r
    join auth.sessions s on s.id=r.session_id and s.user_id=r.user_id
    where r.user_id=actor and r.session_id=current_session_id
      and r.expires_at>now()
      and (s.not_after is null or s.not_after>now())
  ) then raise exception 'RECENT_REAUTHENTICATION_REQUIRED'; end if;
end $$;

create function private.deletion_blocker_snapshot(p_user_id uuid) returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select jsonb_build_object(
    'policyVersion','sa-conservative-v2',
    'activeJobs',(select count(*) from public.jobs j
      where p_user_id in (j.customer_id,j.provider_id) and j.status not in ('completed','cancelled')),
    'openCancellations',(select count(*) from public.cancellation_requests c
      left join public.jobs j on j.id=c.job_id
      left join public.service_requests r on r.id=c.request_id
      where c.status in ('pending','financial_pending')
        and (c.requester_id=p_user_id or p_user_id in (j.customer_id,j.provider_id) or r.customer_id=p_user_id)),
    'openDisputes',(select count(*) from public.disputes d join public.jobs j on j.id=d.job_id
      where p_user_id in (j.customer_id,j.provider_id) and d.status not in ('resolved','closed')),
    'financialHolds',(select count(*) from public.financial_holds h join public.jobs j on j.id=h.job_id
      where p_user_id in (j.customer_id,j.provider_id) and h.status='held'),
    'pendingRefunds',(select count(*) from public.refunds r join public.payments p on p.id=r.payment_id
      where p_user_id in (p.customer_id,p.provider_id) and r.status='pending'),
    'pendingPayments',(select count(*) from public.payments p
      where p_user_id in (p.customer_id,p.provider_id) and p.status in ('pending','authorized')),
    'pendingFinancialActions',(select count(*) from public.financial_action_intents i
      join public.payments p on p.id=i.payment_id
      where p_user_id in (p.customer_id,p.provider_id) and i.status='pending'),
    'ledgerRetentionYears',10
  )
$$;

drop function if exists public.request_account_deletion(text);
create function public.request_account_deletion() returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  actor uuid:=auth.uid();
  request_id uuid;
  snapshot jsonb;
  blocked boolean;
begin
  perform private.require_recent_reauthentication();
  select id into request_id from account_deletion_requests
  where user_id=actor and status in ('requested','verified','blocked_retention','processing')
  order by requested_at desc limit 1;
  if request_id is not null then return request_id; end if;
  snapshot:=private.deletion_blocker_snapshot(actor);
  blocked:=exists(
    select 1 from jsonb_each_text(snapshot)
    where key not in ('policyVersion','ledgerRetentionYears') and value::integer>0
  );
  insert into account_deletion_requests(
    user_id,status,verified_at,retention_snapshot,scheduled_at
  ) values(
    actor,case when blocked then 'blocked_retention' else 'verified' end,
    now(),snapshot,now()
  ) returning id into request_id;
  if not blocked then
    update profiles set status='deletion_pending' where id=actor;
    delete from push_tokens where user_id=actor;
    insert into scheduled_jobs(job_type,payload,scheduled_at)
    values(
      'account_deletion',
      jsonb_build_object('requestId',request_id,'userId',actor,'schemaVersion','2'),now()
    );
  end if;
  insert into privacy_events(user_id,request_id,request_type,event_type,actor_id,metadata)
  values(
    actor,request_id,'account_deletion',
    case when blocked then 'blocked_retention' else 'requested' end,actor,snapshot
  );
  insert into notification_outbox(user_id,event_type,channel,payload,deduplication_key)
  values(
    actor,case when blocked then 'account_deletion_blocked' else 'account_deletion_scheduled' end,
    'in_app',jsonb_build_object('requestId',request_id,'blockers',snapshot),
    'privacy-deletion-state:'||request_id::text||':'||
      case when blocked then 'blocked' else 'scheduled' end
  ) on conflict(channel,deduplication_key) do nothing;
  return request_id;
end $$;

drop function if exists public.request_data_export(text);
create function public.request_data_export() returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  actor uuid:=auth.uid();
  result uuid;
begin
  perform private.require_recent_reauthentication();
  select id into result from data_export_requests
  where user_id=actor and status in ('requested','processing','completed')
  order by requested_at desc limit 1;
  if result is not null then return result; end if;
  insert into data_export_requests(user_id,status,scheduled_at)
  values(actor,'requested',now()) returning id into result;
  insert into scheduled_jobs(job_type,payload,scheduled_at)
  values(
    'data_export',jsonb_build_object('requestId',result,'userId',actor,'schemaVersion','2'),now()
  );
  insert into privacy_events(user_id,request_id,request_type,event_type,actor_id)
  values(actor,result,'data_export','requested',actor);
  return result;
end $$;

create unique index one_privacy_job_per_request_idx
  on public.scheduled_jobs(job_type,((payload->>'requestId')))
  where job_type in ('account_deletion','data_export')
    and status in ('pending','processing','completed');

create function public.reconcile_blocked_account_deletions(
  p_request_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  actor uuid:=auth.uid();
  item public.account_deletion_requests%rowtype;
  snapshot jsonb;
  blocked boolean;
  checked integer:=0;
  unblocked integer:=0;
begin
  if auth.role()<>'service_role'
    and not private.has_role(array['operations_admin','support_agent','super_admin']::public.user_role[]) then
    raise exception 'DELETION_RECONCILIATION_PERMISSION_REQUIRED';
  end if;
  for item in
    select * from account_deletion_requests
    where status='blocked_retention' and (p_request_id is null or id=p_request_id)
    order by requested_at for update skip locked
  loop
    checked:=checked+1;
    snapshot:=private.deletion_blocker_snapshot(item.user_id);
    blocked:=exists(
      select 1 from jsonb_each_text(snapshot)
      where key not in ('policyVersion','ledgerRetentionYears') and value::integer>0
    );
    update account_deletion_requests
    set retention_snapshot=snapshot,version=version+1,
        status=case when blocked then 'blocked_retention' else 'verified' end,
        scheduled_at=case when blocked then scheduled_at else now() end
    where id=item.id;
    insert into privacy_events(user_id,request_id,request_type,event_type,actor_id,metadata)
    values(
      item.user_id,item.id,'account_deletion',
      case when blocked then 'blockers_reconciled' else 'unblocked_and_scheduled' end,
      actor,snapshot
    );
    insert into notification_outbox(user_id,event_type,channel,payload,deduplication_key)
    values(
      item.user_id,
      case when blocked then 'account_deletion_still_blocked' else 'account_deletion_unblocked' end,
      'in_app',jsonb_build_object('requestId',item.id,'blockers',snapshot),
      'privacy-reconcile:'||item.id::text||':'||
        case when blocked then item.version::text else 'unblocked' end
    ) on conflict(channel,deduplication_key) do nothing;
    if not blocked then
      unblocked:=unblocked+1;
      update profiles set status='deletion_pending' where id=item.user_id;
      delete from push_tokens where user_id=item.user_id;
      insert into scheduled_jobs(job_type,payload,scheduled_at)
      values(
        'account_deletion',
        jsonb_build_object('requestId',item.id,'userId',item.user_id,'schemaVersion','2'),now()
      ) on conflict do nothing;
    end if;
  end loop;
  return jsonb_build_object('checked',checked,'unblocked',unblocked);
end $$;

create function public.get_account_deletion_summary() returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select coalesce((
    select jsonb_build_object(
      'id',d.id,'status',d.status,'requestedAt',d.requested_at,
      'scheduledAt',d.scheduled_at,'completedAt',d.completed_at,
      'blockers',d.retention_snapshot,'failureCategory',d.failure_category,
      'version',d.version
    )
    from public.account_deletion_requests d
    where d.user_id=auth.uid()
    order by d.requested_at desc limit 1
  ),'{}'::jsonb)
$$;

create function private.notify_account_deletion_status() returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare event_name text;
begin
  event_name:=case new.status
    when 'blocked_retention' then 'account_deletion_blocked'
    when 'verified' then 'account_deletion_scheduled'
    when 'processing' then 'account_deletion_processing'
    when 'completed' then 'account_deletion_completed'
    when 'failed' then 'account_deletion_failed'
    else null
  end;
  if event_name is null then return new; end if;
  insert into public.notification_outbox(
    user_id,event_type,channel,payload,deduplication_key
  ) values(
    new.user_id,event_name,'in_app',
    jsonb_build_object(
      'requestId',new.id,'status',new.status,'blockers',new.retention_snapshot,
      'failureCategory',new.failure_category,'version',new.version
    ),
    'account-deletion-state:'||new.id::text||':'||new.status||':'||new.version::text
  ) on conflict(channel,deduplication_key) do nothing;
  return new;
end $$;

create trigger account_deletion_status_notification
after insert or update of status,version on public.account_deletion_requests
for each row execute function private.notify_account_deletion_status();

create function public.get_data_export_manifest() returns jsonb
language sql
immutable
security definer
set search_path=''
as $$
  select '[
    "profile","roles","preferences","notificationPreferences","addresses",
    "legalAcceptances","devices","providerProfile","providerServices",
    "providerServiceAreas","providerAvailability","providerBlackouts",
    "providerDocuments","providerPortfolio","serviceRequests","requestAnswers",
    "requestMedia","requestTranslations","aiSessions","aiMessages",
    "aiDiagnostics","transcriptions","matches","offers","jobs","jobHistory",
    "jobEvents","completionProofs","conversations","messages",
    "messageAttachments","payments","refunds","financialHolds","cancellations",
    "disputes","supportCases","ratings","notifications","privacyRequests"
  ]'::jsonb
$$;

create or replace function public.build_data_export(
  p_request_id uuid,
  p_user_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not exists(
    select 1 from public.data_export_requests
    where id=p_request_id and user_id=p_user_id and status='processing'
  ) then raise exception 'EXPORT_REQUEST_NOT_PROCESSING'; end if;
  return jsonb_build_object(
    'schemaVersion','2','manifest',public.get_data_export_manifest(),
    'generatedAt',now(),'requestId',p_request_id,
    'profile',coalesce((select to_jsonb(p) from public.profiles p where p.id=p_user_id),'{}'::jsonb),
    'roles',coalesce((select jsonb_agg(to_jsonb(x) order by x.granted_at) from public.user_roles x where x.user_id=p_user_id),'[]'::jsonb),
    'preferences',coalesce((select to_jsonb(x) from public.user_preferences x where x.user_id=p_user_id),'{}'::jsonb),
    'notificationPreferences',coalesce((select to_jsonb(x) from public.notification_preferences x where x.user_id=p_user_id),'{}'::jsonb),
    'addresses',coalesce((select jsonb_agg(to_jsonb(x)-'location' order by x.created_at) from public.addresses x where x.user_id=p_user_id),'[]'::jsonb),
    'legalAcceptances',coalesce((select jsonb_agg(to_jsonb(x)-'ip_hash'-'user_agent_hash' order by x.accepted_at) from public.legal_acceptances x where x.user_id=p_user_id),'[]'::jsonb),
    'devices',coalesce((select jsonb_agg(to_jsonb(x)-'device_hash' order by x.last_seen_at) from public.user_devices x where x.user_id=p_user_id),'[]'::jsonb),
    'providerProfile',coalesce((select to_jsonb(x)-'commercial_registration_reference' from public.provider_profiles x where x.user_id=p_user_id),'{}'::jsonb),
    'providerServices',coalesce((select jsonb_agg(to_jsonb(x)) from public.provider_services x where x.provider_id=p_user_id),'[]'::jsonb),
    'providerServiceAreas',coalesce((select jsonb_agg(to_jsonb(x)-'center') from public.provider_service_areas x where x.provider_id=p_user_id),'[]'::jsonb),
    'providerAvailability',coalesce((select jsonb_agg(to_jsonb(x)) from public.provider_availability x where x.provider_id=p_user_id),'[]'::jsonb),
    'providerBlackouts',coalesce((select jsonb_agg(to_jsonb(x)) from public.provider_blackout_periods x where x.provider_id=p_user_id),'[]'::jsonb),
    'providerDocuments',coalesce((select jsonb_agg(to_jsonb(x)-'storage_path'-'content_hash') from public.provider_documents x where x.provider_id=p_user_id),'[]'::jsonb),
    'providerPortfolio',coalesce((select jsonb_agg(to_jsonb(x)-'storage_path') from public.provider_portfolio_items x where x.provider_id=p_user_id),'[]'::jsonb),
    'serviceRequests',coalesce((select jsonb_agg(to_jsonb(x)-'approximate_location' order by x.created_at) from public.service_requests x where x.customer_id=p_user_id),'[]'::jsonb),
    'requestAnswers',coalesce((select jsonb_agg(to_jsonb(x)) from public.service_request_answers x join public.service_requests r on r.id=x.request_id where r.customer_id=p_user_id),'[]'::jsonb),
    'requestMedia',coalesce((select jsonb_agg(to_jsonb(x)-'storage_path'-'thumbnail_path'-'content_hash') from public.request_media x where x.uploader_id=p_user_id),'[]'::jsonb),
    'requestTranslations',coalesce((select jsonb_agg(to_jsonb(x)) from public.request_translations x join public.service_requests r on r.id=x.request_id where r.customer_id=p_user_id),'[]'::jsonb),
    'aiSessions',coalesce((select jsonb_agg(to_jsonb(x)) from public.ai_sessions x where x.user_id=p_user_id),'[]'::jsonb),
    'aiMessages',coalesce((select jsonb_agg(to_jsonb(x)) from public.ai_messages x join public.ai_sessions s on s.id=x.session_id where s.user_id=p_user_id),'[]'::jsonb),
    'aiDiagnostics',coalesce((select jsonb_agg(to_jsonb(x)) from public.ai_diagnostics x join public.ai_sessions s on s.id=x.session_id where s.user_id=p_user_id),'[]'::jsonb),
    'transcriptions',coalesce((select jsonb_agg(to_jsonb(x)-'private_audio_path') from public.transcription_jobs x where x.user_id=p_user_id),'[]'::jsonb),
    'matches',coalesce((select jsonb_agg(to_jsonb(x)) from public.request_provider_matches x where x.provider_id=p_user_id),'[]'::jsonb),
    'offers',coalesce((select jsonb_agg(to_jsonb(x)) from public.offers x where x.provider_id=p_user_id),'[]'::jsonb),
    'jobs',coalesce((select jsonb_agg(to_jsonb(x)-'exact_address_id') from public.jobs x where p_user_id in (x.customer_id,x.provider_id)),'[]'::jsonb),
    'jobHistory',coalesce((select jsonb_agg(to_jsonb(x)) from public.job_status_history x join public.jobs j on j.id=x.job_id where p_user_id in (j.customer_id,j.provider_id)),'[]'::jsonb),
    'jobEvents',coalesce((select jsonb_agg(to_jsonb(x)) from public.job_events x join public.jobs j on j.id=x.job_id where p_user_id in (j.customer_id,j.provider_id)),'[]'::jsonb),
    'completionProofs',coalesce((select jsonb_agg(to_jsonb(x)-'storage_path') from public.completion_proofs x join public.jobs j on j.id=x.job_id where p_user_id in (j.customer_id,j.provider_id)),'[]'::jsonb),
    'conversations',coalesce((select jsonb_agg(to_jsonb(x)) from public.conversations x join public.jobs j on j.id=x.job_id where p_user_id in (j.customer_id,j.provider_id)),'[]'::jsonb),
    'messages',coalesce((select jsonb_agg(to_jsonb(x)) from public.messages x where x.sender_id=p_user_id),'[]'::jsonb),
    'messageAttachments',coalesce((select jsonb_agg(to_jsonb(x)-'storage_path') from public.message_attachments x where x.uploader_id=p_user_id),'[]'::jsonb),
    'payments',coalesce((select jsonb_agg(to_jsonb(x)-'provider_reference') from public.payments x where p_user_id in (x.customer_id,x.provider_id)),'[]'::jsonb),
    'refunds',coalesce((select jsonb_agg(to_jsonb(x)-'provider_reference') from public.refunds x join public.payments p on p.id=x.payment_id where p_user_id in (p.customer_id,p.provider_id)),'[]'::jsonb),
    'financialHolds',coalesce((select jsonb_agg(to_jsonb(x)) from public.financial_holds x join public.jobs j on j.id=x.job_id where p_user_id in (j.customer_id,j.provider_id)),'[]'::jsonb),
    'cancellations',coalesce((select jsonb_agg(to_jsonb(x)) from public.cancellation_requests x where x.requester_id=p_user_id),'[]'::jsonb),
    'disputes',coalesce((select jsonb_agg(to_jsonb(x)) from public.disputes x where x.opened_by=p_user_id),'[]'::jsonb),
    'supportCases',coalesce((select jsonb_agg(to_jsonb(x)) from public.support_cases x where x.opened_by=p_user_id),'[]'::jsonb),
    'ratings',coalesce((select jsonb_agg(to_jsonb(x)) from public.ratings x where p_user_id in (x.customer_id,x.provider_id)),'[]'::jsonb),
    'notifications',coalesce((select jsonb_agg(to_jsonb(x)) from public.notification_outbox x where x.user_id=p_user_id),'[]'::jsonb),
    'privacyRequests',jsonb_build_object(
      'deletion',coalesce((select jsonb_agg(to_jsonb(x)) from public.account_deletion_requests x where x.user_id=p_user_id),'[]'::jsonb),
      'exports',coalesce((select jsonb_agg(to_jsonb(x)-'signed_download_url'-'private_storage_path') from public.data_export_requests x where x.user_id=p_user_id),'[]'::jsonb)
    )
  );
end $$;

alter table public.ai_sessions
  add column suggested_category_slug text,
  add column confirmed_category_slug text,
  add column summary_requested_at timestamptz,
  add column latest_diagnostic_id uuid,
  add column version integer not null default 1,
  add column updated_at timestamptz not null default now();
alter table public.ai_messages
  add column client_message_id text,
  add column input_kind text not null default 'text'
    check (input_kind in ('text','voice','image','system')),
  add column metadata jsonb not null default '{}'::jsonb;
create unique index ai_message_client_id_idx
  on public.ai_messages(session_id,client_message_id)
  where client_message_id is not null;

create table public.ai_message_media (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.ai_messages(id) on delete cascade,
  file_upload_id uuid not null unique references public.file_uploads(id),
  media_kind text not null check (media_kind in ('voice','image','document')),
  created_at timestamptz not null default now()
);
alter table public.ai_message_media enable row level security;
create policy ai_message_media_owner_read on public.ai_message_media for select to authenticated
using(
  exists(
    select 1 from public.ai_messages m
    join public.ai_sessions s on s.id=m.session_id
    where m.id=ai_message_media.message_id and s.user_id=auth.uid()
  )
);
grant select on public.ai_message_media to authenticated;

create function public.start_ai_intake_session(
  p_locale text,
  p_idempotency_key text
) returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare actor uuid:=auth.uid(); result uuid;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_locale not in ('ar','en','ur','hi') then raise exception 'UNSUPPORTED_LOCALE'; end if;
  if length(coalesce(p_idempotency_key,'')) not between 8 and 128 then raise exception 'INVALID_IDEMPOTENCY_KEY'; end if;
  select id into result from ai_sessions
  where user_id=actor and purpose='service_request_intake'
    and status='active' and provider='session:'||p_idempotency_key
  limit 1;
  if result is not null then return result; end if;
  insert into ai_sessions(user_id,purpose,status,locale,provider)
  values(actor,'service_request_intake','active',p_locale,'session:'||p_idempotency_key)
  returning id into result;
  return result;
end $$;

alter table public.message_attachments add column file_upload_id uuid unique references public.file_uploads(id);
alter table public.completion_proofs add column file_upload_id uuid unique references public.file_uploads(id);

create function private.bind_completion_proof_upload() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.file_upload_id is null then
    select f.id into new.file_upload_id
    from public.file_uploads f
    where f.user_id=new.provider_id and f.purpose='completion_proof'
      and f.resource_id=new.job_id and f.final_path=new.storage_path and f.status='clean';
  end if;
  if new.file_upload_id is null then raise exception 'CLEAN_COMPLETION_UPLOAD_REQUIRED'; end if;
  return new;
end $$;
create trigger completion_proofs_bind_upload
  before insert on public.completion_proofs
  for each row execute function private.bind_completion_proof_upload();

create function private.bind_request_media_upload() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  update public.file_uploads
  set resource_id=new.request_id
  where user_id=new.uploader_id and purpose='request_media'
    and final_path=new.storage_path and status='clean'
    and resource_id is null;
  return new;
end $$;
create trigger request_media_bind_upload
  after insert on public.request_media
  for each row execute function private.bind_request_media_upload();

create function public.link_ai_session_to_request(
  p_session_id uuid,
  p_request_id uuid
) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid();
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from service_requests where id=p_request_id and customer_id=actor) then
    raise exception 'REQUEST_ACCESS_DENIED';
  end if;
  update ai_sessions set request_id=p_request_id,status='published',ended_at=now(),updated_at=now()
  where id=p_session_id and user_id=actor and status='active';
  if not found then raise exception 'AI_SESSION_NOT_LINKABLE'; end if;
  update ai_diagnostics set request_id=p_request_id where session_id=p_session_id;
  update transcription_jobs set request_id=p_request_id
  where user_id=actor and request_id is null
    and created_at>now()-interval '24 hours';
end $$;

create function public.send_message_with_attachments(
  p_conversation_id uuid,
  p_body text,
  p_upload_ids uuid[],
  p_client_message_id text
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  actor uuid:=auth.uid();
  created_message_id uuid;
  upload_id uuid;
  upload public.file_uploads%rowtype;
  attachment_count integer:=coalesce(array_length(p_upload_ids,1),0);
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if not private.can_access_conversation(p_conversation_id) then raise exception 'CONVERSATION_ACCESS_DENIED'; end if;
  if attachment_count>8 then raise exception 'TOO_MANY_ATTACHMENTS'; end if;
  if length(trim(coalesce(p_body,'')))=0 and attachment_count=0 then raise exception 'MESSAGE_CONTENT_REQUIRED'; end if;
  if length(coalesce(p_client_message_id,'')) not between 8 and 128 then raise exception 'INVALID_CLIENT_MESSAGE_ID'; end if;
  select m.id into created_message_id
  from messages m
  where m.sender_id=actor and m.client_message_id=p_client_message_id;
  if created_message_id is not null then
    return jsonb_build_object(
      'messageId',created_message_id,
      'attachmentCount',(
        select count(*) from message_attachments ma
        where ma.message_id=created_message_id
      )
    );
  end if;
  insert into messages(conversation_id,sender_id,body,client_message_id)
  values(
    p_conversation_id,actor,
    case when length(trim(coalesce(p_body,'')))=0 then 'attachment' else trim(p_body) end,
    p_client_message_id
  ) returning id into created_message_id;
  foreach upload_id in array coalesce(p_upload_ids,'{}'::uuid[]) loop
    select * into upload from file_uploads where id=upload_id for update;
    if upload.id is null or upload.user_id<>actor or upload.purpose<>'message_attachment'
      or upload.status<>'clean' or upload.final_path is null
      or (upload.resource_id is not null and upload.resource_id<>p_conversation_id) then
      raise exception 'CLEAN_MESSAGE_ATTACHMENT_REQUIRED';
    end if;
    update file_uploads set resource_id=p_conversation_id where id=upload.id;
    insert into message_attachments(
      message_id,uploader_id,storage_path,mime_type,size_bytes,file_upload_id
    ) values(
      created_message_id,actor,upload.final_path,coalesce(upload.detected_mime_type,upload.declared_mime_type),
      upload.size_bytes,upload.id
    );
  end loop;
  return jsonb_build_object('messageId',created_message_id,'attachmentCount',attachment_count);
end $$;

create function public.authorize_clean_media(
  p_user_id uuid,
  p_upload_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare item public.file_uploads%rowtype; allowed boolean:=false;
begin
  if auth.role()<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select * into item from public.file_uploads where id=p_upload_id and status='clean';
  if item.id is null or item.final_path is null then raise exception 'CLEAN_MEDIA_NOT_FOUND'; end if;
  if item.user_id=p_user_id then allowed:=true; end if;
  if item.purpose='message_attachment' then
    allowed:=allowed or exists(select 1 from public.conversation_members m
      where m.conversation_id=item.resource_id and m.user_id=p_user_id and m.left_at is null);
  elsif item.purpose='completion_proof' then
    allowed:=allowed or exists(select 1 from public.jobs j
      where j.id=item.resource_id and p_user_id in (j.customer_id,j.provider_id))
      or exists(
        select 1 from public.profiles profile
        join public.user_roles ur on ur.user_id=profile.id
        join public.admin_roles ar on ar.system_role=ur.role
        join public.admin_role_permissions arp on arp.admin_role_id=ar.id
        join public.admin_permissions ap on ap.id=arp.permission_id
        where profile.id=p_user_id and profile.status='active' and ur.revoked_at is null
          and ap.key='support.case.read'
      );
  elsif item.purpose='request_media' then
    allowed:=allowed or exists(select 1 from public.service_requests r
      where r.id=item.resource_id and r.customer_id=p_user_id)
      or exists(select 1 from public.request_provider_matches m
        where m.request_id=item.resource_id and m.provider_id=p_user_id
          and m.status in ('invited','viewed','offered','selected'));
  elsif item.purpose='support_evidence' then
    allowed:=allowed or exists(select 1 from public.support_cases c
      where c.id=item.resource_id and c.opened_by=p_user_id)
      or exists(
        select 1 from public.profiles profile
        join public.user_roles ur on ur.user_id=profile.id
        join public.admin_roles ar on ar.system_role=ur.role
        join public.admin_role_permissions arp on arp.admin_role_id=ar.id
        join public.admin_permissions ap on ap.id=arp.permission_id
        where profile.id=p_user_id and profile.status='active' and ur.revoked_at is null
          and ap.key='support.case.read'
      );
  elsif item.purpose='provider_document' then
    allowed:=allowed or item.user_id=p_user_id
      or exists(
        select 1 from public.profiles profile
        join public.user_roles ur on ur.user_id=profile.id
        join public.admin_roles ar on ar.system_role=ur.role
        join public.admin_role_permissions arp on arp.admin_role_id=ar.id
        join public.admin_permissions ap on ap.id=arp.permission_id
        where profile.id=p_user_id and profile.status='active' and ur.revoked_at is null
          and ap.key='provider.document.read'
      );
  end if;
  if not allowed then raise exception 'MEDIA_ACCESS_DENIED'; end if;
  return jsonb_build_object(
    'bucket',item.target_bucket,'path',item.final_path,
    'mimeType',coalesce(item.detected_mime_type,item.declared_mime_type),
    'sizeBytes',item.size_bytes,'uploadId',item.id
  );
end $$;

revoke all on function public.record_account_reauthentication(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.record_account_reauthentication(uuid,uuid,text) to service_role;
revoke all on function private.require_recent_reauthentication() from public,anon,authenticated;
revoke all on function private.deletion_blocker_snapshot(uuid) from public,anon,authenticated;
revoke all on function private.notify_account_deletion_status() from public,anon,authenticated;
revoke all on function public.request_account_deletion() from public,anon,authenticated;
revoke all on function public.request_data_export() from public,anon,authenticated;
revoke all on function public.reconcile_blocked_account_deletions(uuid) from public,anon,authenticated;
revoke all on function public.get_account_deletion_summary() from public,anon,authenticated;
revoke all on function public.get_data_export_manifest() from public,anon,authenticated;
revoke all on function public.start_ai_intake_session(text,text) from public,anon,authenticated;
revoke all on function public.send_message_with_attachments(uuid,text,uuid[],text) from public,anon,authenticated;
revoke all on function private.bind_completion_proof_upload() from public,anon,authenticated;
revoke all on function private.bind_request_media_upload() from public,anon,authenticated;
revoke all on function public.link_ai_session_to_request(uuid,uuid) from public,anon,authenticated;
revoke all on function public.authorize_clean_media(uuid,uuid) from public,anon,authenticated;
grant execute on function public.request_account_deletion() to authenticated;
grant execute on function public.request_data_export() to authenticated;
grant execute on function public.reconcile_blocked_account_deletions(uuid) to authenticated,service_role;
grant execute on function public.get_account_deletion_summary() to authenticated;
grant execute on function public.get_data_export_manifest() to authenticated,service_role;
grant execute on function public.start_ai_intake_session(text,text) to authenticated;
grant execute on function public.send_message_with_attachments(uuid,text,uuid[],text) to authenticated;
grant execute on function public.link_ai_session_to_request(uuid,uuid) to authenticated;
grant execute on function public.authorize_clean_media(uuid,uuid) to service_role;

-- The AI Edge handler persists a server-authoritative conversation while the
-- service role remains limited to the exact tables and operations it needs.
grant select,insert,update on public.ai_sessions to service_role;
grant select,insert on public.ai_messages to service_role;
grant select,insert on public.ai_diagnostics to service_role;
grant select on public.file_uploads to service_role;
grant insert on public.ai_message_media to service_role;

commit;
