begin;

select no_plan();

select ok(
  case
    when to_regprocedure('public.accept_completion(uuid,boolean,text,integer,text,text)') is null
      then true
    else not has_function_privilege(
      'authenticated',
      'public.accept_completion(uuid,boolean,text,integer,text,text)',
      'EXECUTE'
    )
  end,
  'the removed six-argument completion overload exposes no authenticated grant surface'
);

insert into auth.users(
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) select id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
  email,crypt(gen_random_uuid()::text,gen_salt('bf')),now(),'{}','{}',now(),now()
from (values
  ('a8100000-0000-4000-8000-000000000001'::uuid,'gate-customer@test.invalid'),
  ('a8100000-0000-4000-8000-000000000002'::uuid,'gate-provider@test.invalid'),
  ('a8100000-0000-4000-8000-000000000003'::uuid,'gate-operations@test.invalid')
) actors(id,email);

insert into public.user_roles(user_id,role)
values
  ('a8100000-0000-4000-8000-000000000002','provider'),
  ('a8100000-0000-4000-8000-000000000003','super_admin');
insert into public.provider_profiles(
  user_id,kind,verification_status,accepting_requests,active_workload
) values(
  'a8100000-0000-4000-8000-000000000002','individual','verified',true,9
);
insert into public.service_categories(
  id,slug,icon_key,restricted,verification_required,enabled,sort_order
) values(
  'a8120000-0000-4000-8000-000000000001',
  'active-gate-fixture','fixture',false,true,true,997
);
insert into public.addresses(
  id,user_id,city_id,label,formatted_address,location
) select
  'a8200000-0000-4000-8000-000000000001',
  'a8100000-0000-4000-8000-000000000001',city.id,
  'Gate fixture','Synthetic gate address',
  extensions.st_setsrid(extensions.st_makepoint(46.67,24.71),4326)::extensions.geography
from public.cities city where city.code='riyadh';
insert into public.addresses(
  id,user_id,city_id,label,formatted_address,location
) select
  'a8200000-0000-4000-8000-000000000009',
  'a8100000-0000-4000-8000-000000000001',city.id,
  'Exact RLS gate fixture','Synthetic exact RLS gate address',
  extensions.st_setsrid(extensions.st_makepoint(46.68,24.72),4326)::extensions.geography
from public.cities city where city.code='riyadh';

insert into public.service_requests(
  id,customer_id,category_id,city_id,title,structured_description,original_text,
  approximate_location,exact_address_id,status,published_at,customer_approved_at
) select
  format('a8300000-0000-4000-8000-%s',lpad(n::text,12,'0'))::uuid,
  'a8100000-0000-4000-8000-000000000001',
  'a8120000-0000-4000-8000-000000000001',city.id,
  'Active gate fixture '||n,'Synthetic active job gate','Synthetic active job gate',
  extensions.st_setsrid(extensions.st_makepoint(46.67,24.71),4326)::extensions.geography,
  'a8200000-0000-4000-8000-000000000001','provider_selected',now(),now()
from generate_series(1,9) n
cross join public.cities city
where city.code='riyadh';
insert into public.offers(
  id,request_id,provider_id,total_amount_minor,materials_included,
  estimated_arrival_minutes,estimated_duration_minutes,expires_at,idempotency_key,status
) select
  format('a8400000-0000-4000-8000-%s',lpad(n::text,12,'0'))::uuid,
  format('a8300000-0000-4000-8000-%s',lpad(n::text,12,'0'))::uuid,
  'a8100000-0000-4000-8000-000000000002',10000,false,30,60,
  now()+interval '1 day','active-gate-offer-'||n,'selected'
