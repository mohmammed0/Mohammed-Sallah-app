begin;
select no_plan();

create function pg_temp.media_scan_deadline_is_open(
  p_at_time timestamptz,
  p_deadline timestamptz
) returns boolean
language plpgsql as $$
declare result boolean;
begin
  execute 'select private.media_scan_deadline_is_open($1,$2)'
    into result using p_at_time,p_deadline;
  return result;
exception when undefined_function then
  return null;
end
$$;

select is(
  pg_temp.media_scan_deadline_is_open('2026-08-21T12:02:00Z','2026-08-21T12:02:00Z'),
  false,
  'a scanner callback is invalid at exact deadline equality'
);
select is(
  pg_temp.media_scan_deadline_is_open('2026-08-21T12:01:59.999999Z','2026-08-21T12:02:00Z'),
  true,
  'a scanner callback remains valid strictly before its deadline'
);

select has_table('private','media_scan_jobs','scan jobs are private');
select has_table('private','media_scan_attempts','scan attempts are private');
select has_table('private','media_scan_artifacts','scan artifacts are private');
select has_table('private','media_scan_attestations','scanner attestations are private');
select has_table('private','media_scan_events','scanner events are private');
select has_table('private','media_scanner_nonces','scanner HMAC nonces are private');
select has_table('private','media_scanner_attestation_nonces','scanner attestation nonces are private');
select ok((select relrowsecurity from pg_class where oid='private.media_scan_jobs'::regclass),'private scan jobs use RLS defense in depth');
select ok((select relrowsecurity from pg_class where oid='private.media_scan_attempts'::regclass),'private scan attempts use RLS defense in depth');
select ok((select relrowsecurity from pg_class where oid='private.media_scan_artifacts'::regclass),'private scan artifacts use RLS defense in depth');
select is((select public from storage.buckets where id='quarantine'),false,'quarantine remains private');
select is((select public from storage.buckets where id='scan-input'),false,'scan input is private');
select is((select public from storage.buckets where id='scan-output'),false,'scan output is private');

select function_privs_are('public','start_or_get_media_scan',array['uuid','uuid'],'authenticated',array['EXECUTE'],'owner queue mutation requires an operation ID');
select hasnt_function('public','start_or_get_media_scan',array['uuid'],'owner queue mutation has no receipt-less overload');
select function_privs_are('public','get_my_file_upload_status',array['uuid'],'authenticated',array['EXECUTE'],'safe owner status is exposed');
select ok(
  not has_function_privilege(
    'authenticated',
    'private.media_scan_adopt_untracked_upload(public.file_uploads,timestamp with time zone)',
    'EXECUTE'
  ),
  'upload owners cannot invoke terminal adoption directly'
);
select function_privs_are('public','claim_media_scan_job',array['text','uuid','text','timestamp with time zone','integer'],'service_role',array['EXECUTE'],'only scanner control may claim');
select function_privs_are('public','get_media_scan_attempt_status',array['uuid','uuid'],'service_role',array['EXECUTE'],'only scanner control may reconcile an attempt');
select function_privs_are('public','get_media_scan_attempt_status',array['uuid','uuid'],'authenticated',array[]::text[],'owners cannot read the trusted reconciliation receipt');
select function_privs_are('public','consume_media_scanner_nonce',array['text','text','uuid','bigint','text','uuid'],'service_role',array['EXECUTE'],'only scanner control may consume an identity-bound request nonce');
select hasnt_function('public','complete_file_upload_v2',array['uuid','uuid','uuid','text','text','bigint','text','text','text','boolean','text','text','text','text'],'old synchronous completion is absent from the final migration');
select function_privs_are('public','claim_file_upload',array['uuid','uuid'],'service_role',array[]::text[],'old synchronous claim is revoked');
select ok(not has_table_privilege('authenticated','private.media_scan_jobs','SELECT'),'owner has no private-job table grant');
select ok(not has_table_privilege('service_role','private.media_scan_jobs','SELECT'),'service role has no private-job table grant');
select ok(not has_table_privilege('authenticated','private.media_scan_attestations','SELECT'),'owner has no attestation table grant');
select ok(not has_table_privilege('service_role','private.media_scan_attestations','SELECT'),'service role has no attestation table grant');
select ok(not has_table_privilege('authenticated','private.media_scanner_attestation_nonces','SELECT'),'owner has no attestation nonce table grant');
select ok(not exists(
  select 1 from information_schema.role_table_grants
  where table_schema='private'
    and table_name in (
      'media_scan_jobs','media_scan_attempts','media_scan_artifacts','media_scan_attestations',
      'media_scan_events','media_scanner_nonces','media_scanner_attestation_nonces'
    )
    and grantee in ('PUBLIC','anon','authenticated','service_role')
),'no scanner role has any direct private-table grant');
select ok(not has_table_privilege('authenticated','public.file_uploads','SELECT'),'owner cannot read the operational upload ledger');
select ok(not has_table_privilege('authenticated','public.upload_security_events','SELECT'),'owner cannot read operational event rows');

