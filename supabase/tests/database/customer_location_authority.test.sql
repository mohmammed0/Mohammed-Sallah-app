begin;
select plan(20);

select has_function(
  'public','resolve_service_location',
  array['double precision','double precision'],
  'service-location resolution RPC exists'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.resolve_service_location(double precision,double precision)',
    'execute'
  ),
  'authenticated customers may resolve a service location'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.resolve_service_location(double precision,double precision)',
    'execute'
  ),
  'anonymous callers cannot resolve service locations'
);

insert into auth.users(
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
  ('ca100000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','location-authority@test.invalid',
   crypt(gen_random_uuid()::text,gen_salt('bf')),now(),'{}','{}',now(),now()),
  ('ca200000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','location-outsider@test.invalid',
   crypt(gen_random_uuid()::text,gen_salt('bf')),now(),'{}','{}',now(),now());

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ca100000-0000-4000-8000-000000000001',true);

select is(
  public.resolve_service_location(24.7136,46.6753)->>'status',
  'supported',
  'Riyadh resolves as supported'
);
select is(
  public.resolve_service_location(24.7136,46.6753)->'city'->>'code',
  'riyadh',
  'Riyadh coordinates resolve to Riyadh'
);
select is(
  public.resolve_service_location(21.5433,39.1728)->'city'->>'code',
  'jeddah',
  'Jeddah coordinates resolve to Jeddah'
);
select is(
  public.resolve_service_location(26.4207,50.0888)->'city'->>'code',
  'dammam',
  'Dammam coordinates resolve to Dammam'
);
select is(
  public.resolve_service_location(24.4686,39.6142)->>'status',
  'city_not_supported',
  'an unsupported Saudi city remains explicitly unsupported'
);
select is(
  public.resolve_service_location(38.5767,-92.1735)->>'status',
  'outside_saudi_arabia',
  'the Missouri emulator point is not converted to Riyadh'
);
select is(
  public.resolve_service_location(null,null)->>'status',
  'location_unavailable',
  'missing coordinates have a distinct unavailable state'
);

select throws_ok($$
  select public.upsert_my_saved_address(jsonb_build_object(
    'id','aa100000-0000-4000-8000-000000000001',
    'label','Wrong city','formattedAddress','Synthetic Jeddah address',
    'building','','unit','','accessNotes','','cityCode','riyadh','isDefault',false,
    'coordinates',jsonb_build_object('latitude',21.5433,'longitude',39.1728)
  ))
$$,'LOCATION_CITY_MISMATCH','a Jeddah point cannot be stored as Riyadh');

select is(
  public.upsert_my_saved_address(jsonb_build_object(
    'id','aa100000-0000-4000-8000-000000000001',
    'label','Jeddah home','formattedAddress','Synthetic Jeddah address',
    'building','','unit','','accessNotes','','cityCode','jeddah','isDefault',true,
    'coordinates',jsonb_build_object('latitude',21.5433,'longitude',39.1728)
  )),
  'aa100000-0000-4000-8000-000000000001'::uuid,
  'a resolved Jeddah address is accepted'
);
select is(
  public.upsert_my_saved_address(jsonb_build_object(
    'id','aa100000-0000-4000-8000-000000000002',
    'label','Jeddah work','formattedAddress','Second synthetic Jeddah address',
    'building','','unit','','accessNotes','','cityCode','jeddah','isDefault',false,
    'coordinates',jsonb_build_object('latitude',21.56,'longitude',39.18)
  )),
  'aa100000-0000-4000-8000-000000000002'::uuid,
  'a second resolved address is accepted'
);
select lives_ok(
  $$select public.make_my_saved_address_default(
    'aa100000-0000-4000-8000-000000000002'
  )$$,
  'the owner can make an address default'
);
reset role;

select is(
  (select count(*) from public.addresses
   where user_id='ca100000-0000-4000-8000-000000000001'
     and address_kind='saved' and deleted_at is null and is_default),
  1::bigint,
  'the transactional default invariant leaves exactly one active default'
);
select is(
  (select id from public.addresses
   where user_id='ca100000-0000-4000-8000-000000000001'
     and address_kind='saved' and deleted_at is null and is_default),
  'aa100000-0000-4000-8000-000000000002'::uuid,
  'the explicitly selected address is the default'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ca200000-0000-4000-8000-000000000002',true);
select throws_ok($$
  select public.make_my_saved_address_default(
    'aa100000-0000-4000-8000-000000000001'
  )
$$,'SAVED_ADDRESS_NOT_AVAILABLE','another user cannot change the default');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ca100000-0000-4000-8000-000000000001',true);
select throws_ok($$
  select public.publish_service_request(jsonb_build_object(
    'idempotency_key','location-city-mismatch-publication-001',
    'title','Synthetic Jeddah request',
    'original_text','Synthetic complaint for city mismatch validation',
    'structured_description','Synthetic complaint for city mismatch validation',
    'locale','en','urgency','normal',
    'selected_category_slug','general-handyman',
    'category_confirmed_by_user',true,
    'category_selection_source','manual',
    'city_code','riyadh','timing_mode','flexible',
    'requested_start',null,'requested_end',null,
    'exact_location',jsonb_build_object('latitude',21.5433,'longitude',39.1728),
    'location_details',jsonb_build_object(
      'label','Test','formatted_address','Synthetic Jeddah request address'
    ),
    'media','[]'::jsonb,'customer_approved',true
  ))
$$,'LOCATION_CITY_MISMATCH','publication rejects a city and coordinate mismatch');

create temporary table resolved_request_fixture(request_id uuid);
grant all on resolved_request_fixture to authenticated;
insert into resolved_request_fixture
select public.publish_service_request(jsonb_build_object(
  'idempotency_key','location-resolved-publication-001',
  'title','Synthetic Jeddah request',
  'original_text','Synthetic complaint with a verified service city',
  'structured_description','Synthetic complaint with a verified service city',
  'locale','en','urgency','normal',
  'selected_category_slug','general-handyman',
  'category_confirmed_by_user',true,
  'category_selection_source','manual',
  'city_code','jeddah','timing_mode','flexible',
  'requested_start',null,'requested_end',null,
  'exact_location',jsonb_build_object('latitude',21.5433,'longitude',39.1728),
  'location_details',jsonb_build_object(
    'label','Test','formatted_address','Synthetic Jeddah request address'
  ),
  'media','[]'::jsonb,'customer_approved',true
));
reset role;

select is(
  (select city.code from public.service_requests request
   join resolved_request_fixture fixture on fixture.request_id=request.id
   join public.cities city on city.id=request.city_id),
  'jeddah',
  'publication persists the city resolved from the coordinates'
);
select is(
  (select count(*) from public.addresses address
   join resolved_request_fixture fixture on true
   join public.service_requests request on request.id=fixture.request_id
   where address.id=request.exact_address_id
     and address.city_id=request.city_id),
  1::bigint,
  'the immutable request snapshot uses the same authoritative city'
);

select * from finish();
rollback;