from generate_series(1,9) n;
update public.service_requests
set exact_address_id='a8200000-0000-4000-8000-000000000009'
where id='a8300000-0000-4000-8000-000000000009';
insert into public.jobs(
  id,request_id,selected_offer_id,customer_id,provider_id,exact_address_id,
  status,approved_total_minor,version
) select
  format('a8500000-0000-4000-8000-%s',lpad(n::text,12,'0'))::uuid,
  format('a8300000-0000-4000-8000-%s',lpad(n::text,12,'0'))::uuid,
  format('a8400000-0000-4000-8000-%s',lpad(n::text,12,'0'))::uuid,
  'a8100000-0000-4000-8000-000000000001',
  'a8100000-0000-4000-8000-000000000002',
  'a8200000-0000-4000-8000-000000000001',
  (case n
    when 1 then 'scheduled'
    when 2 then 'diagnosing'
    when 3 then 'awaiting_change_order_approval'
    when 4 then 'in_progress'
    when 5 then 'completion_submitted'
    when 6 then 'completion_submitted'
    when 7 then 'scheduled'
    when 8 then 'provider_selected'
    else 'scheduled'
  end)::public.job_status,10000,1
from generate_series(1,9) n;
update public.jobs
set exact_address_id='a8200000-0000-4000-8000-000000000009'
where id='a8500000-0000-4000-8000-000000000009';

insert into public.change_orders(
  id,job_id,provider_id,reason,description,added_amount_minor,
  revised_total_minor,status,expires_at,idempotency_key
) values(
  'a8600000-0000-4000-8000-000000000003',
  'a8500000-0000-4000-8000-000000000003',
  'a8100000-0000-4000-8000-000000000002',
  'Additional work','Synthetic pending decision',1000,11000,'pending',
  now()+interval '1 day','active-gate-existing-change-order'
);
insert into public.file_uploads(
  id,user_id,purpose,resource_id,original_filename,extension,declared_mime_type,
  detected_mime_type,size_bytes,max_size_bytes,quarantine_path,target_bucket,
  target_path,final_path,content_sha256,status,scanner,sanitized,scanned_at
) values(
  'a8700000-0000-4000-8000-000000000004',
  'a8100000-0000-4000-8000-000000000002','completion_proof',
  'a8500000-0000-4000-8000-000000000004','gate-proof.jpg','jpg',
  'image/jpeg','image/jpeg',128,20971520,'gate/quarantine/proof.jpg',
  'completion-proofs','gate/clean/proof.jpg','gate/clean/proof.jpg',repeat('d',64),
  'clean','fixture',false,now()
);
insert into public.completion_attempts(
  id,job_id,provider_id,attempt_number,status,idempotency_key
) values
  ('a8800000-0000-4000-8000-000000000005',
   'a8500000-0000-4000-8000-000000000005',
   'a8100000-0000-4000-8000-000000000002',1,'submitted','gate-attempt-five');

update public.profiles set status='suspended'
where id='a8100000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','a8100000-0000-4000-8000-000000000002',true);
select throws_ok(
  $test$do $block$ begin
    perform public.transition_job(
      'a8500000-0000-4000-8000-000000000001','en_route',
      'Provider is travelling','gate-provider-transition-denied'
    );
    raise exception 'EXPECTED_DENIAL_MISSING';
  end $block$$test$,
  'ACCOUNT_NOT_ACTIVE','a suspended provider cannot transition an active job'
);
select throws_ok(
  $test$do $block$ begin
    perform public.create_change_order(jsonb_build_object(
      'jobId','a8500000-0000-4000-8000-000000000002',
      'idempotencyKey','gate-create-order-denied','reason','Additional work',
      'description','Additional work requires approval',
      'expiresAt',now()+interval '1 day','lineItems',jsonb_build_array(
        jsonb_build_object('description','Part','quantity',1,'amountMinor',1000)
      )
    ));
    raise exception 'EXPECTED_DENIAL_MISSING';
  end $block$$test$,
  'ACCOUNT_NOT_ACTIVE','a suspended provider cannot create a change order'
);
select throws_ok(
  $test$do $block$ begin
    perform public.submit_completion(
      'a8500000-0000-4000-8000-000000000004',jsonb_build_array(
        jsonb_build_object('uploadId','a8700000-0000-4000-8000-000000000004')
      ),'gate-submit-denied'
    );
    raise exception 'EXPECTED_DENIAL_MISSING';
  end $block$$test$,
  'ACCOUNT_NOT_ACTIVE','a suspended provider cannot submit completion evidence'
);
reset role;

