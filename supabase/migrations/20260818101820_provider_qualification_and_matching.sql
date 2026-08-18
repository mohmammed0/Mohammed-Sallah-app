begin;

alter table public.provider_profiles
  add column max_active_jobs integer not null default 5 check (max_active_jobs between 1 and 100);

create table public.provider_restricted_qualifications (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.provider_profiles(user_id) on delete cascade,
  category_id uuid not null references public.service_categories(id),
  subcategory_id uuid references public.service_subcategories(id),
  qualified boolean not null,
  reason text not null check (char_length(trim(reason)) between 5 and 2000),
  reviewed_by uuid not null references public.profiles(id),
  reviewed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (provider_id,category_id,subcategory_id)
);
alter table public.provider_restricted_qualifications enable row level security;
create policy provider_qualifications_owner_or_reviewer_read
  on public.provider_restricted_qualifications for select to authenticated
  using (
    provider_id=auth.uid()
    or private.has_role(array['verification_reviewer','super_admin']::public.user_role[])
  );
grant select on public.provider_restricted_qualifications to authenticated;

create table public.provider_qualification_events (
  id uuid primary key default gen_random_uuid(),
  qualification_id uuid not null references public.provider_restricted_qualifications(id),
  provider_id uuid not null references public.provider_profiles(user_id),
  category_id uuid not null references public.service_categories(id),
  subcategory_id uuid references public.service_subcategories(id),
  actor_id uuid not null references public.profiles(id),
  event_type text not null check (event_type in ('granted','revoked')),
  reason text not null,
  created_at timestamptz not null default now()
);
alter table public.provider_qualification_events enable row level security;
create policy provider_qualification_events_owner_or_reviewer_read
  on public.provider_qualification_events for select to authenticated
  using (
    provider_id=auth.uid()
    or private.has_role(array['verification_reviewer','super_admin']::public.user_role[])
  );
create trigger provider_qualification_events_immutable
before update or delete on public.provider_qualification_events
for each row execute function private.reject_event_mutation();
grant select on public.provider_qualification_events to authenticated;

create function private.guard_provider_service_qualification() returns trigger
language plpgsql security definer set search_path='' as $$
declare provider uuid:=coalesce(new.provider_id,old.provider_id); profile_status public.verification_status;
begin
  if tg_op<>'DELETE'
    and coalesce(new.qualified_for_restricted,false) is distinct from coalesce(old.qualified_for_restricted,false)
    and not private.has_role(array['verification_reviewer','super_admin']::public.user_role[]) then
    raise exception 'PROVIDER_SELF_QUALIFICATION_FORBIDDEN';
  end if;
  if auth.uid()=provider and current_setting('sallah.provider_onboarding_command',true) is distinct from 'true' then
    select verification_status into profile_status from public.provider_profiles where user_id=provider;
    if profile_status='verified' and (
      tg_op in ('INSERT','DELETE')
      or old.category_id is distinct from new.category_id
      or old.subcategory_id is distinct from new.subcategory_id
      or old.enabled is distinct from new.enabled
    ) then
      update public.provider_profiles
      set verification_status='submitted',accepting_requests=false,updated_at=now()
      where user_id=provider;
      insert into public.provider_status_history(
        provider_id,previous_status,new_status,actor_id,reason
      ) values(provider,'verified','submitted',provider,'material_service_change_requires_review');
    end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
create trigger provider_service_qualification_guard
before insert or update or delete on public.provider_services
for each row execute function private.guard_provider_service_qualification();

create function private.guard_provider_profile_material_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare material boolean;
begin
  if auth.uid()<>new.user_id or private.has_role(array['verification_reviewer','super_admin']::public.user_role[]) then
    return new;
  end if;
  material:=old.kind is distinct from new.kind
    or old.business_name is distinct from new.business_name
    or old.commercial_registration_reference is distinct from new.commercial_registration_reference;
  if new.verification_status is distinct from old.verification_status
    and current_setting('sallah.provider_onboarding_command',true) is distinct from 'true'
    and not (
      old.verification_status='verified'
      and new.verification_status='submitted'
      and not new.accepting_requests
    ) then
    raise exception 'PROVIDER_VERIFICATION_SELF_CHANGE_FORBIDDEN';
  end if;
  if new.accepting_requests and old.verification_status<>'verified' then
    raise exception 'VERIFIED_PROVIDER_REQUIRED';
  end if;
  if old.verification_status='verified' and material then
    new.verification_status:='submitted';
    new.accepting_requests:=false;
  end if;
  return new;
end $$;
create trigger provider_profile_material_change_guard
before update on public.provider_profiles
for each row execute function private.guard_provider_profile_material_change();
grant update(bio,preferred_brief_locale) on public.provider_profiles to authenticated;

