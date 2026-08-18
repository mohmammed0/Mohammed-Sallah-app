begin;

create type public.request_timing_mode as enum ('asap','scheduled','flexible');

alter table public.service_requests
  add column timing_mode public.request_timing_mode;

update public.service_requests
set timing_mode=case
  when requested_start is not null and requested_end is not null then 'scheduled'::public.request_timing_mode
  else 'flexible'::public.request_timing_mode
end;

alter table public.service_requests
  alter column timing_mode set not null,
  alter column timing_mode set default 'flexible'::public.request_timing_mode,
  add constraint service_requests_timing_window_check check (
    (timing_mode='scheduled' and requested_start is not null and requested_end is not null
      and requested_end>requested_start)
    or (timing_mode='asap' and requested_start is not null and requested_end is not null
      and requested_end>requested_start)
    or (timing_mode='flexible' and requested_start is null and requested_end is null)
  );

alter table public.transcription_jobs
  add column client_message_id text;
create unique index transcription_jobs_user_client_message_unique
  on public.transcription_jobs(user_id,client_message_id);

comment on column public.service_requests.timing_mode is
  'Authoritative scheduling semantics. ASAP uses the publication instant plus a bounded 60-minute matching window; scheduled uses the customer window; flexible has no fixed window and providers supply arrival estimates.';

create function private.normalize_direct_request_timing() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.requested_start is not null and new.timing_mode='flexible' then
    new.timing_mode:='scheduled';
    new.requested_end:=coalesce(new.requested_end,new.requested_start+interval '60 minutes');
  end if;
  return new;
end $$;
create trigger normalize_direct_request_timing
before insert or update of requested_start,requested_end on public.service_requests for each row
execute function private.normalize_direct_request_timing();

-- Preserve the existing, security-reviewed publication body while adding a narrow
-- timing contract around it. This avoids duplicating authorization, media binding,
-- AI-session binding, idempotency and audit behavior.
alter function public.publish_service_request(jsonb)
  rename to publish_service_request_without_timing_mode;

create function public.publish_service_request(payload jsonb) returns uuid
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  mode public.request_timing_mode;
  start_at timestamptz;
  end_at timestamptz;
  normalized jsonb:=payload;
  result_id uuid;
begin
  mode:=coalesce(
    nullif(payload->>'timing_mode',''),
    nullif(payload->>'schedule_preference',''),
    case when nullif(payload->>'requested_start','') is not null then 'scheduled' else 'flexible' end
  )::public.request_timing_mode;
  if mode='asap' then
    start_at:=coalesce(nullif(payload->>'requested_start','')::timestamptz,now());
    end_at:=coalesce(nullif(payload->>'requested_end','')::timestamptz,start_at+interval '60 minutes');
    if end_at<=start_at or end_at>start_at+interval '60 minutes' then
      raise exception 'INVALID_ASAP_WINDOW';
    end if;
  elsif mode='scheduled' then
    start_at:=nullif(payload->>'requested_start','')::timestamptz;
    end_at:=nullif(payload->>'requested_end','')::timestamptz;
    if start_at is null or end_at is null or end_at<=start_at then
      raise exception 'VALID_SCHEDULED_WINDOW_REQUIRED';
    end if;
  else
    if nullif(payload->>'requested_start','') is not null or nullif(payload->>'requested_end','') is not null then
      raise exception 'FLEXIBLE_WINDOW_MUST_BE_EMPTY';
    end if;
    start_at:=null; end_at:=null;
  end if;
  normalized:=jsonb_set(normalized,'{requested_start}',coalesce(to_jsonb(start_at),'null'::jsonb),true);
  normalized:=jsonb_set(normalized,'{requested_end}',coalesce(to_jsonb(end_at),'null'::jsonb),true);
  result_id:=public.publish_service_request_without_timing_mode(normalized);
  update public.service_requests set timing_mode=mode where id=result_id and customer_id=auth.uid();
  update public.transcription_jobs t set request_id=result_id
  where t.user_id=auth.uid() and t.request_id is null and exists(
    select 1 from jsonb_array_elements(coalesce(payload->'media','[]'::jsonb)) m
    join public.file_uploads f on f.id=coalesce(
      nullif(m->>'upload_id','')::uuid,nullif(m->>'uploadId','')::uuid)
    where f.user_id=auth.uid() and f.final_path=t.private_audio_path
  );
  return result_id;
end $$;

revoke all on function public.publish_service_request_without_timing_mode(jsonb) from public,anon,authenticated;
revoke all on function public.publish_service_request(jsonb) from public,anon,authenticated;
grant execute on function public.publish_service_request(jsonb) to authenticated;

