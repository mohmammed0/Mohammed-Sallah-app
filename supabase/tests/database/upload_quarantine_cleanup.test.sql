begin;
select no_plan();

select function_privs_are('public','claim_media_scan_artifact_cleanup',array['text','uuid','text'],'service_role',array['EXECUTE'],'service control may claim exactly one artifact');
select function_privs_are('public','claim_media_scan_artifact_cleanup',array['text','uuid','text'],'authenticated',array[]::text[],'owners cannot claim scanner cleanup');
select function_privs_are('public','claim_upload_quarantine_cleanup',array['text'],'service_role',array[]::text[],'whole-upload cleanup contract is retired');

select has_extension('pg_cron','the repository installs the autonomous cleanup scheduler');
select has_extension('pg_net','the scheduler uses the bounded asynchronous HTTP client');
select has_function('private','invoke_media_scan_cleanup_schedule',array[]::text[],'the scheduler invokes a private no-argument cleanup dispatcher');
select function_privs_are('private','invoke_media_scan_cleanup_schedule',array[]::text[],'authenticated',array[]::text[],'upload owners cannot invoke the scheduled dispatcher');
select is(
  (select count(*) from cron.job where jobname='sallah-media-scan-cleanup'),
  1::bigint,
  'exactly one scanner-independent cleanup schedule is installed'
);
select is(
  (select schedule from cron.job where jobname='sallah-media-scan-cleanup'),
  '*/15 * * * *',
  'cleanup reconciliation runs every fifteen minutes'
);
select is(
  (select command from cron.job where jobname='sallah-media-scan-cleanup'),
  'select private.invoke_media_scan_cleanup_schedule();',
  'the cron command contains no URL or secret material'
);

