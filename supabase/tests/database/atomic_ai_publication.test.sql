begin;
select plan(17);

insert into auth.users(
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) select id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',email,
  crypt(gen_random_uuid()::text,gen_salt('bf')),now(),'{}','{}',now(),now()
from (values
  ('fa000000-0000-4000-8000-000000000001'::uuid,'ai-publisher@test.invalid'),
  ('fa000000-0000-4000-8000-000000000002'::uuid,'ai-other@test.invalid')
) users(id,email);
insert into public.ai_sessions(
  id,user_id,purpose,status,locale,provider,model,suggested_category_slug
) values(
  'fa100000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000001',
  'service_request_intake','active','ar','deterministic','rules-v1','general-handyman'
);
insert into public.ai_diagnostics(
  id,session_id,schema_version,provider,model,prompt_version,structured_output
) values(
  'fa200000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000000001',
  '1.0','deterministic','rules-v1','diagnostic-v3',
  '{"summary":"A leaking water pipe needs a plumber."}'
);
insert into public.file_uploads(
  id,user_id,purpose,original_filename,extension,declared_mime_type,detected_mime_type,
  size_bytes,max_size_bytes,quarantine_path,target_bucket,target_path,final_path,
  content_sha256,status,scanner,sanitized,scanned_at
) values
  ('fa300000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000001',
   'request_media','leak.jpg','jpg','image/jpeg','image/jpeg',2048,10485760,
   'ai/quarantine-leak.jpg','request-media','ai/clean-leak.jpg','ai/clean-leak.jpg',
   repeat('a',64),'clean','fixture',false,now()),
  ('fa300000-0000-4000-8000-000000000002','fa000000-0000-4000-8000-000000000001',
   'request_audio','description.m4a','m4a','audio/mp4','audio/mp4',4096,10485760,
   'ai/quarantine-audio.m4a','request-media','ai/clean-audio.m4a','ai/clean-audio.m4a',
   repeat('b',64),'clean','fixture',false,now()),
  ('fa300000-0000-4000-8000-000000000003','fa000000-0000-4000-8000-000000000001',
   'request_media','dirty.jpg','jpg','image/jpeg','image/jpeg',1024,10485760,
   'ai/quarantine-dirty.jpg','request-media','ai/dirty.jpg',null,
   repeat('c',64),'rejected',null,false,null);
insert into public.transcription_jobs(
  id,user_id,private_audio_path,source_locale,provider,model,status,transcript
) values(
  'fa400000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000001',
  'ai/clean-audio.m4a','ar','deterministic','offline','completed',
  'There is a leaking pipe under the kitchen sink.'
);

