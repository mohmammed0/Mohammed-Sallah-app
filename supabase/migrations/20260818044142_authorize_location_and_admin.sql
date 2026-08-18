begin;

create or replace function private.has_role(required public.user_role[]) returns boolean
language sql stable security definer set search_path=''
as $$
  select exists(
    select 1
    from public.user_roles r
    join public.profiles p on p.id=r.user_id
    where r.user_id=auth.uid() and r.role=any(required)
      and r.revoked_at is null and p.status='active'
  )
$$;

create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path=''
as $$
  select private.has_role(array[
    'operations_admin','verification_reviewer','support_agent','finance_reviewer','super_admin'
  ]::public.user_role[])
$$;

insert into public.admin_permissions(key,description,risk_level) values
  ('dashboard.aggregate.read','Read non-identifying operational aggregates','low'),
  ('customer.pii.read','Read customer personally identifying data','high'),
  ('job.exact_location.read','Read exact job location for active support','high'),
  ('support.case.read','Read support cases and participant evidence','medium'),
  ('finance.read','Read financial ledgers and reconciliation','high'),
  ('provider.document.read','Read private provider verification documents','high'),
  ('operations.mutate','Execute approved operational mutations','critical')
on conflict(key) do update set
  description=excluded.description,risk_level=excluded.risk_level;

insert into public.admin_roles(key,name,description,system_role) values
  ('operations','Operations','Marketplace operations without unrestricted finance or documents','operations_admin'),
  ('verification','Verification','Provider verification documents and decisions','verification_reviewer'),
  ('support','Support','Support cases and narrowly authorized locations','support_agent'),
  ('finance','Finance','Financial review and confirmation','finance_reviewer'),
  ('analyst','Analyst','Aggregate dashboards only','analyst'),
  ('super','Super admin','All administrative capabilities','super_admin')
on conflict(key) do update set
  name=excluded.name,description=excluded.description,system_role=excluded.system_role;

insert into public.admin_role_permissions(admin_role_id,permission_id)
select r.id,p.id
from public.admin_roles r
join public.admin_permissions p on (
  r.key='super'
  or (r.key='analyst' and p.key='dashboard.aggregate.read')
  or (r.key='operations' and p.key in ('dashboard.aggregate.read','job.exact_location.read','support.case.read','operations.mutate'))
  or (r.key='support' and p.key in ('dashboard.aggregate.read','customer.pii.read','job.exact_location.read','support.case.read'))
  or (r.key='verification' and p.key in ('dashboard.aggregate.read','provider.document.read'))
  or (r.key='finance' and p.key in ('dashboard.aggregate.read','finance.read'))
)
on conflict do nothing;

create or replace function private.has_admin_permission(p_permission text) returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.profiles profile
    join public.user_roles ur on ur.user_id=profile.id
    join public.admin_roles ar on ar.system_role=ur.role
    join public.admin_role_permissions arp on arp.admin_role_id=ar.id
    join public.admin_permissions ap on ap.id=arp.permission_id
    where profile.id=auth.uid() and profile.status='active'
      and ur.revoked_at is null and ap.key=p_permission
  )
$$;

create or replace function public.admin_marketplace_health() returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not private.has_admin_permission('dashboard.aggregate.read') then
    raise exception 'DASHBOARD_PERMISSION_REQUIRED';
  end if;
  return jsonb_build_object(
    'new_requests',(select count(*) from public.service_requests where created_at>now()-interval '24 hours'),
    'active_jobs',(select count(*) from public.jobs where status not in ('completed','cancelled','disputed')),
    'open_support_cases',(select count(*) from public.support_cases where status not in ('resolved','closed')),
    'open_disputes',(select count(*) from public.disputes where status not in ('resolved','closed')),
    'pending_verifications',(select count(*) from public.provider_profiles where verification_status in ('submitted','under_review')),
    'notification_failures',(select count(*) from public.notification_outbox where status in ('failed','dead_letter')),
    'financial_holds',(select count(*) from public.financial_holds where status='held')
  );
end $$;

