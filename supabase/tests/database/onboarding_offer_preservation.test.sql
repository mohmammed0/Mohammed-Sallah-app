begin;
select plan(5);

update public.offers set status='active'
where id='dd000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000001',true);

select public.upsert_provider_onboarding(jsonb_build_object(
  'idempotencyKey','onboarding-preserve-biography-001','submit',false,'kind','individual',
  'businessName','فني الرياض التجريبي',
  'bio','سيرة مهنية محدثة لا تغير أهلية مقدم الخدمة','locale','ur','serviceRadiusKm',40,
  'services',jsonb_build_array(jsonb_build_object('categoryId',
    (select id from public.service_categories where slug='air-conditioning'))),
  'serviceAreas',jsonb_build_array(jsonb_build_object('cityId',
    (select id from public.cities where code='riyadh'),'location',jsonb_build_object(
      'latitude',24.7136,'longitude',46.6753),'radiusKm',40)),
  'availability',jsonb_build_array(jsonb_build_object('weekday',2,'start','08:00','end','20:00'))
));
reset role;
select is((select status::text from public.offers where id='dd000000-0000-4000-8000-000000000002'),
  'active','biography and ordinary availability edits preserve an active offer');
select is((select verification_status::text from public.provider_profiles where user_id='d2000000-0000-4000-8000-000000000001'),
  'verified','unchanged service submission preserves verified status');
select is((select count(*) from public.offer_status_history where offer_id='dd000000-0000-4000-8000-000000000002' and new_status='withdrawn'),
  0::bigint,'same categories are not transiently invalidated');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000001',true);
select public.upsert_provider_onboarding(jsonb_build_object(
  'idempotencyKey','onboarding-add-unrelated-category-001','submit',false,'kind','individual',
  'businessName','فني الرياض التجريبي',
  'bio','سيرة مهنية محدثة لا تغير أهلية مقدم الخدمة','locale','ur','serviceRadiusKm',40,
  'services',jsonb_build_array(
    jsonb_build_object('categoryId',(select id from public.service_categories where slug='air-conditioning')),
    jsonb_build_object('categoryId',(select id from public.service_categories where slug='plumbing'))),
  'serviceAreas',jsonb_build_array(jsonb_build_object('cityId',
    (select id from public.cities where code='riyadh'),'location',jsonb_build_object(
      'latitude',24.7136,'longitude',46.6753),'radiusKm',40))
));
reset role;
select is((select status::text from public.offers where id='dd000000-0000-4000-8000-000000000002'),
  'active','adding an unrelated category does not withdraw another category offer');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000001',true);
select public.upsert_provider_onboarding(jsonb_build_object(
  'idempotencyKey','onboarding-remove-affected-category-001','submit',false,'kind','individual',
  'businessName','فني الرياض التجريبي',
  'bio','سيرة مهنية محدثة لا تغير أهلية مقدم الخدمة','locale','ur','serviceRadiusKm',40,
  'services',jsonb_build_array(jsonb_build_object('categoryId',
    (select id from public.service_categories where slug='plumbing'))),
  'serviceAreas',jsonb_build_array(jsonb_build_object('cityId',
    (select id from public.cities where code='riyadh'),'location',jsonb_build_object(
      'latitude',24.7136,'longitude',46.6753),'radiusKm',40))
));
reset role;
select is((select status::text from public.offers where id='dd000000-0000-4000-8000-000000000002'),
  'withdrawn','removing the offered category withdraws only its affected offer');

select * from finish();
rollback;
