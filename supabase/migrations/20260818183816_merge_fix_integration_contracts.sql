begin;

create type public.request_timing_mode as enum ('asap','scheduled','flexible');

alter table public.service_requests
  add column timing_mode public.request_timing_mode;

update public.service_requests
set requested_end=case
      when requested_start is not null
        and (requested_end is null or requested_end<=requested_start)
        then requested_start+interval '60 minutes'
      when requested_start is null then null
      else requested_end
    end,
    requested_start=case when requested_start is null then null else requested_start end,
    timing_mode=case
      when requested_start is not null then 'scheduled'::public.request_timing_mode
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
  add column client_message_id text,
  add column claim_expires_at timestamptz,
  add column claim_token uuid;
create unique index transcription_jobs_user_client_message_unique
  on public.transcription_jobs(user_id,client_message_id);

create type public.provider_service_review_status as enum (
  'draft','submitted','approved','more_information_required','rejected','suspended'
);
alter table public.provider_services
  add column review_status public.provider_service_review_status,
  add column submitted_at timestamptz,
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references public.profiles(id),
  add column review_reason text;
update public.provider_services s
set review_status=case
      when not s.enabled then 'draft'::public.provider_service_review_status
      when p.verification_status='verified' then 'approved'::public.provider_service_review_status
      when p.verification_status in ('submitted','under_review')
        then 'submitted'::public.provider_service_review_status
      else 'draft'::public.provider_service_review_status
    end,
    submitted_at=case when s.enabled and p.verification_status in ('submitted','under_review')
      then coalesce(s.created_at,now()) else null end,
    reviewed_at=case when s.enabled and p.verification_status='verified'
      then coalesce(s.created_at,now()) else null end
from public.provider_profiles p where p.user_id=s.provider_id;
alter table public.provider_services
  alter column review_status set default 'draft'::public.provider_service_review_status,
  alter column review_status set not null,
  add constraint provider_service_review_reason_check check (
    review_reason is null or char_length(trim(review_reason)) between 5 and 2000
  );
create index provider_services_approved_category_idx
  on public.provider_services(category_id,provider_id)
  where enabled and review_status='approved';

comment on column public.service_requests.timing_mode is
  'Authoritative scheduling semantics. ASAP uses the publication instant plus a bounded 60-minute matching window; scheduled uses the customer window; flexible has no fixed window and providers supply arrival estimates.';
comment on column public.provider_services.review_status is
  'Reviewer-controlled eligibility for one provider category/subcategory. Global provider verification does not approve a newly added service.';

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