create function private.mark_provider_document_for_review() returns trigger
language plpgsql security definer set search_path='' as $$
declare prior public.verification_status;
begin
  if auth.uid()=new.provider_id
    and current_setting('sallah.provider_onboarding_command',true) is distinct from 'true' then
    select verification_status into prior from public.provider_profiles where user_id=new.provider_id for update;
    if prior='verified' then
      update public.provider_profiles set verification_status='submitted',accepting_requests=false,updated_at=now()
      where user_id=new.provider_id;
      insert into public.provider_status_history(provider_id,previous_status,new_status,actor_id,reason)
      values(new.provider_id,prior,'submitted',new.provider_id,'material_document_change_requires_review');
    end if;
  end if;
  return new;
end $$;
create trigger provider_document_material_change_guard
after insert or update of storage_path,content_hash,document_type,deleted_at on public.provider_documents
for each row execute function private.mark_provider_document_for_review();

create function public.set_provider_restricted_qualification(
  p_provider_id uuid,p_category_id uuid,p_subcategory_id uuid,p_qualified boolean,
  p_reason text,p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  actor uuid:=auth.uid(); qualification_id uuid; request_hash text; replay jsonb; result_payload jsonb;
  category_restricted boolean; subcategory_restricted boolean;
begin
  if not private.has_role(array['verification_reviewer','super_admin']::user_role[]) then
    raise exception 'VERIFICATION_PERMISSION_REQUIRED';
  end if;
  if length(trim(coalesce(p_reason,''))) not between 5 and 2000 then raise exception 'REASON_REQUIRED'; end if;
  select restricted into category_restricted from service_categories where id=p_category_id and enabled;
  if category_restricted is null then raise exception 'CATEGORY_NOT_FOUND'; end if;
  if p_subcategory_id is not null then
    select restricted into subcategory_restricted from service_subcategories
    where id=p_subcategory_id and category_id=p_category_id and enabled;
    if subcategory_restricted is null then raise exception 'SUBCATEGORY_NOT_FOUND'; end if;
  end if;
  if not category_restricted and not coalesce(subcategory_restricted,false) then
    raise exception 'RESTRICTED_QUALIFICATION_NOT_APPLICABLE';
  end if;
  if not exists(select 1 from provider_profiles where user_id=p_provider_id) then raise exception 'PROVIDER_NOT_FOUND'; end if;
  request_hash:=private.canonical_request_hash(jsonb_build_object(
    'providerId',p_provider_id,'categoryId',p_category_id,'subcategoryId',p_subcategory_id,
    'qualified',p_qualified,'reason',trim(p_reason)));
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':provider_qualification:'||p_idempotency_key,0));
  replay:=private.idempotency_replay(actor,'provider_qualification_v1',p_idempotency_key,request_hash);
  if replay is not null then return replay; end if;
  insert into idempotency_keys(user_id,command,key,request_hash)
  values(actor,'provider_qualification_v1',p_idempotency_key,request_hash) on conflict do nothing;
  insert into provider_restricted_qualifications(
    provider_id,category_id,subcategory_id,qualified,reason,reviewed_by
  ) values(p_provider_id,p_category_id,p_subcategory_id,p_qualified,trim(p_reason),actor)
  on conflict (provider_id,category_id,subcategory_id) do update set
    qualified=excluded.qualified,reason=excluded.reason,reviewed_by=excluded.reviewed_by,
    reviewed_at=now(),updated_at=now()
  returning id into qualification_id;
  if p_subcategory_id is null then
    update provider_services set qualified_for_restricted=p_qualified
    where provider_id=p_provider_id and category_id=p_category_id;
  end if;
  insert into provider_qualification_events(
    qualification_id,provider_id,category_id,subcategory_id,actor_id,event_type,reason
  ) values(qualification_id,p_provider_id,p_category_id,p_subcategory_id,actor,
    case when p_qualified then 'granted' else 'revoked' end,trim(p_reason));
  insert into admin_audit_logs(
    actor_id,action,target_type,target_id,reason,correlation_id,before_snapshot,after_snapshot
  ) values(actor,case when p_qualified then 'provider.qualification.grant' else 'provider.qualification.revoke' end,
    'provider',p_provider_id,trim(p_reason),qualification_id,
    null,jsonb_build_object('categoryId',p_category_id,'subcategoryId',p_subcategory_id,'qualified',p_qualified));
  result_payload:=jsonb_build_object('qualificationId',qualification_id,'providerId',p_provider_id,
    'categoryId',p_category_id,'subcategoryId',p_subcategory_id,'qualified',p_qualified);
  perform private.complete_idempotent_command(actor,'provider_qualification_v1',p_idempotency_key,result_payload);
  return result_payload;
