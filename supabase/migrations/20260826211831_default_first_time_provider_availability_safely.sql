create or replace function public.upsert_provider_onboarding_without_final_diff(payload jsonb) returns jsonb
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
    coalesce(previous='verified' and not material_change and previous_profile.accepting_requests,false)
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
