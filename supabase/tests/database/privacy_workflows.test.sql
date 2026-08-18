begin;
select plan(31);

select has_table('public','privacy_events','privacy event ledger exists');
select ok(
  (select relrowsecurity from pg_class where oid='public.privacy_events'::regclass),
  'privacy event ledger has RLS enabled'
);
select has_table('public','account_reauthentications','short-lived reauthentication ledger exists');
select function_privs_are(
  'public','record_account_reauthentication',array['uuid','uuid','text'],'authenticated',array[]::text[],
  'clients cannot mint their own reauthentication proof'
);
select function_privs_are(
  'public','record_account_reauthentication',array['uuid','uuid','text'],'service_role',array['EXECUTE'],
  'trusted reauthentication endpoint may record a verified proof'
);
select function_privs_are(
  'public','claim_privacy_job',array['text'],'authenticated',array[]::text[],
  'authenticated clients cannot claim privacy jobs'
);
select function_privs_are(
  'public','claim_privacy_job',array['text'],'service_role',array['EXECUTE'],
  'service role may claim privacy jobs'
);
select function_privs_are(
  'public','get_privacy_retention_config',array[]::text[],'authenticated',array[]::text[],
  'authenticated clients cannot read the worker retention contract'
);
select function_privs_are(
  'public','get_privacy_retention_config',array[]::text[],'service_role',array['EXECUTE'],
  'service role may read the worker retention contract'
);

set local role service_role;
select is(
  (public.get_privacy_retention_config()->>'exportLinkSeconds')::integer,
  3600,
  'worker retention contract configures a one-hour export link'
);
reset role;

insert into auth.users(
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
  (
    '81818181-8181-4181-8181-818181818181',
    '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
    'privacy-owner@test.invalid',crypt(gen_random_uuid()::text,gen_salt('bf')),now(),
    '{}','{}',now(),now()
  ),
  (
    '82828282-8282-4282-8282-828282828282',
    '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
    'privacy-outsider@test.invalid',crypt(gen_random_uuid()::text,gen_salt('bf')),now(),
    '{}','{}',now(),now()
  );

insert into auth.sessions(id,user_id,created_at,updated_at,not_after) values
  (
    '81818181-8181-4181-8181-818181818180',
    '81818181-8181-4181-8181-818181818181',now(),now(),now()+interval '1 day'
  ),
  (
    '82828282-8282-4282-8282-828282828280',
    '82828282-8282-4282-8282-828282828282',now(),now(),now()+interval '1 day'
  );

set local role service_role;
select lives_ok(
  $$select public.record_account_reauthentication(
    '81818181-8181-4181-8181-818181818181',
    '81818181-8181-4181-8181-818181818180',
    'password'
  )$$,
  'trusted endpoint records recent verification for the current session'
);
reset role;

create temp table privacy_test_context (
  key text primary key,
  id uuid,
  payload jsonb
);
grant select,insert,update,delete on privacy_test_context to authenticated,service_role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub','81818181-8181-4181-8181-818181818181',
    'session_id','81818181-8181-4181-8181-818181818180',
    'iat',extract(epoch from now())::bigint
  )::text,
  true
);
insert into privacy_test_context(key,id)
select 'export_request',public.request_data_export();
select is(
  (select status from public.data_export_requests where id=(select id from privacy_test_context where key='export_request')),
  'requested',
  'recently authenticated user queues an export'
);
reset role;
select is(
  (select count(*) from public.scheduled_jobs where job_type='data_export'),
  1::bigint,
  'export request creates one worker job'
);
set local role authenticated;
select throws_ok(
  $$select public.claim_privacy_job('client-worker')$$,
  '42501',
  null,
  'authenticated caller cannot execute worker claim'
);

