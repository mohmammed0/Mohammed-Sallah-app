begin;
select plan(15);

insert into auth.users(
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) select id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',email,
  crypt(gen_random_uuid()::text,gen_salt('bf')),now(),'{}','{}',now(),now()
from (values
  ('fb000000-0000-4000-8000-000000000001'::uuid,'pii-customer@test.invalid'),
  ('fb000000-0000-4000-8000-000000000002'::uuid,'pii-provider@test.invalid'),
  ('fb000000-0000-4000-8000-000000000003'::uuid,'pii-operations@test.invalid'),
  ('fb000000-0000-4000-8000-000000000004'::uuid,'pii-verifier@test.invalid'),
  ('fb000000-0000-4000-8000-000000000005'::uuid,'pii-reviewer@test.invalid'),
  ('fb000000-0000-4000-8000-000000000006'::uuid,'pii-support@test.invalid'),
  ('fb000000-0000-4000-8000-000000000007'::uuid,'pii-analyst@test.invalid'),
  ('fb000000-0000-4000-8000-000000000008'::uuid,'pii-finance@test.invalid')
) users(id,email);
update public.profiles set display_name='PII Customer',phone='+966500001234'
where id='fb000000-0000-4000-8000-000000000001';
insert into public.user_roles(user_id,role) values
  ('fb000000-0000-4000-8000-000000000002','provider'),
  ('fb000000-0000-4000-8000-000000000003','operations_admin'),
  ('fb000000-0000-4000-8000-000000000004','verification_reviewer'),
  ('fb000000-0000-4000-8000-000000000005','privacy_reviewer'),
  ('fb000000-0000-4000-8000-000000000006','support_agent'),
  ('fb000000-0000-4000-8000-000000000007','analyst'),
  ('fb000000-0000-4000-8000-000000000008','finance_reviewer');
insert into public.provider_profiles(
  user_id,kind,business_name,commercial_registration_reference,
  verification_status,accepting_requests
) values(
  'fb000000-0000-4000-8000-000000000002','company','Verification target',
  'CR-PII-WORKFLOW','submitted',false
);
insert into public.file_uploads(
  id,user_id,purpose,resource_id,original_filename,extension,
  declared_mime_type,detected_mime_type,size_bytes,max_size_bytes,
  quarantine_path,target_bucket,target_path,final_path,content_sha256,
  status,scanner,sanitized,scanned_at
) values(
  'fb050000-0000-4000-8000-000000000001',
  'fb000000-0000-4000-8000-000000000002','provider_document',
  'fb000000-0000-4000-8000-000000000002','registration.pdf','pdf',
  'application/pdf','application/pdf',1024,20971520,
  'private/quarantine-registration.pdf','provider-documents',
  'private/provider-registration.pdf','private/provider-registration.pdf',
  repeat('a',64),'clean','fixture',false,now()
);
insert into public.provider_documents(
  provider_id,document_type,storage_path,content_hash,mime_type,size_bytes
) values(
  'fb000000-0000-4000-8000-000000000002','commercial_registration',
  'private/provider-registration.pdf',repeat('a',64),'application/pdf',1024
);
insert into public.support_cases(
  id,opened_by,topic,subject
) values(
  'fb100000-0000-4000-8000-000000000001',
  'fb000000-0000-4000-8000-000000000001','privacy_help','Linked customer case'
);
insert into public.support_case_assignments(
  case_id,assignee_id,assigned_by,permissions
) values(
  'fb100000-0000-4000-8000-000000000001',
  'fb000000-0000-4000-8000-000000000006',
  'fb000000-0000-4000-8000-000000000003',
  array['read']
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fb000000-0000-4000-8000-000000000003',true);
select is((select count(*) from public.profiles
  where id='fb000000-0000-4000-8000-000000000001'),0::bigint,
  'operations cannot read an unrelated customer profile or phone through raw PostgREST');
select ok(not (public.get_marketplace_safe_identity(
  'fb000000-0000-4000-8000-000000000001',null
) ? 'phone'),'operations receives a safe identity projection without phone');

select set_config('request.jwt.claim.sub','fb000000-0000-4000-8000-000000000004',true);
select is((select count(*) from public.profiles
  where id='fb000000-0000-4000-8000-000000000001'),0::bigint,
  'verification reviewer cannot query ordinary customer profiles');
select throws_ok(
  $$select public.get_customer_pii(
    'fb000000-0000-4000-8000-000000000001','Verification unrelated customer lookup'
  )$$,
  'CUSTOMER_PII_PERMISSION_REQUIRED',
  'provider document permission cannot be used as customer PII permission'
);
select is(public.get_provider_verification_identity(
  'fb000000-0000-4000-8000-000000000002',
  'Reviewing submitted company registration'
)->>'commercialRegistrationReference','CR-PII-WORKFLOW',
  'verification reviewer receives only the provider identity for an active workflow');

select set_config('request.jwt.claim.sub','fb000000-0000-4000-8000-000000000005',true);
select is((select count(*) from public.profiles
  where id='fb000000-0000-4000-8000-000000000001'),0::bigint,
  'privacy reviewer also cannot bypass the authorized RPC through raw profiles');
select is(public.get_customer_pii(
  'fb000000-0000-4000-8000-000000000001',
  'Handling the customer data-subject identity request'
)->>'phone','+966500001234',
  'dedicated customer PII reviewer can perform a reasoned audited read');
reset role;
select is((select count(*) from public.admin_audit_logs
  where actor_id='fb000000-0000-4000-8000-000000000005'
    and action='customer.pii.read'),1::bigint,
  'customer PII RPC creates an immutable audit record');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fb000000-0000-4000-8000-000000000006',true);
select is((select count(*) from public.profiles
  where id='fb000000-0000-4000-8000-000000000001'),0::bigint,
  'assigned support cannot read the linked customer raw profile');
select ok(not (public.get_marketplace_safe_identity(
  'fb000000-0000-4000-8000-000000000001',
  'fb100000-0000-4000-8000-000000000001'
) ? 'phone'),'assigned support sees only case-linked safe identity fields');
select throws_ok(
  $$select public.get_customer_pii(
    'fb000000-0000-4000-8000-000000000001','Support must remain case scoped'
  )$$,
  'CUSTOMER_PII_PERMISSION_REQUIRED',
  'support role no longer inherits broad customer PII permission'
);

select set_config('request.jwt.claim.sub','fb000000-0000-4000-8000-000000000007',true);
select is((select count(*) from public.profiles
  where id='fb000000-0000-4000-8000-000000000001'),0::bigint,
  'analyst remains aggregate-only and sees no customer PII');
select set_config('request.jwt.claim.sub','fb000000-0000-4000-8000-000000000008',true);
select lives_ok($$select public.get_finance_review_queue()$$,
  'finance reviewer receives the minimal financial-decision queue');
select is((select count(*) from public.support_cases),0::bigint,
  'finance reviewer receives no broad support case access');

reset role;
update public.user_roles set revoked_at=now()
where user_id='fb000000-0000-4000-8000-000000000005'
  and role='privacy_reviewer';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fb000000-0000-4000-8000-000000000005',true);
select throws_ok(
  $$select public.get_customer_pii(
    'fb000000-0000-4000-8000-000000000001','Role was revoked before this read'
  )$$,
  'CUSTOMER_PII_PERMISSION_REQUIRED',
  'revoked privacy role loses PII access immediately'
);

select * from finish();
rollback;
