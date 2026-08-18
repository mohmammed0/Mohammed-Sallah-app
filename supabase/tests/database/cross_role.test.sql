begin;
select plan(18);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',email,crypt(gen_random_uuid()::text,gen_salt('bf')),now(),'{}','{}',now(),now()
from (values
 ('11111111-1111-4111-8111-111111111111'::uuid,'customer@test.invalid'),
 ('22222222-2222-4222-8222-222222222222'::uuid,'provider-a@test.invalid'),
 ('33333333-3333-4333-8333-333333333333'::uuid,'provider-b@test.invalid'),
 ('44444444-4444-4444-8444-444444444444'::uuid,'outsider@test.invalid'),
 ('55555555-5555-4555-8555-555555555555'::uuid,'analyst@test.invalid'),
 ('66666666-6666-4666-8666-666666666666'::uuid,'reviewer@test.invalid'),
 ('77777777-7777-4777-8777-777777777777'::uuid,'operations@test.invalid')) users(id,email);
insert into public.user_roles(user_id,role) values
 ('22222222-2222-4222-8222-222222222222','provider'),('33333333-3333-4333-8333-333333333333','provider'),
 ('55555555-5555-4555-8555-555555555555','analyst'),('66666666-6666-4666-8666-666666666666','verification_reviewer'),
 ('77777777-7777-4777-8777-777777777777','operations_admin');
insert into public.provider_profiles(user_id,kind,verification_status,accepting_requests) values
 ('22222222-2222-4222-8222-222222222222','individual','verified',true),('33333333-3333-4333-8333-333333333333','individual','verified',true);
insert into public.provider_services(provider_id,category_id)
select provider_id,c.id from (values('22222222-2222-4222-8222-222222222222'::uuid),('33333333-3333-4333-8333-333333333333'::uuid)) p(provider_id)
cross join lateral(select id from public.service_categories where slug='general-handyman') c;
insert into public.provider_service_areas(provider_id,city_id,center,radius_m)
select provider_id,c.id,st_setsrid(st_makepoint(0,0),4326)::geography,50000
from (values('22222222-2222-4222-8222-222222222222'::uuid),('33333333-3333-4333-8333-333333333333'::uuid)) p(provider_id)
cross join lateral(select id from public.cities where code='riyadh') c;

insert into public.addresses(id,user_id,city_id,label,formatted_address,location)
select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',id,'Fixture','Synthetic test fixture with no real address',st_setsrid(st_makepoint(0,0),4326)::geography from public.cities where code='riyadh';
insert into public.service_requests(id,customer_id,category_id,city_id,title,structured_description,original_text,approximate_location,exact_address_id,status,published_at,customer_approved_at)
select 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111',cat.id,city.id,'Test request','Test request structured description','Test request original description',st_setsrid(st_makepoint(0,0),4326)::geography,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','draft',now(),now()
from public.service_categories cat cross join public.cities city where cat.slug='general-handyman' and city.code='riyadh';
insert into public.matching_runs(id,request_id,configuration_version,weights,status) values('cccccccc-cccc-4ccc-8ccc-cccccccccccc','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','test','{}','completed');
insert into public.request_provider_matches(request_id,provider_id,matching_run_id,score,status,expires_at) values
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','cccccccc-cccc-4ccc-8ccc-cccccccccccc',.9,'offered',now()+interval '1 day'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','33333333-3333-4333-8333-333333333333','cccccccc-cccc-4ccc-8ccc-cccccccccccc',.8,'offered',now()+interval '1 day');
insert into public.offers(id,request_id,provider_id,total_amount_minor,materials_included,estimated_arrival_minutes,estimated_duration_minutes,expires_at,idempotency_key,status) values
 ('dddddddd-dddd-4ddd-8ddd-ddddddddddda','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222',10000,false,60,120,now()+interval '1 day','provider-a-idempotency','selected'),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddb','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','33333333-3333-4333-8333-333333333333',9000,false,90,90,now()+interval '1 day','provider-b-idempotency','rejected');