create or replace function private.can_read_request(target uuid) returns boolean
language sql stable security definer set search_path=''
as $$
  select exists(select 1 from public.service_requests r
    where r.id=target and r.customer_id=auth.uid())
  or exists(select 1 from public.request_provider_matches m
    where m.request_id=target and m.provider_id=auth.uid()
      and m.status in ('invited','viewed','offered','selected'))
  or private.has_admin_permission('support.case.read')
$$;

create or replace function private.can_access_job(target uuid) returns boolean
language sql stable security definer set search_path=''
as $$
  select exists(select 1 from public.jobs j
    where j.id=target and auth.uid() in (j.customer_id,j.provider_id))
  or private.has_admin_permission('support.case.read')
$$;

drop policy profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles for select
using(id=auth.uid() or private.has_admin_permission('customer.pii.read'));
drop policy addresses_authorized_read on public.addresses;
create policy addresses_authorized_read on public.addresses for select
using(
  user_id=auth.uid()
  or exists(select 1 from public.jobs j
    where j.exact_address_id=addresses.id and j.provider_id=auth.uid())
  or private.has_admin_permission('job.exact_location.read')
);
drop policy provider_profile_private on public.provider_profiles;
create policy provider_profile_private on public.provider_profiles for select
using(
  user_id=auth.uid()
  or private.has_admin_permission('provider.document.read')
  or private.has_admin_permission('support.case.read')
);
drop policy jobs_participants on public.jobs;
create policy jobs_participants on public.jobs for select
using(auth.uid() in (customer_id,provider_id) or private.has_admin_permission('support.case.read'));
drop policy support_cases_participants on public.support_cases;
create policy support_cases_participants on public.support_cases for select
using(opened_by=auth.uid() or private.has_admin_permission('support.case.read'));
drop policy support_messages_participants on public.support_case_messages;
create policy support_messages_participants on public.support_case_messages for select
using(
  exists(select 1 from public.support_cases c
    where c.id=support_case_messages.case_id
      and (c.opened_by=auth.uid() or private.has_admin_permission('support.case.read')))
  and (visible_to_user or private.has_admin_permission('support.case.read'))
);
drop policy support_evidence_participants on public.support_case_evidence;
create policy support_evidence_participants on public.support_case_evidence for select
using(exists(select 1 from public.support_cases c
  where c.id=support_case_evidence.case_id
    and (c.opened_by=auth.uid() or private.has_admin_permission('support.case.read'))));
drop policy notification_owner on public.notification_outbox;
create policy notification_owner on public.notification_outbox for select
using(user_id=auth.uid() or private.has_admin_permission('support.case.read'));
create policy admin_audit_authorized_read on public.admin_audit_logs for select
using(private.has_admin_permission('operations.mutate'));

create or replace function public.get_session_context() returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  actor uuid:=auth.uid();
  profile public.profiles%rowtype;
  requested_role public.user_role;
  roles jsonb;
  provider_status public.verification_status;
  active_role public.user_role;
  blocked_reason text;
begin
  if actor is null then return jsonb_build_object('authenticated',false); end if;
  select * into profile from public.profiles where id=actor;
  if profile.id is null or profile.status<>'active' then
    return jsonb_build_object(
      'authenticated',true,'accountStatus',coalesce(profile.status::text,'missing'),
      'allowed',false,'blockedReason','ACCOUNT_NOT_ACTIVE'
    );
  end if;
  select coalesce(jsonb_agg(role::text order by role::text),'[]'::jsonb) into roles
  from public.user_roles where user_id=actor and revoked_at is null;
  select role_mode into requested_role from public.user_preferences where user_id=actor;
  if requested_role is null or not exists(
    select 1 from public.user_roles where user_id=actor and role=requested_role and revoked_at is null
  ) then
    select role into requested_role from public.user_roles
    where user_id=actor and revoked_at is null
    order by case role when 'customer' then 0 else 1 end,role::text limit 1;
  end if;
  if requested_role='provider' then
    select verification_status into provider_status from public.provider_profiles where user_id=actor;
    if provider_status is distinct from 'verified' then
      blocked_reason:='PROVIDER_NOT_VERIFIED';
    end if;
  end if;
  active_role:=requested_role;
  return jsonb_build_object(
    'authenticated',true,'allowed',active_role is not null,
    'userId',actor,'accountStatus',profile.status,'locale',profile.preferred_locale,
    'roles',roles,'activeRole',active_role,'requestedRole',requested_role,
    'providerVerificationStatus',provider_status,'blockedReason',blocked_reason
  );
