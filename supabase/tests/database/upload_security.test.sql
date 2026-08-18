begin;
select plan(18);

select has_table('public','file_uploads','file upload security ledger exists');
select ok(
  (select relrowsecurity from pg_class where oid='public.file_uploads'::regclass),
  'file upload ledger has RLS enabled'
);
select is(
  (select public from storage.buckets where id='quarantine'),false,
  'quarantine bucket is private'
);
select function_privs_are(
  'public','create_file_upload',array['text','uuid','text','text','bigint'],
  'authenticated',array[]::text[],
  'authenticated clients cannot call nullable internal ticket command'
);
select function_privs_are(
  'public','create_unbound_file_upload',array['text','text','text','bigint'],
  'authenticated',array['EXECUTE'],
  'authenticated clients may request a typed unbound upload ticket'
);
select function_privs_are(
  'public','claim_file_upload',array['uuid','uuid'],
  'authenticated',array[]::text[],
  'authenticated clients cannot claim scanner work'
);

insert into auth.users(
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
  ('a1000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','upload-provider@test.invalid',crypt(gen_random_uuid()::text,gen_salt('bf')),now(),'{}','{}',now(),now()),
  ('a1000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','upload-outsider@test.invalid',crypt(gen_random_uuid()::text,gen_salt('bf')),now(),'{}','{}',now(),now());
insert into public.user_roles(user_id,role)
values('a1000000-0000-4000-8000-000000000001','provider');
insert into public.provider_profiles(user_id,kind,verification_status)
values('a1000000-0000-4000-8000-000000000001','individual','draft');

create temp table upload_test_context(key text primary key,id uuid,payload jsonb);
grant select,insert,update,delete on upload_test_context to authenticated,service_role;

set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
select throws_ok(
  $$insert into public.provider_documents(provider_id,document_type,storage_path,content_hash,mime_type,size_bytes)
    values('a1000000-0000-4000-8000-000000000001','identity','a1000000-0000-4000-8000-000000000001/raw.jpg',repeat('0',64),'image/jpeg',1024)$$,
  'CLEAN_UPLOAD_REQUIRED','raw provider documents cannot bypass scanning'
);
select throws_ok(
  $$select public.create_unbound_file_upload('provider_document','spoofed.jpg','application/pdf',1024)$$,
  'FILE_TYPE_NOT_ALLOWED','extension and declared MIME must match the allowlist'
);
select throws_ok(
  $$select public.create_unbound_file_upload('provider_document','large.jpg','image/jpeg',20971521)$$,
  'FILE_TOO_LARGE','oversized files are rejected before storage upload'
);
insert into upload_test_context(key,payload)
values('ticket',public.create_unbound_file_upload(
  'provider_document','identity.jpg','image/jpeg',1024
));
select is(
  (select payload->>'bucket' from upload_test_context where key='ticket'),'quarantine',
  'valid upload ticket targets quarantine only'
);
select is((select count(*) from public.file_uploads),1::bigint,'owner can read the upload ledger row');

select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',true);
select is((select count(*) from public.file_uploads),0::bigint,'unrelated user cannot read another upload ticket');

reset role;
set local role service_role;
select throws_ok(
  format(
    'select public.claim_file_upload(%L,%L)',
    (select (payload->>'uploadId')::uuid from upload_test_context where key='ticket'),
    'a1000000-0000-4000-8000-000000000002'
  ),
  'UPLOAD_NOT_CLAIMABLE','scanner cannot claim a ticket for a different owner'
);
insert into upload_test_context(key,payload)
select 'claim',public.claim_file_upload(
  (select (payload->>'uploadId')::uuid from upload_test_context where key='ticket'),
  'a1000000-0000-4000-8000-000000000001'
);
select is(
  (select payload->>'declaredMimeType' from upload_test_context where key='claim'),'image/jpeg',
  'service scanner claims the immutable validation contract'
);
insert into upload_test_context(key,payload)
select 'complete',public.complete_file_upload(
  (select (payload->>'uploadId')::uuid from upload_test_context where key='ticket'),
  'a1000000-0000-4000-8000-000000000001','image/jpeg',1024,repeat('a',64),
  (select payload->>'targetPath' from upload_test_context where key='claim'),
  'deterministic-test-scanner',true
);
select is(
  (select payload->>'status' from upload_test_context where key='complete'),'clean',
  'service scanner records a clean immutable result'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
select lives_ok(
  format(
    'insert into public.provider_documents(provider_id,document_type,storage_path,content_hash,mime_type,size_bytes) values(%L,%L,%L,%L,%L,1024)',
    'a1000000-0000-4000-8000-000000000001','identity',
    (select payload->>'storagePath' from upload_test_context where key='complete'),
    repeat('a',64),'image/jpeg'
  ),
  'clean provider document may be referenced by the domain record'
);
select is(
  (select status from public.file_uploads where id=(select (payload->>'uploadId')::uuid from upload_test_context where key='ticket')),
  'clean','owner sees the clean scan status'
);

reset role;
select throws_ok(
  $$update public.upload_security_events set event_type='tampered'$$,
  'APPEND_ONLY_RECORD','upload security events are append only'
);

select * from finish();
rollback;
