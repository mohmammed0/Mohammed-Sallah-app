begin;
select plan(23);

select has_table('public','support_case_access_grants','temporary and escalated support access is explicit');
select is((select count(*) from pg_policies where schemaname='public' and (
  coalesce(qual,'') like '%is_admin%'
  or coalesce(with_check,'') like '%is_admin%'
  or coalesce(qual,'') like '%support.case.read%'
  or coalesce(with_check,'') like '%support.case.read%'
)),0::bigint,'no RLS policy retains a broad legacy admin or support permission gateway');

insert into auth.users(
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) select id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',email,
  crypt(gen_random_uuid()::text,gen_salt('bf')),now(),'{}','{}',now(),now()
from (values
  ('f3000000-0000-4000-8000-000000000001'::uuid,'scope-customer@test.invalid'),
  ('f3000000-0000-4000-8000-000000000002'::uuid,'scope-provider@test.invalid'),
  ('f3000000-0000-4000-8000-000000000003'::uuid,'scope-assigned@test.invalid'),
  ('f3000000-0000-4000-8000-000000000004'::uuid,'scope-unassigned@test.invalid'),
  ('f3000000-0000-4000-8000-000000000005'::uuid,'scope-expired@test.invalid'),
  ('f3000000-0000-4000-8000-000000000006'::uuid,'scope-revoked@test.invalid'),
  ('f3000000-0000-4000-8000-000000000007'::uuid,'scope-analyst@test.invalid'),
  ('f3000000-0000-4000-8000-000000000008'::uuid,'scope-operations@test.invalid'),
  ('f3000000-0000-4000-8000-000000000009'::uuid,'scope-never-assigned@test.invalid'),
  ('f3000000-0000-4000-8000-000000000010'::uuid,'scope-ended-assignment@test.invalid')
) users(id,email);
insert into public.user_roles(user_id,role,revoked_at) values
  ('f3000000-0000-4000-8000-000000000002','provider',null),
  ('f3000000-0000-4000-8000-000000000003','support_agent',null),
  ('f3000000-0000-4000-8000-000000000004','support_agent',null),
  ('f3000000-0000-4000-8000-000000000005','support_agent',null),
  ('f3000000-0000-4000-8000-000000000006','support_agent',now()),
  ('f3000000-0000-4000-8000-000000000007','analyst',null),
  ('f3000000-0000-4000-8000-000000000008','operations_admin',null),
  ('f3000000-0000-4000-8000-000000000009','support_agent',null),
  ('f3000000-0000-4000-8000-000000000010','support_agent',null);
insert into public.provider_profiles(user_id,kind,verification_status,accepting_requests)
values('f3000000-0000-4000-8000-000000000002','individual','verified',true);
insert into public.addresses(id,user_id,city_id,label,formatted_address,location)
select address_id,'f3000000-0000-4000-8000-000000000001',city.id,label,label,
  extensions.st_setsrid(extensions.st_makepoint(longitude,latitude),4326)::extensions.geography
from (values
  ('f3100000-0000-4000-8000-000000000001'::uuid,'Linked exact location',46.67::double precision,24.71::double precision),
  ('f3100000-0000-4000-8000-000000000002'::uuid,'Unrelated exact location',46.80::double precision,24.80::double precision)
) a(address_id,label,longitude,latitude)
cross join lateral(select id from public.cities where code='riyadh') city;
insert into public.service_requests(
  id,customer_id,category_id,city_id,title,structured_description,original_text,
  approximate_location,exact_address_id,status,published_at,customer_approved_at
) select request_id,'f3000000-0000-4000-8000-000000000001',cat.id,city.id,title,title,title,
  extensions.st_setsrid(extensions.st_makepoint(longitude,latitude),4326)::extensions.geography,
  address_id,'provider_selected',now(),now()
from (values
  ('f3200000-0000-4000-8000-000000000001'::uuid,'Linked request',46.67::double precision,24.71::double precision,'f3100000-0000-4000-8000-000000000001'::uuid),
  ('f3200000-0000-4000-8000-000000000002'::uuid,'Unrelated request',46.80::double precision,24.80::double precision,'f3100000-0000-4000-8000-000000000002'::uuid)
) r(request_id,title,longitude,latitude,address_id)
cross join lateral(select id from public.service_categories where slug='general-handyman') cat
cross join lateral(select id from public.cities where code='riyadh') city;
insert into public.offers(
  id,request_id,provider_id,total_amount_minor,materials_included,estimated_arrival_minutes,
  estimated_duration_minutes,expires_at,idempotency_key,status
) values
  ('f3300000-0000-4000-8000-000000000001','f3200000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000002',10000,false,30,60,now()+interval '1 day','scope-offer-1','selected'),
  ('f3300000-0000-4000-8000-000000000002','f3200000-0000-4000-8000-000000000002','f3000000-0000-4000-8000-000000000002',12000,false,30,60,now()+interval '1 day','scope-offer-2','selected');
insert into public.jobs(
  id,request_id,selected_offer_id,customer_id,provider_id,exact_address_id,status,approved_total_minor
) values
  ('f3400000-0000-4000-8000-000000000001','f3200000-0000-4000-8000-000000000001','f3300000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000002','f3100000-0000-4000-8000-000000000001','in_progress',10000),
  ('f3400000-0000-4000-8000-000000000002','f3200000-0000-4000-8000-000000000002','f3300000-0000-4000-8000-000000000002','f3000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000002','f3100000-0000-4000-8000-000000000002','in_progress',12000);
insert into public.support_cases(id,opened_by,job_id,topic,subject)
values('f3500000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000001',
  'f3400000-0000-4000-8000-000000000001','job_help','Linked scoped support case');
