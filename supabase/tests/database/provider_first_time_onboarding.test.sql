begin;
set local search_path=public,extensions,pg_temp;
select extensions.no_plan();

insert into auth.users(
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
  (
    'e1000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
    'provider-first-draft@test.invalid',crypt(gen_random_uuid()::text,gen_salt('bf')),now(),
    '{}','{}',now(),now()
  ),
  (
    'e2000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
    'provider-first-submit@test.invalid',crypt(gen_random_uuid()::text,gen_salt('bf')),now(),
    '{}','{}',now(),now()
  ),
  (
    'e3000000-0000-4000-8000-000000000003',
    '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
    'provider-verified-update@test.invalid',crypt(gen_random_uuid()::text,gen_salt('bf')),now(),
    '{}','{}',now(),now()
  );

create temporary table provider_onboarding_regression(
  case_name text primary key,
  payload jsonb not null,
  result jsonb
);
grant select,insert,update on provider_onboarding_regression to authenticated;

insert into provider_onboarding_regression(case_name,payload) values(
  'first-draft',
  jsonb_build_object(
    'idempotencyKey','provider-first-draft-001','submit',false,
    'kind','individual','businessName','مزود صيانة تجريبي',
    'bio','سيرة مهنية تجريبية مكتملة لمقدم خدمة جديد',
    'locale','ar','serviceRadiusKm',40,
    'services',jsonb_build_array(jsonb_build_object(
      'categoryId',(select id from public.service_categories where slug='air-conditioning')
    )),
    'serviceAreas',jsonb_build_array(jsonb_build_object(
      'cityId',(select id from public.cities where code='riyadh'),
      'location',jsonb_build_object('latitude',24.7136,'longitude',46.6753),
      'radiusKm',40
    ))
  )
),(
  'first-submit',
  jsonb_build_object(
    'idempotencyKey','provider-first-submit-001','submit',true,
    'kind','individual','businessName','مزود تقديم تجريبي',
    'bio','سيرة مهنية تجريبية مكتملة لاختبار التقديم الأول',
    'locale','ar','serviceRadiusKm',40,
    'services',jsonb_build_array(jsonb_build_object(
      'categoryId',(select id from public.service_categories where slug='air-conditioning')
    )),
    'serviceAreas',jsonb_build_array(jsonb_build_object(
      'cityId',(select id from public.cities where code='riyadh'),
      'location',jsonb_build_object('latitude',24.7136,'longitude',46.6753),
      'radiusKm',40
    ))
  )
),(
  'verified-update',
  jsonb_build_object(
    'idempotencyKey','provider-verified-update-001','submit',false,
    'kind','individual','businessName','مزود موثق تجريبي',
    'bio','سيرة مهنية محدثة دون تغيير جوهري في الهوية',
    'locale','ar','serviceRadiusKm',40,
    'services',jsonb_build_array(jsonb_build_object(
      'categoryId',(select id from public.service_categories where slug='air-conditioning')
    )),
    'serviceAreas',jsonb_build_array(jsonb_build_object(
      'cityId',(select id from public.cities where code='riyadh'),
      'location',jsonb_build_object('latitude',24.7136,'longitude',46.6753),
      'radiusKm',40
    ))
  )
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000001',true);

select extensions.lives_ok($test$
  update provider_onboarding_regression
  set result=public.upsert_provider_onboarding(payload)
  where case_name='first-draft'
$test$,'a first-time provider can save a draft without a NOT NULL failure');

reset role;
select extensions.is(
  (select result->>'status' from provider_onboarding_regression where case_name='first-draft'),
  'draft','first-time onboarding returns draft status'
);
select extensions.is(
  (select verification_status::text from public.provider_profiles
   where user_id='e1000000-0000-4000-8000-000000000001'),
  'draft','first-time onboarding persists a draft provider profile'
);
select extensions.is(
  (select accepting_requests from public.provider_profiles
   where user_id='e1000000-0000-4000-8000-000000000001'),
  false,'a first-time unverified provider cannot accept requests'
);
select extensions.ok(
  exists(select 1 from public.user_roles
    where user_id='e1000000-0000-4000-8000-000000000001'
      and role='provider' and revoked_at is null),
  'first-time onboarding grants only the provider marketplace role'
);
select extensions.ok(
  not exists(select 1 from public.user_roles
    where user_id='e1000000-0000-4000-8000-000000000001'
      and role in ('operations_admin','verification_reviewer','support_agent',
        'finance_reviewer','analyst','super_admin') and revoked_at is null)
  and not exists(select 1 from public.admin_role_assignments
    where user_id='e1000000-0000-4000-8000-000000000001' and revoked_at is null),
  'first-time onboarding grants no administrative authority'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000001',true);
update provider_onboarding_regression
set payload=jsonb_set(
  jsonb_set(payload,'{idempotencyKey}','"provider-first-draft-update-001"'::jsonb),
  '{bio}','"سيرة مهنية محدثة لمسودة مقدم الخدمة دون تغيير الصلاحيات"'::jsonb
)
where case_name='first-draft';
select extensions.lives_ok($test$
  update provider_onboarding_regression
  set result=public.upsert_provider_onboarding(payload)
  where case_name='first-draft'
$test$,'an existing unverified provider can save an ordinary draft update');
reset role;

select extensions.is(
  (select verification_status::text from public.provider_profiles
   where user_id='e1000000-0000-4000-8000-000000000001'),
  'draft','an ordinary unverified update remains draft'
);
select extensions.is(
  (select accepting_requests from public.provider_profiles
   where user_id='e1000000-0000-4000-8000-000000000001'),
  false,'an ordinary unverified update remains unable to accept requests'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e2000000-0000-4000-8000-000000000002',true);
select extensions.throws_ok($test$
  select public.upsert_provider_onboarding(
    (select payload from provider_onboarding_regression where case_name='first-submit')
  )
$test$,'PROVIDER_DOCUMENT_REQUIRED',
  'a first-time submission without a clean provider document fails closed');
reset role;

select extensions.ok(
  not exists(select 1 from public.provider_profiles
    where user_id='e2000000-0000-4000-8000-000000000002'),
  'failed first-time submission rolls back the provider profile'
);
select extensions.ok(
  not exists(select 1 from public.user_roles
    where user_id='e2000000-0000-4000-8000-000000000002'
      and role='provider' and revoked_at is null),
  'failed first-time submission rolls back the provider role'
);
select extensions.ok(
  not exists(select 1 from public.idempotency_keys
    where user_id='e2000000-0000-4000-8000-000000000002'
      and command='provider_onboarding_v2' and key='provider-first-submit-001'),
  'failed first-time submission rolls back its idempotency record'
);

insert into public.user_roles(user_id,role)
values('e3000000-0000-4000-8000-000000000003','provider');
insert into public.provider_profiles(
  user_id,kind,business_name,bio,preferred_brief_locale,
  verification_status,service_radius_km,accepting_requests
) values(
  'e3000000-0000-4000-8000-000000000003','individual','مزود موثق تجريبي',
  'سيرة مهنية أصلية لمقدم خدمة موثق','ar','verified',40,true
);
insert into public.provider_services(
  provider_id,category_id,enabled,qualified_for_restricted,review_status,
  submitted_at,reviewed_at
) values(
  'e3000000-0000-4000-8000-000000000003',
  (select id from public.service_categories where slug='air-conditioning'),
  true,false,'approved',now(),now()
);
insert into public.provider_service_areas(provider_id,city_id,center,radius_m)
values(
  'e3000000-0000-4000-8000-000000000003',
  (select id from public.cities where code='riyadh'),
  st_setsrid(st_makepoint(46.6753,24.7136),4326)::geography,40000
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e3000000-0000-4000-8000-000000000003',true);
select extensions.lives_ok($test$
  update provider_onboarding_regression
  set result=public.upsert_provider_onboarding(payload)
  where case_name='verified-update'
$test$,'a verified provider can save a non-material update');
reset role;

select extensions.is(
  (select verification_status::text from public.provider_profiles
   where user_id='e3000000-0000-4000-8000-000000000003'),
  'verified','a verified provider remains verified after a non-material update'
);
select extensions.is(
  (select accepting_requests from public.provider_profiles
   where user_id='e3000000-0000-4000-8000-000000000003'),
  true,'a verified provider preserves accepting_requests after a non-material update'
);

select * from extensions.finish();
rollback;
