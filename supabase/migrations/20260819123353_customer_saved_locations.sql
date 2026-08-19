-- Customer saved locations are distinct from immutable per-request snapshots.
-- Exact coordinates remain protected by the existing address RLS policy.
alter table public.addresses
  add column if not exists address_kind text;

update public.addresses a
set address_kind=case
  when exists(select 1 from public.service_requests r where r.exact_address_id=a.id)
    or exists(select 1 from public.jobs j where j.exact_address_id=a.id)
    then 'request_snapshot'
  else 'saved'
end
where a.address_kind is null;

alter table public.addresses
  alter column address_kind set default 'saved',
  alter column address_kind set not null;

alter table public.addresses
  drop constraint if exists addresses_address_kind_check;
alter table public.addresses
  add constraint addresses_address_kind_check
  check(address_kind in ('saved','request_snapshot'));

with ranked as (
  select id,row_number() over(
    partition by user_id order by updated_at desc,created_at desc,id
  ) as position
  from public.addresses
  where address_kind='saved' and is_default and deleted_at is null
)
update public.addresses a
set is_default=false,updated_at=now()
from ranked r
where r.id=a.id and r.position>1;

create unique index if not exists addresses_one_saved_default_per_user
on public.addresses(user_id)
where address_kind='saved' and is_default and deleted_at is null;

create or replace function public.list_my_saved_addresses() returns jsonb
language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,
    'label',a.label,
    'formattedAddress',a.formatted_address,
    'building',a.building,
    'unit',a.unit,
    'accessNotes',a.access_notes,
    'cityCode',c.code,
    'cityNameAr',c.name_ar,
    'cityNameEn',c.name_en,
    'isDefault',a.is_default,
    'coordinates',jsonb_build_object(
      'latitude',extensions.st_y(a.location::extensions.geometry),
      'longitude',extensions.st_x(a.location::extensions.geometry)
    )
  ) order by a.is_default desc,a.updated_at desc),'[]'::jsonb)
  from public.addresses a
  join public.cities c on c.id=a.city_id
  where a.user_id=(select auth.uid())
    and a.address_kind='saved'
    and a.deleted_at is null
$$;
revoke all on function public.list_my_saved_addresses() from public,anon;
grant execute on function public.list_my_saved_addresses() to authenticated;

create or replace function public.upsert_my_saved_address(payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid();
  address_id uuid:=coalesce(nullif(payload->>'id','')::uuid,gen_random_uuid());
  city_id uuid;
  latitude double precision:=(payload->'coordinates'->>'latitude')::double precision;
  longitude double precision:=(payload->'coordinates'->>'longitude')::double precision;
  make_default boolean:=coalesce((payload->>'isDefault')::boolean,false);
  existing public.addresses%rowtype;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.profiles where id=actor and status='active') then
    raise exception 'ACCOUNT_NOT_ACTIVE';
  end if;
  if latitude not between 16 and 33 or longitude not between 34 and 56 then
    raise exception 'LOCATION_OUTSIDE_SAUDI_ARABIA';
  end if;
  if length(trim(coalesce(payload->>'label','')))<1
    or length(payload->>'label')>80
    or length(trim(coalesce(payload->>'formattedAddress','')))<3
    or length(payload->>'formattedAddress')>500
    or length(coalesce(payload->>'building',''))>80
    or length(coalesce(payload->>'unit',''))>80
    or length(coalesce(payload->>'accessNotes',''))>500 then
    raise exception 'INVALID_ADDRESS_FIELDS';
  end if;
  select id into city_id from public.cities
  where code=payload->>'cityCode' and enabled limit 1;
  if city_id is null then raise exception 'CITY_NOT_AVAILABLE'; end if;

  perform pg_advisory_xact_lock(hashtextextended(actor::text||':saved-addresses',0));
  select * into existing from public.addresses
  where id=address_id for update;
  if existing.id is not null
    and (existing.user_id<>actor or existing.address_kind<>'saved') then
    raise exception 'SAVED_ADDRESS_NOT_AVAILABLE';
  end if;
  if existing.id is null and (
    select count(*) from public.addresses
    where user_id=actor and address_kind='saved' and deleted_at is null
  )>=20 then
    raise exception 'SAVED_ADDRESS_LIMIT_REACHED';
  end if;
  if make_default then
    update public.addresses
    set is_default=false,updated_at=now()
    where user_id=actor and address_kind='saved' and deleted_at is null
      and id<>address_id and is_default;
  end if;

  insert into public.addresses(
    id,user_id,city_id,label,formatted_address,building,unit,access_notes,
    location,is_default,address_kind,deleted_at
  ) values(
    address_id,actor,city_id,trim(payload->>'label'),trim(payload->>'formattedAddress'),
    nullif(trim(coalesce(payload->>'building','')),''),
    nullif(trim(coalesce(payload->>'unit','')),''),
    nullif(trim(coalesce(payload->>'accessNotes','')),''),
    extensions.st_setsrid(extensions.st_makepoint(longitude,latitude),4326)::extensions.geography,
    make_default,'saved',null
  )
  on conflict(id) do update set
    city_id=excluded.city_id,
    label=excluded.label,
    formatted_address=excluded.formatted_address,
    building=excluded.building,
    unit=excluded.unit,
    access_notes=excluded.access_notes,
    location=excluded.location,
    is_default=excluded.is_default,
    deleted_at=null,
    updated_at=now()
  where addresses.user_id=actor and addresses.address_kind='saved';
  return address_id;
