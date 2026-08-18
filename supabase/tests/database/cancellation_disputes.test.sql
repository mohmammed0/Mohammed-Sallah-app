begin;
select plan(76);

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
  ('91200000-0000-4000-8000-000000000004'::uuid,'Payment dispute','provider_selected',7,true),
  ('91200000-0000-4000-8000-000000000005'::uuid,'Nonfinancial dispute','provider_selected',2,true),
  ('91200000-0000-4000-8000-000000000006'::uuid,'Cumulative refund dispute','provider_selected',5,true)
) fixture(id,title,status,version,has_address)
cross join lateral(select id from public.service_categories where slug='general-handyman') cat
cross join lateral(select id from public.cities where code='riyadh') city;

insert into public.offers(
  id,request_id,provider_id,total_amount_minor,materials_included,
  estimated_arrival_minutes,estimated_duration_minutes,expires_at,idempotency_key,status
) values
  ('91300000-0000-4000-8000-000000000002','91200000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000002',10000,false,60,120,now()+interval '1 day','workflow-offer-2','selected'),
  ('91300000-0000-4000-8000-000000000003','91200000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000002',15000,false,60,120,now()+interval '1 day','workflow-offer-3','selected'),
  ('91300000-0000-4000-8000-000000000004','91200000-0000-4000-8000-000000000004','91000000-0000-4000-8000-000000000002',20000,false,60,120,now()+interval '1 day','workflow-offer-4','selected'),
  ('91300000-0000-4000-8000-000000000005','91200000-0000-4000-8000-000000000005','91000000-0000-4000-8000-000000000002',8000,false,60,120,now()+interval '1 day','workflow-offer-5','selected'),
  ('91300000-0000-4000-8000-000000000006','91200000-0000-4000-8000-000000000006','91000000-0000-4000-8000-000000000002',10000,false,60,120,now()+interval '1 day','workflow-offer-6','selected');
insert into public.jobs(
  id,request_id,selected_offer_id,customer_id,provider_id,exact_address_id,
  status,approved_total_minor,version,completed_at
) values
  ('91400000-0000-4000-8000-000000000002','91200000-0000-4000-8000-000000000002','91300000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002','91100000-0000-4000-8000-000000000001','provider_selected',10000,1,null),
  ('91400000-0000-4000-8000-000000000003','91200000-0000-4000-8000-000000000003','91300000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002','91100000-0000-4000-8000-000000000001','in_progress',15000,4,null),
  ('91400000-0000-4000-8000-000000000004','91200000-0000-4000-8000-000000000004','91300000-0000-4000-8000-000000000004','91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002','91100000-0000-4000-8000-000000000001','completed',20000,7,now()),
  ('91400000-0000-4000-8000-000000000005','91200000-0000-4000-8000-000000000005','91300000-0000-4000-8000-000000000005','91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002','91100000-0000-4000-8000-000000000001','in_progress',8000,2,null),
  ('91400000-0000-4000-8000-000000000006','91200000-0000-4000-8000-000000000006','91300000-0000-4000-8000-000000000006','91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002','91100000-0000-4000-8000-000000000001','in_progress',10000,5,null);