end $$;

create or replace function public.review_provider(
  p_provider_id uuid,p_decision verification_status,p_reason text,p_idempotency_key text
) returns void
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare actor uuid:=auth.uid(); previous verification_status; request_hash text; replay jsonb; audit_id uuid:=gen_random_uuid();
begin
  if not private.has_role(array['verification_reviewer','super_admin']::user_role[]) then raise exception 'VERIFICATION_PERMISSION_REQUIRED'; end if;
  if p_decision not in ('verified','rejected','more_information_required','suspended') then raise exception 'INVALID_VERIFICATION_DECISION'; end if;
  if length(trim(coalesce(p_reason,'')))<5 then raise exception 'REASON_REQUIRED'; end if;
  request_hash:=private.canonical_request_hash(jsonb_build_object(
    'providerId',p_provider_id,'decision',p_decision,'reason',trim(p_reason)));
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':review_provider:'||p_idempotency_key,0));
  replay:=private.idempotency_replay(actor,'review_provider_v2',p_idempotency_key,request_hash);
  if replay is not null then return; end if;
  select verification_status into previous from provider_profiles where user_id=p_provider_id for update;
  if previous is null then raise exception 'PROVIDER_NOT_FOUND'; end if;
  insert into idempotency_keys(user_id,command,key,request_hash)
  values(actor,'review_provider_v2',p_idempotency_key,request_hash) on conflict do nothing;
  update provider_profiles set verification_status=p_decision,
    accepting_requests=case when p_decision='verified' then true else false end,updated_at=now()
  where user_id=p_provider_id;
  insert into provider_status_history(provider_id,previous_status,new_status,actor_id,reason)
  values(p_provider_id,previous,p_decision,actor,trim(p_reason));
  insert into admin_audit_logs(id,actor_id,action,target_type,target_id,reason,correlation_id,before_snapshot,after_snapshot)
  values(audit_id,actor,'provider.review','provider',p_provider_id,trim(p_reason),audit_id,
    jsonb_build_object('status',previous),jsonb_build_object('status',p_decision));
  perform private.complete_idempotent_command(actor,'review_provider_v2',p_idempotency_key,
    jsonb_build_object('providerId',p_provider_id,'status',p_decision));
end $$;