select is(
  (select string_agg(status::text,',' order by id) from public.jobs
   where id in (
     'a8500000-0000-4000-8000-000000000001',
     'a8500000-0000-4000-8000-000000000002',
     'a8500000-0000-4000-8000-000000000004'
   )),
  'scheduled,diagnosing,in_progress',
  'provider denials leave all three job states unchanged'
);
select is(
  (select count(*) from public.idempotency_keys
   where user_id='a8100000-0000-4000-8000-000000000002'
     and key in ('gate-provider-transition-denied','gate-create-order-denied','gate-submit-denied')),
  0::bigint,'provider denials emit no command idempotency records'
);

update public.profiles set status='suspended'
where id='a8100000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','a8100000-0000-4000-8000-000000000001',true);
select throws_ok(
  $test$do $block$ begin
    perform public.transition_job(
      'a8500000-0000-4000-8000-000000000003','cancelled',
      'Use separate cancellation flow','gate-customer-transition-denied'
    );
    raise exception 'EXPECTED_DENIAL_MISSING';
  end $block$$test$,
  'ACCOUNT_NOT_ACTIVE',
  'the generic transition command fails closed for a suspended customer cancellation'
);
select throws_ok(
  $test$do $block$ begin
    perform public.decide_change_order(
      'a8600000-0000-4000-8000-000000000003',true,
      'Approved additional work','gate-decide-denied'
    );
    raise exception 'EXPECTED_DENIAL_MISSING';
  end $block$$test$,
  'ACCOUNT_NOT_ACTIVE','a suspended customer cannot decide a change order'
);
select throws_ok(
  $test$do $block$ begin
    perform public.accept_completion(
      'a8500000-0000-4000-8000-000000000005',true,
      'Accepted completed work',5,'Good work','gate-accept-seven-denied','{}'::uuid[]
    );
    raise exception 'EXPECTED_DENIAL_MISSING';
  end $block$$test$,
  'ACCOUNT_NOT_ACTIVE','a suspended customer cannot use seven-argument acceptance'
);
reset role;

select is(
  (select string_agg(status::text,',' order by id) from public.jobs
   where id in (
     'a8500000-0000-4000-8000-000000000003',
     'a8500000-0000-4000-8000-000000000005'
   )),
  'awaiting_change_order_approval,completion_submitted',
  'customer denials leave transition and completion states unchanged'
);
select is(
  (select count(*) from public.idempotency_keys
   where user_id='a8100000-0000-4000-8000-000000000001'
     and key in (
       'gate-customer-transition-denied','gate-decide-denied',
       'gate-accept-seven-denied'
     )),
  0::bigint,'customer denials emit no command idempotency records'
);