insert into public.support_cases(id,opened_by,job_id,topic,subject)
values(
  '91450000-0000-4000-8000-000000000005','91000000-0000-4000-8000-000000000001',
  '91400000-0000-4000-8000-000000000005','dispute_review','Assigned nonfinancial dispute review'
);
insert into public.support_case_assignments(case_id,assignee_id,assigned_by)
values(
  '91450000-0000-4000-8000-000000000005','91000000-0000-4000-8000-000000000005',
  '91000000-0000-4000-8000-000000000004'
);
insert into public.payments(
  id,job_id,customer_id,provider_id,provider_name,amount_minor,status,payment_mode,idempotency_key
) values
  ('91500000-0000-4000-8000-000000000002','91400000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002','Fixture provider',10000,'offline','offline','workflow-payment-2'),
  ('91500000-0000-4000-8000-000000000003','91400000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002','Fixture provider',15000,'captured','gateway','workflow-payment-3'),
  ('91500000-0000-4000-8000-000000000004','91400000-0000-4000-8000-000000000004','91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002','Fixture provider',20000,'captured','gateway','workflow-payment-4'),
  ('91500000-0000-4000-8000-000000000005','91400000-0000-4000-8000-000000000005','91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002','Fixture provider',8000,'offline','offline','workflow-payment-5'),
  ('91500000-0000-4000-8000-000000000006','91400000-0000-4000-8000-000000000006','91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002','Fixture provider',10000,'captured','gateway','workflow-payment-6');

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
select is((select status::text from public.jobs where id='91400000-0000-4000-8000-000000000003'),'in_progress','reviewed cancellation defers the job transition until finance confirms the refund');
reset role;
select is((select status::text from public.payments where id='91500000-0000-4000-8000-000000000003'),'captured','captured payment is unchanged before provider confirmation');
select is((select count(*) from public.financial_action_intents
  where source_type='cancellation' and status='pending'
    and source_id=(select (payload->>'cancellationId')::uuid
      from workflow_test_context where key='reviewed')),
  1::bigint,'cancellation creates one pending external financial action');

insert into workflow_test_context(key,id)
select 'cancellation_intent',id from public.financial_action_intents
where source_type='cancellation'
  and source_id=(select (payload->>'cancellationId')::uuid from workflow_test_context where key='reviewed');
set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000006',true);
insert into workflow_test_context(key,payload)
select 'cancellation_confirmation',public.confirm_financial_action(
  (select id from workflow_test_context where key='cancellation_intent'),
  'provider-cancel-refund-001','Finance confirmed the cancellation refund','cancel-confirm-key'
);
select is((select payload->>'status' from workflow_test_context where key='cancellation_confirmation'),'confirmed','finance confirms the cancellation refund');
select is((select status from public.cancellation_requests where id=(select (payload->>'cancellationId')::uuid from workflow_test_context where key='reviewed')),'approved','external confirmation finalizes the cancellation decision');
reset role;
select is((select status::text from public.jobs where id='91400000-0000-4000-8000-000000000003'),'cancelled','job cancellation is applied exactly after financial confirmation');
select is((select status::text from public.payments where id='91500000-0000-4000-8000-000000000003'),'refunded','confirmed cancellation refund updates payment accounting');

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
select is((select pre_dispute_job_status::text from public.disputes where id=(select (payload->>'disputeId')::uuid from workflow_test_context where key='dispute')),'completed','dispute stores the pre-dispute job state');
select is((select status::text from public.jobs where id='91400000-0000-4000-8000-000000000004'),'disputed','opening a dispute changes the job state');
select is((select status::text from public.financial_holds where dispute_id=(select (payload->>'disputeId')::uuid from workflow_test_context where key='dispute')),'held','opening a dispute creates a financial hold');
select is(
  (public.open_dispute('91400000-0000-4000-8000-000000000004','Delivered work is materially incomplete',7,'customer-dispute-key')->>'disputeId')::uuid,
  (select (payload->>'disputeId')::uuid from workflow_test_context where key='dispute'),
  'dispute opening is idempotent'
);
select throws_ok(
  $$select public.open_dispute('91400000-0000-4000-8000-000000000004','Different payload reusing the same key',7,'customer-dispute-key')$$,
  'IDEMPOTENCY_KEY_CONFLICT','same dispute idempotency key rejects a different payload'
);

select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000005',true);
select throws_ok(
  format(
    'select public.resolve_dispute(%L,%L,4000,%L,%L,8,%L)',
    (select (payload->>'disputeId')::uuid from workflow_test_context where key='dispute'),
    'refund_customer','cancel','Support cannot authorize a refund','support-refund-key'
  ),
  'FINANCE_PERMISSION_REQUIRED','support cannot authorize a financial resolution'
);

