begin;
select plan(37);

select has_table('public','financial_action_intents','financial action intent ledger exists');
select ok(
  (select relrowsecurity from pg_class where oid='public.financial_action_intents'::regclass),
  'financial action intents are protected by RLS'
);
select function_privs_are(
  'public','request_cancellation',array['uuid','uuid','text'],'authenticated',array[]::text[],
  'legacy cancellation command is not executable by authenticated clients'
);
select function_privs_are(
  'public','open_dispute',array['uuid','text','text'],'authenticated',array[]::text[],
  'legacy dispute command is not executable by authenticated clients'
);
select function_privs_are(
  'public','request_job_cancellation',array['uuid','text','integer','text'],'authenticated',array['EXECUTE'],
  'versioned cancellation command is available to authenticated clients'
);

insert into auth.users(
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
  ('91000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','workflow-customer@test.invalid',crypt(gen_random_uuid()::text,gen_salt('bf')),now(),'{}','{}',now(),now()),
  ('91000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','workflow-provider@test.invalid',crypt(gen_random_uuid()::text,gen_salt('bf')),now(),'{}','{}',now(),now()),
  ('91000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','workflow-outsider@test.invalid',crypt(gen_random_uuid()::text,gen_salt('bf')),now(),'{}','{}',now(),now()),
  ('91000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','workflow-operations@test.invalid',crypt(gen_random_uuid()::text,gen_salt('bf')),now(),'{}','{}',now(),now()),
  ('91000000-0000-4000-8000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','workflow-support@test.invalid',crypt(gen_random_uuid()::text,gen_salt('bf')),now(),'{}','{}',now(),now()),
  ('91000000-0000-4000-8000-000000000006','00000000-0000-0000-0000-000000000000','authenticated','authenticated','workflow-finance@test.invalid',crypt(gen_random_uuid()::text,gen_salt('bf')),now(),'{}','{}',now(),now());
insert into public.user_roles(user_id,role) values
  ('91000000-0000-4000-8000-000000000002','provider'),
  ('91000000-0000-4000-8000-000000000004','operations_admin'),
  ('91000000-0000-4000-8000-000000000005','support_agent'),
  ('91000000-0000-4000-8000-000000000006','finance_reviewer');
insert into public.provider_profiles(user_id,kind,verification_status,accepting_requests,active_workload)
values('91000000-0000-4000-8000-000000000002','individual','verified',true,3);

insert into public.addresses(id,user_id,city_id,label,formatted_address,location)
select
  '91100000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001',id,
  'Fixture','Synthetic workflow fixture',st_setsrid(st_makepoint(0,0),4326)::geography
from public.cities where code='riyadh';

insert into public.service_requests(
  id,customer_id,category_id,city_id,title,structured_description,original_text,
  approximate_location,exact_address_id,status,published_at,customer_approved_at,version
)
select fixture.id,'91000000-0000-4000-8000-000000000001',cat.id,city.id,fixture.title,
  fixture.title,fixture.title,st_setsrid(st_makepoint(0,0),4326)::geography,
  case when fixture.has_address then '91100000-0000-4000-8000-000000000001'::uuid else null end,
  fixture.status::public.request_status,now(),now(),fixture.version
from (values
  ('91200000-0000-4000-8000-000000000001'::uuid,'Standalone cancellation','receiving_offers',3,false),
  ('91200000-0000-4000-8000-000000000002'::uuid,'Early job cancellation','provider_selected',1,true),
  ('91200000-0000-4000-8000-000000000003'::uuid,'Reviewed cancellation','provider_selected',4,true),
  ('91200000-0000-4000-8000-000000000004'::uuid,'Payment dispute','provider_selected',7,true)
) fixture(id,title,status,version,has_address)
cross join lateral(select id from public.service_categories where slug='general-handyman') cat
cross join lateral(select id from public.cities where code='riyadh') city;

insert into public.offers(
  id,request_id,provider_id,total_amount_minor,materials_included,
  estimated_arrival_minutes,estimated_duration_minutes,expires_at,idempotency_key,status
) values
  ('91300000-0000-4000-8000-000000000002','91200000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000002',10000,false,60,120,now()+interval '1 day','workflow-offer-2','selected'),
  ('91300000-0000-4000-8000-000000000003','91200000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000002',15000,false,60,120,now()+interval '1 day','workflow-offer-3','selected'),
  ('91300000-0000-4000-8000-000000000004','91200000-0000-4000-8000-000000000004','91000000-0000-4000-8000-000000000002',20000,false,60,120,now()+interval '1 day','workflow-offer-4','selected');
insert into public.jobs(
  id,request_id,selected_offer_id,customer_id,provider_id,exact_address_id,
  status,approved_total_minor,version,completed_at
) values
  ('91400000-0000-4000-8000-000000000002','91200000-0000-4000-8000-000000000002','91300000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002','91100000-0000-4000-8000-000000000001','provider_selected',10000,1,null),
  ('91400000-0000-4000-8000-000000000003','91200000-0000-4000-8000-000000000003','91300000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002','91100000-0000-4000-8000-000000000001','in_progress',15000,4,null),
  ('91400000-0000-4000-8000-000000000004','91200000-0000-4000-8000-000000000004','91300000-0000-4000-8000-000000000004','91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002','91100000-0000-4000-8000-000000000001','completed',20000,7,now());
insert into public.payments(
  id,job_id,customer_id,provider_id,provider_name,amount_minor,status,payment_mode,idempotency_key
) values
  ('91500000-0000-4000-8000-000000000002','91400000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002','Fixture provider',10000,'offline','offline','workflow-payment-2'),
  ('91500000-0000-4000-8000-000000000003','91400000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002','Fixture provider',15000,'captured','gateway','workflow-payment-3'),
  ('91500000-0000-4000-8000-000000000004','91400000-0000-4000-8000-000000000004','91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002','Fixture provider',20000,'captured','gateway','workflow-payment-4');

create temp table workflow_test_context(key text primary key,id uuid,payload jsonb);
grant select,insert,update,delete on workflow_test_context to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
insert into workflow_test_context(key,payload)
values('standalone',public.request_service_request_cancellation('91200000-0000-4000-8000-000000000001','Customer no longer needs this service',3,'standalone-cancel-key'));
select is((select payload->>'status' from workflow_test_context where key='standalone'),'approved','standalone request cancellation is approved transactionally');
select is((select status from public.cancellation_requests where request_id='91200000-0000-4000-8000-000000000001'),'approved','standalone cancellation decision is persisted');
select is((select status::text from public.service_requests where id='91200000-0000-4000-8000-000000000001'),'cancelled','standalone service request is cancelled');
select is(
  (public.request_service_request_cancellation('91200000-0000-4000-8000-000000000001','Customer no longer needs this service',3,'standalone-cancel-key')->>'cancellationId')::uuid,
  (select (payload->>'cancellationId')::uuid from workflow_test_context where key='standalone'),
  'standalone cancellation is idempotent'
);
select throws_ok(
  $$select public.request_service_request_cancellation('91200000-0000-4000-8000-000000000001','Trying a stale version after cancellation',3,'standalone-stale-key')$$,
  'VERSION_CONFLICT','stale request versions are rejected'
);

select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000003',true);
select throws_ok(
  $$select public.request_job_cancellation('91400000-0000-4000-8000-000000000002','Outsider attempts cancellation',1,'outsider-cancel-key')$$,
  'CANCELLATION_ACCESS_DENIED','unrelated user cannot cancel a job'
);

select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
insert into workflow_test_context(key,payload)
values('early',public.request_job_cancellation('91400000-0000-4000-8000-000000000002','Customer cancels before provider travel',1,'early-cancel-key'));
select is((select payload->>'status' from workflow_test_context where key='early'),'approved','early customer cancellation is auto-approved');
select is((select status::text from public.jobs where id='91400000-0000-4000-8000-000000000002'),'cancelled','early cancellation changes the job atomically');
select is((select status::text from public.payments where id='91500000-0000-4000-8000-000000000002'),'offline','offline payment is not represented as an external refund');

select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000002',true);
insert into workflow_test_context(key,payload)
values('reviewed',public.request_job_cancellation('91400000-0000-4000-8000-000000000003','Provider cannot complete the active work',4,'provider-cancel-key'));
select is((select payload->>'status' from workflow_test_context where key='reviewed'),'pending','active provider cancellation requires review');
select is((select status::text from public.jobs where id='91400000-0000-4000-8000-000000000003'),'in_progress','pending cancellation does not mutate the job');

select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000004',true);
select throws_ok(
  format(
    'select public.decide_cancellation(%L,true,100,%L,4,%L)',
    (select (payload->>'cancellationId')::uuid from workflow_test_context where key='reviewed'),
    'Operations cannot impose a financial fee',
    'operations-fee-key'
  ),
  'FINANCE_PERMISSION_REQUIRED','operations cannot impose a cancellation fee'
);
insert into workflow_test_context(key,payload)
select 'reviewed_decision',public.decide_cancellation(
  (select (payload->>'cancellationId')::uuid from workflow_test_context where key='reviewed'),
  true,0,'Operations approves cancellation after review',4,'operations-decision-key'
);
select is((select payload->>'status' from workflow_test_context where key='reviewed_decision'),'financial_pending','gateway cancellation waits for external confirmation');
select is((select status::text from public.jobs where id='91400000-0000-4000-8000-000000000003'),'cancelled','reviewed cancellation atomically cancels the job');
reset role;
select is((select status::text from public.payments where id='91500000-0000-4000-8000-000000000003'),'captured','captured payment is unchanged before provider confirmation');
select is((select count(*) from public.financial_action_intents where source_type='cancellation' and status='pending'),1::bigint,'cancellation creates one pending external financial action');

set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000003',true);
select throws_ok(
  $$select public.open_dispute('91400000-0000-4000-8000-000000000004','Outsider attempts a dispute',7,'outsider-dispute-key')$$,
  'DISPUTE_ACCESS_DENIED','unrelated user cannot open a dispute'
);

select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
insert into workflow_test_context(key,payload)
values('dispute',public.open_dispute('91400000-0000-4000-8000-000000000004','Delivered work is materially incomplete',7,'customer-dispute-key'));
select is((select payload->>'status' from workflow_test_context where key='dispute'),'open','job participant opens a dispute');
select is((select status::text from public.jobs where id='91400000-0000-4000-8000-000000000004'),'disputed','opening a dispute changes the job state');
select is((select status::text from public.financial_holds where dispute_id=(select (payload->>'disputeId')::uuid from workflow_test_context where key='dispute')),'held','opening a dispute creates a financial hold');
select is(
  (public.open_dispute('91400000-0000-4000-8000-000000000004','Delivered work is materially incomplete',7,'customer-dispute-key')->>'disputeId')::uuid,
  (select (payload->>'disputeId')::uuid from workflow_test_context where key='dispute'),
  'dispute opening is idempotent'
);

select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000005',true);
select throws_ok(
  format(
    'select public.resolve_dispute(%L,%L,4000,%L,8,%L)',
    (select (payload->>'disputeId')::uuid from workflow_test_context where key='dispute'),
    'refund_customer','Support cannot authorize a refund','support-refund-key'
  ),
  'FINANCE_PERMISSION_REQUIRED','support cannot authorize a financial resolution'
);

select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000006',true);
insert into workflow_test_context(key,payload)
select 'resolution',public.resolve_dispute(
  (select (payload->>'disputeId')::uuid from workflow_test_context where key='dispute'),
  'refund_customer',4000,'Finance approves a partial customer refund',8,'finance-resolution-key'
);
select is((select payload->>'status' from workflow_test_context where key='resolution'),'waiting_operations','refund resolution waits for external execution');
select is((select status::text from public.refunds where payment_id='91500000-0000-4000-8000-000000000004'),'pending','refund remains pending before confirmation');
select is((select status::text from public.payments where id='91500000-0000-4000-8000-000000000004'),'captured','dispute payment remains captured before confirmation');
insert into workflow_test_context(key,id)
select 'dispute_intent',id from public.financial_action_intents
where source_type='dispute' and source_id=(select (payload->>'disputeId')::uuid from workflow_test_context where key='dispute');
insert into workflow_test_context(key,payload)
select 'confirmation',public.confirm_financial_action(
  (select id from workflow_test_context where key='dispute_intent'),
  'provider-refund-reference-001','Finance verified the provider refund receipt','finance-confirm-key'
);
select is((select payload->>'status' from workflow_test_context where key='confirmation'),'confirmed','finance confirms the external action using a provider reference');
select is((select status::text from public.refunds where payment_id='91500000-0000-4000-8000-000000000004'),'refunded','confirmed refund updates the refund ledger');
select is((select status::text from public.disputes where id=(select (payload->>'disputeId')::uuid from workflow_test_context where key='dispute')),'resolved','confirmed financial action resolves the dispute');
select is((select status::text from public.financial_holds where dispute_id=(select (payload->>'disputeId')::uuid from workflow_test_context where key='dispute')),'released','confirmed resolution releases the financial hold');

reset role;
select ok((select count(*) from public.admin_audit_logs where action in ('cancellation.decide','dispute.resolve','financial_action.confirm'))>=3,'financial decisions create immutable admin audit records');
select throws_ok($$update public.dispute_events set event_type='tampered'$$,'APPEND_ONLY_RECORD','dispute events are append only');
select throws_ok($$delete from public.cancellation_decisions$$,'APPEND_ONLY_RECORD','cancellation decisions are append only');

select * from finish();
rollback;