insert into auth.users(
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
  ('b1000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','scan-owner@test.invalid',crypt(gen_random_uuid()::text,gen_salt('bf')),now(),'{}','{}',now(),now()),
  ('b1000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','scan-outsider@test.invalid',crypt(gen_random_uuid()::text,gen_salt('bf')),now(),'{}','{}',now(),now());

create temp table scan_test_context(key text primary key,payload jsonb,token uuid);
grant select,insert,update,delete on scan_test_context to authenticated,service_role;
insert into scan_test_context(key,token) values('start-op',gen_random_uuid());

set local role authenticated;
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000001',true);
insert into scan_test_context(key,payload)
values('ticket',public.create_unbound_file_upload('provider_document','photo.png','image/png',20971520));
insert into storage.objects(bucket_id,name,owner_id,metadata)
select payload->>'bucket',payload->>'path','b1000000-0000-4000-8000-000000000001',
  jsonb_build_object('mimetype','image/png','size',20971520)
from scan_test_context where key='ticket';
insert into scan_test_context(key,payload)
select 'start-1',public.start_or_get_media_scan(
  (select (payload->>'uploadId')::uuid from scan_test_context where key='ticket'),
  (select token from scan_test_context where key='start-op')
);
select is((select payload->>'status' from scan_test_context where key='start-1'),'queued','first authorized call queues the job');
select is(public.start_or_get_media_scan(
  (select (payload->>'uploadId')::uuid from scan_test_context where key='ticket'),
  (select token from scan_test_context where key='start-op')
),(select payload from scan_test_context where key='start-1'),'lost first response replays the exact caller receipt');
insert into scan_test_context(key,payload)
values('other-ticket',public.create_unbound_file_upload('provider_document','other.png','image/png',4096));
insert into storage.objects(bucket_id,name,owner_id,metadata)
select payload->>'bucket',payload->>'path','b1000000-0000-4000-8000-000000000001',
  jsonb_build_object('mimetype','image/png','size',4096)
from scan_test_context where key='other-ticket';
insert into scan_test_context(key,payload)
values('missing-object-ticket',public.create_unbound_file_upload('request_media','missing.png','image/png',4096));
select throws_ok(
  format('select public.start_or_get_media_scan(%L,%L)',
    (select payload->>'uploadId' from scan_test_context where key='missing-object-ticket'),
    gen_random_uuid()),
  'QUARANTINE_UPLOAD_INCOMPLETE',
  'a ticket with no exact quarantine object cannot queue scanner work'
);
select throws_ok(format('select public.start_or_get_media_scan(%L,%L)',
  (select payload->>'uploadId' from scan_test_context where key='other-ticket'),
  (select token from scan_test_context where key='start-op')),
  'OPERATION_REPLAY_MISMATCH','changed upload reuse of a queue operation fails closed');
select is(
  (select array_agg(key order by key) from jsonb_object_keys(public.get_my_file_upload_status((select (payload->>'uploadId')::uuid from scan_test_context where key='ticket'))) key),
  array['createdAt','mimeType','retryAt','sanitized','sizeBytes','status','terminalCategory','updatedAt','uploadId'],
  'owner projection is an exact safe allowlist'
);
select throws_ok($$select count(*) from private.media_scan_jobs$$,'42501',null,'owner cannot query private jobs');
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000002',true);
select throws_ok(
  format('select public.get_my_file_upload_status(%L)',(select payload->>'uploadId' from scan_test_context where key='ticket')),
  'UPLOAD_NOT_FOUND','an unrelated owner cannot read safe status'
);
reset role;

-- A D1 terminal upload may still have its quarantine object when M2 is
-- applied. An owner start must adopt the old outcome for cleanup only; it must
-- never revive clean/rejected evidence or create a scanner attempt. Expired
-- pre-start tickets must likewise become a replayable terminal result.
set local role authenticated;
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000001',true);
insert into scan_test_context(key,payload) values
  ('d1-clean-ticket',public.create_unbound_file_upload(
    'request_media','d1-clean.png','image/png',4096
  )),
  ('d1-rejected-ticket',public.create_unbound_file_upload(
    'request_media','d1-rejected.png','image/png',4096
  )),
  ('expired-unstarted-ticket',public.create_unbound_file_upload(
    'request_media','expired-unstarted.png','image/png',4096
  ));
insert into storage.objects(bucket_id,name,owner_id,metadata)
select payload->>'bucket',payload->>'path','b1000000-0000-4000-8000-000000000001',
  jsonb_build_object('mimetype','image/png','size',4096)
from scan_test_context
where key in ('d1-clean-ticket','d1-rejected-ticket','expired-unstarted-ticket');
reset role;
update public.file_uploads set
  status='clean',detected_mime_type='image/png',sanitized=true,
  scanned_at=clock_timestamp()
where id=(select (payload->>'uploadId')::uuid from scan_test_context where key='d1-clean-ticket');
update public.file_uploads set status='rejected',failure_category='malicious'
where id=(select (payload->>'uploadId')::uuid from scan_test_context where key='d1-rejected-ticket');
update public.file_uploads set
  created_at=clock_timestamp()-interval '25 hours',
  expires_at=clock_timestamp()-interval '1 hour'
where id=(
  select (payload->>'uploadId')::uuid from scan_test_context where key='expired-unstarted-ticket'
);
set local role authenticated;
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000001',true);
insert into scan_test_context(key,payload)
select 'd1-clean-start',public.start_or_get_media_scan(
  (select (payload->>'uploadId')::uuid from scan_test_context where key='d1-clean-ticket'),
  gen_random_uuid()
);
insert into scan_test_context(key,payload)
select 'd1-rejected-start',public.start_or_get_media_scan(
  (select (payload->>'uploadId')::uuid from scan_test_context where key='d1-rejected-ticket'),
  gen_random_uuid()
);
select lives_ok(
  format(
    'insert into scan_test_context(key,payload) select %L,public.start_or_get_media_scan(%L,%L)',
    'expired-unstarted-start',
    (select payload->>'uploadId' from scan_test_context where key='expired-unstarted-ticket'),
    gen_random_uuid()
  ),
  'an expired unstarted upload becomes a replayable terminal result'
);
reset role;
select is(
  (select payload->>'status' from scan_test_context where key='d1-clean-start'),
  'clean','an owner start preserves a D1 clean outcome'
);
select is(
  (select payload->>'status' from scan_test_context where key='d1-rejected-start'),
  'rejected','an owner start preserves a D1 rejected outcome'
);
select is(
  (select payload->>'status' from scan_test_context where key='expired-unstarted-start'),
  'terminal_failure','an expired unstarted upload closes terminally without a scan'
);
select is(
  (select payload->>'terminalCategory' from scan_test_context where key='expired-unstarted-start'),
  'upload_expired','the expired owner response exposes only the safe terminal category'
);
select results_eq(
  $$
    select f.status::text,j.state::text,count(a.id)::bigint,artifact.state::text
    from public.file_uploads f
    join private.media_scan_jobs j on j.upload_id=f.id
    left join private.media_scan_attempts a on a.job_id=j.id
    join private.media_scan_artifacts artifact
      on artifact.job_id=j.id and artifact.kind='quarantine'
    where f.id=(select (payload->>'uploadId')::uuid
      from scan_test_context where key='d1-clean-ticket')
    group by f.status,j.state,artifact.state
  $$,
  $$values ('clean'::text,'clean'::text,0::bigint,'cleanup_pending'::text)$$,
  'D1 clean adoption creates cleanup authority but no scanner attempt'
);
select results_eq(
  $$
    select f.status::text,j.state::text,count(a.id)::bigint,artifact.state::text
    from public.file_uploads f
    join private.media_scan_jobs j on j.upload_id=f.id
    left join private.media_scan_attempts a on a.job_id=j.id
    join private.media_scan_artifacts artifact
      on artifact.job_id=j.id and artifact.kind='quarantine'
    where f.id=(select (payload->>'uploadId')::uuid
      from scan_test_context where key='d1-rejected-ticket')
    group by f.status,j.state,artifact.state
  $$,
  $$values ('rejected'::text,'rejected'::text,0::bigint,'cleanup_pending'::text)$$,
  'D1 rejected adoption cannot revive content or create a scanner attempt'
);
select results_eq(
  $$
    select f.status::text,j.state::text,count(a.id)::bigint,artifact.state::text
    from public.file_uploads f
    join private.media_scan_jobs j on j.upload_id=f.id
    left join private.media_scan_attempts a on a.job_id=j.id
    join private.media_scan_artifacts artifact
      on artifact.job_id=j.id and artifact.kind='quarantine'
    where f.id=(select (payload->>'uploadId')::uuid
      from scan_test_context where key='expired-unstarted-ticket')
    group by f.status,j.state,artifact.state
  $$,
  $$values ('expired'::text,'terminal_failure'::text,0::bigint,'cleanup_pending'::text)$$,
  'expired pre-start adoption closes the journal and queues cleanup without scanning'
);

insert into scan_test_context(key,token) values('attempt-1',gen_random_uuid());
set local role service_role;
select throws_ok(
  $$select public.claim_media_scan_job('scanner-future-one',gen_random_uuid(),repeat('b',64),clock_timestamp()+interval '1 second',86400)$$,
  'SCANNER_SIGNATURE_STALE','a signature timestamp one second in the future cannot claim work'
);
select throws_ok(
  $$select public.claim_media_scan_job('scanner-future-twenty',gen_random_uuid(),repeat('c',64),clock_timestamp()+interval '20 seconds',86400)$$,
  'SCANNER_SIGNATURE_STALE','a signature timestamp twenty seconds in the future cannot claim work'
);
reset role;
select is((select count(*) from private.media_scan_attempts),0::bigint,'future signature evidence creates no attempt');
select ok(
  regexp_replace(
    pg_get_functiondef('public.claim_media_scan_job(text,uuid,text,timestamp with time zone,integer)'::regprocedure),
    '\s+','','g'
  ) like '%p_signature_timestamp>request_time%'
  and regexp_replace(
    pg_get_functiondef('public.claim_media_scan_job(text,uuid,text,timestamp with time zone,integer)'::regprocedure),
    '\s+','','g'
  ) not like '%p_signature_timestamp>request_time+interval%',
  'pre-lock signature freshness permits no positive clock skew'
);
select ok(
  regexp_replace(
    pg_get_functiondef('public.claim_media_scan_job(text,uuid,text,timestamp with time zone,integer)'::regprocedure),
    '\s+','','g'
  ) like '%p_signature_timestamp>at_time%'
  and regexp_replace(
    pg_get_functiondef('public.claim_media_scan_job(text,uuid,text,timestamp with time zone,integer)'::regprocedure),
    '\s+','','g'
  ) not like '%p_signature_timestamp>at_time+interval%',
  'post-lock authoritative signature freshness permits no positive clock skew'
);
set local role service_role;
insert into scan_test_context(key,payload)
select 'claim-1',public.claim_media_scan_job(
  'scanner-a',gen_random_uuid(),
  encode(extensions.digest((select token::text from scan_test_context where key='attempt-1'),'sha256'),'hex'),
  clock_timestamp(),86400
);
reset role;
select is((select payload->>'status' from scan_test_context where key='claim-1'),'scanning','queued work is claimed');
select ok((select (payload->>'processingDeadline')::timestamptz-(payload->>'claimedAt')::timestamptz=interval '120 seconds' from scan_test_context where key='claim-1'),'deadline is exactly 120 seconds');
select ok((select (payload->>'leaseExpiresAt')::timestamptz=(payload->>'processingDeadline')::timestamptz from scan_test_context where key='claim-1'),'lease has no conflicting hierarchy');
select ok((select payload->>'inputPath' ~ '^[0-9a-f]{2}/[0-9a-f]{2}/[0-9a-f-]{36}$' from scan_test_context where key='claim-1'),'input path is opaque');
select ok((select payload->>'outputPath' ~ '^[0-9a-f]{2}/[0-9a-f]{2}/[0-9a-f-]{36}$' from scan_test_context where key='claim-1'),'output path is opaque');
select ok((select payload->>'finalPath' ~ '^clean/[0-9a-f]{2}/[0-9a-f]{2}/[0-9a-f-]{36}$' from scan_test_context where key='claim-1'),'final path is opaque');
select ok((select (payload->>'inputPath') !~ 'b1000000|request|photo|upload' and (payload->>'outputPath') !~ 'b1000000|request|photo|upload' and (payload->>'finalPath') !~ 'b1000000|request|photo|upload' from scan_test_context where key='claim-1'),'scanner paths disclose no identity or business context');
select ok((select attempt_token_hash=encode(extensions.digest((select token::text from scan_test_context where key='attempt-1'),'sha256'),'hex') from private.media_scan_attempts where id=(select (payload->>'attemptId')::uuid from scan_test_context where key='claim-1')),'only the caller-provided token hash is stored');

set local role service_role;
select is(public.claim_media_scan_job('scanner-b',gen_random_uuid(),repeat('a',64),clock_timestamp(),86400),null::jsonb,'a second worker cannot claim active work');
select lives_ok(format('select public.heartbeat_media_scan_attempt(%L,%L,%L)',(select payload->>'attemptId' from scan_test_context where key='claim-1'),(select token from scan_test_context where key='attempt-1'),gen_random_uuid()),'current heartbeat succeeds');
reset role;
select is((select processing_deadline-claimed_at from private.media_scan_attempts where id=(select (payload->>'attemptId')::uuid from scan_test_context where key='claim-1')),interval '120 seconds','heartbeat never extends the hard deadline');

insert into scan_test_context(key,token) values('prepare-op',gen_random_uuid());
set local role service_role;
insert into scan_test_context(key,payload)
select 'prepare-1',public.prepare_media_scan_output(
  (select (payload->>'attemptId')::uuid from scan_test_context where key='claim-1'),
  (select token from scan_test_context where key='attempt-1'),(select token from scan_test_context where key='prepare-op'),repeat('1',64),
  'image/png','image/png',20971520,1048576,repeat('2',64),repeat('3',64),
  'decode-reencode-png-v1','1.0.0'
);
select is((select payload->>'outputPath' from scan_test_context where key='prepare-1'),(select payload->>'outputPath' from scan_test_context where key='claim-1'),'output preparation binds the exact attempt path');
select is((select payload->>'purpose' from scan_test_context where key='prepare-1'),'provider_document','prepare receipt publishes the attempt-bound manifest purpose');
select is((select payload->>'jobDeadline' from scan_test_context where key='prepare-1'),(select payload->>'processingDeadline' from scan_test_context where key='claim-1'),'prepare receipt publishes the immutable manifest job deadline');
select is((select payload->>'detectedInputMime' from scan_test_context where key='prepare-1'),'image/png','prepare receipt publishes the detected input MIME contract');
select is((select payload->>'detectedOutputMime' from scan_test_context where key='prepare-1'),'image/png','prepare receipt publishes the detected output MIME contract');
select is(public.prepare_media_scan_output(
  (select (payload->>'attemptId')::uuid from scan_test_context where key='claim-1'),
  (select token from scan_test_context where key='attempt-1'),(select token from scan_test_context where key='prepare-op'),repeat('1',64),
  'image/png','image/png',20971520,1048576,repeat('2',64),repeat('3',64),
  'decode-reencode-png-v1','1.0.0'
),(select payload from scan_test_context where key='prepare-1'),'response-loss replay reconstructs the prepared output contract');
select lives_ok(format('select public.authorize_media_scan_readback(%L,%L,%L,1048576,%L)',(select payload->>'attemptId' from scan_test_context where key='claim-1'),(select token from scan_test_context where key='attempt-1'),gen_random_uuid(),repeat('3',64)),'readback requires exact prepared metadata');

insert into scan_test_context(key,payload)
select 'manifest-1',jsonb_build_object(
  'schemaVersion','sallah-media-attestation-v1','attemptId',(select payload->>'attemptId' from scan_test_context where key='claim-1'),
  'inputRef',(select payload->>'inputPath' from scan_test_context where key='claim-1'),
  'outputRef',(select payload->>'outputPath' from scan_test_context where key='claim-1'),
  'purpose','provider_document','detectedInputMime','image/png','detectedOutputMime','image/png',
  'inputSize',20971520,'outputSize',1048576,
  'inputSha256',repeat('2',64),'outputSha256',repeat('3',64),'readbackSha256',repeat('3',64),
  'storageFingerprint',repeat('a',32),
  'originalScan','clean','finalScan','clean','sanitized',true,'sanitizer','decode-reencode-png-v1','sanitizerVersion','1.0.0',
  'clamavEngineVersion','1.4.3','signatureVersion','28094','signatureTimestamp',(clock_timestamp()-interval '1 minute'),
  'signatureAgeSeconds',60,'processingDurationMs',1200,
  'jobDeadline',(select payload->>'processingDeadline' from scan_test_context where key='claim-1'),
  'nonce',gen_random_uuid(),'correlationId',gen_random_uuid()
);
select throws_ok(
  format('select public.record_media_scan_attestation(%L,%L,%L,%L,%L::jsonb)',
    (select payload->>'attemptId' from scan_test_context where key='claim-1'),
    (select token from scan_test_context where key='attempt-1'),gen_random_uuid(),repeat('9',64),
    (select payload-'purpose' from scan_test_context where key='manifest-1')),
  'INVALID_ATTESTATION','attestation purpose is mandatory and attempt-bound'
);
insert into scan_test_context(key,payload)
select 'attest-1',public.record_media_scan_attestation(
  (select (payload->>'attemptId')::uuid from scan_test_context where key='claim-1'),
  (select token from scan_test_context where key='attempt-1'),gen_random_uuid(),repeat('4',64),
  (select payload from scan_test_context where key='manifest-1')
);
insert into scan_test_context(key,payload)
select 'status-attested',public.get_media_scan_attempt_status(
  (select (payload->>'attemptId')::uuid from scan_test_context where key='claim-1'),
  (select token from scan_test_context where key='attempt-1')
);
select is(
  (select array_agg(key order by key) from jsonb_object_keys((select payload from scan_test_context where key='status-attested')) key),
  array[
    'attemptId','attemptState','claimedAt','current','declaredMimeType','detectedInputMime',
    'detectedOutputMime','finalArtifactState','finalBucket','finalizationDeadline','finalPath',
    'inputArtifactState','inputBucket','inputPath','inputSha256','inputSize','jobId','jobState',
    'manifestFingerprint','outputArtifactState','outputBucket','outputPath','outputSha256','outputSize',
    'processingDeadline','purpose','sanitizer','sanitizerVersion'
    ,'workerId'
  ],
  'trusted attempt status is an exact authoritative reconciliation receipt'
);
select is(
  (select payload->>'workerId' from scan_test_context where key='status-attested'),
  'scanner-a','trusted attempt status binds the claimed scanner identity'
);
select is(
  (select payload->>'finalPath' from scan_test_context where key='status-attested'),
  (select payload->>'finalPath' from scan_test_context where key='claim-1'),
  'response-loss recovery reconstructs the database-selected final candidate'
);
select is(
  public.get_media_scan_attempt_status(
    (select (payload->>'attemptId')::uuid from scan_test_context where key='claim-1'),
    (select token from scan_test_context where key='attempt-1')
  ),
  (select payload from scan_test_context where key='status-attested'),
  'repeated status reconstructs the same authoritative attested receipt'
);
reset role;
select is((select finalization_deadline-processing_deadline from private.media_scan_attempts where id=(select (payload->>'attemptId')::uuid from scan_test_context where key='claim-1')),interval '15 seconds','timely attestation gets a fixed 15-second finalization margin');

insert into scan_test_context(key,token) values('finalize-op',gen_random_uuid());
set local role service_role;
insert into scan_test_context(key,payload)
select 'complete-1',public.finalize_media_scan_job((select (payload->>'attemptId')::uuid from scan_test_context where key='claim-1'),(select token from scan_test_context where key='attempt-1'),(select token from scan_test_context where key='finalize-op'),repeat('4',64));
select is(public.finalize_media_scan_job((select (payload->>'attemptId')::uuid from scan_test_context where key='claim-1'),(select token from scan_test_context where key='attempt-1'),(select token from scan_test_context where key='finalize-op'),repeat('4',64)),(select payload from scan_test_context where key='complete-1'),'response-loss replay reconstructs clean result');
insert into scan_test_context(key,payload)
select 'status-completed',public.get_media_scan_attempt_status(
  (select (payload->>'attemptId')::uuid from scan_test_context where key='claim-1'),
  (select token from scan_test_context where key='attempt-1')
);
reset role;
select is((select payload->>'jobState' from scan_test_context where key='status-completed'),'clean','lost completion response reconstructs committed job state');
select is((select payload->>'attemptState' from scan_test_context where key='status-completed'),'completed','lost completion response reconstructs committed attempt state');
select is((select payload->>'finalArtifactState' from scan_test_context where key='status-completed'),'retained','lost completion response reconstructs retained final artifact');
select is((select count(*) from private.media_scan_events where action='finalize' and attempt_id=(select (payload->>'attemptId')::uuid from scan_test_context where key='claim-1')),1::bigint,'completion has one immutable audit event');
select is((select final_path from public.file_uploads where id=(select (payload->>'uploadId')::uuid from scan_test_context where key='ticket')),(select payload->>'finalPath' from scan_test_context where key='claim-1'),'winning opaque candidate becomes final path');
select is((select state from private.media_scan_artifacts where attempt_id=(select (payload->>'attemptId')::uuid from scan_test_context where key='claim-1') and kind='final_candidate'),'retained','winning final cannot be cleaned');

-- A nonce from one valid attestation cannot be replayed in a newly signed manifest for another
-- attempt, even though the control-request nonce and domain operation are fresh.
set local role authenticated;
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000001',true);
select public.start_or_get_media_scan(
  (select (payload->>'uploadId')::uuid from scan_test_context where key='other-ticket'),
  gen_random_uuid()
);
reset role;
insert into scan_test_context(key,token) values('attempt-nonce-replay',gen_random_uuid());
set local role service_role;
insert into scan_test_context(key,payload)
select 'claim-nonce-replay',public.claim_media_scan_job(
  'scanner-b',gen_random_uuid(),
  encode(extensions.digest((select token::text from scan_test_context where key='attempt-nonce-replay'),'sha256'),'hex'),
  clock_timestamp(),86400
);
select public.prepare_media_scan_output(
  (select (payload->>'attemptId')::uuid from scan_test_context where key='claim-nonce-replay'),
  (select token from scan_test_context where key='attempt-nonce-replay'),gen_random_uuid(),repeat('5',64),
  'image/png','image/png',4096,4096,repeat('6',64),repeat('7',64),
  'decode-reencode-png-v1','1.0.0'
);
select public.authorize_media_scan_readback(
  (select (payload->>'attemptId')::uuid from scan_test_context where key='claim-nonce-replay'),
  (select token from scan_test_context where key='attempt-nonce-replay'),gen_random_uuid(),4096,repeat('7',64)
);
insert into scan_test_context(key,payload)
select 'manifest-nonce-replay',(select payload from scan_test_context where key='manifest-1') || jsonb_build_object(
  'attemptId',(select payload->>'attemptId' from scan_test_context where key='claim-nonce-replay'),
  'inputRef',(select payload->>'inputPath' from scan_test_context where key='claim-nonce-replay'),
  'outputRef',(select payload->>'outputPath' from scan_test_context where key='claim-nonce-replay'),
  'inputSize',4096,'outputSize',4096,'inputSha256',repeat('6',64),
  'outputSha256',repeat('7',64),'readbackSha256',repeat('7',64),'storageFingerprint',repeat('b',32),
  'jobDeadline',(select payload->>'processingDeadline' from scan_test_context where key='claim-nonce-replay'),
  'correlationId',gen_random_uuid()
);
select throws_ok(
  format('select public.record_media_scan_attestation(%L,%L,%L,%L,%L::jsonb)',
    (select payload->>'attemptId' from scan_test_context where key='claim-nonce-replay'),
    (select token from scan_test_context where key='attempt-nonce-replay'),gen_random_uuid(),repeat('8',64),
    (select payload from scan_test_context where key='manifest-nonce-replay')),
  'SCANNER_ATTESTATION_NONCE_REPLAY',
  'attestation nonce replay is rejected across attempts with fresh request authentication'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000002',true);
select is(private.can_read_clean_storage_object(
  (select payload->>'finalBucket' from scan_test_context where key='claim-1'),
  (select payload->>'finalPath' from scan_test_context where key='claim-1'),
  'b1000000-0000-4000-8000-000000000002'
),false,'storage helper cannot be called as a cross-owner clean-path existence oracle');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000001',true);
select is(public.start_or_get_media_scan((select (payload->>'uploadId')::uuid from scan_test_context where key='ticket'),gen_random_uuid())->>'status','clean','clean status replay does not rescan');
reset role;
select is((select count(*) from private.media_scan_attempts where job_id=(select id from private.media_scan_jobs where upload_id=(select (payload->>'uploadId')::uuid from scan_test_context where key='ticket'))),1::bigint,'clean replay creates no attempt');

-- Terminal scanner failure and attempt exhaustion both release every
-- non-retained artifact, including the quarantine source.
set local role authenticated;
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000001',true);
insert into scan_test_context(key,payload) values('terminal-ticket',public.create_unbound_file_upload('request_media','terminal.png','image/png',4096));
insert into storage.objects(bucket_id,name,owner_id,metadata)
select payload->>'bucket',payload->>'path','b1000000-0000-4000-8000-000000000001',
  jsonb_build_object('mimetype','image/png','size',4096)
from scan_test_context where key='terminal-ticket';
select public.start_or_get_media_scan((select (payload->>'uploadId')::uuid from scan_test_context where key='terminal-ticket'),gen_random_uuid());
reset role;
insert into scan_test_context(key,token) values('terminal-token',gen_random_uuid());
set local role service_role;
insert into scan_test_context(key,payload) select 'terminal-claim',public.claim_media_scan_job('scanner-terminal',gen_random_uuid(),encode(extensions.digest((select token::text from scan_test_context where key='terminal-token'),'sha256'),'hex'),clock_timestamp(),86400);
reset role;
update private.media_scan_jobs set attempt_count=3 where upload_id=(select (payload->>'uploadId')::uuid from scan_test_context where key='terminal-ticket');
set local role service_role;
select public.fail_media_scan_attempt((select (payload->>'attemptId')::uuid from scan_test_context where key='terminal-claim'),(select token from scan_test_context where key='terminal-token'),gen_random_uuid(),'scanner_unavailable');
reset role;
select is((select state from private.media_scan_artifacts where job_id=(select id from private.media_scan_jobs where upload_id=(select (payload->>'uploadId')::uuid from scan_test_context where key='terminal-ticket')) and kind='quarantine'),'cleanup_pending','terminal failure enqueues quarantine cleanup');

set local role authenticated;
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000001',true);
insert into scan_test_context(key,payload) values('exhaustion-ticket',public.create_unbound_file_upload('request_media','exhaustion.png','image/png',4096));
insert into storage.objects(bucket_id,name,owner_id,metadata)
select payload->>'bucket',payload->>'path','b1000000-0000-4000-8000-000000000001',
  jsonb_build_object('mimetype','image/png','size',4096)
from scan_test_context where key='exhaustion-ticket';
select public.start_or_get_media_scan((select (payload->>'uploadId')::uuid from scan_test_context where key='exhaustion-ticket'),gen_random_uuid());
reset role;
insert into scan_test_context(key,token) values('exhaustion-token',gen_random_uuid());
set local role service_role;
insert into scan_test_context(key,payload) select 'exhaustion-claim',public.claim_media_scan_job('scanner-exhaustion',gen_random_uuid(),encode(extensions.digest((select token::text from scan_test_context where key='exhaustion-token'),'sha256'),'hex'),clock_timestamp(),86400);
reset role;
update private.media_scan_jobs set attempt_count=3 where upload_id=(select (payload->>'uploadId')::uuid from scan_test_context where key='exhaustion-ticket');
update private.media_scan_attempts set claimed_at=t.at_time-interval '121 seconds',processing_deadline=t.at_time-interval '1 second'
from (select clock_timestamp() at_time) t where id=(select (payload->>'attemptId')::uuid from scan_test_context where key='exhaustion-claim');
set local role service_role;
select is(public.claim_media_scan_job('scanner-exhaustion',gen_random_uuid(),repeat('e',64),clock_timestamp(),86400),null::jsonb,'attempt exhaustion creates no fourth attempt');
reset role;
select is((select state from private.media_scan_artifacts where job_id=(select id from private.media_scan_jobs where upload_id=(select (payload->>'uploadId')::uuid from scan_test_context where key='exhaustion-ticket')) and kind='quarantine'),'cleanup_pending','attempt exhaustion enqueues quarantine cleanup');

set local role authenticated;
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000001',true);
insert into scan_test_context(key,payload) values('retry-ticket',public.create_unbound_file_upload('request_media','retry.jpg','image/jpeg',4096));
insert into storage.objects(bucket_id,name,owner_id,metadata)
select payload->>'bucket',payload->>'path','b1000000-0000-4000-8000-000000000001',
  jsonb_build_object('mimetype','image/jpeg','size',4096)
from scan_test_context where key='retry-ticket';
select public.start_or_get_media_scan((select (payload->>'uploadId')::uuid from scan_test_context where key='retry-ticket'),gen_random_uuid());
reset role;
insert into scan_test_context(key,token) values('retry-token-1',gen_random_uuid()),('retry-token-2',gen_random_uuid());
set local role service_role;
insert into scan_test_context(key,payload) select 'retry-claim-1',public.claim_media_scan_job('scanner-a',gen_random_uuid(),encode(extensions.digest((select token::text from scan_test_context where key='retry-token-1'),'sha256'),'hex'),clock_timestamp(),86400);
select public.fail_media_scan_attempt((select (payload->>'attemptId')::uuid from scan_test_context where key='retry-claim-1'),(select token from scan_test_context where key='retry-token-1'),gen_random_uuid(),'scanner_timeout');
reset role;
update private.media_scan_jobs set retry_at=clock_timestamp()-interval '1 second' where upload_id=(select (payload->>'uploadId')::uuid from scan_test_context where key='retry-ticket');
set local role service_role;
insert into scan_test_context(key,payload) select 'retry-claim-2',public.claim_media_scan_job('scanner-b',gen_random_uuid(),encode(extensions.digest((select token::text from scan_test_context where key='retry-token-2'),'sha256'),'hex'),clock_timestamp(),86400);
select throws_ok(format('select public.prepare_media_scan_output(%L,%L,%L,%L,%L,%L,4096,1024,%L,%L,%L,%L)',(select payload->>'attemptId' from scan_test_context where key='retry-claim-1'),(select token from scan_test_context where key='retry-token-1'),gen_random_uuid(),repeat('5',64),'image/jpeg','image/jpeg',repeat('6',64),repeat('7',64),'decode-reencode-jpeg-v1','1.0.0'),'SCAN_ATTEMPT_STALE','old attempt cannot prepare output');
select throws_ok(format('select public.finalize_media_scan_job(%L,%L,%L,%L)',(select payload->>'attemptId' from scan_test_context where key='retry-claim-1'),(select token from scan_test_context where key='retry-token-1'),gen_random_uuid(),repeat('5',64)),'SCAN_ATTEMPT_STALE','old attempt cannot finalize');
reset role;
select isnt((select payload->>'inputPath' from scan_test_context where key='retry-claim-1'),(select payload->>'inputPath' from scan_test_context where key='retry-claim-2'),'retry input is distinct');
select isnt((select payload->>'outputPath' from scan_test_context where key='retry-claim-1'),(select payload->>'outputPath' from scan_test_context where key='retry-claim-2'),'retry output is distinct');
select isnt((select payload->>'finalPath' from scan_test_context where key='retry-claim-1'),(select payload->>'finalPath' from scan_test_context where key='retry-claim-2'),'old orphan cannot poison retry final path');

update private.media_scan_attempts
set claimed_at=t.at_time-interval '121 seconds',processing_deadline=t.at_time-interval '1 second'
from (select clock_timestamp() at_time) t
where id=(select (payload->>'attemptId')::uuid from scan_test_context where key='retry-claim-2');
set local role service_role;
select throws_ok(format('select public.heartbeat_media_scan_attempt(%L,%L,%L)',(select payload->>'attemptId' from scan_test_context where key='retry-claim-2'),(select token from scan_test_context where key='retry-token-2'),gen_random_uuid()),'SCAN_ATTEMPT_EXPIRED','expired attempt cannot heartbeat');
select throws_ok(format('select public.reject_media_scan_job(%L,%L,%L,%L)',(select payload->>'attemptId' from scan_test_context where key='retry-claim-2'),(select token from scan_test_context where key='retry-token-2'),gen_random_uuid(),'malware_detected'),'SCAN_ATTEMPT_EXPIRED','expired attempt cannot reject');
reset role;
update private.media_scan_attempts
set state='attested',manifest_fingerprint=repeat('a',64),
    claimed_at=t.at_time-interval '136 seconds',processing_deadline=t.at_time-interval '16 seconds',
    attested_at=t.at_time-interval '16 seconds',finalization_deadline=t.at_time-interval '1 second'
from (select clock_timestamp() at_time) t
where id=(select (payload->>'attemptId')::uuid from scan_test_context where key='retry-claim-2');
update private.media_scan_artifacts set state='promotion_pending'
where attempt_id=(select (payload->>'attemptId')::uuid from scan_test_context where key='retry-claim-2') and kind='final_candidate';
set local role service_role;
select throws_ok(format('select public.finalize_media_scan_job(%L,%L,%L,%L)',(select payload->>'attemptId' from scan_test_context where key='retry-claim-2'),(select token from scan_test_context where key='retry-token-2'),gen_random_uuid(),repeat('a',64)),'SCAN_ATTEMPT_EXPIRED','attempt cannot finalize after the fixed metadata margin');
reset role;

insert into scan_test_context(key,token) values
  ('nonce',gen_random_uuid()),('nonce-op',gen_random_uuid()),('nonce-fresh',gen_random_uuid());
set local role service_role;
insert into scan_test_context(key,payload) select 'nonce-receipt',public.consume_media_scanner_nonce('scanner-review','claim',(select token from scan_test_context where key='nonce'),extract(epoch from clock_timestamp())::bigint,repeat('8',64),(select token from scan_test_context where key='nonce-op'));
select is((select payload->>'workerId' from scan_test_context where key='nonce-receipt'),'scanner-review','request nonce receipt is bound to the signed scanner identity');
select throws_ok(format('select public.consume_media_scanner_nonce(%L,%L,%L,%s,%L,%L)','scanner-review','claim',(select token from scan_test_context where key='nonce'),(select payload->>'timestamp' from scan_test_context where key='nonce-receipt'),repeat('8',64),(select token from scan_test_context where key='nonce-op')),'SCANNER_NONCE_REPLAY','exact nonce and operation replay is denied without a recovered response');
select throws_ok(format('select public.consume_media_scanner_nonce(%L,%L,%L,%s,%L,%L)','scanner-other','claim',(select token from scan_test_context where key='nonce'),(select payload->>'timestamp' from scan_test_context where key='nonce-receipt'),repeat('8',64),gen_random_uuid()),'SCANNER_NONCE_REPLAY','same nonce under another scanner identity is denied');
reset role;
update private.media_scanner_nonces set expires_at=clock_timestamp()-interval '1 second'
where nonce=(select token from scan_test_context where key='nonce');
set local role service_role;
select throws_ok(format('select public.consume_media_scanner_nonce(%L,%L,%L,%s,%L,%L)','scanner-review','claim',(select token from scan_test_context where key='nonce'),extract(epoch from clock_timestamp())::bigint,repeat('8',64),gen_random_uuid()),'SCANNER_NONCE_REPLAY','an expired consumed nonce remains unavailable');
select lives_ok(format('select public.consume_media_scanner_nonce(%L,%L,%L,%s,%L,%L)','scanner-review','claim',(select token from scan_test_context where key='nonce-fresh'),extract(epoch from clock_timestamp()+interval '29 seconds')::bigint,repeat('9',64),gen_random_uuid()),'a nonexistent nonce inside the positive request window is accepted once');
select lives_ok(format('select public.consume_media_scanner_nonce(%L,%L,%L,%s,%L,%L)','scanner-review','heartbeat',gen_random_uuid(),extract(epoch from clock_timestamp()-interval '29 seconds')::bigint,repeat('7',64),gen_random_uuid()),'the negative side of the 30-second request window remains accepted');
select throws_ok(format('select public.consume_media_scanner_nonce(%L,%L,%L,%s,%L,%L)','scanner-review','claim',gen_random_uuid(),extract(epoch from clock_timestamp()+interval '31 seconds')::bigint,repeat('8',64),gen_random_uuid()),'SCANNER_TIMESTAMP_OUTSIDE_WINDOW','more than thirty seconds of positive request skew is denied');
select throws_ok(format('select public.consume_media_scanner_nonce(%L,%L,%L,%s,%L,%L)','scanner-review','claim',gen_random_uuid(),extract(epoch from clock_timestamp()-interval '2 minutes')::bigint,repeat('8',64),gen_random_uuid()),'SCANNER_TIMESTAMP_OUTSIDE_WINDOW','stale HMAC timestamp is denied');
reset role;
select is((select count(*) from private.media_scan_events where action='consume_nonce'
  and operation_id=(select token from scan_test_context where key='nonce-op')),1::bigint,
  'duplicate nonce replay creates no capability-recovery receipt');

select * from finish();
rollback;