insert into public.support_case_assignments(
  case_id,assignee_id,assigned_by,assigned_at,expires_at,permissions
) values
  ('f3500000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000003','f3000000-0000-4000-8000-000000000008',now(),null,array['read','internal_note','evidence']),
  ('f3500000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000005','f3000000-0000-4000-8000-000000000008',now()-interval '2 hours',now()-interval '1 hour',array['read','internal_note']),
  ('f3500000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000006','f3000000-0000-4000-8000-000000000008',now(),null,array['read','internal_note']),
  ('f3500000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000010','f3000000-0000-4000-8000-000000000008',now()-interval '2 hours',null,array['read','internal_note']);
update public.support_case_assignments set ended_at=now(),ended_reason='Assignment explicitly revoked'
where case_id='f3500000-0000-4000-8000-000000000001'
  and assignee_id='f3000000-0000-4000-8000-000000000010';
insert into public.support_case_access_grants(
  case_id,user_id,access_type,permissions,reason,granted_by,starts_at,expires_at
) values
  ('f3500000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000003','temporary',
    array['read','exact_location'],'Customer safety visit requires exact destination review',
    'f3000000-0000-4000-8000-000000000008',now(),now()+interval '1 hour'),
  ('f3500000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000004','temporary',
    array['read'],'Expired temporary access fixture','f3000000-0000-4000-8000-000000000008',
    now()-interval '2 hours',now()-interval '1 hour');
insert into public.support_internal_notes(case_id,author_id,body)
values('f3500000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000003','Assigned agent internal note');
insert into public.notification_outbox(user_id,event_type,channel,payload,deduplication_key)
values('f3000000-0000-4000-8000-000000000001','private_customer_notice','in_app','{}','scope-private-notice');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','f3000000-0000-4000-8000-000000000003',true);
select is((select count(*) from public.support_cases where id='f3500000-0000-4000-8000-000000000001'),1::bigint,
  'assigned support agent reads the assigned case');
select is((select count(*) from public.jobs),1::bigint,'assigned agent reads only the case-linked job');
select is((select count(*) from public.service_requests),1::bigint,'case-linked job derives access to its request');
select is((select count(*) from public.jobs where id='f3400000-0000-4000-8000-000000000002'),0::bigint,
  'unrelated job remains hidden from assigned support');
select is((select count(*) from public.support_internal_notes),1::bigint,
  'assigned support agent reads internal notes for that case');
select is((select count(*) from public.notification_outbox),0::bigint,
  'support case read no longer exposes system-wide notifications');
select is((public.get_authorized_job_location(
  'f3400000-0000-4000-8000-000000000001','f3500000-0000-4000-8000-000000000001',
  'Assigned exact location safety review')->>'jobId')::uuid,
  'f3400000-0000-4000-8000-000000000001'::uuid,
  'independent temporary capability permits reasoned exact-location access');
reset role;
select is((select count(*) from public.admin_audit_logs where actor_id='f3000000-0000-4000-8000-000000000003'
  and action='job.exact_location.read'),1::bigint,'high-risk exact-location read is audited');

set local role authenticated;
select set_config('request.jwt.claim.sub','f3000000-0000-4000-8000-000000000004',true);
select is((select count(*) from public.support_cases),0::bigint,'expired temporary support access cannot read the case');
select throws_ok(
  $$select public.get_authorized_job_location(
    'f3400000-0000-4000-8000-000000000001','f3500000-0000-4000-8000-000000000001',
    'Unassigned exact location attempt'
  )$$,'EXACT_LOCATION_ACCESS_DENIED','unassigned support agent cannot read exact location');
select is((select count(*) from public.support_internal_notes),0::bigint,
  'expired temporary support access cannot read internal notes');

select set_config('request.jwt.claim.sub','f3000000-0000-4000-8000-000000000009',true);
select is((select count(*) from public.support_cases),0::bigint,
  'never-assigned support agent cannot read the case');

select set_config('request.jwt.claim.sub','f3000000-0000-4000-8000-000000000010',true);
select is((select count(*) from public.jobs),0::bigint,
  'explicitly ended assignment loses linked job access immediately');

select set_config('request.jwt.claim.sub','f3000000-0000-4000-8000-000000000005',true);
select is((select count(*) from public.jobs),0::bigint,'expired assignment loses linked job access immediately');
select set_config('request.jwt.claim.sub','f3000000-0000-4000-8000-000000000006',true);
select is((select count(*) from public.jobs),0::bigint,'revoked support role loses access immediately');

select set_config('request.jwt.claim.sub','f3000000-0000-4000-8000-000000000007',true);
select is((select count(*) from public.jobs),0::bigint,'analyst remains aggregate-only');
select lives_ok($$select public.admin_marketplace_health()$$,'analyst retains aggregate dashboard access');

select set_config('request.jwt.claim.sub','f3000000-0000-4000-8000-000000000008',true);
select is((select count(*) from public.jobs where id in (
  'f3400000-0000-4000-8000-000000000001','f3400000-0000-4000-8000-000000000002')),2::bigint,
  'operations-wide marketplace access uses its distinct permission');
select is((select count(*) from public.addresses),0::bigint,
  'operations cannot bypass reasoned exact-location RPC through direct address reads');
select is((select count(*) from public.support_internal_notes),0::bigint,
  'operations-wide marketplace access does not bypass internal-note assignment scope');
select is((public.get_authorized_job_location(
  'f3400000-0000-4000-8000-000000000002',null,'Operations incident exact location review'
)->>'jobId')::uuid,'f3400000-0000-4000-8000-000000000002'::uuid,
  'operations exact-location permission remains reasoned and audited');

select * from finish();
rollback;