update public.profiles set status='active'
where id in (
  'a8100000-0000-4000-8000-000000000001',
  'a8100000-0000-4000-8000-000000000002'
);
update public.provider_job_eligibility_reviews
set status='resolved',resolved_at=now()
where provider_id='a8100000-0000-4000-8000-000000000002' and status='open';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','a8100000-0000-4000-8000-000000000002',true);
select lives_ok(
  $$select public.create_change_order(jsonb_build_object(
    'jobId','a8500000-0000-4000-8000-000000000002',
    'idempotencyKey','gate-create-order-active','reason','Additional work',
    'description','Additional work requires approval',
    'expiresAt',now()+interval '1 day','lineItems',jsonb_build_array(
      jsonb_build_object('description','Part','quantity',1,'amountMinor',1000)
    )
  ))$$,
  'an active eligible provider can create a change order'
);
select lives_ok(
  $$select public.submit_completion(
    'a8500000-0000-4000-8000-000000000004',jsonb_build_array(
      jsonb_build_object('uploadId','a8700000-0000-4000-8000-000000000004')
    ),'gate-submit-active'
  )$$,
  'an active eligible provider can submit completion evidence'
);
select lives_ok(
  $$select public.transition_job(
    'a8500000-0000-4000-8000-000000000007','en_route',
    'Provider is travelling','gate-provider-replay'
  )$$,
  'an active eligible provider can transition an exact job'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','a8100000-0000-4000-8000-000000000001',true);
select lives_ok(
  $$select public.decide_change_order(
    'a8600000-0000-4000-8000-000000000003',true,
    'Approved additional work','gate-decide-active'
  )$$,
  'an active customer can decide a pending change order'
);
select lives_ok(
  $$select public.accept_completion(
    'a8500000-0000-4000-8000-000000000005',true,
    'Accepted completed work',5,'Good work','gate-accept-seven-active','{}'::uuid[]
  )$$,
  'an active customer can use seven-argument acceptance'
);
reset role;

update public.user_roles set revoked_at=now()
where user_id='a8100000-0000-4000-8000-000000000002' and role='provider';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','a8100000-0000-4000-8000-000000000002',true);
select throws_ok(
  $test$do $block$ begin
    perform public.transition_job(
      'a8500000-0000-4000-8000-000000000007','en_route',
      'Provider is travelling','gate-provider-replay'
    );
    raise exception 'EXPECTED_DENIAL_MISSING';
  end $block$$test$,
  'PROVIDER_JOB_INELIGIBLE',
  'provider deprivileging is checked before an exact committed replay'
);
reset role;
select is(
  (select count(*) from public.job_status_history
   where job_id='a8500000-0000-4000-8000-000000000007'
     and idempotency_key='gate-provider-replay'),
  1::bigint,'denied provider replay does not append another transition'
);

update public.user_roles set revoked_at=null
where user_id='a8100000-0000-4000-8000-000000000002' and role='provider';
update public.provider_job_eligibility_reviews
set status='resolved',resolved_at=now()
where provider_id='a8100000-0000-4000-8000-000000000002' and status='open';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','a8100000-0000-4000-8000-000000000001',true);
select lives_ok(
  $$select public.transition_job(
    'a8500000-0000-4000-8000-000000000008','scheduled',
    'Customer confirmed schedule','gate-customer-replay'
  )$$,
  'an active customer can transition an exact job'
);
reset role;
update public.profiles set status='suspended'
where id='a8100000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','a8100000-0000-4000-8000-000000000001',true);
select throws_ok(
  $test$do $block$ begin
    perform public.transition_job(
      'a8500000-0000-4000-8000-000000000008','scheduled',
      'Customer confirmed schedule','gate-customer-replay'
    );
    raise exception 'EXPECTED_DENIAL_MISSING';
  end $block$$test$,
  'ACCOUNT_NOT_ACTIVE','customer suspension is checked before exact replay'
);
reset role;
select is(
  (select count(*) from public.job_status_history
   where job_id='a8500000-0000-4000-8000-000000000008'
     and idempotency_key='gate-customer-replay'),
  1::bigint,'denied customer replay does not append another transition'
);

update public.profiles set status='active'
where id='a8100000-0000-4000-8000-000000000001';
insert into public.provider_job_eligibility_reviews(job_id,provider_id,reason)
values(
  'a8500000-0000-4000-8000-000000000009',
  'a8100000-0000-4000-8000-000000000002','Exact job requires review'
);
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','a8100000-0000-4000-8000-000000000002',true);
select throws_ok(
  $test$do $block$ begin
    perform public.transition_job(
      'a8500000-0000-4000-8000-000000000009','en_route',
      'Provider is travelling','gate-open-review'
    );
    raise exception 'EXPECTED_DENIAL_MISSING';
  end $block$$test$,
  'PROVIDER_JOB_REVIEW_REQUIRED','an open exact-job provider review blocks the command'
);
reset role;
update public.provider_job_eligibility_reviews
set status='resolved',resolved_at=now()
where job_id='a8500000-0000-4000-8000-000000000009';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','a8100000-0000-4000-8000-000000000002',true);
select lives_ok(
  $$select public.transition_job(
    'a8500000-0000-4000-8000-000000000009','en_route',
    'Provider is travelling','gate-resolved-review'
  )$$,
  'a resolved exact-job review no longer blocks an otherwise eligible provider'
);
reset role;