end $$;

create function public.set_active_role(p_role public.user_role) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare actor uuid:=auth.uid();
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from profiles where id=actor and status='active') then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  if not exists(select 1 from user_roles where user_id=actor and role=p_role and revoked_at is null) then
    raise exception 'ROLE_NOT_OWNED_OR_REVOKED';
  end if;
  insert into user_preferences(user_id,role_mode) values(actor,p_role)
  on conflict(user_id) do update set role_mode=excluded.role_mode,updated_at=now();
  return public.get_session_context();
end $$;

create table public.job_location_sharing_sessions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id),
  provider_id uuid not null references public.provider_profiles(user_id),
  consented_at timestamptz not null default now(),
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  stopped_at timestamptz,
  stop_reason text,
  created_at timestamptz not null default now(),
  check (expires_at>starts_at and expires_at<=starts_at+interval '4 hours')
);
create unique index one_active_location_session_per_job
  on public.job_location_sharing_sessions(job_id)
  where stopped_at is null;
alter table public.job_location_sharing_sessions enable row level security;
create policy location_sessions_participants_read
  on public.job_location_sharing_sessions for select to authenticated
  using(
    exists(select 1 from public.jobs j
      where j.id=job_id and auth.uid() in (j.customer_id,j.provider_id))
    or private.has_admin_permission('job.exact_location.read')
  );
grant select on public.job_location_sharing_sessions to authenticated;

