begin;

create function public.upsert_provider_onboarding(payload jsonb) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  actor uuid:=auth.uid();
  v_category_id uuid:=(payload->>'categoryId')::uuid;
  v_city_id uuid:=(payload->>'cityId')::uuid;
  v_lat double precision:=(payload->'location'->>'latitude')::double precision;
  v_lon double precision:=(payload->'location'->>'longitude')::double precision;
  v_previous verification_status;
  v_result verification_status;
  v_doc jsonb;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from profiles where id=actor and status='active') then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  if not exists(select 1 from service_categories where id=v_category_id and enabled) then raise exception 'CATEGORY_REQUIRED'; end if;
  if not exists(select 1 from cities where id=v_city_id and enabled) then raise exception 'CITY_REQUIRED'; end if;
  if v_lat not between 16 and 33 or v_lon not between 34 and 56 then raise exception 'LOCATION_OUTSIDE_SAUDI_ARABIA'; end if;
  if coalesce(length(trim(payload->>'bio')),0)<10 then raise exception 'BIO_REQUIRED'; end if;

  insert into user_roles(user_id,role) values(actor,'provider')
  on conflict(user_id,role) do update set revoked_at=null;
  select verification_status into v_previous from provider_profiles where user_id=actor for update;
  insert into provider_profiles(user_id,kind,business_name,commercial_registration_reference,bio,preferred_brief_locale,verification_status,service_radius_km)
  values(actor,(payload->>'kind')::provider_kind,nullif(trim(payload->>'businessName'),''),nullif(trim(payload->>'commercialRegistrationReference'),''),trim(payload->>'bio'),coalesce(payload->>'locale','ar'),'submitted',coalesce((payload->>'serviceRadiusKm')::numeric,20))
  on conflict(user_id) do update set
    kind=excluded.kind,
    business_name=excluded.business_name,
    commercial_registration_reference=excluded.commercial_registration_reference,
    bio=excluded.bio,
    preferred_brief_locale=excluded.preferred_brief_locale,
    verification_status=case when provider_profiles.verification_status='verified' then 'verified'::verification_status else 'submitted'::verification_status end,
    service_radius_km=excluded.service_radius_km,
    updated_at=now()
  returning verification_status into v_result;

  insert into provider_services(provider_id,category_id,enabled) values(actor,v_category_id,true)
  on conflict(provider_id,category_id) do update set enabled=true;
  delete from provider_service_areas where provider_id=actor and city_id=v_city_id;
  insert into provider_service_areas(provider_id,city_id,center,radius_m)
  values(actor,v_city_id,st_setsrid(st_makepoint(v_lon,v_lat),4326)::geography,(coalesce((payload->>'serviceRadiusKm')::numeric,20)*1000)::integer);

  insert into provider_availability(provider_id,weekday,start_time,end_time)
  select actor,day,'08:00'::time,'18:00'::time from generate_series(0,6) day
  on conflict(provider_id,weekday,start_time) do update set end_time=excluded.end_time;

  for v_doc in select value from jsonb_array_elements(coalesce(payload->'documents','[]'::jsonb)) loop
    insert into provider_documents(provider_id,document_type,storage_path,content_hash,mime_type,size_bytes,status)
    values(actor,v_doc->>'documentType',v_doc->>'storagePath',v_doc->>'contentHash',v_doc->>'mimeType',(v_doc->>'sizeBytes')::bigint,'submitted');
  end loop;

  if v_previous is distinct from v_result then
    insert into provider_status_history(provider_id,previous_status,new_status,actor_id,reason)
    values(actor,v_previous,v_result,actor,'provider_submitted_onboarding');
  end if;
  return jsonb_build_object('providerId',actor,'status',v_result);
end $$;

create function public.get_customer_offers(p_request_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); result jsonb;
begin
  if not exists(select 1 from service_requests where id=p_request_id and customer_id=actor) then raise exception 'REQUEST_ACCESS_DENIED'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',o.id,
    'providerId',o.provider_id,
    'providerName',coalesce(nullif(p.business_name,''),'مقدم خدمة موثّق'),
    'rating',p.rating_average,
    'ratingCount',p.rating_count,
    'completedJobs',p.completed_jobs,
    'totalAmountMinor',o.total_amount_minor,
    'visitFeeMinor',o.visit_fee_minor,
    'materialsIncluded',o.materials_included,
    'materialsEstimateMinor',o.materials_estimate_minor,
    'estimatedArrivalMinutes',o.estimated_arrival_minutes,
    'estimatedDurationMinutes',o.estimated_duration_minutes,
    'warrantyDays',o.warranty_days,
    'note',o.provider_note,
    'expiresAt',o.expires_at,
    'status',o.status
  ) order by o.total_amount_minor,o.estimated_arrival_minutes),'[]'::jsonb) into result
  from offers o join provider_profiles p on p.user_id=o.provider_id
  where o.request_id=p_request_id and o.status='active' and o.expires_at>now();
  return result;
end $$;