create temp table location_gate_results(
  key text primary key,
  payload jsonb,
  value_id uuid
);
grant select,insert,update,delete on location_gate_results to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','a8100000-0000-4000-8000-000000000002',true);
insert into location_gate_results(key,payload)
values(
  'active_session',
  public.start_job_location_sharing(
    'a8500000-0000-4000-8000-000000000009',30,true
  )
);
insert into location_gate_results(key,value_id)
values(
  'active_update',
  public.record_job_location(
    'a8500000-0000-4000-8000-000000000009',
    (select (payload->>'sessionId')::uuid
     from location_gate_results where key='active_session'),
    24.72,46.68,12
  )
);
select is(
  public.get_authorized_job_location(
    'a8500000-0000-4000-8000-000000000009'
  )->>'jobId',
  'a8500000-0000-4000-8000-000000000009',
  'an active verified provider can start, record, and read exact-job location'
);
select is(
  (select count(*) from public.addresses
   where id='a8200000-0000-4000-8000-000000000009'),
  1::bigint,
  'an active eligible selected provider can directly read the exact job address'
);
select is(
  (select count(*) from public.job_location_sharing_sessions
   where job_id='a8500000-0000-4000-8000-000000000009'),
  1::bigint,
  'an active eligible provider can directly read the current sharing session'
);
select is(
  (select count(*) from public.job_location_updates
   where job_id='a8500000-0000-4000-8000-000000000009'),
  1::bigint,
  'an active eligible provider can directly read unexpired live coordinates'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','a8100000-0000-4000-8000-000000000003',true);
select is(
  (select count(*) from public.addresses
   where id='a8200000-0000-4000-8000-000000000009'),
  0::bigint,
  'operations cannot bypass the reasoned exact-address RPC through direct reads'
);
select is(
  (select count(*) from public.job_location_updates
   where job_id='a8500000-0000-4000-8000-000000000009'),
  0::bigint,
  'operations cannot bypass the audited live-coordinate RPC through direct reads'
);
select is(
  (select count(*) from public.job_location_sharing_sessions
   where job_id='a8500000-0000-4000-8000-000000000009'),
  1::bigint,
  'the existing operations exact-location permission still reads sharing-session metadata'
);
reset role;

update public.profiles set status='suspended'
where id='a8100000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','a8100000-0000-4000-8000-000000000002',true);
select throws_ok(
  $test$do $block$ begin
    perform public.start_job_location_sharing(
      'a8500000-0000-4000-8000-000000000009',30,true
    );
    raise exception 'EXPECTED_DENIAL_MISSING';
  end $block$$test$,
  'ACCOUNT_NOT_ACTIVE',
  'a suspended provider cannot replace a current exact-location session'
);
select throws_ok(
  $test$do $block$ begin
    perform public.record_job_location(
      'a8500000-0000-4000-8000-000000000009',
      (select (payload->>'sessionId')::uuid
       from location_gate_results where key='active_session'),
      24.73,46.69,15
    );
    raise exception 'EXPECTED_DENIAL_MISSING';
  end $block$$test$,
  'ACCOUNT_NOT_ACTIVE',
  'a suspended provider cannot reuse a current sharing token to record location'
);
select throws_ok(
  $test$do $block$ begin
    perform public.get_authorized_job_location(
      'a8500000-0000-4000-8000-000000000009'
    );
    raise exception 'EXPECTED_DENIAL_MISSING';
  end $block$$test$,
  'ACCOUNT_NOT_ACTIVE',
  'a suspended provider cannot read exact customer or live-provider location'
);
select is(
  (select count(*) from public.addresses
   where id='a8200000-0000-4000-8000-000000000009'),
  0::bigint,
  'a suspended provider cannot directly select the customer exact address'
);
select is(
  (select count(*) from public.job_location_sharing_sessions
   where job_id='a8500000-0000-4000-8000-000000000009'),
  0::bigint,
  'a suspended provider cannot directly select the live sharing token'
);
select is(
  (select count(*) from public.job_location_updates
   where job_id='a8500000-0000-4000-8000-000000000009'),
  0::bigint,
  'a suspended provider cannot directly select unexpired live coordinates'
);
reset role;
select is(
  (select count(*) from public.job_location_sharing_sessions
   where job_id='a8500000-0000-4000-8000-000000000009'),
  1::bigint,
  'suspended-provider denials do not replace the current sharing session'
);
select is(
  (select count(*) from public.job_location_updates
   where job_id='a8500000-0000-4000-8000-000000000009'),
  1::bigint,
  'suspended-provider denials do not append an exact-location update'
);

