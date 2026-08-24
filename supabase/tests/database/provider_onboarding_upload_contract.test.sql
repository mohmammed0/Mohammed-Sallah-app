begin;
select no_plan();

select function_privs_are(
  'public','upsert_provider_onboarding',array['jsonb'],'authenticated',array['EXECUTE'],
  'authenticated providers may call only the safe onboarding wrapper'
);
select function_privs_are(
  'public','upsert_provider_onboarding',array['jsonb'],'anon',array[]::text[],
  'anonymous clients cannot call provider onboarding'
);
select function_privs_are(
  'public','upsert_provider_onboarding',array['jsonb'],'service_role',array[]::text[],
  'service role does not bypass the authenticated onboarding contract'
);
select has_function(
  'private','upsert_provider_onboarding_trusted_legacy',array['jsonb'],
  'the authoritative legacy onboarding body is private'
);
select function_privs_are(
  'private','upsert_provider_onboarding_trusted_legacy',array['jsonb'],'authenticated',array[]::text[],
  'authenticated providers cannot call the trusted legacy body'
);
select function_privs_are(
  'private','upsert_provider_onboarding_trusted_legacy',array['jsonb'],'anon',array[]::text[],
  'anonymous clients cannot call the trusted legacy body'
);
select function_privs_are(
  'private','upsert_provider_onboarding_trusted_legacy',array['jsonb'],'service_role',array[]::text[],
  'service role cannot call the trusted legacy body'
);
select ok(
  (select coalesce(p.proconfig,'{}'::text[]) @> array['search_path=""']
   from pg_proc p where p.oid='public.upsert_provider_onboarding(jsonb)'::regprocedure),
  'the safe onboarding wrapper uses an empty fixed search path'
);
select ok(
  not has_column_privilege('authenticated','public.provider_documents','storage_path','SELECT')
  and not has_column_privilege('authenticated','public.provider_documents','content_hash','SELECT'),
  'owners have no raw provider-document path or content-hash projection'
);
select ok(
  has_column_privilege('authenticated','public.provider_documents','id','SELECT')
  and has_column_privilege('authenticated','public.provider_documents','document_type','SELECT')
  and has_column_privilege('authenticated','public.provider_documents','status','SELECT'),
  'owners retain safe provider-document metadata projection'
);
select ok(
  not has_table_privilege('authenticated','public.provider_documents','INSERT'),
  'providers cannot bypass the safe onboarding wrapper with a raw document insert'
);

insert into public.file_uploads(
  id,user_id,purpose,original_filename,extension,declared_mime_type,detected_mime_type,
  size_bytes,max_size_bytes,quarantine_path,target_bucket,target_path,final_path,
  content_sha256,status,scanner,sanitized,scanned_at
) values
  ('f2000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001',
   'provider_document','safe-id.jpg','jpg','image/jpeg','image/jpeg',128,20971520,
   'contract/good/quarantine','provider-documents','contract/good/target',
   'clean/aa/bb/f2000000-0000-4000-8000-000000000001',repeat('a',64),'clean','test',true,now()),
  ('f2000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000001',
   'provider_document','other-id.jpg','jpg','image/jpeg','image/jpeg',128,20971520,
   'contract/other/quarantine','provider-documents','contract/other/target',
   'clean/aa/bb/f2000000-0000-4000-8000-000000000002',repeat('b',64),'clean','test',true,now()),
  ('f2000000-0000-4000-8000-000000000003','d2000000-0000-4000-8000-000000000001',
   'request_media','wrong-purpose.jpg','jpg','image/jpeg','image/jpeg',128,20971520,
   'contract/purpose/quarantine','request-media','contract/purpose/target',
   'clean/aa/bb/f2000000-0000-4000-8000-000000000003',repeat('c',64),'clean','test',true,now()),
  ('f2000000-0000-4000-8000-000000000004','d2000000-0000-4000-8000-000000000001',
   'provider_document','not-clean.jpg','jpg','image/jpeg',null,128,20971520,
   'contract/dirty/quarantine','provider-documents','contract/dirty/target',null,null,
   'created',null,false,null);

create temporary table onboarding_upload_contract(payload jsonb,result jsonb,replay jsonb);
grant select,insert,update on onboarding_upload_contract to authenticated;
insert into onboarding_upload_contract(payload) values(jsonb_build_object(
  'submit',false,'kind','individual','businessName','مزود اختبار عقد المستند الآمن',
  'bio','سيرة مهنية مكتملة لاختبار عقد رفع مستندات مقدم الخدمة بأمان',
  'locale','ar','serviceRadiusKm',20,
  'services',jsonb_build_array(jsonb_build_object(
    'categoryId',(select id from public.service_categories where slug='air-conditioning')
  )),
  'serviceAreas',jsonb_build_array(jsonb_build_object(
    'cityId',(select id from public.cities where code='riyadh'),
    'location',jsonb_build_object('latitude',24.7136,'longitude',46.6753),'radiusKm',20
  ))
));