insert into public.jobs(id,request_id,selected_offer_id,customer_id,provider_id,exact_address_id,approved_total_minor)
values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','dddddddd-dddd-4ddd-8ddd-ddddddddddda','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',10000);
insert into public.conversations(id,job_id) values('ffffffff-ffff-4fff-8fff-ffffffffffff','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
insert into public.conversation_members(conversation_id,user_id,member_role) values
 ('ffffffff-ffff-4fff-8fff-ffffffffffff','11111111-1111-4111-8111-111111111111','customer'),('ffffffff-ffff-4fff-8fff-ffffffffffff','22222222-2222-4222-8222-222222222222','provider');
insert into public.messages(conversation_id,sender_id,body) values('ffffffff-ffff-4fff-8fff-ffffffffffff','11111111-1111-4111-8111-111111111111','Private job message');
insert into public.file_uploads(
  id,user_id,purpose,original_filename,extension,declared_mime_type,detected_mime_type,
  size_bytes,max_size_bytes,quarantine_path,target_bucket,target_path,final_path,
  content_sha256,status,scanner,sanitized,scanned_at
) values(
  'abababab-abab-4aba-8aba-abababababab','33333333-3333-4333-8333-333333333333',
  'provider_document','id.pdf','pdf','application/pdf','application/pdf',100,20971520,
  '33333333-3333-4333-8333-333333333333/abababab-abab-4aba-8aba-abababababab/id.pdf',
  'provider-documents','33333333-3333-4333-8333-333333333333/id.pdf',
  '33333333-3333-4333-8333-333333333333/id.pdf',repeat('a',64),
  'clean','deterministic-test-fixture',false,now()
);
insert into public.provider_documents(provider_id,document_type,storage_path,content_hash,mime_type,size_bytes)
values('33333333-3333-4333-8333-333333333333','identity','33333333-3333-4333-8333-333333333333/id.pdf','hash','application/pdf',100);

set local role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select is((select count(*) from public.offers),1::bigint,'provider A sees only own offer');
select is((select count(*) from public.addresses),1::bigint,'selected provider reads exact address');
select is((select count(*) from public.provider_documents),0::bigint,'provider A cannot read provider B documents');

select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
select is((select count(*) from public.offers),1::bigint,'provider B sees only own offer');
select is((select count(*) from public.addresses),0::bigint,'unselected provider cannot read exact address');
select is((select count(*) from public.provider_documents),1::bigint,'provider reads own private document');

select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select is((select count(*) from public.offers),2::bigint,'customer sees all offers for own request');
select is((select count(*) from public.addresses),1::bigint,'customer reads own exact address');
select is((select count(*) from public.messages),1::bigint,'conversation member reads messages');

select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',true);
select is((select count(*) from public.messages),0::bigint,'conversation outsider cannot read messages');
select is((select count(*) from public.offers),0::bigint,'unrelated user cannot read offers');

select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
select lives_ok($$select public.admin_marketplace_health()$$,'analyst may read dashboard');
select throws_ok($$select public.review_provider('33333333-3333-4333-8333-333333333333','verified','not authorized','analyst-review-key')$$,'VERIFICATION_PERMISSION_REQUIRED','analyst cannot verify provider');
select throws_ok($$select public.admin_set_customer_status('11111111-1111-4111-8111-111111111111','suspended','not authorized','analyst-customer-key')$$,'OPERATIONS_PERMISSION_REQUIRED','analyst cannot suspend customer');

select set_config('request.jwt.claim.sub','66666666-6666-4666-8666-666666666666',true);
select lives_ok($$select public.review_provider('33333333-3333-4333-8333-333333333333','verified','evidence reviewed','reviewer-key')$$,'verification reviewer may verify provider');
reset role;
select is((select count(*) from public.admin_audit_logs where actor_id='66666666-6666-4666-8666-666666666666'),1::bigint,'provider verification is audited');
set local role authenticated;

select set_config('request.jwt.claim.sub','77777777-7777-4777-8777-777777777777',true);
select lives_ok($$select public.admin_set_customer_status('11111111-1111-4111-8111-111111111111','suspended','risk review complete','operations-customer-key')$$,'operations admin may suspend customer');
select is((select status::text from public.profiles where id='11111111-1111-4111-8111-111111111111'),'suspended','customer suspension persists');

select * from finish();
rollback;