update public.profiles set status='active'
where id='a8100000-0000-4000-8000-000000000002';
update public.user_roles set revoked_at=now()
where user_id='a8100000-0000-4000-8000-000000000002' and role='provider';
update public.provider_job_eligibility_reviews
set status='resolved',resolved_at=now()
where provider_id='a8100000-0000-4000-8000-000000000002' and status='open';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','a8100000-0000-4000-8000-000000000002',true);
select throws_ok(
  $test$do $block$ begin
    perform public.start_job_location_sharing(
      'a8500000-0000-4000-8000-000000000009',30,true
    );
    raise exception 'EXPECTED_DENIAL_MISSING';
  end $block$$test$,
  'PROVIDER_JOB_INELIGIBLE',
  'a provider-role revocation denies exact-location sharing before mutation'
);
select throws_ok(
  $test$do $block$ begin
    perform public.record_job_location(
      'a8500000-0000-4000-8000-000000000009',
      (select (payload->>'sessionId')::uuid
       from location_gate_results where key='active_session'),
      24.73,46.69,15
    );
    raise exception 'EXPECTED_DENIAL_MISSING';
  end $block$$test$,
  'PROVIDER_JOB_INELIGIBLE',
  'a provider-role revocation denies current-token location recording'
);
select throws_ok(
  $test$do $block$ begin
    perform public.get_authorized_job_location(
      'a8500000-0000-4000-8000-000000000009'
    );
    raise exception 'EXPECTED_DENIAL_MISSING';
  end $block$$test$,
  'PROVIDER_JOB_INELIGIBLE',
  'a provider-role revocation denies participant exact-location reads'
);
select is(
  (select count(*) from public.addresses
   where id='a8200000-0000-4000-8000-000000000009'),
  0::bigint,
  'a revoked provider role cannot directly select the customer exact address'
);
select is(
  (select count(*) from public.job_location_sharing_sessions
   where job_id='a8500000-0000-4000-8000-000000000009'),
  0::bigint,
  'a revoked provider role cannot directly select the sharing token'
);
select is(
  (select count(*) from public.job_location_updates
   where job_id='a8500000-0000-4000-8000-000000000009'),
  0::bigint,
  'a revoked provider role cannot directly select unexpired live coordinates'
);
reset role;