create function pg_temp.try_provider_onboarding(p_payload jsonb) returns jsonb
language plpgsql as $$
begin
  return public.upsert_provider_onboarding(p_payload);
exception when others then
  return null;
end
$$;
grant execute on function pg_temp.try_provider_onboarding(jsonb) to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000001',true);

select throws_ok($test$
  select public.upsert_provider_onboarding(
    (select payload from onboarding_upload_contract) || jsonb_build_object(
      'idempotencyKey','onboarding-safe-cross-owner-001','documents',jsonb_build_array(
        jsonb_build_object('uploadId','f2000000-0000-4000-8000-000000000002','documentType','identity_or_license')
      )
    )
  )
$test$,'CLEAN_PROVIDER_DOCUMENT_REQUIRED','a provider cannot adopt another owner clean upload');

select throws_ok($test$
  select public.upsert_provider_onboarding(
    (select payload from onboarding_upload_contract) || jsonb_build_object(
      'idempotencyKey','onboarding-safe-purpose-001','documents',jsonb_build_array(
        jsonb_build_object('uploadId','f2000000-0000-4000-8000-000000000003','documentType','identity_or_license')
      )
    )
  )
$test$,'CLEAN_PROVIDER_DOCUMENT_REQUIRED','a non-provider-document upload is rejected');

select throws_ok($test$
  select public.upsert_provider_onboarding(
    (select payload from onboarding_upload_contract) || jsonb_build_object(
      'idempotencyKey','onboarding-safe-not-clean-001','documents',jsonb_build_array(
        jsonb_build_object('uploadId','f2000000-0000-4000-8000-000000000004','documentType','identity_or_license')
      )
    )
  )
$test$,'CLEAN_PROVIDER_DOCUMENT_REQUIRED','a provider document must already be clean');

select throws_ok($test$
  select public.upsert_provider_onboarding(
    (select payload from onboarding_upload_contract) || jsonb_build_object(
      'idempotencyKey','onboarding-legacy-document-001','documents',jsonb_build_array(
        jsonb_build_object(
          'uploadId','f2000000-0000-4000-8000-000000000001',
          'documentType','identity_or_license',
          'storagePath','clean/aa/bb/f2000000-0000-4000-8000-000000000001',
          'contentHash',repeat('a',64),'mimeType','image/jpeg','sizeBytes',128
        )
      )
    )
  )
$test$,'INVALID_PROVIDER_DOCUMENT_CONTRACT','legacy client path/hash fields are rejected');

select throws_ok($test$
  select public.upsert_provider_onboarding(
    (select payload from onboarding_upload_contract) || jsonb_build_object(
      'idempotencyKey','onboarding-duplicate-document-001','documents',jsonb_build_array(
        jsonb_build_object('uploadId','f2000000-0000-4000-8000-000000000001','documentType','identity_or_license'),
        jsonb_build_object('uploadId','f2000000-0000-4000-8000-000000000001','documentType','business_license')
      )
    )
  )
$test$,'DUPLICATE_PROVIDER_DOCUMENT','one upload cannot be submitted twice');

update onboarding_upload_contract set result=pg_temp.try_provider_onboarding(
  payload || jsonb_build_object(
    'idempotencyKey','onboarding-safe-upload-001','documents',jsonb_build_array(
      jsonb_build_object('uploadId','f2000000-0000-4000-8000-000000000001','documentType','safe_identity')
    )
  )
);
update onboarding_upload_contract set replay=pg_temp.try_provider_onboarding(
  payload || jsonb_build_object(
    'idempotencyKey','onboarding-safe-upload-001','documents',jsonb_build_array(
      jsonb_build_object('uploadId','f2000000-0000-4000-8000-000000000001','documentType','safe_identity')
    )
  )
);
reset role;

select isnt((select result from onboarding_upload_contract),null::jsonb,'safe uploadId onboarding succeeds');
select is((select replay from onboarding_upload_contract),(select result from onboarding_upload_contract),'safe uploadId replay preserves top-level idempotency');
select is((select count(*) from public.provider_documents
  where provider_id='d2000000-0000-4000-8000-000000000001' and document_type='safe_identity'),1::bigint,
  'response-loss replay creates one provider document');
select is((select storage_path from public.provider_documents
  where provider_id='d2000000-0000-4000-8000-000000000001' and document_type='safe_identity'),
  'clean/aa/bb/f2000000-0000-4000-8000-000000000001','server derives the final path from the upload ledger');
select is((select content_hash from public.provider_documents
  where provider_id='d2000000-0000-4000-8000-000000000001' and document_type='safe_identity'),repeat('a',64),
  'server derives the content hash from the upload ledger');
select ok((select result::text !~ '(storagePath|contentHash|clean/aa/bb|aaaaaaaaaaaaaaaa)' from onboarding_upload_contract),
  'onboarding response exposes no final path or content hash');

select * from finish();
rollback;
