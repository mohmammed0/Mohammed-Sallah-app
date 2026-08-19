begin;
select plan(18);

select has_column('public','addresses','address_kind','address kind distinguishes saved locations from request snapshots');
select ok(has_function_privilege('authenticated','public.list_my_saved_addresses()','execute'),
  'authenticated customers may list their own saved addresses');
select ok(not has_function_privilege('anon','public.list_my_saved_addresses()','execute'),
  'anonymous callers cannot list saved addresses');

insert into auth.users(
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
  ('c8100000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','location-customer@test.invalid',
   crypt(gen_random_uuid()::text,gen_salt('bf')),now(),'{}','{}',now(),now()),
  ('c8200000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','location-outsider@test.invalid',
   crypt(gen_random_uuid()::text,gen_salt('bf')),now(),'{}','{}',now(),now());
insert into public.user_roles(user_id,role)
values('c8200000-0000-4000-8000-000000000002','provider')
on conflict do nothing;
insert into public.provider_profiles(user_id,kind,verification_status,accepting_requests)
values('c8200000-0000-4000-8000-000000000002','individual','verified',true)
on conflict(user_id) do nothing;

insert into public.service_subcategories(id,category_id,slug,enabled,sort_order)
select 'c8300000-0000-4000-8000-000000000003',id,'tap-repair',true,10
from public.service_categories where slug='plumbing';
insert into public.service_subcategory_translations(subcategory_id,locale,name,description)
values
 ('c8300000-0000-4000-8000-000000000003','ar','إصلاح صنبور','اختبار'),
 ('c8300000-0000-4000-8000-000000000003','en','Tap repair','Test fixture');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c8100000-0000-4000-8000-000000000001',true);

select is(public.upsert_my_saved_address(jsonb_build_object(
  'id','a8100000-0000-4000-8000-000000000001',
  'label','Home','formattedAddress','Synthetic Riyadh address',
  'building','12','unit','4','accessNotes','Synthetic private instruction',
  'cityCode','riyadh','isDefault',true,
  'coordinates',jsonb_build_object('latitude',24.7136,'longitude',46.6753)
)), 'a8100000-0000-4000-8000-000000000001'::uuid,
  'customer creates a deterministic saved location');

select is(jsonb_array_length(public.list_my_saved_addresses()),1,
  'customer lists one saved location');
select is((public.list_my_saved_addresses()->0->'coordinates'->>'latitude')::numeric,
  24.7136::numeric,'saved location returns the exact latitude only to its owner');

select public.upsert_my_saved_address(jsonb_build_object(
  'id','a8100000-0000-4000-8000-000000000002',
  'label','Office','formattedAddress','Synthetic office address',
  'building','','unit','','accessNotes','','cityCode','riyadh','isDefault',true,
  'coordinates',jsonb_build_object('latitude',24.72,'longitude',46.68)
));
reset role;

select is((select count(*) from public.addresses
  where user_id='c8100000-0000-4000-8000-000000000001'
    and address_kind='saved' and is_default and deleted_at is null),1::bigint,
  'only one saved location is the default');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c8200000-0000-4000-8000-000000000002',true);
select throws_ok($$
  select public.upsert_my_saved_address(jsonb_build_object(
    'id','a8100000-0000-4000-8000-000000000001',
    'label','Tampered','formattedAddress','Attempted overwrite',
    'building','','unit','','accessNotes','','cityCode','riyadh','isDefault',false,
    'coordinates',jsonb_build_object('latitude',24.8,'longitude',46.8)
  ))
$$,'SAVED_ADDRESS_NOT_AVAILABLE','another account cannot alter a saved location');
reset role;

create temporary table customer_location_fixture(request_id uuid);
grant all on customer_location_fixture to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c8100000-0000-4000-8000-000000000001',true);
insert into customer_location_fixture
select public.publish_service_request(jsonb_build_object(
  'idempotency_key','customer-location-publication-001',
  'title','Synthetic tap request',
  'original_text','Synthetic customer complaint for location tests',
  'structured_description','Synthetic customer complaint for location tests',
  'locale','en','urgency','normal',
  'selected_category_slug','plumbing',
  'selected_subcategory_slug','tap-repair',
  'category_confirmed_by_user',true,
  'category_selection_source','manual',
  'city_code','riyadh',
  'timing_mode','flexible',
  'requested_start',null,
  'requested_end',null,
  'saved_address_id','a8100000-0000-4000-8000-000000000001',
  'exact_location',jsonb_build_object('latitude',20,'longitude',40),
  'media','[]'::jsonb,
  'customer_approved',true
));
reset role;

select is((select count(*) from customer_location_fixture),1::bigint,
  'publication accepts an owned saved location');
select is((select s.slug from public.service_requests r
  join customer_location_fixture f on f.request_id=r.id
  join public.service_subcategories s on s.id=r.subcategory_id),
  'tap-repair','publication persists the selected optional subcategory');
select ok((select r.exact_address_id<>'a8100000-0000-4000-8000-000000000001'::uuid
  from public.service_requests r join customer_location_fixture f on f.request_id=r.id),
  'publication creates an immutable location snapshot');
select is((select a.address_kind from public.addresses a
  join public.service_requests r on r.exact_address_id=a.id
  join customer_location_fixture f on f.request_id=r.id),
  'request_snapshot','the request address is explicitly classified as a snapshot');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c8100000-0000-4000-8000-000000000001',true);
select is(jsonb_array_length(public.list_my_saved_addresses()),2,
  'request snapshots are excluded from saved location lists');
select public.upsert_my_saved_address(jsonb_build_object(
  'id','a8100000-0000-4000-8000-000000000001',
  'label','Home updated','formattedAddress','Updated synthetic address',
  'building','99','unit','','accessNotes','','cityCode','riyadh','isDefault',false,
  'coordinates',jsonb_build_object('latitude',24.8,'longitude',46.8)
));
reset role;

select is((select round(extensions.st_y(a.location::extensions.geometry)::numeric,4)
  from public.addresses a
  join public.service_requests r on r.exact_address_id=a.id
  join customer_location_fixture f on f.request_id=r.id),
  24.7136::numeric,'editing a saved location cannot mutate an existing request snapshot');
select is((select a.formatted_address from public.addresses a
  join public.service_requests r on r.exact_address_id=a.id
  join customer_location_fixture f on f.request_id=r.id),
  'Synthetic Riyadh address','snapshot preserves the approved formatted address');
select is((select a.access_notes from public.addresses a
  join public.service_requests r on r.exact_address_id=a.id
  join customer_location_fixture f on f.request_id=r.id),
  'Synthetic private instruction','snapshot preserves private access instructions');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c8200000-0000-4000-8000-000000000002',true);
select is((select count(*) from public.addresses a
  join public.service_requests r on r.exact_address_id=a.id
  join customer_location_fixture f on f.request_id=r.id),0::bigint,
  'an unrelated provider cannot read the exact request location');
select is(jsonb_array_length(public.list_my_saved_addresses()),0,
  'a provider cannot list another customer saved locations');
reset role;

select * from finish();
rollback;