create or replace function public.upsert_provider_onboarding(payload jsonb) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  actor uuid:=auth.uid(); previous verification_status; result_status verification_status;
  previous_profile provider_profiles%rowtype; service_value jsonb; area jsonb; slot jsonb; document jsonb;
  submit boolean:=coalesce((payload->>'submit')::boolean,true); material_change boolean:=false;
  services jsonb; service_count integer; area_count integer:=jsonb_array_length(coalesce(payload->'serviceAreas','[]'::jsonb));
  previous_services jsonb; requested_services jsonb; idem text:=payload->>'idempotencyKey';
  request_hash text; replay jsonb; result_payload jsonb; upload file_uploads%rowtype;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from profiles where id=actor and status='active') then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  if payload ? 'qualifiedForRestricted'
    or exists(select 1 from jsonb_array_elements(coalesce(payload->'services','[]'::jsonb)) x where x ? 'qualifiedForRestricted') then
    raise exception 'PROVIDER_SELF_QUALIFICATION_FORBIDDEN';
  end if;
  if coalesce(length(trim(payload->>'bio')),0)<10 then raise exception 'BIO_REQUIRED'; end if;
  if payload ? 'services' then
    services:=coalesce(payload->'services','[]'::jsonb);
  else
    services:=coalesce((select jsonb_agg(jsonb_build_object('categoryId',value#>>'{}','subcategoryId',null))
      from jsonb_array_elements(coalesce(payload->'categoryIds','[]'::jsonb))),'[]'::jsonb);
  end if;
  service_count:=jsonb_array_length(services);
  if area_count=0 and payload->>'cityId' is not null then
    payload:=jsonb_set(payload,'{serviceAreas}',jsonb_build_array(jsonb_build_object(
      'cityId',payload->>'cityId','location',payload->'location',
      'radiusKm',coalesce((payload->>'serviceRadiusKm')::integer,20))));
    area_count:=1;
  end if;
  if service_count not between 1 and 20 then raise exception 'PROVIDER_SERVICES_REQUIRED'; end if;
  if area_count not between 1 and 20 then raise exception 'PROVIDER_SERVICE_AREAS_REQUIRED'; end if;
  request_hash:=private.canonical_request_hash(payload||jsonb_build_object('normalizedServices',services));
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':provider_onboarding:'||idem,0));
  replay:=private.idempotency_replay(actor,'provider_onboarding_v2',idem,request_hash);
  if replay is not null then return replay; end if;
  insert into idempotency_keys(user_id,command,key,request_hash)
  values(actor,'provider_onboarding_v2',idem,request_hash) on conflict do nothing;
  perform set_config('sallah.provider_onboarding_command','true',true);
  insert into user_roles(user_id,role) values(actor,'provider') on conflict(user_id,role) do update set revoked_at=null;
  select * into previous_profile from provider_profiles where user_id=actor for update;
  previous:=previous_profile.verification_status;
  select coalesce(jsonb_agg(jsonb_build_object('categoryId',category_id,'subcategoryId',subcategory_id)
    order by category_id,subcategory_id),'[]'::jsonb) into previous_services
  from provider_services where provider_id=actor and enabled;
  select coalesce(jsonb_agg(jsonb_build_object(
    'categoryId',(x->>'categoryId')::uuid,'subcategoryId',nullif(x->>'subcategoryId','')::uuid)
    order by (x->>'categoryId')::uuid,nullif(x->>'subcategoryId','')::uuid),'[]'::jsonb)
  into requested_services from jsonb_array_elements(services) x;
  if previous='verified' then
    material_change:=previous_profile.kind is distinct from (payload->>'kind')::provider_kind
      or previous_profile.business_name is distinct from nullif(trim(payload->>'businessName'),'')
      or previous_profile.commercial_registration_reference is distinct from nullif(trim(payload->>'commercialRegistrationReference'),'')
      or previous_services is distinct from requested_services
      or jsonb_array_length(coalesce(payload->'documents','[]'::jsonb))>0;
  end if;
  result_status:=case
    when previous='verified' and material_change then 'submitted'::verification_status
    when previous='verified' then 'verified'::verification_status
    when submit then 'submitted'::verification_status
    else 'draft'::verification_status end;
  insert into provider_profiles(
    user_id,kind,business_name,commercial_registration_reference,bio,preferred_brief_locale,
    verification_status,service_radius_km,accepting_requests
  ) values(
    actor,(payload->>'kind')::provider_kind,nullif(trim(payload->>'businessName'),''),
    nullif(trim(payload->>'commercialRegistrationReference'),''),trim(payload->>'bio'),
    coalesce(payload->>'locale','ar'),result_status,coalesce((payload->>'serviceRadiusKm')::numeric,20),
    previous='verified' and not material_change and previous_profile.accepting_requests
  ) on conflict(user_id) do update set
    kind=excluded.kind,business_name=excluded.business_name,
    commercial_registration_reference=excluded.commercial_registration_reference,bio=excluded.bio,
    preferred_brief_locale=excluded.preferred_brief_locale,verification_status=result_status,
    service_radius_km=excluded.service_radius_km,
    accepting_requests=case when result_status='verified' then provider_profiles.accepting_requests else false end,
    updated_at=now();
  update provider_services set enabled=false where provider_id=actor;
  for service_value in select value from jsonb_array_elements(services) loop
    if not exists(select 1 from service_categories where id=(service_value->>'categoryId')::uuid and enabled) then
      raise exception 'INVALID_PROVIDER_SERVICE';
    end if;
    if nullif(service_value->>'subcategoryId','') is not null and not exists(
      select 1 from service_subcategories where id=(service_value->>'subcategoryId')::uuid
        and category_id=(service_value->>'categoryId')::uuid and enabled
    ) then raise exception 'INVALID_PROVIDER_SUBCATEGORY'; end if;
    insert into provider_services(provider_id,category_id,subcategory_id,enabled,qualified_for_restricted)
    values(actor,(service_value->>'categoryId')::uuid,nullif(service_value->>'subcategoryId','')::uuid,true,false)
    on conflict(provider_id,category_id) do update set
      subcategory_id=excluded.subcategory_id,enabled=true,
      qualified_for_restricted=provider_services.qualified_for_restricted;
  end loop;
  delete from provider_service_areas where provider_id=actor;
  for area in select value from jsonb_array_elements(payload->'serviceAreas') loop
    if not exists(select 1 from cities where id=(area->>'cityId')::uuid and enabled) then raise exception 'INVALID_PROVIDER_CITY'; end if;
    if (area->'location'->>'latitude')::double precision not between 16 and 33
      or (area->'location'->>'longitude')::double precision not between 34 and 56 then
      raise exception 'LOCATION_OUTSIDE_SAUDI_ARABIA';
    end if;
    insert into provider_service_areas(provider_id,city_id,center,radius_m)
    values(actor,(area->>'cityId')::uuid,st_setsrid(st_makepoint(
      (area->'location'->>'longitude')::double precision,(area->'location'->>'latitude')::double precision
    ),4326)::geography,(coalesce((area->>'radiusKm')::numeric,(payload->>'serviceRadiusKm')::numeric,20)*1000)::integer);
  end loop;
  delete from provider_availability where provider_id=actor;
  if jsonb_array_length(coalesce(payload->'availability','[]'::jsonb))=0 then
    insert into provider_availability(provider_id,weekday,start_time,end_time)
    select actor,day,'08:00'::time,'18:00'::time from generate_series(0,6) day;
  else
    for slot in select value from jsonb_array_elements(payload->'availability') loop
      insert into provider_availability(provider_id,weekday,start_time,end_time)
      values(actor,(slot->>'weekday')::smallint,(slot->>'start')::time,(slot->>'end')::time);
    end loop;
  end if;
  for document in select value from jsonb_array_elements(coalesce(payload->'documents','[]'::jsonb)) loop
    select * into upload from file_uploads
    where user_id=actor and purpose='provider_document' and status='clean'
      and final_path=document->>'storagePath' for update;
    if upload.id is null or upload.content_sha256 is distinct from document->>'contentHash'
      or coalesce(upload.detected_mime_type,upload.declared_mime_type) is distinct from document->>'mimeType'
      or upload.size_bytes is distinct from (document->>'sizeBytes')::bigint then
      raise exception 'CLEAN_PROVIDER_DOCUMENT_REQUIRED';
    end if;
    insert into provider_documents(provider_id,document_type,storage_path,content_hash,mime_type,size_bytes,status)
    values(actor,document->>'documentType',upload.final_path,upload.content_sha256,
      coalesce(upload.detected_mime_type,upload.declared_mime_type),upload.size_bytes,
      (case when submit then 'submitted' else 'draft' end)::public.verification_status);
  end loop;
  if submit and not exists(select 1 from provider_documents where provider_id=actor and deleted_at is null) then
    raise exception 'PROVIDER_DOCUMENT_REQUIRED';
  end if;
  if previous is distinct from result_status then
    insert into provider_status_history(provider_id,previous_status,new_status,actor_id,reason)
    values(actor,previous,result_status,actor,case when material_change then 'material_change_requires_review'
      when submit then 'provider_submitted_onboarding' else 'provider_saved_draft' end);
  end if;
  result_payload:=jsonb_build_object('providerId',actor,'status',result_status,'serviceCount',service_count,
    'areaCount',area_count,'submitted',submit,'materialChange',material_change);
  perform private.complete_idempotent_command(actor,'provider_onboarding_v2',idem,result_payload);
  return result_payload;