create function public.start_job_location_sharing(
  p_job_id uuid,
  p_duration_minutes integer,
  p_consent boolean
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare actor uuid:=auth.uid(); item jobs%rowtype; result uuid; expiry timestamptz;
begin
  if p_consent is not true then raise exception 'LOCATION_SHARING_CONSENT_REQUIRED'; end if;
  if p_duration_minutes not between 5 and 240 then raise exception 'INVALID_LOCATION_SHARING_DURATION'; end if;
  select * into item from jobs where id=p_job_id and provider_id=actor for update;
  if item.id is null or item.status not in ('en_route','arrived') then raise exception 'ACTIVE_PROVIDER_JOB_REQUIRED'; end if;
  update job_location_sharing_sessions set stopped_at=now(),stop_reason='replaced'
  where job_id=item.id and stopped_at is null;
  expiry:=now()+make_interval(mins=>p_duration_minutes);
  insert into job_location_sharing_sessions(job_id,provider_id,expires_at)
  values(item.id,actor,expiry) returning id into result;
  return jsonb_build_object('sessionId',result,'state','sharing','expiresAt',expiry);
end $$;

create function public.stop_job_location_sharing(
  p_session_id uuid,
  p_reason text default 'provider_stopped'
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare actor uuid:=auth.uid(); item job_location_sharing_sessions%rowtype;
begin
  select * into item from job_location_sharing_sessions
  where id=p_session_id and provider_id=actor for update;
  if item.id is null then raise exception 'LOCATION_SESSION_ACCESS_DENIED'; end if;
  update job_location_sharing_sessions
  set stopped_at=coalesce(stopped_at,now()),stop_reason=coalesce(stop_reason,left(trim(p_reason),120))
  where id=item.id;
  return jsonb_build_object('sessionId',item.id,'state','stopped');
end $$;

drop function if exists public.record_job_location(uuid,double precision,double precision,numeric,boolean);
create function public.record_job_location(
  p_job_id uuid,
  p_session_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_m numeric
) returns uuid
language plpgsql
security definer
set search_path=public,extensions,pg_temp
as $$
declare actor uuid:=auth.uid(); result uuid; sharing job_location_sharing_sessions%rowtype;
begin
  if p_latitude not between 16 and 33 or p_longitude not between 34 and 56 then
    raise exception 'LOCATION_OUTSIDE_SAUDI_ARABIA';
  end if;
  if p_accuracy_m is null or p_accuracy_m<=0 or p_accuracy_m>5000 then raise exception 'INVALID_LOCATION_ACCURACY'; end if;
  select * into sharing from job_location_sharing_sessions
  where id=p_session_id and job_id=p_job_id and provider_id=actor
    and stopped_at is null and starts_at<=now() and expires_at>now() for update;
  if sharing.id is null then raise exception 'ACTIVE_LOCATION_SHARING_SESSION_REQUIRED'; end if;
  if not exists(select 1 from jobs where id=p_job_id and provider_id=actor and status in ('en_route','arrived')) then
    raise exception 'ACTIVE_PROVIDER_JOB_REQUIRED';
  end if;
  insert into job_location_updates(
    job_id,provider_id,location,accuracy_m,captured_at,expires_at,sharing_consent_at
  ) values(
    p_job_id,actor,st_setsrid(st_makepoint(p_longitude,p_latitude),4326)::geography,
    p_accuracy_m,now(),least(sharing.expires_at,now()+interval '15 minutes'),sharing.consented_at
  ) returning id into result;
  return result;
end $$;

create function public.get_authorized_job_location(p_job_id uuid) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare actor uuid:=auth.uid(); item public.jobs%rowtype; address public.addresses%rowtype; latest record;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into item from public.jobs where id=p_job_id;
  if item.id is null then raise exception 'JOB_NOT_FOUND'; end if;
  if actor not in (item.customer_id,item.provider_id)
    and not private.has_admin_permission('job.exact_location.read') then
    raise exception 'EXACT_LOCATION_ACCESS_DENIED';
  end if;
  select * into address from public.addresses where id=item.exact_address_id and deleted_at is null;
  select
    extensions.st_y(u.location::extensions.geometry) as latitude,
    extensions.st_x(u.location::extensions.geometry) as longitude,
    u.accuracy_m,u.captured_at,u.expires_at
  into latest from public.job_location_updates u
  where u.job_id=item.id and u.expires_at>now()
  order by u.captured_at desc limit 1;
  return jsonb_build_object(
    'jobId',item.id,
    'destination',jsonb_build_object(
      'formattedAddress',address.formatted_address,
      'latitude',extensions.st_y(address.location::extensions.geometry),
      'longitude',extensions.st_x(address.location::extensions.geometry)
    ),
    'providerLocation',case when latest.captured_at is null then null else jsonb_build_object(
      'latitude',latest.latitude,'longitude',latest.longitude,'accuracyM',latest.accuracy_m,
      'capturedAt',latest.captured_at,'expiresAt',latest.expires_at
    ) end
  );
end $$;

create function public.get_completion_proof_manifest(p_job_id uuid) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not exists(select 1 from public.jobs j
      where j.id=p_job_id and auth.uid() in (j.customer_id,j.provider_id))
    and not private.has_admin_permission('support.case.read') then
    raise exception 'COMPLETION_PROOF_ACCESS_DENIED';
  end if;
  return jsonb_build_object(
    'jobId',p_job_id,
    'proofs',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',p.id,'uploadId',p.file_upload_id,'mimeType',p.mime_type,
        'sizeBytes',p.size_bytes,'description',p.description,
        'capturedAt',p.captured_at,'createdAt',p.created_at
      ) order by p.created_at)
      from public.completion_proofs p where p.job_id=p_job_id
    ),'[]'::jsonb)
  );
end
$$;