reset role;
set local role service_role;
insert into privacy_test_context(key,payload)
values('export_job',public.claim_privacy_job('privacy-test-worker'));
select is(
  (select payload->>'jobType' from privacy_test_context where key='export_job'),
  'data_export',
  'worker atomically claims the queued export'
);
select lives_ok(
  format(
    'select public.build_data_export(%L,%L)',
    (select id from privacy_test_context where key='export_request'),
    '81818181-8181-4181-8181-818181818181'
  ),
  'worker builds the owner export'
);
select throws_ok(
  format(
    'select public.build_data_export(%L,%L)',
    (select id from privacy_test_context where key='export_request'),
    '82828282-8282-4282-8282-828282828282'
  ),
  'EXPORT_REQUEST_NOT_PROCESSING',
  'worker cannot build an export for a different user'
);
select lives_ok(
  format(
    'select public.fail_privacy_job(%L,%L,%L)',
    (select (payload->>'jobId')::uuid from privacy_test_context where key='export_job'),
    (select id from privacy_test_context where key='export_request'),
    'deterministic_test_failure'
  ),
  'worker failure is recorded and rescheduled'
);
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub','81818181-8181-4181-8181-818181818181',
    'session_id','81818181-8181-4181-8181-818181818180',
    'iat',extract(epoch from now())::bigint
  )::text,
  true
);
select is(
  (select status from public.data_export_requests where id=(select id from privacy_test_context where key='export_request')),
  'requested',
  'nonterminal export failure returns to requested'
);

insert into privacy_test_context(key,id)
select 'deletion_request',public.request_account_deletion();
select is(
  (select status from public.account_deletion_requests where id=(select id from privacy_test_context where key='deletion_request')),
  'verified',
  'deletion without retention blockers is verified'
);
select is(
  (select status::text from public.profiles where id='81818181-8181-4181-8181-818181818181'),
  'deletion_pending',
  'deletion request immediately disables the profile'
);

reset role;
set local role service_role;
insert into privacy_test_context(key,payload)
values('deletion_job',public.claim_privacy_job('privacy-test-worker'));
select is(
  (select payload->>'jobType' from privacy_test_context where key='deletion_job'),
  'account_deletion',
  'worker claims account deletion independently of delayed export retry'
);
select lives_ok(
  format(
    'select public.complete_account_deletion(%L,%L)',
    (select (payload->>'jobId')::uuid from privacy_test_context where key='deletion_job'),
    (select id from privacy_test_context where key='deletion_request')
  ),
  'database anonymization completes transactionally'
);
reset role;
select is(
  (select status::text from public.profiles where id='81818181-8181-4181-8181-818181818181'),
  'anonymized',
  'completed deletion leaves an anonymized legal identity'
);
select is(
  (select status from public.account_deletion_requests where id=(select id from privacy_test_context where key='deletion_request')),
  'completed',
  'deletion request is completed'
);
select throws_ok(
  $$update public.privacy_events set event_type='tampered'$$,
  'APPEND_ONLY_RECORD',
  'privacy audit events are append only'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"81818181-8181-4181-8181-818181818181","session_id":"81818181-8181-4181-8181-818181818180","iat":0}',
  true
);
select is(
  (select count(*) from public.privacy_events),
  6::bigint,
  'owner can read the full privacy event timeline'
);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub','82828282-8282-4282-8282-828282828282',
    'session_id','82828282-8282-4282-8282-828282828280',
    'iat',extract(epoch from now())::bigint
  )::text,
  true
);
select is(
  (select count(*) from public.privacy_events),
  0::bigint,
  'unrelated user cannot read another privacy timeline'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"82828282-8282-4282-8282-828282828282","session_id":"82828282-8282-4282-8282-828282828280","iat":0}',
  true
);
select throws_ok(
  $$select public.request_data_export()$$,
  'RECENT_REAUTHENTICATION_REQUIRED',
  'a session without recent verification cannot request exports'
);

reset role;
set local role service_role;
select lives_ok(
  $$select public.record_account_reauthentication(
    '82828282-8282-4282-8282-828282828282',
    '82828282-8282-4282-8282-828282828280',
    'password'
  )$$,
  'trusted endpoint can verify a second active session'
);
reset role;
delete from auth.sessions where id='82828282-8282-4282-8282-828282828280';
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"82828282-8282-4282-8282-828282828282","session_id":"82828282-8282-4282-8282-828282828280","iat":0}',
  true
);
select throws_ok(
  $$select public.request_data_export()$$,
  'RECENT_REAUTHENTICATION_REQUIRED',
  'revoking the current auth session invalidates its reauthentication proof'
);

select * from finish();
rollback;