end $$;

create function private.provider_request_eligibility(
  p_provider_id uuid,p_request_id uuid,p_at timestamptz default now()
) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  req public.service_requests%rowtype; provider public.provider_profiles%rowtype; profile_status text;
  category_restricted boolean; subcategory_restricted boolean:=false; service public.provider_services%rowtype;
  local_day smallint; local_time time; distance_ratio numeric; distance_m numeric; reason text;
begin
  select * into req from public.service_requests where id=p_request_id;
  if req.id is null then return jsonb_build_object('eligible',false,'reason','request_not_found'); end if;
  select * into provider from public.provider_profiles where user_id=p_provider_id;
  select status::text into profile_status from public.profiles where id=p_provider_id;
  if provider.user_id is null then reason:='provider_profile_missing';
  elsif profile_status<>'active' then reason:='provider_account_inactive';
  elsif provider.verification_status<>'verified' then reason:='provider_not_verified';
  elsif not provider.accepting_requests then reason:='provider_not_accepting_requests';
  end if;
  select * into service from public.provider_services
  where provider_id=p_provider_id and category_id=req.category_id and enabled;
  if reason is null and service.provider_id is null then reason:='category_not_supported'; end if;
  if reason is null and req.subcategory_id is not null
    and service.subcategory_id is not null and service.subcategory_id<>req.subcategory_id then
    reason:='subcategory_not_supported';
  end if;
  select restricted into category_restricted from public.service_categories where id=req.category_id;
  if req.subcategory_id is not null then
    select restricted into subcategory_restricted from public.service_subcategories where id=req.subcategory_id;
  end if;
  if reason is null and category_restricted and not exists(
    select 1 from public.provider_restricted_qualifications q
    where q.provider_id=p_provider_id and q.category_id=req.category_id
      and q.subcategory_id is null and q.qualified
  ) then reason:='restricted_category_unqualified'; end if;
  if reason is null and subcategory_restricted and not exists(
    select 1 from public.provider_restricted_qualifications q
    where q.provider_id=p_provider_id and q.category_id=req.category_id
      and q.subcategory_id=req.subcategory_id and q.qualified
  ) then reason:='restricted_subcategory_unqualified'; end if;
  local_day:=extract(dow from p_at at time zone 'Asia/Riyadh')::smallint;
  local_time:=(p_at at time zone 'Asia/Riyadh')::time;
  if reason is null and not exists(
    select 1 from public.provider_availability a where a.provider_id=p_provider_id
      and a.weekday=local_day and local_time>=a.start_time and local_time<a.end_time
  ) then reason:='outside_availability'; end if;
  if reason is null and exists(
    select 1 from public.provider_blackout_periods b where b.provider_id=p_provider_id
      and p_at>=b.starts_at and p_at<b.ends_at
  ) then reason:='blackout_active'; end if;
  if reason is null and provider.active_workload>=provider.max_active_jobs then reason:='capacity_reached'; end if;
  if reason is null and exists(
    select 1 from public.blocked_users b where
      (b.blocker_id=req.customer_id and b.blocked_id=p_provider_id)
      or (b.blocker_id=p_provider_id and b.blocked_id=req.customer_id)
  ) then reason:='customer_provider_blocked'; end if;
  select best.ratio,best.meters into distance_ratio,distance_m
  from (
    select case when a.center is null then 0::numeric
      else extensions.st_distance(a.center,req.approximate_location)::numeric/nullif(a.radius_m,0) end ratio,
      case when a.center is null then 0::numeric
      else extensions.st_distance(a.center,req.approximate_location)::numeric end meters
    from public.provider_service_areas a
    where a.provider_id=p_provider_id and a.enabled and a.city_id=req.city_id
      and (a.district_id is null or a.district_id=req.district_id)
    order by 1 asc limit 1
  ) best;
  if reason is null and (distance_ratio is null or distance_ratio>1) then reason:='outside_service_area'; end if;
  return jsonb_build_object(
    'eligible',reason is null,'reason',reason,'distanceMeters',round(coalesce(distance_m,0),2),
    'distanceScore',round(greatest(0::numeric,1-coalesce(distance_ratio,1)),6),
    'activeWorkload',coalesce(provider.active_workload,0),'capacity',coalesce(provider.max_active_jobs,0),
    'categoryRestricted',coalesce(category_restricted,false),
    'subcategoryRestricted',coalesce(subcategory_restricted,false)
  );