select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000006',true);
insert into workflow_test_context(key,payload)
select 'resolution',public.resolve_dispute(
  (select (payload->>'disputeId')::uuid from workflow_test_context where key='dispute'),
  'split',4000,'cancel','Finance approves a split customer refund',8,'finance-resolution-key'
);
select is((select payload->>'status' from workflow_test_context where key='resolution'),'waiting_operations','refund resolution waits for external execution');
reset role;
select is((select status::text from public.refunds where payment_id='91500000-0000-4000-8000-000000000004'),'pending','refund remains pending before confirmation');
select is((select status::text from public.payments where id='91500000-0000-4000-8000-000000000004'),'captured','dispute payment remains captured before confirmation');
insert into workflow_test_context(key,id)
select 'dispute_intent',id from public.financial_action_intents
where source_type='dispute' and source_id=(select (payload->>'disputeId')::uuid from workflow_test_context where key='dispute');
set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000006',true);
insert into workflow_test_context(key,payload)
select 'confirmation',public.confirm_financial_action(
  (select id from workflow_test_context where key='dispute_intent'),
  'provider-refund-reference-001','Finance verified the provider refund receipt','finance-confirm-key'
);
select is((select payload->>'status' from workflow_test_context where key='confirmation'),'confirmed','finance confirms the external action using a provider reference');
reset role;
select is((select status::text from public.refunds where payment_id='91500000-0000-4000-8000-000000000004'),'refunded','confirmed refund updates the refund ledger');
select is((select status::text from public.payments where id='91500000-0000-4000-8000-000000000004'),'partially_refunded','partial refund preserves the remaining captured balance');
select is((select refunded_minor from public.payments where id='91500000-0000-4000-8000-000000000004'),4000::bigint,'payment accounting stores the cumulative refunded amount');
select is((select status::text from public.disputes where id=(select (payload->>'disputeId')::uuid from workflow_test_context where key='dispute')),'resolved','confirmed financial action resolves the dispute');
select is((select status::text from public.financial_holds where dispute_id=(select (payload->>'disputeId')::uuid from workflow_test_context where key='dispute')),'released','confirmed resolution releases the financial hold');
select is((select status::text from public.jobs where id='91400000-0000-4000-8000-000000000004'),'cancelled','explicit dispute outcome is applied after financial confirmation');
select is((select action_type from public.resolution_actions where dispute_id=(select (payload->>'disputeId')::uuid from workflow_test_context where key='dispute')),'split','split resolution is represented explicitly');
select ok((select count(*) from public.job_status_history where job_id='91400000-0000-4000-8000-000000000004' and new_status in ('disputed','cancelled'))=2,'dispute open and resolution both append job history');
select ok((select count(*) from public.job_events where job_id='91400000-0000-4000-8000-000000000004' and event_type='terminal_outcome_applied')=1,'confirmed dispute outcome emits exactly one terminal job event');