create function public.get_provider_request_brief(p_request_id uuid) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare actor uuid:=auth.uid(); result jsonb;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(
    select 1 from public.request_provider_matches m
    join public.provider_profiles pp on pp.user_id=m.provider_id
    join public.profiles p on p.id=pp.user_id
    where m.request_id=p_request_id and m.provider_id=actor
      and m.status in ('invited','viewed','offered','selected')
      and pp.verification_status='verified' and p.status='active'
  ) then raise exception 'PROVIDER_BRIEF_ACCESS_DENIED'; end if;
  select jsonb_build_object(
    'requestId',r.id,'version',r.version,'title',r.title,
    'original',jsonb_build_object('locale',r.original_locale,'text',r.original_text),
    'description',r.structured_description,
    'category',jsonb_build_object('id',r.category_id,'slug',c.slug),
    'subcategory',jsonb_build_object('id',r.subcategory_id,'slug',sc.slug),
    'area',jsonb_build_object(
      'cityId',r.city_id,'city',coalesce(ct.name_ar,ct.name_en),
      'districtId',r.district_id,'district',coalesce(dt.name_ar,dt.name_en)
    ),
    'approximateLocation',jsonb_build_object(
      'latitude',round(extensions.st_y(r.approximate_location::extensions.geometry)::numeric,3),
      'longitude',round(extensions.st_x(r.approximate_location::extensions.geometry)::numeric,3)
    ),
    'schedule',jsonb_build_object('start',r.requested_start,'end',r.requested_end),
    'urgency',r.urgency,
    'answers',coalesce((select jsonb_agg(jsonb_build_object(
      'questionKey',q.key,'answerText',a.answer_text,'answerNumber',a.answer_number,
      'answerBoolean',a.answer_boolean,'answerOptions',a.answer_options,
      'safetyRelevant',q.safety_relevant
    ) order by q.sort_order) from public.service_request_answers a
      join public.service_questions q on q.id=a.question_id where a.request_id=r.id),'[]'::jsonb),
    'media',coalesce((select jsonb_agg(jsonb_build_object(
      'id',m.id,'uploadId',f.id,'kind',m.media_kind,'mimeType',m.mime_type,
      'sizeBytes',m.size_bytes,'status',m.upload_status
    ) order by m.created_at) from public.request_media m
      left join public.file_uploads f on f.final_path=m.storage_path and f.status='clean'
      where m.request_id=r.id and m.deleted_at is null),'[]'::jsonb),
    'safety',coalesce((select jsonb_agg(jsonb_build_object(
      'type',s.flag_type,'severity',s.severity,'guidanceVersion',s.guidance_version
    )) from public.request_safety_flags s where s.request_id=r.id),'[]'::jsonb),
    'translation',coalesce((select jsonb_build_object(
      'sourceLocale',t.source_locale,'targetLocale',t.target_locale,
      'original',t.original_content,'translated',t.translated_content,'status',t.status
    ) from public.request_translations t
      join public.provider_profiles pp on pp.user_id=actor
      where t.request_id=r.id and t.target_locale=pp.preferred_brief_locale limit 1),'{}'::jsonb),
    'ai',jsonb_build_object(
      'provider',coalesce(d.provider,r.ai_provider),'model',coalesce(d.model,r.ai_model),
      'schemaVersion',d.schema_version,
      'customerApproved',r.customer_approved_at is not null,
      'uncertain',coalesce((d.output->>'enoughInformation')::boolean,false) is not true
    ),
    'requiredCapabilities',coalesce(d.output->'recommendedCapabilities','[]'::jsonb),
    'providerCapabilities',jsonb_build_object(
      'qualified',exists(select 1 from public.provider_services ps
        where ps.provider_id=actor and ps.category_id=r.category_id and ps.enabled
          and (not c.restricted or ps.qualified_for_restricted)),
      'restrictedCategory',c.restricted
    )
  ) into result
  from public.service_requests r
  join public.service_categories c on c.id=r.category_id
  left join public.service_subcategories sc on sc.id=r.subcategory_id
  left join public.cities ct on ct.id=r.city_id
  left join public.districts dt on dt.id=r.district_id
  left join lateral (
    select x.provider,x.model,x.schema_version,
      coalesce(x.customer_edited_output,x.structured_output) as output
    from public.ai_diagnostics x
    where x.request_id=r.id
    order by x.created_at desc,x.id desc
    limit 1
  ) d on true
  where r.id=p_request_id;
  return result;
end $$;