end $$;

create or replace function public.run_matching(p_request_id uuid,p_limit integer default 20) returns uuid
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare actor uuid:=auth.uid(); run_id uuid; req service_requests%rowtype;
begin
  if p_limit not between 1 and 100 then raise exception 'INVALID_MATCH_LIMIT'; end if;
  select * into req from service_requests where id=p_request_id for update;
  if req.id is null or req.status not in ('published','matching','receiving_offers') then raise exception 'REQUEST_NOT_MATCHABLE'; end if;
  if auth.role()<>'service_role' and actor is distinct from req.customer_id then raise exception 'MATCHING_ACCESS_DENIED'; end if;
  insert into matching_runs(request_id,configuration_version,weights)
  values(p_request_id,'v2-restricted-distance','{"distance":0.25,"availability":0.15,"rating":0.2,"response":0.15,"workload":0.15,"completedJobs":0.1}')
  returning id into run_id;
  insert into matching_candidates(matching_run_id,provider_id,eligible,score,score_components,exclusion_reason)
  select run_id,p.user_id,(eligibility->>'eligible')::boolean,
    case when (eligibility->>'eligible')::boolean then
      least(1,p.rating_average/5)*.2 + least(1,p.response_rate)*.15
      + greatest(0,1-p.active_workload::numeric/p.max_active_jobs)*.15
      + least(1,p.completed_jobs::numeric/100)*.1 + .15
      + ((eligibility->>'distanceScore')::numeric*.25) else null end,
    jsonb_build_object('rating',p.rating_average,'responseRate',p.response_rate,
      'activeWorkload',p.active_workload,'capacity',p.max_active_jobs,
      'completedJobs',p.completed_jobs,'availability',1,
      'distanceMeters',eligibility->'distanceMeters','distanceScore',eligibility->'distanceScore'),
    eligibility->>'reason'
  from provider_profiles p
  cross join lateral private.provider_request_eligibility(p.user_id,p_request_id,now()) eligibility;
  update request_provider_matches m set status='closed'
  where m.request_id=p_request_id and m.status in ('invited','viewed','offered')
    and not exists(select 1 from matching_candidates c
      where c.matching_run_id=run_id and c.provider_id=m.provider_id and c.eligible);
  insert into request_provider_matches(request_id,provider_id,matching_run_id,score,expires_at)
  select p_request_id,provider_id,run_id,score,now()+interval '24 hours'
  from matching_candidates where matching_run_id=run_id and eligible
  order by score desc,provider_id limit p_limit
  on conflict(request_id,provider_id) do update set matching_run_id=excluded.matching_run_id,
    score=excluded.score,status='invited',expires_at=excluded.expires_at;
  update matching_runs set status='completed',candidate_count=(select count(*) from matching_candidates where matching_run_id=run_id),
    completed_at=now() where id=run_id;
  update service_requests set status='receiving_offers',version=version+1,updated_at=now() where id=p_request_id;
  insert into notification_outbox(user_id,event_type,channel,payload,deduplication_key)
  select provider_id,'provider_matched','in_app',jsonb_build_object('requestId',p_request_id),
    run_id::text||':'||provider_id::text from request_provider_matches where matching_run_id=run_id
  on conflict do nothing;
  return run_id;