alter function public.get_provider_request_brief(uuid)
  rename to get_provider_request_brief_without_timing_mode;
create function public.get_provider_request_brief(p_request_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; mode public.request_timing_mode;
begin
  result:=public.get_provider_request_brief_without_timing_mode(p_request_id);
  select timing_mode into mode from public.service_requests where id=p_request_id;
  return jsonb_set(result,'{schedule,mode}',to_jsonb(mode),true);
end $$;
revoke all on function public.get_provider_request_brief_without_timing_mode(uuid) from public,anon,authenticated;
revoke all on function public.get_provider_request_brief(uuid) from public,anon,authenticated;
grant execute on function public.get_provider_request_brief(uuid) to authenticated;

create or replace function private.provider_request_eligibility(
  p_provider_id uuid,p_request_id uuid,p_at timestamptz,p_accepting_new_work boolean
) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare req public.service_requests%rowtype; provider public.provider_profiles%rowtype;
  profile_status text; category_restricted boolean; subcategory_restricted boolean:=false;
  service public.provider_services%rowtype; window_start timestamptz; window_end timestamptz;
  local_start timestamp; local_end timestamp; local_day smallint;
  distance_ratio numeric; distance_m numeric; reason text;
begin
  select * into req from public.service_requests where id=p_request_id;
  if req.id is null then return jsonb_build_object('eligible',false,'reason','request_not_found'); end if;
  if req.timing_mode='asap' then
    window_start:=p_at; window_end:=p_at+interval '60 minutes';
  elsif req.timing_mode='scheduled' then
    window_start:=req.requested_start; window_end:=req.requested_end;
  else
    window_start:=null; window_end:=null;
  end if;
  if req.timing_mode<>'flexible' and (window_start is null or window_end is null or window_end<=window_start) then
    return jsonb_build_object('eligible',false,'reason','invalid_request_window');
  end if;
  if window_start is not null then
    local_start:=window_start at time zone 'Asia/Riyadh';
    local_end:=window_end at time zone 'Asia/Riyadh';
    local_day:=extract(dow from local_start)::smallint;
  end if;
  select * into provider from public.provider_profiles where user_id=p_provider_id;
  select status::text into profile_status from public.profiles where id=p_provider_id;
  if provider.user_id is null then reason:='provider_profile_missing';
  elsif profile_status<>'active' then reason:='provider_account_inactive';
  elsif provider.verification_status<>'verified' then reason:='provider_not_verified';
  elsif p_accepting_new_work and not provider.accepting_requests then reason:='provider_not_accepting_requests'; end if;
  select * into service from public.provider_services
  where provider_id=p_provider_id and category_id=req.category_id and enabled;
  if reason is null and service.provider_id is null then reason:='category_not_supported'; end if;
  if reason is null and req.subcategory_id is not null
    and (service.subcategory_id is null or service.subcategory_id<>req.subcategory_id) then reason:='subcategory_not_supported'; end if;
  select restricted into category_restricted from public.service_categories where id=req.category_id;
  if req.subcategory_id is not null then select restricted into subcategory_restricted from public.service_subcategories where id=req.subcategory_id; end if;
  if reason is null and category_restricted and not exists(
    select 1 from public.provider_restricted_qualifications q where q.provider_id=p_provider_id
      and q.category_id=req.category_id and q.subcategory_id is null and q.qualified
  ) then reason:='restricted_category_unqualified'; end if;
  if reason is null and subcategory_restricted and not exists(
    select 1 from public.provider_restricted_qualifications q where q.provider_id=p_provider_id
      and q.category_id=req.category_id and q.subcategory_id=req.subcategory_id and q.qualified
  ) then reason:='restricted_subcategory_unqualified'; end if;
  if reason is null and p_accepting_new_work and req.timing_mode<>'flexible' and (
    local_start::date<>local_end::date or not exists(
      select 1 from public.provider_availability a where a.provider_id=p_provider_id
        and a.weekday=local_day and local_start::time>=a.start_time and local_end::time<=a.end_time
    )
  ) then reason:='outside_availability'; end if;
  if reason is null and p_accepting_new_work and req.timing_mode<>'flexible' and exists(
    select 1 from public.provider_blackout_periods b where b.provider_id=p_provider_id
      and b.starts_at<window_end and b.ends_at>window_start
  ) then reason:='blackout_overlap'; end if;
  if reason is null and p_accepting_new_work and provider.active_workload>=provider.max_active_jobs then reason:='capacity_reached'; end if;
  if reason is null and exists(select 1 from public.blocked_users b where
    (b.blocker_id=req.customer_id and b.blocked_id=p_provider_id)
    or (b.blocker_id=p_provider_id and b.blocked_id=req.customer_id)
  ) then reason:='customer_provider_blocked'; end if;
  select best.ratio,best.meters into distance_ratio,distance_m from (
    select case when a.center is null then 0::numeric else extensions.st_distance(a.center,req.approximate_location)::numeric/nullif(a.radius_m,0) end ratio,
      case when a.center is null then 0::numeric else extensions.st_distance(a.center,req.approximate_location)::numeric end meters
    from public.provider_service_areas a where a.provider_id=p_provider_id and a.enabled and a.city_id=req.city_id
      and (a.district_id is null or a.district_id=req.district_id) order by 1 asc limit 1
  ) best;
  if reason is null and (distance_ratio is null or distance_ratio>1) then reason:='outside_service_area'; end if;
  return jsonb_build_object('eligible',reason is null,'reason',reason,'timingMode',req.timing_mode,
    'windowStart',window_start,'windowEnd',window_end,'distanceMeters',round(coalesce(distance_m,0),2),
    'distanceScore',round(greatest(0::numeric,1-coalesce(distance_ratio,1)),6),
    'activeWorkload',coalesce(provider.active_workload,0),'capacity',coalesce(provider.max_active_jobs,0),
    'categoryRestricted',coalesce(category_restricted,false),'subcategoryRestricted',coalesce(subcategory_restricted,false));
end $$;

-- Restore the workflow state captured when the dispute opened. Completion
-- rejection is the one deliberate exception: it resumes into rework.
create or replace function private.apply_dispute_job_outcome(
  p_dispute_id uuid,p_actor uuid,p_reason text,p_idempotency_key text
) returns integer language plpgsql security definer set search_path='' as $$
declare dispute public.disputes%rowtype; item public.jobs%rowtype; final_version integer;
  resume_state public.job_status; policy text;
begin
  select * into dispute from public.disputes where id=p_dispute_id for update;
  if dispute.id is null then raise exception 'DISPUTE_NOT_FOUND'; end if;
  if dispute.target_job_status is null then raise exception 'DISPUTE_JOB_OUTCOME_REQUIRED'; end if;
  select * into item from public.jobs where id=dispute.job_id for update;
  if dispute.job_resolution_applied_at is not null then return item.version; end if;
  if dispute.resolution_outcome='resume' then
    if item.status<>'disputed' then raise exception 'INVALID_DISPUTE_RESUME_STATE'; end if;
    if dispute.completion_attempt_id is not null then resume_state:='in_progress'; policy:='completion_rejection_rework';
    else
      resume_state:=case dispute.pre_dispute_job_status
        when 'provider_selected' then 'provider_selected'::public.job_status
        when 'scheduled' then 'scheduled'::public.job_status
        when 'en_route' then 'scheduled'::public.job_status
        when 'arrived' then 'arrived'::public.job_status
        when 'diagnosing' then 'diagnosing'::public.job_status
        when 'awaiting_change_order_approval' then 'diagnosing'::public.job_status
        when 'in_progress' then 'in_progress'::public.job_status
        else null end;
      policy:=case dispute.pre_dispute_job_status when 'en_route' then 'en_route_safe_scheduled'
        when 'awaiting_change_order_approval' then 'change_order_safe_diagnosing'
        else 'restore_pre_dispute_state' end;
    end if;
    if resume_state is null then raise exception 'INVALID_DISPUTE_RESUME_STATE'; end if;
    update public.jobs set status=resume_state,version=version+1,updated_at=now() where id=item.id;
    if resume_state<>'en_route' then
      update public.job_location_sharing_sessions
      set stopped_at=coalesce(stopped_at,now()),stop_reason=coalesce(stop_reason,'dispute_resume_policy')
      where job_id=item.id and stopped_at is null;
    end if;
    insert into public.job_status_history(job_id,actor_id,previous_status,new_status,reason,idempotency_key,metadata)
    values(item.id,p_actor,item.status,resume_state,p_reason,p_idempotency_key,jsonb_build_object(
      'disputeId',dispute.id,'resolutionOutcome','resume','preDisputeStatus',dispute.pre_dispute_job_status,
      'resumePolicy',policy,'completionAttemptId',dispute.completion_attempt_id));
    insert into public.job_events(job_id,event_type,actor_id,payload) values(item.id,'dispute_work_resumed',p_actor,
      jsonb_build_object('disputeId',dispute.id,'resumeState',resume_state,'resumePolicy',policy,
        'completionAttemptId',dispute.completion_attempt_id));
    final_version:=item.version+1;
  elsif dispute.resolution_outcome='complete' then
    final_version:=private.apply_job_terminal_outcome(item.id,p_actor,'completed','dispute',dispute.id,p_reason,
      p_idempotency_key,jsonb_build_object('disputeId',dispute.id,'adminResolved',true));
  else
    final_version:=private.apply_job_terminal_outcome(item.id,p_actor,'cancelled','dispute',dispute.id,p_reason,
      p_idempotency_key,jsonb_build_object('disputeId',dispute.id,'adminResolved',true));
  end if;
  update public.disputes set job_resolution_applied_at=coalesce(job_resolution_applied_at,now()) where id=dispute.id;
  insert into public.dispute_events(dispute_id,actor_id,event_type,reason,payload)
  values(dispute.id,p_actor,'job_outcome_applied',p_reason,jsonb_build_object('outcome',dispute.resolution_outcome,
    'jobVersion',final_version,'resumeState',resume_state,'resumePolicy',policy));
  return final_version;
end $$;

revoke all on function private.apply_dispute_job_outcome(uuid,uuid,text,text) from public,anon,authenticated;

-- Onboarding performs several writes in one command. Ignore its transient row
-- states; the wrapper below evaluates the final committed eligibility diff.
create or replace function private.invalidate_provider_marketplace_eligibility()
returns trigger language plpgsql security definer set search_path='' as $$
declare provider uuid; invalid_reason text; affected record; changed_category uuid;
begin
  if current_setting('sallah.provider_onboarding_command',true)='true' then
    return case when tg_op='DELETE' then old else new end;
  end if;
  provider:=case tg_table_name
    when 'profiles' then coalesce(nullif(to_jsonb(new)->>'id',''),nullif(to_jsonb(old)->>'id',''))::uuid
    when 'provider_profiles' then coalesce(nullif(to_jsonb(new)->>'user_id',''),nullif(to_jsonb(old)->>'user_id',''))::uuid
    else coalesce(nullif(to_jsonb(new)->>'provider_id',''),nullif(to_jsonb(old)->>'provider_id',''))::uuid end;
  changed_category:=case when tg_table_name in ('provider_services','provider_restricted_qualifications')
    then coalesce(nullif(to_jsonb(new)->>'category_id',''),nullif(to_jsonb(old)->>'category_id',''))::uuid else null end;
  invalid_reason:=case tg_table_name when 'profiles' then 'provider_account_inactive'
    when 'provider_profiles' then case when to_jsonb(new)->>'verification_status'<>'verified' then 'provider_not_verified'
      else 'provider_not_accepting_requests' end
    when 'provider_services' then 'provider_service_changed' else 'restricted_qualification_revoked' end;
  update public.request_provider_matches m set status='closed'
  from public.service_requests r where m.request_id=r.id and m.provider_id=provider
    and m.status in ('invited','viewed','offered')
    and (changed_category is null or r.category_id=changed_category);
  for affected in update public.offers o set status='withdrawn',version=o.version+1,updated_at=now()
    from public.service_requests r where o.request_id=r.id and o.provider_id=provider and o.status='active'
      and (changed_category is null or r.category_id=changed_category) returning o.id,o.request_id
  loop
    insert into public.offer_status_history(offer_id,actor_id,previous_status,new_status,reason)
    values(affected.id,auth.uid(),'active','withdrawn',invalid_reason);
    insert into public.notification_outbox(user_id,event_type,channel,payload,deduplication_key)
    select r.customer_id,'provider_offer_invalidated','in_app',jsonb_build_object(
      'requestId',affected.request_id,'offerId',affected.id,'reason',invalid_reason),
      'provider-offer-invalidated:'||affected.id::text from public.service_requests r
    where r.id=affected.request_id on conflict(channel,deduplication_key) do nothing;
  end loop;
  insert into public.provider_job_eligibility_reviews(job_id,provider_id,reason)
  select j.id,j.provider_id,invalid_reason from public.jobs j join public.service_requests r on r.id=j.request_id
  where j.provider_id=provider and j.status not in ('completed','cancelled')
    and (changed_category is null or r.category_id=changed_category)
  on conflict (job_id) where status='open' do nothing;
  return case when tg_op='DELETE' then old else new end;
end $$;

alter function public.upsert_provider_onboarding(jsonb)
  rename to upsert_provider_onboarding_without_final_diff;

create function private.preserve_unchanged_onboarding_service() returns trigger
language plpgsql set search_path='' as $$
declare requested jsonb:=coalesce(nullif(current_setting('sallah.onboarding_category_ids',true),''),'[]')::jsonb;
begin
  if current_setting('sallah.provider_onboarding_command',true)='true' then
    if old.enabled and not new.enabled and requested ? old.category_id::text then return old; end if;
    if to_jsonb(new)-'updated_at' is not distinct from to_jsonb(old)-'updated_at' then return null; end if;
  end if;
  return new;
end $$;
create trigger provider_services_preserve_unchanged_onboarding
before update on public.provider_services for each row
execute function private.preserve_unchanged_onboarding_service();

create function public.upsert_provider_onboarding(payload jsonb) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare actor uuid:=auth.uid(); result jsonb; before_profile public.provider_profiles%rowtype;
  after_profile public.provider_profiles%rowtype; removed_category uuid; prior_accepting boolean;
  identity_changed boolean; documents_added boolean; before_services jsonb;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  perform set_config('sallah.onboarding_category_ids',coalesce((
    select jsonb_agg(distinct category_id)::text from (
      select value->>'categoryId' category_id from jsonb_array_elements(coalesce(payload->'services','[]'::jsonb))
      union all
      select value#>>'{}' from jsonb_array_elements(coalesce(payload->'categoryIds','[]'::jsonb))
    ) requested where category_id is not null
  ),'[]'),true);
  select * into before_profile from public.provider_profiles where user_id=actor;
  prior_accepting:=before_profile.accepting_requests;
  select coalesce(jsonb_agg(jsonb_build_object('category_id',category_id,'subcategory_id',subcategory_id,
    'enabled',enabled)),'[]'::jsonb) into before_services
  from public.provider_services where provider_id=actor;
  result:=public.upsert_provider_onboarding_without_final_diff(payload);
  select * into after_profile from public.provider_profiles where user_id=actor;
  identity_changed:=before_profile.user_id is not null and (
    before_profile.kind is distinct from after_profile.kind
    or before_profile.business_name is distinct from after_profile.business_name
    or before_profile.commercial_registration_reference is distinct from after_profile.commercial_registration_reference
  );
  documents_added:=jsonb_array_length(coalesce(payload->'documents','[]'::jsonb))>0;
  if before_profile.verification_status='verified' and not identity_changed and not documents_added then
    update public.provider_profiles set verification_status='verified',accepting_requests=false
    where user_id=actor;
    update public.provider_profiles set accepting_requests=prior_accepting where user_id=actor;
  end if;
  for removed_category in
    select b.category_id from jsonb_to_recordset(before_services) as b(
      category_id uuid,subcategory_id uuid,enabled boolean
    ) where b.enabled and not exists(select 1 from public.provider_services s
      where s.provider_id=actor and s.category_id=b.category_id and s.enabled
      and s.subcategory_id is not distinct from b.subcategory_id)
  loop
    update public.request_provider_matches m set status='closed' from public.service_requests r
    where m.request_id=r.id and m.provider_id=actor and r.category_id=removed_category
      and m.status in ('invited','viewed','offered');
    with withdrawn as (
      update public.offers o set status='withdrawn',version=o.version+1,updated_at=now()
      from public.service_requests r where o.request_id=r.id and o.provider_id=actor
        and o.status='active' and r.category_id=removed_category returning o.id
    ) insert into public.offer_status_history(offer_id,actor_id,previous_status,new_status,reason)
      select id,actor,'active','withdrawn','provider_service_removed' from withdrawn;
  end loop;
  if identity_changed or documents_added then
    update public.request_provider_matches set status='closed' where provider_id=actor
      and status in ('invited','viewed','offered');
    with withdrawn as (
      update public.offers set status='withdrawn',version=version+1,updated_at=now()
      where provider_id=actor and status='active' returning id
    ) insert into public.offer_status_history(offer_id,actor_id,previous_status,new_status,reason)
      select id,actor,'active','withdrawn','provider_material_identity_changed' from withdrawn;
    insert into public.provider_job_eligibility_reviews(job_id,provider_id,reason)
    select id,provider_id,'provider_material_identity_changed' from public.jobs
    where provider_id=actor and status not in ('completed','cancelled')
    on conflict (job_id) where status='open' do nothing;
  end if;
  return result||jsonb_build_object('materialIdentityChange',identity_changed or documents_added);
end $$;

revoke all on function public.upsert_provider_onboarding_without_final_diff(jsonb) from public,anon,authenticated;
revoke all on function public.upsert_provider_onboarding(jsonb) from public,anon,authenticated;
grant execute on function public.upsert_provider_onboarding(jsonb) to authenticated;

commit;
