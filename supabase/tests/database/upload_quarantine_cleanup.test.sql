begin;
select plan(9);

select has_column('public','file_uploads','quarantine_cleaned_at','upload ledger records physical quarantine cleanup');
select function_privs_are(
  'public','claim_upload_quarantine_cleanup',array['text'],
  'authenticated',array[]::text[],
  'authenticated clients cannot claim quarantine cleanup work'
);

insert into auth.users(
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values(
  'a2000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','cleanup-user@test.invalid',crypt(gen_random_uuid()::text,gen_salt('bf')),
  now(),'{}','{}',now(),now()
);

create temp table cleanup_context(key text primary key,payload jsonb);
grant select,insert,update,delete on cleanup_context to authenticated,service_role;

set local role authenticated;
select set_config('request.jwt.claim.sub','a2000000-0000-4000-8000-000000000001',true);
insert into cleanup_context(key,payload)
values('ticket',public.create_unbound_file_upload('request_media','old.png','image/png',128));

reset role;
update public.file_uploads
set expires_at=now()-interval '1 minute'
where id=(select (payload->>'uploadId')::uuid from cleanup_context where key='ticket');
update public.file_uploads
set quarantine_cleaned_at=now()
where id<>(select (payload->>'uploadId')::uuid from cleanup_context where key='ticket');

set local role service_role;
insert into cleanup_context(key,payload)
select 'claim',public.claim_upload_quarantine_cleanup('cleanup-worker-test');
reset role;
select is(
  (select payload->>'uploadId' from cleanup_context where key='claim'),
  (select payload->>'uploadId' from cleanup_context where key='ticket'),
  'service worker claims the expired upload'
);
select is(
  (select status from public.file_uploads where id=(select (payload->>'uploadId')::uuid from cleanup_context where key='ticket')),
  'expired','claiming an unscanned expired upload closes its ticket'
);
select is(
  (select payload->>'bucket' from cleanup_context where key='claim'),
  'quarantine','cleanup contract exposes only the immutable quarantine bucket'
);
set local role service_role;
select lives_ok(
  format(
    'select public.complete_upload_quarantine_cleanup(%L,%L)',
    (select payload->>'uploadId' from cleanup_context where key='ticket'),'cleanup-worker-test'
  ),
  'claimed cleanup can be completed idempotently by its worker'
);
reset role;
select ok(
  (select quarantine_cleaned_at is not null from public.file_uploads where id=(select (payload->>'uploadId')::uuid from cleanup_context where key='ticket')),
  'physical cleanup completion is timestamped'
);
select is(
  (select status from public.scheduled_jobs where job_type='upload_quarantine_cleanup' and payload->>'uploadId'=(select payload->>'uploadId' from cleanup_context where key='ticket')),
  'completed','scheduled cleanup job is closed'
);
set local role service_role;
select is(
  public.claim_upload_quarantine_cleanup('cleanup-worker-test'),null::jsonb,
  'completed cleanup cannot be claimed again'
);

select * from finish();
rollback;