end $$;

create or replace function public.submit_offer(payload jsonb) returns uuid
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  actor uuid:=auth.uid(); offer_id uuid; v_request_id uuid:=(payload->>'requestId')::uuid;
  req service_requests%rowtype; idem text:=payload->>'idempotencyKey'; request_hash text; replay jsonb;
  eligibility jsonb;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  request_hash:=private.canonical_request_hash(payload);
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':submit_offer:'||idem,0));
  replay:=private.idempotency_replay(actor,'submit_offer_v2',idem,request_hash);
  if replay is not null then return (replay->>'id')::uuid; end if;
  eligibility:=private.provider_request_eligibility(actor,v_request_id,now());
  if not (eligibility->>'eligible')::boolean then
    raise exception 'PROVIDER_NOT_ELIGIBLE:%',eligibility->>'reason';
  end if;
  if not exists(select 1 from request_provider_matches where request_id=v_request_id
    and provider_id=actor and status in ('invited','viewed','offered') and expires_at>now()) then
    raise exception 'MATCH_REQUIRED';
  end if;
  select * into req from service_requests where id=v_request_id and status='receiving_offers' for update;
  if req.id is null or req.version<>(payload->>'expectedRequestVersion')::integer then raise exception 'REQUEST_VERSION_CONFLICT'; end if;
  insert into idempotency_keys(user_id,command,key,request_hash)
  values(actor,'submit_offer_v2',idem,request_hash) on conflict do nothing;
  insert into offers(request_id,provider_id,total_amount_minor,visit_fee_minor,labor_amount_minor,
    materials_included,materials_estimate_minor,estimated_arrival_minutes,estimated_duration_minutes,
    warranty_days,provider_note,expires_at,idempotency_key)
  values(v_request_id,actor,(payload->>'totalAmountMinor')::bigint,coalesce((payload->>'visitFeeMinor')::bigint,0),
    (payload->>'laborAmountMinor')::bigint,(payload->>'materialsIncluded')::boolean,
    (payload->>'materialsEstimateMinor')::bigint,(payload->>'estimatedArrivalMinutes')::integer,
    (payload->>'estimatedDurationMinutes')::integer,(payload->>'warrantyDays')::integer,
    coalesce(payload->>'note',''),(payload->>'expiresAt')::timestamptz,idem)
  on conflict(provider_id,request_id) do update set
    total_amount_minor=excluded.total_amount_minor,visit_fee_minor=excluded.visit_fee_minor,
    labor_amount_minor=excluded.labor_amount_minor,materials_included=excluded.materials_included,
    materials_estimate_minor=excluded.materials_estimate_minor,
    estimated_arrival_minutes=excluded.estimated_arrival_minutes,
    estimated_duration_minutes=excluded.estimated_duration_minutes,warranty_days=excluded.warranty_days,
    provider_note=excluded.provider_note,expires_at=excluded.expires_at,status='active',
    version=offers.version+1,updated_at=now(),idempotency_key=excluded.idempotency_key
  returning id into offer_id;
  update request_provider_matches set status='offered' where request_id=v_request_id and provider_id=actor;
  insert into notification_outbox(user_id,event_type,channel,payload,deduplication_key)
  values(req.customer_id,'new_offer','in_app',jsonb_build_object('requestId',v_request_id,'offerId',offer_id),'offer:'||offer_id::text)
  on conflict do nothing;
  perform private.complete_idempotent_command(actor,'submit_offer_v2',idem,jsonb_build_object('id',offer_id));
  return offer_id;
end $$;