create function public.admin_set_category(p_category_id uuid,p_enabled boolean,p_reason text,p_idempotency_key text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); prior boolean; audit_id uuid:=gen_random_uuid();
begin
  if not private.has_role(array['operations_admin','super_admin']::user_role[]) then raise exception 'OPERATIONS_PERMISSION_REQUIRED'; end if;
  if length(trim(p_reason))<5 then raise exception 'REASON_REQUIRED'; end if;
  select enabled into prior from service_categories where id=p_category_id for update;
  if prior is null then raise exception 'CATEGORY_NOT_FOUND'; end if;
  insert into idempotency_keys(user_id,command,key) values(actor,'admin_set_category',p_idempotency_key) on conflict do nothing;
  update service_categories set enabled=p_enabled,updated_at=now() where id=p_category_id;
  insert into admin_audit_logs(id,actor_id,action,target_type,target_id,reason,correlation_id,before_snapshot,after_snapshot)
  values(audit_id,actor,'catalog.category.toggle','service_category',p_category_id,p_reason,audit_id,jsonb_build_object('enabled',prior),jsonb_build_object('enabled',p_enabled));
end $$;

create or replace function public.publish_service_request(payload jsonb) returns uuid
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare actor uuid:=auth.uid(); request_id uuid; address_id uuid; city_id uuid; category_id uuid; idem text; existing jsonb; lat double precision; lon double precision; item jsonb; diag jsonb;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from profiles where id=actor and status='active') then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  if coalesce((payload->>'customer_approved')::boolean,false) is not true then raise exception 'CUSTOMER_APPROVAL_REQUIRED'; end if;
  idem:=payload->>'idempotency_key'; if length(coalesce(idem,''))<16 then raise exception 'INVALID_IDEMPOTENCY_KEY'; end if;
  select response into existing from idempotency_keys where user_id=actor and command='publish_service_request' and key=idem;
  if existing is not null then return (existing->>'id')::uuid; end if;
  insert into idempotency_keys(user_id,command,key,request_hash) values(actor,'publish_service_request',idem,encode(digest(payload::text,'sha256'),'hex')) on conflict do nothing;
  select id into city_id from cities where code=coalesce(payload->>'city_code','riyadh') and enabled limit 1;
  diag:=payload->'ai_diagnostic';
  select id into category_id from service_categories where slug=coalesce(nullif(payload->>'category_slug',''),diag->>'suggestedCategorySlug','general-handyman') and enabled limit 1;
  if city_id is null or category_id is null then raise exception 'CATALOG_CONFIGURATION_REQUIRED'; end if;
  lat:=(payload->'exact_location'->>'latitude')::double precision; lon:=(payload->'exact_location'->>'longitude')::double precision;
  if lat not between 16 and 33 or lon not between 34 and 56 then raise exception 'LOCATION_OUTSIDE_SAUDI_ARABIA'; end if;
  insert into addresses(user_id,city_id,label,formatted_address,location)
    values(actor,city_id,'Service location','Private location selected in app',st_setsrid(st_makepoint(lon,lat),4326)::geography) returning id into address_id;
  insert into service_requests(customer_id,category_id,city_id,title,structured_description,original_text,original_locale,urgency,requested_start,approximate_location,exact_address_id,
    ai_provider,ai_model,ai_prompt_version,customer_approved_at,published_at,status)
  values(actor,category_id,city_id,left(coalesce(nullif(payload->>'title',''),payload->>'structured_description'),120),payload->>'structured_description',payload->>'original_text',
    coalesce(payload->>'locale','ar'),coalesce((payload->>'urgency')::request_urgency,'normal'),(payload->>'requested_start')::timestamptz,st_setsrid(st_makepoint(round(lon::numeric,2),round(lat::numeric,2)),4326)::geography,address_id,
    diag->'metadata'->>'provider',diag->'metadata'->>'model',diag->'metadata'->>'promptVersion',now(),now(),'published') returning id into request_id;
  insert into request_visibility(request_id) values(request_id);
  insert into request_status_history(request_id,actor_id,new_status,reason,idempotency_key) values(request_id,actor,'published','customer_approved',idem);
  insert into request_publication_events(request_id,actor_id,request_version,approval_snapshot,idempotency_key) values(request_id,actor,1,payload,idem);
  for item in select value from jsonb_array_elements(coalesce(payload->'media','[]'::jsonb)) loop
    if item->>'storage_path' is not null then
      insert into request_media(request_id,uploader_id,storage_path,mime_type,size_bytes,media_kind,upload_status)
      values(request_id,actor,item->>'storage_path',item->>'mime_type',coalesce((item->>'size')::bigint,1),'request','uploaded');
    end if;
  end loop;
  for item in select to_jsonb(value) from jsonb_array_elements_text(coalesce(diag->'safetyFlags','[]'::jsonb)) loop
    insert into request_safety_flags(request_id,flag_type,source,severity,guidance_version) values(request_id,item#>>'{}','ai','high','safety-v1');
  end loop;
  update idempotency_keys set status='completed',response=jsonb_build_object('id',request_id) where user_id=actor and command='publish_service_request' and key=idem;
  return request_id;
exception when others then
  update idempotency_keys set status='failed' where user_id=actor and command='publish_service_request' and key=idem;
  raise;
end $$;

revoke all on function public.upsert_provider_onboarding(jsonb),public.get_customer_offers(uuid),public.admin_set_category(uuid,boolean,text,text) from public,anon,authenticated;
grant execute on function public.upsert_provider_onboarding(jsonb),public.get_customer_offers(uuid),public.admin_set_category(uuid,boolean,text,text) to authenticated;

commit;
