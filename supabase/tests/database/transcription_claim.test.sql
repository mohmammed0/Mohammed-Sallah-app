begin;
select plan(10);

set local role service_role;
select is(public.claim_transcription_job(
  'd1000000-0000-4000-8000-000000000001','voice-client-message-001',
  'd1000000-0000-4000-8000-000000000001/voice-001.m4a','ar','openai','test-model'
)->>'state','claimed','first transcription request atomically claims the job');
select is(public.claim_transcription_job(
  'd1000000-0000-4000-8000-000000000001','voice-client-message-001',
  'd1000000-0000-4000-8000-000000000001/voice-001.m4a','ar','openai','test-model'
)->>'state','in_progress','simultaneous duplicate observes the existing processing claim');
reset role;

select is((select count(*) from public.transcription_jobs
  where user_id='d1000000-0000-4000-8000-000000000001'
    and client_message_id='voice-client-message-001'),1::bigint,
  'one user/clientMessageId creates one transcription job');
select ok((select claim_token is not null and claim_expires_at>now()
  from public.transcription_jobs
  where user_id='d1000000-0000-4000-8000-000000000001'
    and client_message_id='voice-client-message-001'),
  'the processing claim has a bounded server-owned lease token');
update public.transcription_jobs set claim_expires_at=now()-interval '1 second'
where user_id='d1000000-0000-4000-8000-000000000001'
  and client_message_id='voice-client-message-001';
set local role service_role;
select is(public.claim_transcription_job(
  'd1000000-0000-4000-8000-000000000001','voice-client-message-001',
  'd1000000-0000-4000-8000-000000000001/voice-001.m4a','ar','openai','test-model'
)->>'state','claimed','an expired processing lease is reclaimable after timeout or restart');
reset role;
update public.transcription_jobs set status='failed',error_category='provider_timeout'
where user_id='d1000000-0000-4000-8000-000000000001'
  and client_message_id='voice-client-message-001';
set local role service_role;
select is(public.claim_transcription_job(
  'd1000000-0000-4000-8000-000000000001','voice-client-message-001',
  'd1000000-0000-4000-8000-000000000001/voice-001.m4a','ar','openai','test-model'
)->>'state','claimed','failed transcription is retryable without a process restart');
reset role;
update public.transcription_jobs set status='completed',transcript='المكيف لا يبرد',completed_at=now()
where user_id='d1000000-0000-4000-8000-000000000001'
  and client_message_id='voice-client-message-001';
set local role service_role;
select is(public.claim_transcription_job(
  'd1000000-0000-4000-8000-000000000001','voice-client-message-001',
  'd1000000-0000-4000-8000-000000000001/voice-001.m4a','ar','openai','test-model'
)->>'state','completed','restart replay returns the completed transcript');
select is(public.claim_transcription_job(
  'd1000000-0000-4000-8000-000000000001','voice-client-message-001',
  'd1000000-0000-4000-8000-000000000001/different.m4a','ar','openai','test-model'
)->>'state','media_conflict','clientMessageId cannot be rebound to different audio');
reset role;

set local role authenticated;
select throws_ok(
  $$select public.claim_transcription_job(
    'd1000000-0000-4000-8000-000000000001','voice-client-message-002',
    'd1000000-0000-4000-8000-000000000001/voice-002.m4a','ar','openai','test-model')$$,
  'permission denied for function claim_transcription_job',
  'authenticated clients cannot claim transcription work');
reset role;
set local role anon;
select throws_ok(
  $$select public.claim_transcription_job(
    'd1000000-0000-4000-8000-000000000001','voice-client-message-003',
    'd1000000-0000-4000-8000-000000000001/voice-003.m4a','ar','openai','test-model')$$,
  'permission denied for function claim_transcription_job',
  'anonymous clients cannot claim transcription work');
reset role;

select * from finish();
rollback;