update public.user_roles set revoked_at=null
where user_id='a8100000-0000-4000-8000-000000000002' and role='provider';
select set_config('sallah.provider_onboarding_command','true',true);
update public.provider_profiles
set verification_status='more_information_required',accepting_requests=false
where user_id='a8100000-0000-4000-8000-000000000002';
select set_config('sallah.provider_onboarding_command','false',true);
update public.provider_job_eligibility_reviews
set status='resolved',resolved_at=now()
where provider_id='a8100000-0000-4000-8000-000000000002' and status='open';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','a8100000-0000-4000-8000-000000000002',true);
select throws_ok(
  $test$do $block$ begin
    perform public.start_job_location_sharing(
      'a8500000-0000-4000-8000-000000000009',30,true
    );
    raise exception 'EXPECTED_DENIAL_MISSING';
  end $block$$test$,
  'PROVIDER_JOB_INELIGIBLE',
  'failed current provider verification denies exact-location sharing'
);
select throws_ok(
  $test$do $block$ begin
    perform public.record_job_location(
      'a8500000-0000-4000-8000-000000000009',
      (select (payload->>'sessionId')::uuid
       from location_gate_results where key='active_session'),
      24.73,46.69,15
    );
    raise exception 'EXPECTED_DENIAL_MISSING';
  end $block$$test$,
  'PROVIDER_JOB_INELIGIBLE',
  'failed current provider verification denies current-token recording'
);
select throws_ok(
  $test$do $block$ begin
    perform public.get_authorized_job_location(
      'a8500000-0000-4000-8000-000000000009'
    );
    raise exception 'EXPECTED_DENIAL_MISSING';
  end $block$$test$,
  'PROVIDER_JOB_INELIGIBLE',
  'failed current provider verification denies exact-location reads'
);
select is(
  (select count(*) from public.addresses
   where id='a8200000-0000-4000-8000-000000000009'),
  0::bigint,
  'failed provider verification denies direct exact-address selection'
);
select is(
  (select count(*) from public.job_location_sharing_sessions
   where job_id='a8500000-0000-4000-8000-000000000009'),
  0::bigint,
  'failed provider verification denies direct sharing-token selection'
);
select is(
  (select count(*) from public.job_location_updates
   where job_id='a8500000-0000-4000-8000-000000000009'),
  0::bigint,
  'failed provider verification denies direct live-coordinate selection'
);
reset role;

select set_config('sallah.provider_onboarding_command','true',true);
update public.provider_profiles
set verification_status='verified',accepting_requests=false
where user_id='a8100000-0000-4000-8000-000000000002';
update public.provider_profiles set accepting_requests=true
where user_id='a8100000-0000-4000-8000-000000000002';
select set_config('sallah.provider_onboarding_command','false',true);
update public.provider_job_eligibility_reviews
set status='resolved',resolved_at=now()
where provider_id='a8100000-0000-4000-8000-000000000002' and status='open';
insert into public.provider_job_eligibility_reviews(job_id,provider_id,reason)
values(
  'a8500000-0000-4000-8000-000000000009',
  'a8100000-0000-4000-8000-000000000002',
  'Exact location must stop while this exact job is under review'
);
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','a8100000-0000-4000-8000-000000000002',true);
select throws_ok(
  $test$do $block$ begin
    perform public.start_job_location_sharing(
      'a8500000-0000-4000-8000-000000000009',30,true
    );
    raise exception 'EXPECTED_DENIAL_MISSING';
  end $block$$test$,
  'PROVIDER_JOB_REVIEW_REQUIRED',
  'an open exact-job review denies starting a replacement location session'
);
select throws_ok(
  $test$do $block$ begin
    perform public.record_job_location(
      'a8500000-0000-4000-8000-000000000009',
      (select (payload->>'sessionId')::uuid
       from location_gate_results where key='active_session'),
      24.73,46.69,15
    );
    raise exception 'EXPECTED_DENIAL_MISSING';
  end $block$$test$,
  'PROVIDER_JOB_REVIEW_REQUIRED',
  'an open exact-job review denies a still-current sharing token'
);
select throws_ok(
  $test$do $block$ begin
    perform public.get_authorized_job_location(
      'a8500000-0000-4000-8000-000000000009'
    );
    raise exception 'EXPECTED_DENIAL_MISSING';
  end $block$$test$,
  'PROVIDER_JOB_REVIEW_REQUIRED',
  'an open exact-job review denies provider exact-location reads'
);
select is(
  (select count(*) from public.addresses
   where id='a8200000-0000-4000-8000-000000000009'),
  0::bigint,
  'an open exact-job review denies direct exact-address selection'
);
select is(
  (select count(*) from public.job_location_sharing_sessions
   where job_id='a8500000-0000-4000-8000-000000000009'),
  0::bigint,
  'an open exact-job review denies direct sharing-token selection'
);
select is(
  (select count(*) from public.job_location_updates
   where job_id='a8500000-0000-4000-8000-000000000009'),
  0::bigint,
  'an open exact-job review denies direct live-coordinate selection'
);
reset role;
select is(
  (select count(*) from public.job_location_sharing_sessions
   where job_id='a8500000-0000-4000-8000-000000000009'),
  1::bigint,
  'all current provider eligibility denials preserve the original session only'
);
select is(
  (select count(*) from public.job_location_updates
   where job_id='a8500000-0000-4000-8000-000000000009'),
  1::bigint,
  'all current provider eligibility denials preserve the original update only'
);