-- Replace the authoritative publication body so timing is present on the row
-- observed by the AFTER INSERT matching trigger. All dependent writes remain in
-- this transaction; any later failure rolls the request and its matches back.
create or replace function public.publish_service_request(payload jsonb) returns uuid
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare actor uuid:=auth.uid(); v_request_id uuid; v_address_id uuid; v_city_id uuid;
  v_category_id uuid; v_suggested_category_id uuid; session ai_sessions%rowtype;
  idem text:=payload->>'idempotency_key'; request_hash text; replay jsonb;
  lat double precision; lon double precision; item jsonb; diag jsonb;
  selected_slug text; suggested_slug text; selection_source text; upload file_uploads%rowtype;
  v_session_id uuid; media_count integer; image_count integer:=0; media_bytes bigint:=0;
  mode public.request_timing_mode; start_at timestamptz; end_at timestamptz;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from profiles where id=actor and status='active') then
    raise exception 'ACCOUNT_NOT_ACTIVE';
  end if;
  if coalesce((payload->>'customer_approved')::boolean,false) is not true then
    raise exception 'CUSTOMER_APPROVAL_REQUIRED';
  end if;
  if coalesce((payload->>'category_confirmed_by_user')::boolean,false) is not true then
    raise exception 'CATEGORY_CONFIRMATION_REQUIRED';
  end if;
  selected_slug:=nullif(trim(coalesce(
    payload->>'selected_category_slug',payload->>'category_slug',''
  )),'');
  suggested_slug:=nullif(trim(coalesce(
    payload->>'suggested_category_slug',payload->'ai_diagnostic'->>'suggestedCategorySlug',''
  )),'');
  selection_source:=payload->>'category_selection_source';
  if selected_slug is null or selection_source not in (
    'ai_suggestion','customer_correction','manual'
  ) then raise exception 'CATEGORY_SELECTION_REQUIRED'; end if;
  if selection_source='ai_suggestion' and selected_slug is distinct from suggested_slug then
    raise exception 'AI_CATEGORY_SELECTION_MISMATCH';
  end if;
  request_hash:=private.canonical_request_hash(payload);
  perform pg_advisory_xact_lock(hashtextextended(
    actor::text||':publish_service_request:'||idem,0
  ));
  replay:=private.idempotency_replay(actor,'publish_service_request_v3',idem,request_hash);
  if replay is not null then return (replay->>'id')::uuid; end if;

  mode:=coalesce(
    nullif(payload->>'timing_mode',''),
    nullif(payload->>'schedule_preference',''),
    case when nullif(payload->>'requested_start','') is not null then 'scheduled' else 'flexible' end
  )::public.request_timing_mode;
  if mode='asap' then
    start_at:=now();
    end_at:=start_at+interval '60 minutes';
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

  v_session_id:=nullif(payload->>'ai_session_id','')::uuid;
  if v_session_id is not null then
    select * into session from ai_sessions
    where id=v_session_id and user_id=actor and status='active' for update;
    if session.id is null then raise exception 'ACTIVE_AI_SESSION_REQUIRED'; end if;
  end if;
  media_count:=jsonb_array_length(coalesce(payload->'media','[]'::jsonb));
  if media_count>8 then raise exception 'TOO_MANY_REQUEST_MEDIA'; end if;
  insert into idempotency_keys(user_id,command,key,request_hash)
  values(actor,'publish_service_request_v3',idem,request_hash);
  select id into v_city_id from cities
  where code=coalesce(payload->>'city_code','riyadh') and enabled limit 1;
  select id into v_category_id from service_categories
  where slug=selected_slug and enabled limit 1;
  if suggested_slug is not null then
    select id into v_suggested_category_id from service_categories
    where slug=suggested_slug and enabled limit 1;
  end if;
  if v_city_id is null or v_category_id is null then
    raise exception 'CATALOG_CONFIGURATION_REQUIRED';
  end if;
  diag:=payload->'ai_diagnostic';
  lat:=(payload->'exact_location'->>'latitude')::double precision;
  lon:=(payload->'exact_location'->>'longitude')::double precision;
  if lat not between 16 and 33 or lon not between 34 and 56 then
    raise exception 'LOCATION_OUTSIDE_SAUDI_ARABIA';
  end if;
  insert into addresses(user_id,city_id,label,formatted_address,location)
  values(actor,v_city_id,'Service location','Private location selected in app',
    st_setsrid(st_makepoint(lon,lat),4326)::geography)
  returning id into v_address_id;
  insert into service_requests(
    customer_id,category_id,suggested_category_id,category_selection_source,
    category_confirmed_at,city_id,title,structured_description,original_text,
    original_locale,urgency,timing_mode,requested_start,requested_end,approximate_location,
    exact_address_id,ai_provider,ai_model,ai_prompt_version,customer_approved_at,
    published_at,status
  ) values(
    actor,v_category_id,v_suggested_category_id,selection_source,now(),v_city_id,
    left(coalesce(nullif(payload->>'title',''),payload->>'structured_description'),120),
    payload->>'structured_description',payload->>'original_text',
    coalesce(payload->>'locale','ar'),
    coalesce((payload->>'urgency')::request_urgency,'normal'),
    mode,start_at,end_at,
    st_setsrid(st_makepoint(round(lon::numeric,2),round(lat::numeric,2)),4326)::geography,
    v_address_id,diag->'metadata'->>'provider',diag->'metadata'->>'model',
    diag->'metadata'->>'promptVersion',now(),now(),'published'
  ) returning id into v_request_id;
  insert into request_visibility(request_id) values(v_request_id);
  insert into request_status_history(
    request_id,actor_id,new_status,reason,idempotency_key,metadata
  ) values(
    v_request_id,actor,'published','customer_approved',idem,
    jsonb_build_object('categorySelectionSource',selection_source,
      'selectedCategorySlug',selected_slug,'suggestedCategorySlug',suggested_slug,
      'aiSessionId',v_session_id,'timingMode',mode,
      'requestedStart',start_at,'requestedEnd',end_at)
  );
  insert into request_publication_events(
    request_id,actor_id,request_version,approval_snapshot,idempotency_key
  ) values(v_request_id,actor,1,payload||jsonb_build_object(
    'timing_mode',mode,'requested_start',start_at,'requested_end',end_at
  ),idem);

  for item in select value from jsonb_array_elements(coalesce(payload->'media','[]'::jsonb)) loop
    select * into upload from file_uploads
    where id=coalesce(
      nullif(item->>'upload_id','')::uuid,nullif(item->>'uploadId','')::uuid
    ) for update;
    if upload.id is null or upload.user_id<>actor
      or upload.purpose not in ('request_media','request_audio')
      or upload.status<>'clean' or upload.final_path is null
      or (upload.resource_id is not null and upload.resource_id<>v_request_id) then
      raise exception 'CLEAN_REQUEST_MEDIA_REQUIRED';
    end if;
    media_bytes:=media_bytes+upload.size_bytes;
    if coalesce(upload.detected_mime_type,upload.declared_mime_type)
      like 'image/%' then image_count:=image_count+1; end if;
    if image_count>4 or media_bytes>41943040 then
      raise exception 'REQUEST_MEDIA_LIMIT_EXCEEDED';
    end if;
    update file_uploads set resource_id=v_request_id where id=upload.id;
    insert into request_media(
      request_id,uploader_id,storage_path,mime_type,size_bytes,content_hash,
      media_kind,upload_status,file_upload_id
    ) values(
      v_request_id,actor,upload.final_path,
      coalesce(upload.detected_mime_type,upload.declared_mime_type),
      upload.size_bytes,upload.content_sha256,
      case when upload.purpose='request_audio' then 'voice' else 'request' end,
      'uploaded',upload.id
    );
  end loop;
  for item in select to_jsonb(value)
    from jsonb_array_elements_text(coalesce(diag->'safetyFlags','[]'::jsonb))
  loop
    insert into request_safety_flags(
      request_id,flag_type,source,severity,guidance_version
    ) values(v_request_id,item#>>'{}','ai','high','safety-v1');
  end loop;
  if v_session_id is not null then
    update ai_sessions set request_id=v_request_id,status='published',
      confirmed_category_slug=selected_slug,ended_at=now(),updated_at=now(),
      version=version+1 where id=v_session_id;
    update ai_diagnostics d set request_id=v_request_id where d.session_id=v_session_id;
  end if;
  update transcription_jobs t set request_id=v_request_id
  where t.user_id=actor and t.request_id is null and exists(
    select 1 from file_uploads f
    where f.user_id=actor and f.purpose='request_audio'
      and f.resource_id=v_request_id and f.final_path=t.private_audio_path
  );
  perform private.complete_idempotent_command(
    actor,'publish_service_request_v3',idem,jsonb_build_object(
      'id',v_request_id,'aiSessionId',v_session_id,'categorySelectionSource',selection_source,
      'mediaCount',media_count,'timingMode',mode,'requestedStart',start_at,'requestedEnd',end_at
    )
  );
  return v_request_id;
end $$;

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
    window_start:=req.requested_start; window_end:=req.requested_end;
  elsif req.timing_mode='scheduled' then
    window_start:=req.requested_start; window_end:=req.requested_end;
  else
    window_start:=null; window_end:=null;
  end if;
  if req.timing_mode<>'flexible' and (window_start is null or window_end is null or window_end<=window_start) then
    return jsonb_build_object('eligible',false,'reason','invalid_request_window');
  end if;
  if req.timing_mode='asap' and p_at>=window_end then
    return jsonb_build_object('eligible',false,'reason','asap_window_expired',
      'timingMode',req.timing_mode,'windowStart',window_start,'windowEnd',window_end);
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
  where provider_id=p_provider_id and category_id=req.category_id and enabled
    and review_status='approved';
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

create or replace function private.guard_provider_service_qualification() returns trigger
language plpgsql security definer set search_path='' as $$
declare provider uuid:=case when tg_op='DELETE' then old.provider_id else new.provider_id end;
  reviewer boolean:=private.has_role(array[
    'verification_reviewer','super_admin'
  ]::public.user_role[]);
begin
  if tg_op='INSERT' then
    if new.qualified_for_restricted and not reviewer then
      raise exception 'PROVIDER_SELF_QUALIFICATION_FORBIDDEN';
    end if;
  elsif tg_op='UPDATE' then
    if new.qualified_for_restricted is distinct from old.qualified_for_restricted
      and not reviewer then
      raise exception 'PROVIDER_SELF_QUALIFICATION_FORBIDDEN';
    end if;
  end if;
  if tg_op='UPDATE' then
    if (
      new.review_status is distinct from old.review_status
      or new.submitted_at is distinct from old.submitted_at
      or new.reviewed_at is distinct from old.reviewed_at
      or new.reviewed_by is distinct from old.reviewed_by
      or new.review_reason is distinct from old.review_reason
    ) and not reviewer
      and current_user<>'postgres'
      and current_setting('sallah.provider_onboarding_command',true) is distinct from 'true' then
      raise exception 'PROVIDER_SERVICE_REVIEW_SELF_CHANGE_FORBIDDEN';
    end if;
  elsif tg_op='INSERT' and (
    new.review_status<>'draft'
    or new.submitted_at is not null
    or new.reviewed_at is not null
    or new.reviewed_by is not null
    or new.review_reason is not null
  ) and not reviewer
    and current_user<>'postgres'
    and current_setting('sallah.provider_onboarding_command',true) is distinct from 'true' then
    raise exception 'PROVIDER_SERVICE_REVIEW_SELF_CHANGE_FORBIDDEN';
  end if;
  if auth.uid()=provider and not reviewer
    and current_setting('sallah.provider_onboarding_command',true) is distinct from 'true' then
    raise exception 'PROVIDER_SERVICE_ONBOARDING_REQUIRED';
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;

create function public.review_provider_service(
  p_provider_id uuid,p_category_id uuid,
  p_decision public.provider_service_review_status,p_reason text,p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare actor uuid:=auth.uid(); item public.provider_services%rowtype;
  request_hash text; replay jsonb; result_payload jsonb;
begin
  if not private.has_role(array['verification_reviewer','super_admin']::user_role[]) then
    raise exception 'VERIFICATION_PERMISSION_REQUIRED';
  end if;
  if p_decision not in ('approved','more_information_required','rejected','suspended') then
    raise exception 'INVALID_PROVIDER_SERVICE_DECISION';
  end if;
  if length(trim(coalesce(p_reason,''))) not between 5 and 2000 then
    raise exception 'REASON_REQUIRED';
  end if;
  request_hash:=private.canonical_request_hash(jsonb_build_object(
    'providerId',p_provider_id,'categoryId',p_category_id,
    'decision',p_decision,'reason',trim(p_reason)
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    actor::text||':provider_service_review:'||p_idempotency_key,0
  ));
  replay:=private.idempotency_replay(
    actor,'provider_service_review_v1',p_idempotency_key,request_hash
  );
  if replay is not null then return replay; end if;
  select * into item from provider_services
  where provider_id=p_provider_id and category_id=p_category_id and enabled for update;
  if item.provider_id is null then raise exception 'ACTIVE_PROVIDER_SERVICE_REQUIRED'; end if;
  if item.review_status not in ('submitted','more_information_required','approved') then
    raise exception 'PROVIDER_SERVICE_NOT_REVIEWABLE';
  end if;
  insert into idempotency_keys(user_id,command,key,request_hash)
  values(actor,'provider_service_review_v1',p_idempotency_key,request_hash);
  update provider_services set review_status=p_decision,reviewed_at=now(),reviewed_by=actor,
    review_reason=trim(p_reason)
  where provider_id=p_provider_id and category_id=p_category_id;
  insert into admin_audit_logs(
    actor_id,action,target_type,target_id,reason,correlation_id,before_snapshot,after_snapshot
  ) values(actor,'provider.service.review','provider',p_provider_id,trim(p_reason),gen_random_uuid(),
    jsonb_build_object('categoryId',p_category_id,'reviewStatus',item.review_status,
      'subcategoryId',item.subcategory_id),
    jsonb_build_object('categoryId',p_category_id,'reviewStatus',p_decision,
      'subcategoryId',item.subcategory_id));
  result_payload:=jsonb_build_object('providerId',p_provider_id,'categoryId',p_category_id,
    'subcategoryId',item.subcategory_id,'status',p_decision);
  perform private.complete_idempotent_command(
    actor,'provider_service_review_v1',p_idempotency_key,result_payload
  );
  return result_payload;
end $$;

create function public.claim_transcription_job(
  p_user_id uuid,p_client_message_id text,p_private_audio_path text,
  p_source_locale text,p_provider text,p_model text
) returns jsonb
language plpgsql set search_path=public,pg_temp as $$
declare item public.transcription_jobs%rowtype; inserted_id uuid; next_claim_token uuid:=gen_random_uuid();
begin
  if current_user<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if length(trim(coalesce(p_client_message_id,''))) not between 8 and 128 then
    raise exception 'INVALID_CLIENT_MESSAGE_ID';
  end if;
  insert into transcription_jobs(
    user_id,client_message_id,private_audio_path,source_locale,provider,model,status,
    claim_expires_at,claim_token
  ) values(
    p_user_id,p_client_message_id,p_private_audio_path,p_source_locale,p_provider,p_model,'processing',
    now()+interval '15 minutes',next_claim_token
  ) on conflict(user_id,client_message_id) do nothing returning id into inserted_id;
  select * into item from transcription_jobs
  where user_id=p_user_id and client_message_id=p_client_message_id for update;
  if item.private_audio_path is distinct from p_private_audio_path then
    return jsonb_build_object('state','media_conflict','jobId',item.id);
  end if;
  if inserted_id is not null then
    return jsonb_build_object(
      'state','claimed','jobId',item.id,'claimToken',item.claim_token
    );
  end if;
  if item.status='completed' and item.transcript is not null then
    return jsonb_build_object('state','completed','jobId',item.id,'transcript',item.transcript);
  end if;
  if item.status='processing' and item.claim_expires_at>now() then
    return jsonb_build_object('state','in_progress','jobId',item.id);
  end if;
  update transcription_jobs set status='processing',source_locale=p_source_locale,
    provider=p_provider,model=p_model,transcript=null,completed_at=null,error_category=null,
    claim_expires_at=now()+interval '15 minutes',claim_token=next_claim_token
  where id=item.id;
  return jsonb_build_object(
    'state','claimed','jobId',item.id,'claimToken',next_claim_token
  );
end $$;

revoke all on function public.review_provider_service(
  uuid,uuid,public.provider_service_review_status,text,text
) from public,anon,authenticated;
grant execute on function public.review_provider_service(
  uuid,uuid,public.provider_service_review_status,text,text
) to authenticated;
revoke all on function public.claim_transcription_job(uuid,text,text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.claim_transcription_job(uuid,text,text,text,text,text)
  to service_role;
grant select,insert,update on public.transcription_jobs to service_role;

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
  if tg_table_name='provider_services' then
    if tg_op='UPDATE' and not (
      old.enabled and old.review_status='approved'
      and (
        not new.enabled
        or new.review_status<>'approved'
        or new.category_id is distinct from old.category_id
        or new.subcategory_id is distinct from old.subcategory_id
      )
    ) then
      return new;
    end if;
    if tg_op='DELETE' and not (old.enabled and old.review_status='approved') then
      return old;
    end if;
  end if;
  provider:=case tg_table_name
    when 'profiles' then coalesce(nullif(to_jsonb(new)->>'id',''),nullif(to_jsonb(old)->>'id',''))::uuid
    when 'provider_profiles' then coalesce(nullif(to_jsonb(new)->>'user_id',''),nullif(to_jsonb(old)->>'user_id',''))::uuid
    else coalesce(nullif(to_jsonb(new)->>'provider_id',''),nullif(to_jsonb(old)->>'provider_id',''))::uuid end;
  changed_category:=case when tg_table_name in ('provider_services','provider_restricted_qualifications')
    then coalesce(nullif(to_jsonb(old)->>'category_id',''),nullif(to_jsonb(new)->>'category_id',''))::uuid else null end;
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

drop trigger provider_service_invalidates_marketplace on public.provider_services;
create trigger provider_service_invalidates_marketplace
after update of category_id,subcategory_id,enabled,review_status or delete
on public.provider_services for each row
execute function private.invalidate_provider_marketplace_eligibility();

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
  service_row record; submit boolean:=coalesce((payload->>'submit')::boolean,true);
  final_services jsonb; final_service_count integer; final_area_count integer;
  final_result jsonb; history_ids_before uuid[]; idem text:=payload->>'idempotencyKey';
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  perform set_config('sallah.provider_onboarding_command','true',true);
  perform set_config('sallah.onboarding_category_ids',coalesce((
    select jsonb_agg(distinct category_id)::text from (
      select value->>'categoryId' category_id from jsonb_array_elements(coalesce(payload->'services','[]'::jsonb))
      union all
      select value#>>'{}' from jsonb_array_elements(coalesce(payload->'categoryIds','[]'::jsonb))
    ) requested where category_id is not null
  ),'[]'),true);
  select * into before_profile from public.provider_profiles where user_id=actor;
  prior_accepting:=before_profile.accepting_requests;
  select coalesce(array_agg(id),'{}'::uuid[]) into history_ids_before
  from public.provider_status_history where provider_id=actor;
  select coalesce(jsonb_agg(jsonb_build_object(
    'category_id',category_id,'subcategory_id',subcategory_id,'enabled',enabled,
    'review_status',review_status,'submitted_at',submitted_at,'reviewed_at',reviewed_at,
    'reviewed_by',reviewed_by,'review_reason',review_reason
  )),'[]'::jsonb) into before_services
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
    delete from public.provider_status_history where provider_id=actor
      and not (id=any(history_ids_before))
      and previous_status='verified' and new_status='submitted'
      and reason='material_change_requires_review';
  end if;
  for service_row in
    select s.provider_id,s.category_id,s.subcategory_id,b.review_status,b.submitted_at,
      b.reviewed_at,b.reviewed_by,b.review_reason
    from public.provider_services s
    left join jsonb_to_recordset(before_services) as b(
      category_id uuid,subcategory_id uuid,enabled boolean,
      review_status public.provider_service_review_status,submitted_at timestamptz,
      reviewed_at timestamptz,reviewed_by uuid,review_reason text
    ) on b.category_id=s.category_id and b.enabled
      and b.subcategory_id is not distinct from s.subcategory_id
    where s.provider_id=actor and s.enabled
  loop
    if service_row.review_status is not null
      and not (
        submit and service_row.review_status in ('draft','more_information_required','rejected')
      ) then
      update public.provider_services set
        review_status=service_row.review_status,
        submitted_at=service_row.submitted_at,
        reviewed_at=service_row.reviewed_at,
        reviewed_by=service_row.reviewed_by,
        review_reason=service_row.review_reason
      where provider_id=actor and category_id=service_row.category_id;
    else
      update public.provider_services set
        review_status=case when submit then 'submitted'::public.provider_service_review_status
          else 'draft'::public.provider_service_review_status end,
        submitted_at=case when submit then now() else null end,
        reviewed_at=null,reviewed_by=null,review_reason=null
      where provider_id=actor and category_id=service_row.category_id;
    end if;
  end loop;
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
  select * into after_profile from public.provider_profiles where user_id=actor;
  select count(*),coalesce(jsonb_agg(jsonb_build_object(
    'categoryId',category_id,'subcategoryId',subcategory_id,'enabled',enabled,
    'reviewStatus',review_status,'submittedAt',submitted_at,'reviewedAt',reviewed_at,
    'reviewedBy',reviewed_by,'reviewReason',review_reason
  ) order by category_id),'[]'::jsonb)
  into final_service_count,final_services
  from public.provider_services where provider_id=actor and enabled;
  select count(*) into final_area_count from public.provider_service_areas where provider_id=actor and enabled;
  final_result:=jsonb_build_object(
    'providerId',actor,'status',after_profile.verification_status,
    'serviceCount',final_service_count,'areaCount',final_area_count,
    'services',final_services,'submitted',submit,
    'materialChange',identity_changed or documents_added,
    'materialIdentityChange',identity_changed or documents_added,
    'serviceReviewRequired',exists(
      select 1 from public.provider_services where provider_id=actor and enabled
        and review_status<>'approved'
    )
  );
  update public.idempotency_keys set response=final_result,updated_at=now()
  where user_id=actor and command='provider_onboarding_v2' and key=idem and status='completed';
  return final_result;
end $$;

revoke all on function public.upsert_provider_onboarding_without_final_diff(jsonb) from public,anon,authenticated;
revoke all on function public.upsert_provider_onboarding(jsonb) from public,anon,authenticated;
grant execute on function public.upsert_provider_onboarding(jsonb) to authenticated;

commit;