insert into auth.users(
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values(
  'b2000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','artifact-cleanup@test.invalid',crypt(gen_random_uuid()::text,gen_salt('bf')),
  now(),'{}','{}',now(),now()
);

create temp table cleanup_context(key text primary key,payload jsonb,token uuid);
grant select,insert,update,delete on cleanup_context to authenticated,service_role;

-- D1 may already have completed/rejected uploads whose separate quarantine
-- cleanup has not run. M2 must adopt those rows before retiring the legacy RPC.
set local role authenticated;
select set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000001',true);
insert into cleanup_context(key,payload) values
  ('legacy-clean-ticket',public.create_unbound_file_upload(
    'request_media','legacy-clean.png','image/png',4096
  )),
  ('legacy-rejected-ticket',public.create_unbound_file_upload(
    'request_media','legacy-rejected.png','image/png',4096
  ));
insert into storage.objects(bucket_id,name,owner_id,metadata)
select payload->>'bucket',payload->>'path','b2000000-0000-4000-8000-000000000001',
  jsonb_build_object('mimetype','image/png','size',4096)
from cleanup_context where key in ('legacy-clean-ticket','legacy-rejected-ticket');
reset role;
update public.file_uploads set
  status='clean',detected_mime_type='image/png',sanitized=true,
  created_at='1999-01-01 00:00:00+00',scanned_at=clock_timestamp()
where id=(select (payload->>'uploadId')::uuid from cleanup_context where key='legacy-clean-ticket');
update public.file_uploads set
  status='rejected',failure_category='malicious',created_at='2000-01-01 00:00:00+00'
where id=(select (payload->>'uploadId')::uuid from cleanup_context where key='legacy-rejected-ticket');
insert into cleanup_context(key,token) values
  ('legacy-clean-token',gen_random_uuid()),('legacy-rejected-token',gen_random_uuid());
set local role service_role;
insert into cleanup_context(key,payload)
select 'legacy-clean-claim',public.claim_media_scan_artifact_cleanup(
  'cleanup-worker',gen_random_uuid(),
  encode(extensions.digest(
    (select token::text from cleanup_context where key='legacy-clean-token'),'sha256'
  ),'hex')
);
reset role;
select is(
  (select payload->>'kind' from cleanup_context where key='legacy-clean-claim'),
  'quarantine','a D1 clean upload remains eligible after legacy cleanup retirement'
);
select is(
  (select state from private.media_scan_jobs
   where upload_id=(select (payload->>'uploadId')::uuid from cleanup_context where key='legacy-clean-ticket')),
  'clean','adopting cleanup preserves the D1 clean outcome'
);
set local role service_role;
select public.complete_media_scan_artifact_cleanup(
  (select (payload->>'artifactId')::uuid from cleanup_context where key='legacy-clean-claim'),
  (select token from cleanup_context where key='legacy-clean-token'),
  'cleanup-worker',gen_random_uuid()
);
insert into cleanup_context(key,payload)
select 'legacy-rejected-claim',public.claim_media_scan_artifact_cleanup(
  'cleanup-worker',gen_random_uuid(),
  encode(extensions.digest(
    (select token::text from cleanup_context where key='legacy-rejected-token'),'sha256'
  ),'hex')
);
reset role;
select is(
  (select payload->>'kind' from cleanup_context where key='legacy-rejected-claim'),
  'quarantine','a D1 rejected upload remains eligible after legacy cleanup retirement'
);
select is(
  (select state from private.media_scan_jobs
   where upload_id=(select (payload->>'uploadId')::uuid from cleanup_context where key='legacy-rejected-ticket')),
  'rejected','adopting cleanup preserves the D1 rejected outcome'
);
set local role service_role;
select public.complete_media_scan_artifact_cleanup(
  (select (payload->>'artifactId')::uuid from cleanup_context where key='legacy-rejected-claim'),
  (select token from cleanup_context where key='legacy-rejected-token'),
  'cleanup-worker',gen_random_uuid()
);
reset role;
update public.file_uploads set expires_at=clock_timestamp()-interval '1 second'
where id in (
  (select (payload->>'uploadId')::uuid from cleanup_context where key='legacy-clean-ticket'),
  (select (payload->>'uploadId')::uuid from cleanup_context where key='legacy-rejected-ticket')
);
set local role authenticated;
select set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000001',true);
select is(
  public.start_or_get_media_scan(
    (select (payload->>'uploadId')::uuid from cleanup_context where key='legacy-clean-ticket'),
    gen_random_uuid()
  )->>'status',
  'clean','cleanup-first D1 clean replay remains available after ticket expiry'
);
select lives_ok(
  format(
    'select public.start_or_get_media_scan(%L,%L)',
    (select payload->>'uploadId' from cleanup_context where key='legacy-rejected-ticket'),
    gen_random_uuid()
  ),
  'cleanup-first D1 rejected replay remains available after ticket expiry'
);
select is(
  public.start_or_get_media_scan(
    (select (payload->>'uploadId')::uuid from cleanup_context where key='legacy-rejected-ticket'),
    gen_random_uuid()
  )->>'status',
  'rejected','cleanup-first D1 rejected replay cannot be revived after ticket expiry'
);
reset role;
-- Seed data can contain additional D1 terminal uploads. The two explicit
-- upgrade fixtures above prove their adoption; mark unrelated seed rows clean
-- inside this rollback-only test so later queue-order assertions stay local.
update public.file_uploads set quarantine_cleaned_at=coalesce(quarantine_cleaned_at,clock_timestamp())
where id not in (
  (select (payload->>'uploadId')::uuid from cleanup_context where key='legacy-clean-ticket'),
  (select (payload->>'uploadId')::uuid from cleanup_context where key='legacy-rejected-ticket')
)
and not exists(select 1 from private.media_scan_jobs j where j.upload_id=file_uploads.id);

-- A ticket may upload to quarantine and lose its client response before the first
-- scan start. V2 cleanup must discover that orphan without the retired legacy RPC.
set local role authenticated;
select set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000001',true);
insert into cleanup_context(key,payload)
values('unstarted-ticket',public.create_unbound_file_upload(
  'request_media','unstarted.png','image/png',4096
));
insert into storage.objects(bucket_id,name,owner_id,metadata)
select payload->>'bucket',payload->>'path','b2000000-0000-4000-8000-000000000001',
  jsonb_build_object('mimetype','image/png','size',4096)
from cleanup_context where key='unstarted-ticket';
reset role;
update public.file_uploads set
  created_at=clock_timestamp()-interval '25 hours',
  expires_at=clock_timestamp()-interval '1 hour'
where id=(select (payload->>'uploadId')::uuid from cleanup_context where key='unstarted-ticket');
insert into cleanup_context(key,token) values('unstarted-cleanup-token',gen_random_uuid());
set local role service_role;
insert into cleanup_context(key,payload)
select 'unstarted-cleanup-claim',public.claim_media_scan_artifact_cleanup(
  'cleanup-worker',gen_random_uuid(),
  encode(extensions.digest(
    (select token::text from cleanup_context where key='unstarted-cleanup-token'),'sha256'
  ),'hex')
);
reset role;
select is(
  (select payload->>'kind' from cleanup_context where key='unstarted-cleanup-claim'),
  'quarantine','an expired ticket with no scan job is projected into V2 cleanup'
);
select is(
  (select state from private.media_scan_jobs
   where upload_id=(select (payload->>'uploadId')::uuid from cleanup_context where key='unstarted-ticket')),
  'terminal_failure','orphan cleanup creates a terminal private job authority'
);
select is(
  (select status from public.file_uploads
   where id=(select (payload->>'uploadId')::uuid from cleanup_context where key='unstarted-ticket')),
  'expired','orphan cleanup closes the owner-safe upload status'
);
set local role service_role;
select public.complete_media_scan_artifact_cleanup(
  (select (payload->>'artifactId')::uuid from cleanup_context where key='unstarted-cleanup-claim'),
  (select token from cleanup_context where key='unstarted-cleanup-token'),
  'cleanup-worker',gen_random_uuid()
);
reset role;
select isnt(
  (select quarantine_cleaned_at from public.file_uploads
   where id=(select (payload->>'uploadId')::uuid from cleanup_context where key='unstarted-ticket')),
  null::timestamptz,'V2 quarantine completion records the cleanup on the upload ledger'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000001',true);
insert into cleanup_context(key,payload)
values('ticket',public.create_unbound_file_upload('request_media','retry.png','image/png',4096));
insert into storage.objects(bucket_id,name,owner_id,metadata)
select payload->>'bucket',payload->>'path','b2000000-0000-4000-8000-000000000001',
  jsonb_build_object('mimetype','image/png','size',4096)
from cleanup_context where key='ticket';
select public.start_or_get_media_scan((select (payload->>'uploadId')::uuid from cleanup_context where key='ticket'),gen_random_uuid());
reset role;

insert into cleanup_context(key,token) values
  ('attempt-1',gen_random_uuid()),('attempt-2',gen_random_uuid()),('cleanup-1',gen_random_uuid());
set local role service_role;
insert into cleanup_context(key,payload)
select 'claim-1',public.claim_media_scan_job(
  'scanner-cleanup',gen_random_uuid(),
  encode(extensions.digest((select token::text from cleanup_context where key='attempt-1'),'sha256'),'hex'),
  clock_timestamp(),86400
);
select public.fail_media_scan_attempt(
  (select (payload->>'attemptId')::uuid from cleanup_context where key='claim-1'),
  (select token from cleanup_context where key='attempt-1'),gen_random_uuid(),'scanner_timeout'
);
reset role;

select is(
  (select count(*) from private.media_scan_artifacts
   where attempt_id=(select (payload->>'attemptId')::uuid from cleanup_context where key='claim-1')
     and state='cleanup_pending'),
  3::bigint,'all failed-attempt opaque artifacts become cleanup eligible'
);
select is(
  (select state from private.media_scan_artifacts
   where job_id=(select id from private.media_scan_jobs where upload_id=(select (payload->>'uploadId')::uuid from cleanup_context where key='ticket'))
     and kind='quarantine'),
  'source','retryable work preserves quarantine input'
);

-- The retry is independent while one old artifact is token-leased for cleanup.
update private.media_scan_jobs set retry_at=clock_timestamp()-interval '1 second'
where upload_id=(select (payload->>'uploadId')::uuid from cleanup_context where key='ticket');
set local role service_role;
insert into cleanup_context(key,payload)
select 'claim-2',public.claim_media_scan_job(
  'scanner-cleanup',gen_random_uuid(),
  encode(extensions.digest((select token::text from cleanup_context where key='attempt-2'),'sha256'),'hex'),
  clock_timestamp(),86400
);
insert into cleanup_context(key,payload)
select 'cleanup-claim-1',public.claim_media_scan_artifact_cleanup(
  'cleanup-worker',gen_random_uuid(),
  encode(extensions.digest((select token::text from cleanup_context where key='cleanup-1'),'sha256'),'hex')
);
reset role;
select is((select payload->>'kind' from cleanup_context where key='cleanup-claim-1'),'scan_input','cleanup claims one oldest artifact only');
select is((select payload->>'path' from cleanup_context where key='cleanup-claim-1'),(select payload->>'inputPath' from cleanup_context where key='claim-1'),'cleanup is bound to the stale attempt path');
select isnt((select payload->>'path' from cleanup_context where key='cleanup-claim-1'),(select payload->>'inputPath' from cleanup_context where key='claim-2'),'cleanup cannot target the active retry input');
select is(
  (select state from private.media_scan_artifacts where id=(select (payload->>'artifactId')::uuid from cleanup_context where key='cleanup-claim-1')),
  'cleanup_claimed','the artifact has an explicit cleanup lease'
);
select is(
  (select count(*) from private.media_scan_artifacts where state='cleanup_claimed'),
  1::bigint,'one cleanup claim never batches unrelated artifacts'
);

update private.media_scan_artifacts set cleanup_lease_expires_at=clock_timestamp()-interval '1 second'
where id=(select (payload->>'artifactId')::uuid from cleanup_context where key='cleanup-claim-1');
set local role service_role;
select throws_ok(format('select public.fail_media_scan_artifact_cleanup(%L,%L,%L,%L,%L)',
  (select payload->>'artifactId' from cleanup_context where key='cleanup-claim-1'),
  (select token from cleanup_context where key='cleanup-1'),'cleanup-worker',gen_random_uuid(),'storage_unavailable'),
  'ARTIFACT_CLEANUP_LEASE_EXPIRED','expired cleanup worker cannot mutate artifact failure state');
reset role;
update private.media_scan_artifacts set cleanup_lease_expires_at=clock_timestamp()+interval '5 minutes'
where id=(select (payload->>'artifactId')::uuid from cleanup_context where key='cleanup-claim-1');

insert into cleanup_context(key,token) values('cleanup-op',gen_random_uuid());
set local role service_role;
insert into cleanup_context(key,payload)
select 'cleanup-complete',public.complete_media_scan_artifact_cleanup(
  (select (payload->>'artifactId')::uuid from cleanup_context where key='cleanup-claim-1'),
  (select token from cleanup_context where key='cleanup-1'),'cleanup-worker',
  (select token from cleanup_context where key='cleanup-op')
);
select is(
  public.complete_media_scan_artifact_cleanup(
    (select (payload->>'artifactId')::uuid from cleanup_context where key='cleanup-claim-1'),
    (select token from cleanup_context where key='cleanup-1'),'cleanup-worker',
    (select token from cleanup_context where key='cleanup-op')
  ),
  (select payload from cleanup_context where key='cleanup-complete'),
  'cleanup response-loss replay is exact and idempotent'
);
reset role;
select is((select payload->>'status' from cleanup_context where key='cleanup-complete'),'deleted','claimed artifact deletion is recorded');
select is(
  (select count(*) from private.media_scan_events where action='complete_cleanup'
   and attempt_id=(select (payload->>'attemptId')::uuid from cleanup_context where key='claim-1')),
  1::bigint,'cleanup replay appends one audit event'
);

-- A retained final object can never enter the cleanup queue.
update private.media_scan_artifacts set state='retained'
where attempt_id=(select (payload->>'attemptId')::uuid from cleanup_context where key='claim-1') and kind='final_candidate';
update private.media_scan_artifacts set state='deleted',deleted_at=clock_timestamp()
where attempt_id=(select (payload->>'attemptId')::uuid from cleanup_context where key='claim-1') and state='cleanup_pending';
set local role service_role;
select is(
  public.claim_media_scan_artifact_cleanup('cleanup-worker',gen_random_uuid(),repeat('9',64)),
  null::jsonb,'retained final and active-attempt artifacts are not cleanup claimable'
);
reset role;

-- Scanner-independent aging must make every inactive private media artifact cleanup-eligible at
-- 24 hours, while preserving the current attempt and retained clean output.
set local role authenticated;
select set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000001',true);
insert into cleanup_context(key,payload)
values('stale-ticket',public.create_unbound_file_upload('request_media','stale.png','image/png',4096));
insert into storage.objects(bucket_id,name,owner_id,metadata)
select payload->>'bucket',payload->>'path','b2000000-0000-4000-8000-000000000001',
  jsonb_build_object('mimetype','image/png','size',4096)
from cleanup_context where key='stale-ticket';
select public.start_or_get_media_scan(
  (select (payload->>'uploadId')::uuid from cleanup_context where key='stale-ticket'),
  gen_random_uuid()
);
reset role;
insert into cleanup_context(key,token) values
  ('stale-attempt-token',gen_random_uuid()),('stale-cleanup-token',gen_random_uuid());
set local role service_role;
insert into cleanup_context(key,payload)
select 'stale-claim',public.claim_media_scan_job(
  'scanner-cleanup',gen_random_uuid(),
  encode(extensions.digest((select token::text from cleanup_context where key='stale-attempt-token'),'sha256'),'hex'),
  clock_timestamp(),86400
);
reset role;

update private.media_scan_attempts set state='expired',updated_at=clock_timestamp()-interval '25 hours'
where id=(select (payload->>'attemptId')::uuid from cleanup_context where key='stale-claim');
update private.media_scan_jobs set state='retryable_failure',current_attempt_id=null,
  retry_at=clock_timestamp()+interval '1 hour',updated_at=clock_timestamp()-interval '25 hours'
where id=(select id from private.media_scan_jobs
  where upload_id=(select (payload->>'uploadId')::uuid from cleanup_context where key='stale-ticket'));
update private.media_scan_artifacts set
  state=case kind
    when 'quarantine' then 'source'
    when 'scan_input' then 'pending'
    when 'scan_output' then 'attested'
    when 'final_candidate' then 'promotion_pending'
  end,
  created_at=clock_timestamp()-interval '25 hours',
  updated_at=clock_timestamp()-interval '25 hours'
where job_id=(select id from private.media_scan_jobs
  where upload_id=(select (payload->>'uploadId')::uuid from cleanup_context where key='stale-ticket'));

set local role service_role;
insert into cleanup_context(key,payload)
select 'stale-cleanup-claim',public.claim_media_scan_artifact_cleanup(
  'cleanup-worker',gen_random_uuid(),
  encode(extensions.digest((select token::text from cleanup_context where key='stale-cleanup-token'),'sha256'),'hex')
);
reset role;
select is(
  (select count(*) from private.media_scan_artifacts
   where job_id=(select id from private.media_scan_jobs
     where upload_id=(select (payload->>'uploadId')::uuid from cleanup_context where key='stale-ticket'))
     and state in ('cleanup_pending','cleanup_claimed')),
  4::bigint,'25-hour inactive quarantine/input/output/final candidate age without a scanner claim'
);
select is(
  (select count(*) from private.media_scan_artifacts
   where attempt_id=(select (payload->>'attemptId')::uuid from cleanup_context where key='claim-2')
     and state in ('cleanup_pending','cleanup_claimed','cleanup_failed','cleanup_dead_letter')),
  0::bigint,'active current-attempt artifacts never age into cleanup'
);
select is(
  (select count(*) from private.media_scan_artifacts where state='retained'),
  1::bigint,'retained clean output remains outside autonomous aging'
);

-- Scanner outage cannot extend retention: an expired current attempt may leave the job in
-- scanning, but its quarantine/input/output/final artifacts must still age without another claim.
set local role authenticated;
select set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000001',true);
insert into cleanup_context(key,payload)
values('outage-ticket',public.create_unbound_file_upload('request_media','outage.png','image/png',4096));
insert into storage.objects(bucket_id,name,owner_id,metadata)
select payload->>'bucket',payload->>'path','b2000000-0000-4000-8000-000000000001',
  jsonb_build_object('mimetype','image/png','size',4096)
from cleanup_context where key='outage-ticket';
select public.start_or_get_media_scan(
  (select (payload->>'uploadId')::uuid from cleanup_context where key='outage-ticket'),
  gen_random_uuid()
);
reset role;
insert into cleanup_context(key,token) values('outage-attempt-token',gen_random_uuid());
set local role service_role;
insert into cleanup_context(key,payload)
select 'outage-claim',public.claim_media_scan_job(
  'scanner-cleanup',gen_random_uuid(),
  encode(extensions.digest((select token::text from cleanup_context where key='outage-attempt-token'),'sha256'),'hex'),
  clock_timestamp(),86400
);
reset role;

update private.media_scan_attempts set
  claimed_at=aged.processing_deadline-interval '120 seconds',
  processing_deadline=aged.processing_deadline,
  heartbeat_at=aged.processing_deadline,
  updated_at=aged.processing_deadline
from (select clock_timestamp()-interval '25 hours' as processing_deadline) aged
where id=(select (payload->>'attemptId')::uuid from cleanup_context where key='outage-claim');
update private.media_scan_jobs set updated_at=clock_timestamp()-interval '25 hours'
where upload_id=(select (payload->>'uploadId')::uuid from cleanup_context where key='outage-ticket');
update private.media_scan_artifacts set
  state=case kind
    when 'quarantine' then 'source'
    when 'scan_input' then 'pending'
    when 'scan_output' then 'attested'
    when 'final_candidate' then 'promotion_pending'
  end,
  created_at=clock_timestamp()-interval '25 hours',
  updated_at=clock_timestamp()-interval '25 hours'
where job_id=(select id from private.media_scan_jobs
  where upload_id=(select (payload->>'uploadId')::uuid from cleanup_context where key='outage-ticket'));

select is(
  (select state from private.media_scan_jobs
   where upload_id=(select (payload->>'uploadId')::uuid from cleanup_context where key='outage-ticket')),
  'scanning','outage regression retains the unreconciled scanning state before cleanup'
);
set local role service_role;
select public.claim_media_scan_artifact_cleanup('cleanup-worker',gen_random_uuid(),repeat('6',64));
reset role;
select is(
  (select count(*) from private.media_scan_artifacts
   where job_id=(select id from private.media_scan_jobs
     where upload_id=(select (payload->>'uploadId')::uuid from cleanup_context where key='outage-ticket'))
     and state in ('cleanup_pending','cleanup_claimed')),
  4::bigint,'25-hour expired current-attempt artifacts age during a scanner outage'
);

-- A terminal attempt-20 row is dead-lettered before selection and cannot starve the next artifact.
insert into cleanup_context(key,payload)
select 'jammed-artifact',jsonb_build_object('artifactId',id)
from private.media_scan_artifacts
where job_id=(select id from private.media_scan_jobs
  where upload_id=(select (payload->>'uploadId')::uuid from cleanup_context where key='stale-ticket'))
  and state='cleanup_pending'
order by created_at,id limit 1;
update private.media_scan_artifacts set state='cleanup_failed',cleanup_attempts=20,
  cleanup_retry_at=clock_timestamp()-interval '1 second',
  created_at=clock_timestamp()-interval '26 hours'
where id=(select (payload->>'artifactId')::uuid from cleanup_context where key='jammed-artifact');
set local role service_role;
insert into cleanup_context(key,payload)
select 'after-jam-claim',public.claim_media_scan_artifact_cleanup(
  'cleanup-worker',gen_random_uuid(),repeat('8',64)
);
reset role;
select is(
  (select state from private.media_scan_artifacts
   where id=(select (payload->>'artifactId')::uuid from cleanup_context where key='jammed-artifact')),
  'cleanup_dead_letter','attempt-20 cleanup failure transitions to terminal dead letter'
);
select isnt(
  (select payload->>'artifactId' from cleanup_context where key='after-jam-claim'),
  (select payload->>'artifactId' from cleanup_context where key='jammed-artifact'),
  'dead-letter artifact cannot be reselected or block later cleanup work'
);

-- A transient Storage failure is deferred instead of consuming every retry in one worker run.
insert into cleanup_context(key,token) values
  ('backoff-cleanup-token',gen_random_uuid()),
  ('backoff-next-token',gen_random_uuid());
set local role service_role;
insert into cleanup_context(key,payload)
select 'backoff-claim',public.claim_media_scan_artifact_cleanup(
  'cleanup-worker',gen_random_uuid(),
  encode(extensions.digest((select token::text from cleanup_context where key='backoff-cleanup-token'),'sha256'),'hex')
);
select public.fail_media_scan_artifact_cleanup(
  (select (payload->>'artifactId')::uuid from cleanup_context where key='backoff-claim'),
  (select token from cleanup_context where key='backoff-cleanup-token'),
  'cleanup-worker',gen_random_uuid(),'storage_unavailable'
);
insert into cleanup_context(key,payload)
select 'backoff-next-claim',public.claim_media_scan_artifact_cleanup(
  'cleanup-worker',gen_random_uuid(),
  encode(extensions.digest((select token::text from cleanup_context where key='backoff-next-token'),'sha256'),'hex')
);
reset role;
select cmp_ok(
  (select cleanup_retry_at from private.media_scan_artifacts
   where id=(select (payload->>'artifactId')::uuid from cleanup_context where key='backoff-claim')),
  '>',clock_timestamp(),'failed cleanup receives a future retry boundary'
);
select isnt(
  (select payload->>'artifactId' from cleanup_context where key='backoff-next-claim'),
  (select payload->>'artifactId' from cleanup_context where key='backoff-claim'),
  'one transient failure cannot be reclaimed in the same worker invocation'
);

-- Expired request and attestation nonce ledgers are cleanup-eligible through one service RPC.
insert into private.media_scanner_nonces(nonce,worker_id,action,request_timestamp,body_sha256,operation_id,consumed_at,expires_at)
values(gen_random_uuid(),'scanner-cleanup','claim',extract(epoch from clock_timestamp())::bigint,repeat('7',64),gen_random_uuid(),
  clock_timestamp()-interval '25 hours',clock_timestamp()-interval '24 hours');
set local role service_role;
select cmp_ok(
  (public.cleanup_expired_media_scanner_nonces(gen_random_uuid())->>'deleted')::integer,
  '>=',1,'expired scanner nonce records are removed independently of scanner activity'
);
reset role;

select * from finish();
rollback;