update public.provider_job_eligibility_reviews
set status='resolved',resolved_at=now()
where job_id='a8500000-0000-4000-8000-000000000009' and status='open';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','a8100000-0000-4000-8000-000000000002',true);
select lives_ok(
  $$select public.record_job_location(
    'a8500000-0000-4000-8000-000000000009',
    (select (payload->>'sessionId')::uuid
     from location_gate_results where key='active_session'),
    24.73,46.69,15
  )$$,
  'a resolved exact-job review restores current-token location recording'
);
select is(
  public.get_authorized_job_location(
    'a8500000-0000-4000-8000-000000000009'
  )->>'jobId',
  'a8500000-0000-4000-8000-000000000009',
  'a resolved review restores provider participant location reads'
);
select is(
  (select count(*) from public.addresses
   where id='a8200000-0000-4000-8000-000000000009'),
  1::bigint,
  'a resolved exact-job review restores provider direct exact-address reads'
);
select is(
  (select count(*) from public.job_location_sharing_sessions
   where job_id='a8500000-0000-4000-8000-000000000009'),
  1::bigint,
  'a resolved exact-job review restores provider direct sharing-token reads'
);
select is(
  (select count(*) from public.job_location_updates
   where job_id='a8500000-0000-4000-8000-000000000009'),
  2::bigint,
  'a resolved exact-job review restores provider direct live-coordinate reads'
);
select set_config('request.jwt.claim.sub','a8100000-0000-4000-8000-000000000001',true);
select is(
  public.get_authorized_job_location(
    'a8500000-0000-4000-8000-000000000009'
  )->>'jobId',
  'a8500000-0000-4000-8000-000000000009',
  'an active customer retains exact-location access to the exact job'
);
select is(
  (select count(*) from public.addresses
   where id='a8200000-0000-4000-8000-000000000009'),
  1::bigint,
  'an active customer retains direct access to their own exact address'
);
select is(
  (select count(*) from public.job_location_sharing_sessions
   where job_id='a8500000-0000-4000-8000-000000000009'),
  1::bigint,
  'an active customer can directly read the current sharing session'
);
select is(
  (select count(*) from public.job_location_updates
   where job_id='a8500000-0000-4000-8000-000000000009'),
  2::bigint,
  'an active customer can directly read unexpired live coordinates'
);
reset role;

update public.profiles set status='suspended'
where id='a8100000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','a8100000-0000-4000-8000-000000000001',true);
select throws_ok(
  $test$do $block$ begin
    perform public.get_authorized_job_location(
      'a8500000-0000-4000-8000-000000000009'
    );
    raise exception 'EXPECTED_DENIAL_MISSING';
  end $block$$test$,
  'ACCOUNT_NOT_ACTIVE',
  'a suspended customer cannot read exact or live-provider location'
);
select is(
  (select count(*) from public.addresses
   where id='a8200000-0000-4000-8000-000000000009'),
  1::bigint,
  'a suspended customer retains the existing owner read of their own address'
);
select is(
  (select count(*) from public.job_location_sharing_sessions
   where job_id='a8500000-0000-4000-8000-000000000009'),
  0::bigint,
  'a suspended customer cannot directly select the live sharing token'
);
select is(
  (select count(*) from public.job_location_updates
   where job_id='a8500000-0000-4000-8000-000000000009'),
  0::bigint,
  'a suspended customer cannot directly select unexpired live coordinates'
);
reset role;
select is(
  (select count(*) from public.job_location_updates
   where job_id='a8500000-0000-4000-8000-000000000009'),
  2::bigint,
  'a denied customer read cannot mutate exact-location evidence'
);
update public.profiles set status='active'
where id='a8100000-0000-4000-8000-000000000001';

select * from finish();
rollback;
