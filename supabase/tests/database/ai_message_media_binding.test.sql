begin;
select plan(7);

select ok(
  has_column_privilege(
    'service_role',
    'public.ai_message_media',
    'file_upload_id',
    'SELECT'
  ),
  'service role can resolve the upload-id conflict used by idempotent AI media binding'
);
select ok(
  not has_table_privilege('service_role','public.ai_message_media','SELECT'),
  'AI media binding does not grant blanket row reads to the service role'
);
select ok(
  not has_column_privilege(
    'service_role',
    'public.ai_message_media',
    'message_id',
    'SELECT'
  ),
  'service role cannot read AI message identifiers through the binding table'
);
select ok(
  not has_column_privilege(
    'service_role',
    'public.ai_message_media',
    'media_kind',
    'SELECT'
  ),
  'service role cannot read AI media kinds through the binding table'
);

insert into auth.users(
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values(
  'f2a10000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','ai-media-binding@test.invalid',
  crypt(gen_random_uuid()::text,gen_salt('bf')),now(),'{}','{}',now(),now()
);
insert into public.ai_sessions(
  id,user_id,purpose,status,locale,provider,model
) values(
  'f2a20000-0000-4000-8000-000000000001',
  'f2a10000-0000-4000-8000-000000000001',
  'service_request_intake','active','ar','openai','test-model'
);
insert into public.ai_messages(
  id,session_id,actor,original_content,redacted_content,sequence_number,
  client_message_id,input_kind,metadata
) values(
  'f2a30000-0000-4000-8000-000000000001',
  'f2a20000-0000-4000-8000-000000000001',
  'user','synthetic fixture','synthetic fixture',1,'ai-media-binding-fixture',
  'image','{"mediaUploadIds":["f2a40000-0000-4000-8000-000000000001"]}'
);
insert into public.file_uploads(
  id,user_id,purpose,original_filename,extension,declared_mime_type,
  detected_mime_type,size_bytes,max_size_bytes,quarantine_path,target_bucket,
  target_path,final_path,content_sha256,status,scanner,sanitized,scanned_at
) values(
  'f2a40000-0000-4000-8000-000000000001',
  'f2a10000-0000-4000-8000-000000000001',
  'request_media','fixture.png','png','image/png','image/png',128,10485760,
  'f2r1/quarantine-fixture.png','request-media','f2r1/clean-fixture.png',
  'f2r1/clean-fixture.png',repeat('a',64),'clean','fixture',true,now()
);

set local role service_role;
select lives_ok(
  $$with pgrst_source as (
      insert into public.ai_message_media(message_id,file_upload_id,media_kind)
      values(
        'f2a30000-0000-4000-8000-000000000001',
        'f2a40000-0000-4000-8000-000000000001',
        'image'
      )
      on conflict(file_upload_id) do nothing
      returning 1
    )
    select count(*) from pgrst_source$$,
  'the PostgREST-shaped AI media insert succeeds with least privilege'
);
select lives_ok(
  $$with pgrst_source as (
      insert into public.ai_message_media(message_id,file_upload_id,media_kind)
      values(
        'f2a30000-0000-4000-8000-000000000001',
        'f2a40000-0000-4000-8000-000000000001',
        'image'
      )
      on conflict(file_upload_id) do nothing
      returning 1
    )
    select count(*) from pgrst_source$$,
  'replaying the same AI media binding remains idempotent'
);
reset role;
select is(
  (
    select count(*)
    from public.ai_message_media
    where file_upload_id='f2a40000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'idempotent binding leaves exactly one authoritative media row'
);

select * from finish();
rollback;