set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
insert into workflow_test_context(key,payload)
values('nonfinancial_dispute',public.open_dispute('91400000-0000-4000-8000-000000000005','Work paused for a nonfinancial review',2,'nonfinancial-open-key'));
select is((select payload->>'preDisputeStatus' from workflow_test_context where key='nonfinancial_dispute'),'in_progress','nonfinancial dispute returns its pre-dispute state');
select is((select pre_dispute_job_status::text from public.disputes where id=(select (payload->>'disputeId')::uuid from workflow_test_context where key='nonfinancial_dispute')),'in_progress','nonfinancial dispute persists its resumable state');
select is((select status::text from public.jobs where id='91400000-0000-4000-8000-000000000005'),'disputed','job remains disputed while review is open');
select throws_ok(
  $$select public.request_job_cancellation('91400000-0000-4000-8000-000000000005','Concurrent cancellation is not allowed',3,'concurrent-cancel-key')$$,
  'JOB_NOT_CANCELLABLE','cancellation cannot race an open dispute'
);
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000005',true);
select throws_ok(
  format('select public.resolve_dispute(%L,%L,0,%L,%L,2,%L)',
    (select (payload->>'disputeId')::uuid from workflow_test_context where key='nonfinancial_dispute'),
    'no_financial_action','resume','Stale resolver version is rejected','nonfinancial-stale-key'),
  'VERSION_CONFLICT','stale dispute resolution version is rejected'
);
select throws_ok(
  format('select public.resolve_dispute(%L,%L,0,%L,%L,3,%L)',
    (select (payload->>'disputeId')::uuid from workflow_test_context where key='nonfinancial_dispute'),
    'no_financial_action','invalid','Invalid job outcome is rejected','nonfinancial-invalid-key'),
  'DISPUTE_JOB_OUTCOME_REQUIRED','resolver must choose a valid explicit job outcome'
);
insert into workflow_test_context(key,payload)
select 'nonfinancial_resolution',public.resolve_dispute(
  (select (payload->>'disputeId')::uuid from workflow_test_context where key='nonfinancial_dispute'),
  'no_financial_action',0,'resume','Support resumes work after nonfinancial review',3,'nonfinancial-resolve-key'
);
select is((select payload->>'status' from workflow_test_context where key='nonfinancial_resolution'),'resolved','nonfinancial resolution completes atomically');
reset role;
select is((select status::text from public.jobs where id='91400000-0000-4000-8000-000000000005'),'in_progress','resume outcome restores the previous valid job state');
select is((select status::text from public.disputes where id=(select (payload->>'disputeId')::uuid from workflow_test_context where key='nonfinancial_dispute')),'resolved','nonfinancial dispute is fully resolved');
select is((select count(*) from public.job_status_history where job_id='91400000-0000-4000-8000-000000000005'),2::bigint,'nonfinancial resolution records both status transitions');
select ok((select count(*) from public.dispute_events where dispute_id=(select (payload->>'disputeId')::uuid from workflow_test_context where key='nonfinancial_dispute') and event_type in ('opened','resolved'))=2,'nonfinancial resolution records dispute events');
set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000005',true);
select is(
  public.resolve_dispute(
    (select (payload->>'disputeId')::uuid from workflow_test_context where key='nonfinancial_dispute'),
    'no_financial_action',0,'resume','Support resumes work after nonfinancial review',3,'nonfinancial-resolve-key'
  )->>'status','resolved','nonfinancial resolution retry returns the original result'
);
select throws_ok(
  format('select public.resolve_dispute(%L,%L,0,%L,%L,3,%L)',
    (select (payload->>'disputeId')::uuid from workflow_test_context where key='nonfinancial_dispute'),
    'no_financial_action','resume','Changed payload with an already used key','nonfinancial-resolve-key'),
  'IDEMPOTENCY_KEY_CONFLICT','resolution idempotency key rejects a conflicting payload'
);