end $$;
revoke all on function public.upsert_my_saved_address(jsonb) from public,anon;
grant execute on function public.upsert_my_saved_address(jsonb) to authenticated;

create or replace function public.archive_my_saved_address(p_address_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); was_default boolean;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':saved-addresses',0));
  select is_default into was_default from public.addresses
  where id=p_address_id and user_id=actor and address_kind='saved'
    and deleted_at is null for update;
  if not found then raise exception 'SAVED_ADDRESS_NOT_AVAILABLE'; end if;
  update public.addresses
  set deleted_at=now(),is_default=false,updated_at=now()
  where id=p_address_id;
  if was_default then
    update public.addresses set is_default=true,updated_at=now()
    where id=(
      select id from public.addresses
      where user_id=actor and address_kind='saved' and deleted_at is null
      order by updated_at desc,id limit 1
    );
  end if;
end $$;
revoke all on function public.archive_my_saved_address(uuid) from public,anon;
grant execute on function public.archive_my_saved_address(uuid) to authenticated;

-- Publication resolves a saved address server-side, then creates an immutable
-- request snapshot. Matching sees the final category, optional subcategory,
-- timing and location in the original INSERT.
create or replace function public.publish_service_request(payload jsonb) returns uuid
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare actor uuid:=auth.uid(); v_request_id uuid; v_address_id uuid; v_city_id uuid;
  v_category_id uuid; v_subcategory_id uuid; v_suggested_category_id uuid;
  session ai_sessions%rowtype; saved_address addresses%rowtype; saved_address_id uuid;
  idem text:=payload->>'idempotency_key'; request_hash text; replay jsonb;
  lat double precision; lon double precision; item jsonb; diag jsonb;
  selected_slug text; subcategory_slug text; suggested_slug text; selection_source text;
  upload file_uploads%rowtype;
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
  subcategory_slug:=nullif(trim(coalesce(payload->>'selected_subcategory_slug','')),'');
  selection_source:=payload->>'category_selection_source';
  if selected_slug is null or selection_source not in (
    'ai_suggestion','customer_correction','manual'
  ) then raise exception 'CATEGORY_SELECTION_REQUIRED'; end if;
  if selection_source='ai_suggestion' and selected_slug is distinct from suggested_slug then
    raise exception 'AI_CATEGORY_SELECTION_MISMATCH';
  end if;
  saved_address_id:=nullif(payload->>'saved_address_id','')::uuid;
  if saved_address_id is not null then
    select * into saved_address from addresses
    where id=saved_address_id and user_id=actor and address_kind='saved'
      and deleted_at is null for share;
    if saved_address.id is null then raise exception 'SAVED_ADDRESS_NOT_AVAILABLE'; end if;
    lat:=st_y(saved_address.location::geometry);
    lon:=st_x(saved_address.location::geometry);
    payload:=jsonb_set(payload,'{exact_location}',jsonb_build_object(
      'latitude',lat,'longitude',lon
    ),true);
  elsif payload ? 'location_details' and (
    length(trim(coalesce(payload->'location_details'->>'formatted_address','')))<3
    or length(coalesce(payload->'location_details'->>'formatted_address',''))>500
    or length(coalesce(payload->'location_details'->>'label',''))>80
    or length(coalesce(payload->'location_details'->>'building',''))>80
    or length(coalesce(payload->'location_details'->>'unit',''))>80
    or length(coalesce(payload->'location_details'->>'access_notes',''))>500
  ) then
    raise exception 'INVALID_ADDRESS_FIELDS';
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
  if subcategory_slug is not null then
    select id into v_subcategory_id from service_subcategories
    where category_id=v_category_id and slug=subcategory_slug and enabled limit 1;
    if v_subcategory_id is null then raise exception 'SUBCATEGORY_NOT_AVAILABLE'; end if;
  end if;
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
  if saved_address_id is not null then
    if saved_address.city_id<>v_city_id then raise exception 'SAVED_ADDRESS_CITY_MISMATCH'; end if;
    insert into addresses(
      user_id,city_id,district_id,label,formatted_address,building,unit,access_notes,
      location,is_default,address_kind
    ) values(
      actor,v_city_id,saved_address.district_id,saved_address.label,
      saved_address.formatted_address,saved_address.building,saved_address.unit,
      saved_address.access_notes,saved_address.location,false,'request_snapshot'
    ) returning id into v_address_id;
  else
    insert into addresses(
      user_id,city_id,label,formatted_address,building,unit,access_notes,
      location,is_default,address_kind
    ) values(
      actor,v_city_id,
      coalesce(nullif(trim(payload->'location_details'->>'label'),''),'Service location'),
      coalesce(
        nullif(trim(payload->'location_details'->>'formatted_address'),''),
        'Private location selected in app'
      ),
      nullif(trim(coalesce(payload->'location_details'->>'building','')),''),
      nullif(trim(coalesce(payload->'location_details'->>'unit','')),''),
      nullif(trim(coalesce(payload->'location_details'->>'access_notes','')),''),
      st_setsrid(st_makepoint(lon,lat),4326)::geography,false,'request_snapshot'
    ) returning id into v_address_id;
  end if;
  insert into service_requests(
    customer_id,category_id,subcategory_id,suggested_category_id,category_selection_source,
    category_confirmed_at,city_id,title,structured_description,original_text,
    original_locale,urgency,timing_mode,requested_start,requested_end,approximate_location,
    exact_address_id,ai_provider,ai_model,ai_prompt_version,customer_approved_at,
    published_at,status
  ) values(
    actor,v_category_id,v_subcategory_id,v_suggested_category_id,selection_source,now(),v_city_id,
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
      'selectedCategorySlug',selected_slug,'selectedSubcategorySlug',subcategory_slug,
      'suggestedCategorySlug',suggested_slug,'savedAddressId',saved_address_id,
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
      'selectedSubcategorySlug',subcategory_slug,'savedAddressId',saved_address_id,
      'mediaCount',media_count,'timingMode',mode,'requestedStart',start_at,'requestedEnd',end_at
    )
  );
  return v_request_id;
end $$;

revoke all on function public.publish_service_request(jsonb) from public,anon,authenticated;
grant execute on function public.publish_service_request(jsonb) to authenticated;