create or replace function public.get_provider_request_brief(p_request_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); result jsonb; eligibility jsonb;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.request_provider_matches m where m.request_id=p_request_id
    and m.provider_id=actor and m.status in ('invited','viewed','offered','selected')) then
    raise exception 'PROVIDER_BRIEF_ACCESS_DENIED';
  end if;
  eligibility:=private.provider_request_eligibility(actor,p_request_id,now());
  if not (eligibility->>'eligible')::boolean then
    raise exception 'PROVIDER_ELIGIBILITY_REVOKED:%',eligibility->>'reason';
  end if;
  select jsonb_build_object(
    'requestId',r.id,'version',r.version,'title',r.title,
    'original',jsonb_build_object('locale',r.original_locale,'text',r.original_text),
    'description',r.structured_description,
    'category',jsonb_build_object('id',r.category_id,'slug',c.slug),
    'subcategory',jsonb_build_object('id',r.subcategory_id,'slug',sc.slug),
    'area',jsonb_build_object('cityId',r.city_id,'city',coalesce(ct.name_ar,ct.name_en),
      'districtId',r.district_id,'district',coalesce(dt.name_ar,dt.name_en)),
    'approximateLocation',jsonb_build_object(
      'latitude',round(extensions.st_y(r.approximate_location::extensions.geometry)::numeric,3),
      'longitude',round(extensions.st_x(r.approximate_location::extensions.geometry)::numeric,3)),
    'schedule',jsonb_build_object('start',r.requested_start,'end',r.requested_end),'urgency',r.urgency,
    'answers',coalesce((select jsonb_agg(jsonb_build_object('questionKey',q.key,
      'answerText',a.answer_text,'answerNumber',a.answer_number,'answerBoolean',a.answer_boolean,
      'answerOptions',a.answer_options,'safetyRelevant',q.safety_relevant) order by q.sort_order)
      from public.service_request_answers a join public.service_questions q on q.id=a.question_id
      where a.request_id=r.id),'[]'::jsonb),
    'media',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'uploadId',f.id,'kind',m.media_kind,
      'mimeType',m.mime_type,'sizeBytes',m.size_bytes,'status',m.upload_status) order by m.created_at)
      from public.request_media m left join public.file_uploads f on f.final_path=m.storage_path and f.status='clean'
      where m.request_id=r.id and m.deleted_at is null),'[]'::jsonb),
    'safety',coalesce((select jsonb_agg(jsonb_build_object('type',s.flag_type,'severity',s.severity,
      'guidanceVersion',s.guidance_version)) from public.request_safety_flags s where s.request_id=r.id),'[]'::jsonb),
    'translation',coalesce((select jsonb_build_object('sourceLocale',t.source_locale,'targetLocale',t.target_locale,
      'original',t.original_content,'translated',t.translated_content,'status',t.status)
      from public.request_translations t join public.provider_profiles pp on pp.user_id=actor
      where t.request_id=r.id and t.target_locale=pp.preferred_brief_locale limit 1),'{}'::jsonb),
    'ai',jsonb_build_object('provider',coalesce(d.provider,r.ai_provider),'model',coalesce(d.model,r.ai_model),
      'schemaVersion',d.schema_version,'customerApproved',r.customer_approved_at is not null,
      'uncertain',coalesce((d.output->>'enoughInformation')::boolean,false) is not true),
    'requiredCapabilities',coalesce(d.output->'recommendedCapabilities','[]'::jsonb),
    'providerCapabilities',jsonb_build_object('qualified',true,
      'restrictedCategory',c.restricted,'eligibility',eligibility)
  ) into result
  from public.service_requests r join public.service_categories c on c.id=r.category_id
  left join public.service_subcategories sc on sc.id=r.subcategory_id
  left join public.cities ct on ct.id=r.city_id left join public.districts dt on dt.id=r.district_id
  left join lateral (select x.provider,x.model,x.schema_version,
    coalesce(x.customer_edited_output,x.structured_output) output from public.ai_diagnostics x
    where x.request_id=r.id order by x.created_at desc,x.id desc limit 1) d on true
  where r.id=p_request_id;
  return result;
end $$;

revoke all on function private.guard_provider_service_qualification() from public,anon,authenticated;
revoke all on function private.guard_provider_profile_material_change() from public,anon,authenticated;
revoke all on function private.mark_provider_document_for_review() from public,anon,authenticated;
revoke all on function private.provider_request_eligibility(uuid,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.set_provider_restricted_qualification(uuid,uuid,uuid,boolean,text,text) from public,anon,authenticated;
grant execute on function public.set_provider_restricted_qualification(uuid,uuid,uuid,boolean,text,text) to authenticated;

commit;