select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
insert into workflow_test_context(key,payload)
values('refund_dispute_one',public.open_dispute('91400000-0000-4000-8000-000000000006','First cumulative refund review',5,'refund-open-one-key'));
select is((select status::text from public.jobs where id='91400000-0000-4000-8000-000000000006'),'disputed','cumulative-refund job enters disputed state');
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000006',true);
select throws_ok(
  format('select public.resolve_dispute(%L,%L,0,%L,%L,6,%L)',
    (select (payload->>'disputeId')::uuid from workflow_test_context where key='refund_dispute_one'),
    'split','resume','Zero refund must be rejected','refund-zero-key'),
  'INVALID_REFUND_AMOUNT','zero refund is rejected'
);
select throws_ok(
  format('select public.resolve_dispute(%L,%L,11000,%L,%L,6,%L)',
    (select (payload->>'disputeId')::uuid from workflow_test_context where key='refund_dispute_one'),
    'split','resume','Refund above captured total is rejected','refund-over-key'),
  'INVALID_REFUND_AMOUNT','refund greater than captured amount is rejected'
);
insert into workflow_test_context(key,payload)
select 'refund_resolution_one',public.resolve_dispute(
  (select (payload->>'disputeId')::uuid from workflow_test_context where key='refund_dispute_one'),
  'split',6000,'resume','First partial split refund is approved',6,'refund-resolve-one-key'
);
reset role;
select is((select status::text from public.payments where id='91500000-0000-4000-8000-000000000006'),'captured','payment stays captured until the external refund is confirmed');
insert into workflow_test_context(key,id)
select 'refund_intent_one',id from public.financial_action_intents
where source_id=(select (payload->>'disputeId')::uuid from workflow_test_context where key='refund_dispute_one');
set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000006',true);
insert into workflow_test_context(key,payload)
select 'refund_confirmation_one',public.confirm_financial_action(
  (select id from workflow_test_context where key='refund_intent_one'),
  'cumulative-provider-ref-1','First external refund is verified','refund-confirm-one-key'
);
reset role;
select is((select status::text from public.payments where id='91500000-0000-4000-8000-000000000006'),'partially_refunded','first cumulative refund is represented as partial');
select is((select net_paid_minor from public.payment_accounting where id='91500000-0000-4000-8000-000000000006'),4000::bigint,'payment read model exposes the correct remaining balance');
set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000006',true);
select is(
  public.confirm_financial_action(
    (select id from workflow_test_context where key='refund_intent_one'),
    'cumulative-provider-ref-1','First external refund is verified','refund-confirm-one-key'
  )->>'status','confirmed','duplicate provider confirmation is idempotent'
);
select throws_ok(
  format('select public.confirm_financial_action(%L,%L,%L,%L)',
    (select id from workflow_test_context where key='refund_intent_one'),
    'cumulative-provider-ref-1','Changed confirmation payload','refund-confirm-one-key'),
  'IDEMPOTENCY_KEY_CONFLICT','confirmation key rejects a conflicting payload'
);
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
insert into workflow_test_context(key,payload)
values('refund_dispute_two',public.open_dispute('91400000-0000-4000-8000-000000000006','Second cumulative refund review',7,'refund-open-two-key'));
select is((select pre_dispute_job_status::text from public.disputes where id=(select (payload->>'disputeId')::uuid from workflow_test_context where key='refund_dispute_two')),'in_progress','second dispute preserves the resumed state');
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000006',true);
select throws_ok(
  format('select public.resolve_dispute(%L,%L,5000,%L,%L,8,%L)',
    (select (payload->>'disputeId')::uuid from workflow_test_context where key='refund_dispute_two'),
    'refund_customer','cancel','Cumulative over-refund is rejected','refund-cumulative-over-key'),
  'INVALID_REFUND_AMOUNT','cumulative refunds cannot exceed the captured amount'
);
insert into workflow_test_context(key,payload)
select 'refund_resolution_two',public.resolve_dispute(
  (select (payload->>'disputeId')::uuid from workflow_test_context where key='refund_dispute_two'),
  'refund_customer',4000,'cancel','Remaining captured balance is refunded',8,'refund-resolve-two-key'
);
select is((select payload->>'status' from workflow_test_context where key='refund_resolution_two'),'waiting_operations','final cumulative refund remains deferred before confirmation');
insert into workflow_test_context(key,id)
select 'refund_intent_two',id from public.financial_action_intents
where source_id=(select (payload->>'disputeId')::uuid from workflow_test_context where key='refund_dispute_two');
select is(
  public.confirm_financial_action(
    (select id from workflow_test_context where key='refund_intent_two'),
    'cumulative-provider-ref-2','Remaining external refund is verified','refund-confirm-two-key'
  )->>'paymentStatus','refunded','full cumulative refund becomes refunded only after confirmation'
);
reset role;
select is((select refunded_minor from public.payments where id='91500000-0000-4000-8000-000000000006'),10000::bigint,'full cumulative refunded amount equals the capture');
select is((select net_paid_minor from public.payment_accounting where id='91500000-0000-4000-8000-000000000006'),0::bigint,'fully refunded payment has zero remaining balance');

select ok((select count(*) from public.admin_audit_logs where action in ('cancellation.decide','dispute.resolve','financial_action.confirm'))>=3,'financial decisions create immutable admin audit records');
select throws_ok($$update public.dispute_events set event_type='tampered'$$,'APPEND_ONLY_RECORD','dispute events are append only');
select throws_ok($$delete from public.cancellation_decisions$$,'APPEND_ONLY_RECORD','cancellation decisions are append only');

select * from finish();
rollback;