create or replace function public.upsert_provider_onboarding(payload jsonb) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  actor uuid:=auth.uid();
  previous verification_status;
  result_status verification_status;
  category_value jsonb;
  area jsonb;
  slot jsonb;
  document jsonb;
  submit boolean:=coalesce((payload->>'submit')::boolean,true);
  category_count integer:=jsonb_array_length(coalesce(payload->'categoryIds','[]'::jsonb));
  area_count integer:=jsonb_array_length(coalesce(payload->'serviceAreas','[]'::jsonb));
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from profiles where id=actor and status='active') then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  if coalesce(length(trim(payload->>'bio')),0)<10 then raise exception 'BIO_REQUIRED'; end if;
  if category_count=0 and payload->>'categoryId' is not null then
    payload:=jsonb_set(payload,'{categoryIds}',jsonb_build_array(payload->>'categoryId'));
    category_count:=1;
  end if;
  if area_count=0 and payload->>'cityId' is not null then
    payload:=jsonb_set(payload,'{serviceAreas}',jsonb_build_array(jsonb_build_object(
      'cityId',payload->>'cityId','location',payload->'location',
      'radiusKm',coalesce((payload->>'serviceRadiusKm')::integer,20)
    )));
    area_count:=1;
  end if;
  if category_count not between 1 and 20 then raise exception 'PROVIDER_SERVICES_REQUIRED'; end if;
  if area_count not between 1 and 20 then raise exception 'PROVIDER_SERVICE_AREAS_REQUIRED'; end if;

  insert into user_roles(user_id,role) values(actor,'provider')
  on conflict(user_id,role) do update set revoked_at=null;
  select verification_status into previous from provider_profiles where user_id=actor for update;
  result_status:=case
    when previous='verified' then 'verified'::verification_status
    when submit then 'submitted'::verification_status
    else 'draft'::verification_status
  end;
  insert into provider_profiles(
    user_id,kind,business_name,commercial_registration_reference,bio,
    preferred_brief_locale,verification_status,service_radius_km,accepting_requests
  ) values(
    actor,(payload->>'kind')::provider_kind,nullif(trim(payload->>'businessName'),''),
    nullif(trim(payload->>'commercialRegistrationReference'),''),trim(payload->>'bio'),
    coalesce(payload->>'locale','ar'),result_status,
    coalesce((payload->>'serviceRadiusKm')::numeric,20),previous='verified'
  )
  on conflict(user_id) do update set
    kind=excluded.kind,business_name=excluded.business_name,
    commercial_registration_reference=excluded.commercial_registration_reference,
    bio=excluded.bio,preferred_brief_locale=excluded.preferred_brief_locale,
    verification_status=result_status,service_radius_km=excluded.service_radius_km,
    accepting_requests=case when result_status='verified' then provider_profiles.accepting_requests else false end,
    updated_at=now();

  update provider_services set enabled=false where provider_id=actor;
  for category_value in select value from jsonb_array_elements(payload->'categoryIds') loop
    if not exists(select 1 from service_categories
      where id=(category_value#>>'{}')::uuid and enabled) then raise exception 'INVALID_PROVIDER_SERVICE'; end if;
    insert into provider_services(provider_id,category_id,enabled)
    values(actor,(category_value#>>'{}')::uuid,true)
    on conflict(provider_id,category_id) do update set enabled=true;
  end loop;

  delete from provider_service_areas where provider_id=actor;
  for area in select value from jsonb_array_elements(payload->'serviceAreas') loop
    if not exists(select 1 from cities where id=(area->>'cityId')::uuid and enabled) then
      raise exception 'INVALID_PROVIDER_CITY';
    end if;
    if (area->'location'->>'latitude')::double precision not between 16 and 33
      or (area->'location'->>'longitude')::double precision not between 34 and 56 then
      raise exception 'LOCATION_OUTSIDE_SAUDI_ARABIA';
    end if;
    insert into provider_service_areas(provider_id,city_id,center,radius_m)
    values(
      actor,(area->>'cityId')::uuid,
      st_setsrid(st_makepoint(
        (area->'location'->>'longitude')::double precision,
        (area->'location'->>'latitude')::double precision
      ),4326)::geography,
      (coalesce((area->>'radiusKm')::numeric,(payload->>'serviceRadiusKm')::numeric,20)*1000)::integer
    );
  end loop;

  delete from provider_availability where provider_id=actor;
  if jsonb_array_length(coalesce(payload->'availability','[]'::jsonb))=0 then
    insert into provider_availability(provider_id,weekday,start_time,end_time)
    select actor,day,'08:00'::time,'18:00'::time from generate_series(0,6) day;
  else
    for slot in select value from jsonb_array_elements(payload->'availability') loop
      insert into provider_availability(provider_id,weekday,start_time,end_time)
      values(
        actor,(slot->>'weekday')::smallint,(slot->>'start')::time,(slot->>'end')::time
      );
    end loop;
  end if;

  for document in select value from jsonb_array_elements(coalesce(payload->'documents','[]'::jsonb)) loop
    insert into provider_documents(
      provider_id,document_type,storage_path,content_hash,mime_type,size_bytes,status
    ) values(
      actor,document->>'documentType',document->>'storagePath',document->>'contentHash',
      document->>'mimeType',(document->>'sizeBytes')::bigint,
      case when submit then 'submitted' else 'draft' end
    );
  end loop;
  if submit and not exists(select 1 from provider_documents
    where provider_id=actor and deleted_at is null) then raise exception 'PROVIDER_DOCUMENT_REQUIRED'; end if;
  if previous is distinct from result_status then
    insert into provider_status_history(provider_id,previous_status,new_status,actor_id,reason)
    values(
      actor,previous,result_status,actor,
      case when submit then 'provider_submitted_onboarding' else 'provider_saved_draft' end
    );
  end if;
  return jsonb_build_object(
    'providerId',actor,'status',result_status,'serviceCount',category_count,
    'areaCount',area_count,'submitted',submit
  );
end $$;

revoke select on public.request_media from authenticated;
grant select(id,request_id,uploader_id,mime_type,size_bytes,media_kind,upload_status,created_at,deleted_at)
  on public.request_media to authenticated;
revoke select on public.message_attachments from authenticated;
grant select(id,message_id,uploader_id,mime_type,size_bytes,created_at,file_upload_id)
  on public.message_attachments to authenticated;
revoke select on public.completion_proofs from authenticated;
grant select(id,job_id,provider_id,mime_type,size_bytes,description,captured_at,created_at,file_upload_id)
  on public.completion_proofs to authenticated;

revoke all on function private.has_admin_permission(text) from public,anon,authenticated;
grant execute on function private.has_admin_permission(text) to authenticated;
revoke all on function public.get_session_context() from public,anon,authenticated;
revoke all on function public.set_active_role(public.user_role) from public,anon,authenticated;
revoke all on function public.start_job_location_sharing(uuid,integer,boolean) from public,anon,authenticated;
revoke all on function public.stop_job_location_sharing(uuid,text) from public,anon,authenticated;
revoke all on function public.record_job_location(uuid,uuid,double precision,double precision,numeric) from public,anon,authenticated;
revoke all on function public.get_authorized_job_location(uuid) from public,anon,authenticated;
revoke all on function public.get_completion_proof_manifest(uuid) from public,anon,authenticated;
revoke all on function public.get_provider_request_brief(uuid) from public,anon,authenticated;
grant execute on function public.get_session_context() to authenticated;
grant execute on function public.set_active_role(public.user_role) to authenticated;
grant execute on function public.start_job_location_sharing(uuid,integer,boolean) to authenticated;
grant execute on function public.stop_job_location_sharing(uuid,text) to authenticated;
grant execute on function public.record_job_location(uuid,uuid,double precision,double precision,numeric) to authenticated;
grant execute on function public.get_authorized_job_location(uuid) to authenticated;
grant execute on function public.get_completion_proof_manifest(uuid) to authenticated;
grant execute on function public.get_provider_request_brief(uuid) to authenticated;

commit;
