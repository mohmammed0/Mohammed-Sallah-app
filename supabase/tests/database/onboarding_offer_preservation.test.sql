begin;
select plan(18);

create temporary table service_review_fixture(
  kind text primary key,result jsonb,replay_result jsonb,request_id uuid,offer_id uuid
);
grant all on service_review_fixture to authenticated;

update public.offers set status='active' where id='dd000000-0000-4000-8000-000000000002';
insert into public.file_uploads(
  id,user_id,purpose,original_filename,extension,declared_mime_type,detected_mime_type,
  size_bytes,max_size_bytes,quarantine_path,target_bucket,target_path,final_path,
  content_sha256,status,scanner,sanitized,scanned_at
) values(
  'd9000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001',
  'provider_document','service-review-fixture.jpg','jpg','image/jpeg','image/jpeg',128,20971520,
  'd2000000-0000-4000-8000-000000000001/quarantine/service-review-fixture.jpg',
  'provider-documents','local/service-review-fixture.jpg','local/service-review-fixture.jpg',
  repeat('a',64),'clean','test-scanner',true,now()
);
insert into public.provider_documents(
  provider_id,document_type,storage_path,content_hash,mime_type,size_bytes,status
) values(
  'd2000000-0000-4000-8000-000000000001','identity_or_license',
  'local/service-review-fixture.jpg',repeat('a',64),'image/jpeg',128,'verified'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000001',true);
insert into service_review_fixture(kind,result)
select 'draft',public.upsert_provider_onboarding(jsonb_build_object(
  'idempotencyKey','onboarding-service-draft-001','submit',false,'kind','individual',
  'businessName','فني الرياض التجريبي','bio','سيرة مهنية محدثة لا تغير أهلية مقدم الخدمة',
  'locale','ur','serviceRadiusKm',40,'services',jsonb_build_array(
    jsonb_build_object('categoryId',(select id from public.service_categories where slug='air-conditioning')),
    jsonb_build_object('categoryId',(select id from public.service_categories where slug='plumbing'))),
  'serviceAreas',jsonb_build_array(jsonb_build_object('cityId',
    (select id from public.cities where code='riyadh'),'location',jsonb_build_object(
      'latitude',24.7136,'longitude',46.6753),'radiusKm',40)),
  'availability',jsonb_build_array(jsonb_build_object('weekday',2,'start','08:00','end','20:00'))
));
update service_review_fixture set replay_result=public.upsert_provider_onboarding(jsonb_build_object(
  'idempotencyKey','onboarding-service-draft-001','submit',false,'kind','individual',
  'businessName','فني الرياض التجريبي','bio','سيرة مهنية محدثة لا تغير أهلية مقدم الخدمة',
  'locale','ur','serviceRadiusKm',40,'services',jsonb_build_array(
    jsonb_build_object('categoryId',(select id from public.service_categories where slug='air-conditioning')),
    jsonb_build_object('categoryId',(select id from public.service_categories where slug='plumbing'))),
  'serviceAreas',jsonb_build_array(jsonb_build_object('cityId',
    (select id from public.cities where code='riyadh'),'location',jsonb_build_object(
      'latitude',24.7136,'longitude',46.6753),'radiusKm',40)),
  'availability',jsonb_build_array(jsonb_build_object('weekday',2,'start','08:00','end','20:00'))
)) where kind='draft';
reset role;

select is((select replay_result from service_review_fixture where kind='draft'),
  (select result from service_review_fixture where kind='draft'),
  'response-loss onboarding replay returns the same final committed JSON');
select is((select response from public.idempotency_keys
  where user_id='d2000000-0000-4000-8000-000000000001'
    and command='provider_onboarding_v2' and key='onboarding-service-draft-001'),
  (select result from service_review_fixture where kind='draft'),
  'stored onboarding idempotent response matches the final database state');
select is((select result->>'status' from service_review_fixture where kind='draft'),
  (select verification_status::text from public.provider_profiles where user_id='d2000000-0000-4000-8000-000000000001'),
  'onboarding JSON status equals the final committed provider status');
select is((select review_status::text from public.provider_services where provider_id='d2000000-0000-4000-8000-000000000001'
  and category_id=(select id from public.service_categories where slug='plumbing')),
  'draft','verified provider saves a newly added ordinary category as draft');
select is((select service->>'reviewStatus' from service_review_fixture f,
  lateral jsonb_array_elements(f.result->'services') service
  where f.kind='draft' and service->>'categoryId'=(
    select id::text from public.service_categories where slug='plumbing'
  )),'draft','onboarding JSON service state equals the persisted draft state');
select is((select review_status::text from public.provider_services where provider_id='d2000000-0000-4000-8000-000000000001'
  and category_id=(select id from public.service_categories where slug='air-conditioning')),
  'approved','previously approved category remains approved');
select is((select status::text from public.offers where id='dd000000-0000-4000-8000-000000000002'),
  'active','biography, availability, and a draft category preserve the approved-category offer');
select is((select count(*) from public.provider_status_history
  where provider_id='d2000000-0000-4000-8000-000000000001'
    and previous_status='verified' and new_status='submitted'
    and reason='material_change_requires_review'),0::bigint,
  'service-only onboarding does not record a contradictory account-status transition');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000001',true);
update service_review_fixture set request_id=public.publish_service_request(jsonb_build_object(
  'idempotency_key','service-review-plumbing-request-001','title','Plumbing review fixture',
  'original_text','The sink is leaking','structured_description','The sink is leaking',
  'locale','en','urgency','flexible','selected_category_slug','plumbing',
  'category_confirmed_by_user',true,'category_selection_source','manual','city_code','riyadh',
  'timing_mode','flexible','requested_start',null,'requested_end',null,
  'exact_location',jsonb_build_object('latitude',24.7136,'longitude',46.6753),
  'media','[]'::jsonb,'customer_approved',true
)) where kind='draft';
reset role;
select is((select c.exclusion_reason from public.matching_candidates c
  join public.matching_runs run on run.id=c.matching_run_id
  join service_review_fixture f on f.request_id=run.request_id
  where f.kind='draft' and c.provider_id='d2000000-0000-4000-8000-000000000001'),
  'category_not_supported','new draft category cannot match');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000001',true);
insert into service_review_fixture(kind,result)
select 'submitted',public.upsert_provider_onboarding(jsonb_build_object(
  'idempotencyKey','onboarding-service-submit-001','submit',true,'kind','individual',
  'businessName','فني الرياض التجريبي','bio','سيرة مهنية محدثة لا تغير أهلية مقدم الخدمة',
  'locale','ur','serviceRadiusKm',40,'services',jsonb_build_array(
    jsonb_build_object('categoryId',(select id from public.service_categories where slug='air-conditioning')),
    jsonb_build_object('categoryId',(select id from public.service_categories where slug='plumbing'))),
  'serviceAreas',jsonb_build_array(jsonb_build_object('cityId',
    (select id from public.cities where code='riyadh'),'location',jsonb_build_object(
      'latitude',24.7136,'longitude',46.6753),'radiusKm',40))
));
reset role;
select is((select review_status::text from public.provider_services where provider_id='d2000000-0000-4000-8000-000000000001'
  and category_id=(select id from public.service_categories where slug='plumbing')),
  'submitted','provider can submit the new category for human review');
select is((select verification_status::text from public.provider_profiles where user_id='d2000000-0000-4000-8000-000000000001'),
  'verified','service review does not contradict global provider verification');
select is((select result->>'status' from service_review_fixture where kind='submitted'),
  (select verification_status::text from public.provider_profiles where user_id='d2000000-0000-4000-8000-000000000001'),
  'submitted response still reflects persisted global status');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','d3000000-0000-4000-8000-000000000003',true);
select public.review_provider_service(
  'd2000000-0000-4000-8000-000000000001',
  (select id from public.service_categories where slug='plumbing'),
  'approved','Approved after category capability review','service-review-approve-001'
);
reset role;
select is((select review_status::text from public.provider_services where provider_id='d2000000-0000-4000-8000-000000000001'
  and category_id=(select id from public.service_categories where slug='plumbing')),
  'approved','reviewer approval is persisted per service');

select set_config('request.jwt.claim.role','service_role',true);
select public.run_matching(request_id,20) from service_review_fixture where kind='draft';
select set_config('request.jwt.claim.role','',true);
select is((select count(*) from public.request_provider_matches m join service_review_fixture f on f.request_id=m.request_id
  where f.kind='draft' and m.provider_id='d2000000-0000-4000-8000-000000000001' and m.status='invited'),
  1::bigint,'matching begins only after service approval');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000001',true);
update service_review_fixture set offer_id=public.submit_offer(jsonb_build_object(
  'requestId',request_id,'idempotencyKey','service-review-plumbing-offer-001',
  'totalAmountMinor',18000,'visitFeeMinor',2000,'laborAmountMinor',16000,
  'materialsIncluded',false,'materialsEstimateMinor',null,'estimatedArrivalMinutes',60,
  'estimatedDurationMinutes',90,'warrantyDays',7,'note','Approved plumbing service offer',
  'expiresAt',now()+interval '1 day',
  'expectedRequestVersion',(select version from public.service_requests where id=request_id)
)) where kind='draft';
reset role;
select is((select status::text from public.offers o join service_review_fixture f on f.offer_id=o.id where f.kind='draft'),
  'active','approved category can submit an active offer');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000001',true);
select public.upsert_provider_onboarding(jsonb_build_object(
  'idempotencyKey','onboarding-remove-plumbing-001','submit',false,'kind','individual',
  'businessName','فني الرياض التجريبي','bio','سيرة مهنية محدثة لا تغير أهلية مقدم الخدمة',
  'locale','ur','serviceRadiusKm',40,'services',jsonb_build_array(jsonb_build_object(
    'categoryId',(select id from public.service_categories where slug='air-conditioning'))),
  'serviceAreas',jsonb_build_array(jsonb_build_object('cityId',
    (select id from public.cities where code='riyadh'),'location',jsonb_build_object(
      'latitude',24.7136,'longitude',46.6753),'radiusKm',40))
));
reset role;
select is((select enabled from public.provider_services where provider_id='d2000000-0000-4000-8000-000000000001'
  and category_id=(select id from public.service_categories where slug='plumbing')),
  false,'category removal disables only the removed service');
select is((select status::text from public.offers o join service_review_fixture f on f.offer_id=o.id where f.kind='draft'),
  'withdrawn','category removal withdraws its affected offer');
select is((select status::text from public.offers where id='dd000000-0000-4000-8000-000000000002'),
  'active','category removal preserves an unrelated approved-category offer');

select * from finish();
rollback;