create temp table ai_publication_context(key text primary key,payload jsonb,id uuid);
grant select,insert,update,delete on ai_publication_context to authenticated;
insert into ai_publication_context(key,payload) values(
  'base',jsonb_build_object(
    'title','Kitchen water leak',
    'structured_description','A leaking kitchen pipe requires a qualified plumber.',
    'original_text','The water pipe under the sink is leaking.',
    'locale','ar','selected_category_slug','plumbing',
    'suggested_category_slug','general-handyman',
    'category_confirmed_by_user',true,
    'category_selection_source','customer_correction',
    'city_code','riyadh','urgency','normal',
    'exact_location',jsonb_build_object('latitude',24.7136,'longitude',46.6753),
    'customer_approved',true,
    'ai_session_id','fa100000-0000-4000-8000-000000000001',
    'media',jsonb_build_array(
      jsonb_build_object('uploadId','fa300000-0000-4000-8000-000000000001'),
      jsonb_build_object('uploadId','fa300000-0000-4000-8000-000000000002')
    ),
    'ai_diagnostic',jsonb_build_object(
      'suggestedCategorySlug','general-handyman',
      'metadata',jsonb_build_object(
        'provider','deterministic','model','rules-v1','promptVersion','diagnostic-v3'
      )
    )
  )
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000001',true);
select throws_ok(
  $$select public.publish_service_request(
    ((select payload from ai_publication_context where key='base')
      -'category_confirmed_by_user') || '{"idempotency_key":"ai-no-confirm-key"}'
  )$$,
  'CATEGORY_CONFIRMATION_REQUIRED',
  'publication cannot treat the initial suggestion as customer confirmation'
);
select throws_ok(
  $$select public.publish_service_request(
    jsonb_set(
      (select payload from ai_publication_context where key='base'),
      '{media}','[{"uploadId":"fa300000-0000-4000-8000-000000000003"}]'
    ) || '{"idempotency_key":"ai-dirty-media-key"}'
  )$$,
  'CLEAN_REQUEST_MEDIA_REQUIRED',
  'dirty media rejects the entire publication transaction'
);
reset role;
select is((select count(*) from public.service_requests
  where customer_id='fa000000-0000-4000-8000-000000000001'),0::bigint,
  'failed media linkage cannot leave a partially published request');
select is((select status from public.ai_sessions
  where id='fa100000-0000-4000-8000-000000000001'),'active',
  'failed atomic publication leaves the AI session active and recoverable');
select ok((select request_id is null from public.ai_diagnostics
  where id='fa200000-0000-4000-8000-000000000001'),
  'failed publication cannot partially link AI diagnostics');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000001',true);
insert into ai_publication_context(key,id)
select 'published',public.publish_service_request(
  (select payload from ai_publication_context where key='base')
  || '{"idempotency_key":"ai-atomic-publication-key"}'
);
select is(
  public.publish_service_request(
    (select payload from ai_publication_context where key='base')
    || '{"idempotency_key":"ai-atomic-publication-key"}'
  ),
  (select id from ai_publication_context where key='published'),
  'response-loss replay returns the same fully linked request'
);
select throws_ok(
  $$select public.publish_service_request(
    jsonb_set(
      (select payload from ai_publication_context where key='base'),
      '{title}','"Changed title"'
    ) || '{"idempotency_key":"ai-atomic-publication-key"}'
  )$$,
  'IDEMPOTENCY_KEY_CONFLICT',
  'publication key cannot be reused for a different approval snapshot'
);
reset role;
select is((select count(*) from public.service_requests
  where customer_id='fa000000-0000-4000-8000-000000000001'),1::bigint,
  'atomic publication creates exactly one request');
select ok((select r.category_selection_source='customer_correction'
    and r.suggested_category_id<>r.category_id and r.category_confirmed_at is not null
  from public.service_requests r
  where r.id=(select id from ai_publication_context where key='published')),
  'customer correction persists separately from the AI suggestion');
select is((select count(*) from public.request_media
  where request_id=(select id from ai_publication_context where key='published')),2::bigint,
  'all clean image and voice media are atomically bound to the request');
select ok((select status='published' and request_id=(
    select id from ai_publication_context where key='published'
  ) from public.ai_sessions where id='fa100000-0000-4000-8000-000000000001'),
  'AI session is atomically linked and marked published');
select ok((select request_id=(select id from ai_publication_context where key='published')
  from public.ai_diagnostics where id='fa200000-0000-4000-8000-000000000001'),
  'AI diagnostics are linked in the publication transaction');
select ok((select request_id=(select id from ai_publication_context where key='published')
  from public.transcription_jobs where id='fa400000-0000-4000-8000-000000000001'),
  'applicable transcription is linked in the same transaction');
select is((select count(*) from public.request_publication_events
  where request_id=(select id from ai_publication_context where key='published')),1::bigint,
  'one immutable approval snapshot records the atomic publication');

reset role;
insert into public.ai_sessions(id,user_id,purpose,status,locale,provider) values
  ('fa100000-0000-4000-8000-000000000002','fa000000-0000-4000-8000-000000000001',
   'service_request_intake','active','ar','deterministic'),
  ('fa100000-0000-4000-8000-000000000003','fa000000-0000-4000-8000-000000000002',
   'service_request_intake','active','ar','deterministic');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000001',true);
select lives_ok(
  $$select public.abandon_ai_intake_session('fa100000-0000-4000-8000-000000000002')$$,
  'customer can explicitly abandon an owned active intake session');
select lives_ok(
  $$select public.abandon_ai_intake_session('fa100000-0000-4000-8000-000000000002')$$,
  'explicit abandonment is idempotent for response-loss retry');
select throws_ok(
  $$select public.abandon_ai_intake_session('fa100000-0000-4000-8000-000000000003')$$,
  'AI_SESSION_NOT_ABANDONABLE','customer cannot abandon another user session');

select * from finish();
rollback;
