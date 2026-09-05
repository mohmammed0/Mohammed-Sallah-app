begin;
select no_plan();

select function_privs_are(
  'public','open_support_case',
  array['text','text','text','text'],
  'authenticated',array['EXECUTE'],
  'authenticated users open support intake through one atomic command'
);
select ok(
  not has_table_privilege('authenticated','public.support_cases','INSERT')
  and not has_table_privilege('authenticated','public.support_case_messages','INSERT'),
  'clients cannot recreate the former partial two-insert support flow'
);
select function_privs_are(
  'public','get_provider_document_manifest',array['uuid'],
  'authenticated',array['EXECUTE'],
  'provider owners and authorized reviewers use the bounded manifest command'
);
select function_privs_are(
  'public','send_support_case_message',array['uuid','text','text'],
  'authenticated',array['EXECUTE'],
  'case participants reply through one authorized idempotent command'
);

insert into auth.users(
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) select id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',email,
  crypt(gen_random_uuid()::text,gen_salt('bf')),now(),'{}','{}',now(),now()
from (values
  ('fa000000-0000-4000-8000-000000000001'::uuid,'feature-customer@test.invalid'),
  ('fa000000-0000-4000-8000-000000000002'::uuid,'feature-provider@test.invalid'),
  ('fa000000-0000-4000-8000-000000000003'::uuid,'feature-reviewer@test.invalid'),
  ('fa000000-0000-4000-8000-000000000004'::uuid,'feature-outsider@test.invalid'),
  ('fa000000-0000-4000-8000-000000000005'::uuid,'feature-operations@test.invalid'),
  ('fa000000-0000-4000-8000-000000000006'::uuid,'feature-assigned-support@test.invalid'),
  ('fa000000-0000-4000-8000-000000000007'::uuid,'feature-expired-support@test.invalid'),
  ('fa000000-0000-4000-8000-000000000008'::uuid,'feature-ended-support@test.invalid'),
  ('fa000000-0000-4000-8000-000000000009'::uuid,'feature-revoked-support@test.invalid'),
  ('fa000000-0000-4000-8000-000000000010'::uuid,'feature-analyst@test.invalid'),
  ('fa000000-0000-4000-8000-000000000011'::uuid,'feature-unassigned-support@test.invalid'),
  ('fa000000-0000-4000-8000-000000000012'::uuid,'feature-revoked-reviewer@test.invalid'),
  ('fa000000-0000-4000-8000-000000000013'::uuid,'feature-granted-support@test.invalid')
) users(id,email);
insert into public.user_roles(user_id,role,revoked_at) values
  ('fa000000-0000-4000-8000-000000000002','provider',null),
  ('fa000000-0000-4000-8000-000000000003','verification_reviewer',null),
  ('fa000000-0000-4000-8000-000000000005','operations_admin',null),
  ('fa000000-0000-4000-8000-000000000006','support_agent',null),
  ('fa000000-0000-4000-8000-000000000007','support_agent',null),
  ('fa000000-0000-4000-8000-000000000008','support_agent',null),
  ('fa000000-0000-4000-8000-000000000009','support_agent',now()),
  ('fa000000-0000-4000-8000-000000000010','analyst',null),
  ('fa000000-0000-4000-8000-000000000011','support_agent',null),
  ('fa000000-0000-4000-8000-000000000012','verification_reviewer',now()),
  ('fa000000-0000-4000-8000-000000000013','support_agent',null);
insert into public.provider_profiles(
  user_id,kind,business_name,verification_status,accepting_requests
) values(
  'fa000000-0000-4000-8000-000000000002','individual','مزود اختبار الإكمال','submitted',false
);
insert into public.file_uploads(
  id,user_id,purpose,original_filename,extension,declared_mime_type,detected_mime_type,
  size_bytes,max_size_bytes,quarantine_path,target_bucket,target_path,final_path,
  content_sha256,status,scanner,sanitized,scanned_at
) values(
  'fa100000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000002',
  'provider_document','identity.jpg','jpg','image/jpeg','image/jpeg',1024,20971520,
  'feature-test/quarantine','provider-documents','feature-test/target','feature-test/clean',
  repeat('a',64),'clean','feature-test',true,now()
);
insert into public.provider_documents(
  id,provider_id,document_type,storage_path,content_hash,mime_type,size_bytes,status
) values(
  'fa200000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000002',
  'identity_or_license','feature-test/clean',repeat('a',64),'image/jpeg',1024,'submitted'
);

create temporary table feature_completion_result(
  first_result jsonb,replay_result jsonb,second_case_result jsonb,
  operations_case_result jsonb,grant_case_result jsonb,
  message_result jsonb,message_replay jsonb,late_message_replay jsonb,
  assigned_message_result jsonb,assigned_message_replay jsonb,rate_limited_replay jsonb,
  operations_message_result jsonb,operations_message_replay jsonb,
  grant_message_result jsonb,grant_message_replay jsonb,
  manifest jsonb,owner_manifest jsonb,health jsonb
);
grant select,insert,update on feature_completion_result to authenticated;
insert into feature_completion_result default values;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000001',true);
update feature_completion_result set first_result=public.open_support_case(
  'مشكلة في الطلب الحالي','أحتاج مساعدة فريق الدعم في متابعة هذه المشكلة.','general',
  'fa300000-0000-4000-8000-000000000001'
);
update feature_completion_result set replay_result=public.open_support_case(
  'مشكلة في الطلب الحالي','أحتاج مساعدة فريق الدعم في متابعة هذه المشكلة.','general',
  'fa300000-0000-4000-8000-000000000001'
);
select throws_ok($test$
  select public.open_support_case(
    'موضوع مختلف لنفس المفتاح','أحتاج مساعدة فريق الدعم في متابعة هذه المشكلة.','general',
    'fa300000-0000-4000-8000-000000000001'
  )
$test$,'IDEMPOTENCY_KEY_CONFLICT','support replay cannot change the accepted command');
select throws_ok($test$
  select public.open_support_case(
    'مشكلة في الطلب الحالي','قصير','general',
    'fa300000-0000-4000-8000-000000000002'
  )
$test$,'INVALID_SUPPORT_CASE','invalid support intake creates neither row');
update feature_completion_result set second_case_result=public.open_support_case(
  'مشكلة أخرى تحتاج متابعة','تفاصيل كافية لحالة دعم ثانية مستقلة عن الحالة الأولى.','general',
  'fa300000-0000-4000-8000-000000000006'
);
update feature_completion_result set operations_case_result=public.open_support_case(
  'حالة تحتاج متابعة العمليات','تفاصيل كافية لاختبار رد مسؤول العمليات المصرح به.','general',
  'fa300000-0000-4000-8000-000000000014'
);
update feature_completion_result set grant_case_result=public.open_support_case(
  'حالة تحتاج صلاحية دعم مؤقتة','تفاصيل كافية لاختبار صلاحية الدعم المؤقتة وسحبها.','general',
  'fa300000-0000-4000-8000-000000000015'
);
update feature_completion_result set message_result=public.send_support_case_message(
  (select (first_result->>'caseId')::uuid from feature_completion_result),
  'هذه معلومات إضافية آمنة لفريق الدعم.',
  'fa300000-0000-4000-8000-000000000003'
);
update feature_completion_result set message_replay=public.send_support_case_message(
  (select (first_result->>'caseId')::uuid from feature_completion_result),
  'هذه معلومات إضافية آمنة لفريق الدعم.',
  'fa300000-0000-4000-8000-000000000003'
);
select throws_ok($test$
  select public.send_support_case_message(
    (select (first_result->>'caseId')::uuid from feature_completion_result),
    'نص مختلف لا يجوز قبوله مع مفتاح الرسالة نفسه.',
    'fa300000-0000-4000-8000-000000000003'
  )
$test$,'IDEMPOTENCY_KEY_CONFLICT','support reply replay cannot change the accepted body');

reset role;
insert into public.support_case_access_grants(
  case_id,user_id,access_type,permissions,reason,granted_by,starts_at,expires_at
) values(
  (select (grant_case_result->>'caseId')::uuid from feature_completion_result),
  'fa000000-0000-4000-8000-000000000013','temporary',array['read'],
  'focused temporary support reply authorization',
  'fa000000-0000-4000-8000-000000000005',now(),now()+interval '1 hour'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000005',true);
update feature_completion_result set operations_message_result=public.send_support_case_message(
  (select (operations_case_result->>'caseId')::uuid from feature_completion_result),
  'استلم مسؤول العمليات الحالة وبدأ المتابعة المصرح بها.',
  'fa300000-0000-4000-8000-000000000016'
);
update feature_completion_result set operations_message_replay=public.send_support_case_message(
  (select (operations_case_result->>'caseId')::uuid from feature_completion_result),
  'استلم مسؤول العمليات الحالة وبدأ المتابعة المصرح بها.',
  'fa300000-0000-4000-8000-000000000016'
);

select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000013',true);
update feature_completion_result set grant_message_result=public.send_support_case_message(
  (select (grant_case_result->>'caseId')::uuid from feature_completion_result),
  'استلم موظف الدعم المفوض مؤقتاً الحالة وبدأ متابعتها.',
  'fa300000-0000-4000-8000-000000000017'
);
update feature_completion_result set grant_message_replay=public.send_support_case_message(
  (select (grant_case_result->>'caseId')::uuid from feature_completion_result),
  'استلم موظف الدعم المفوض مؤقتاً الحالة وبدأ متابعتها.',
  'fa300000-0000-4000-8000-000000000017'
);

reset role;
update public.support_case_access_grants
set revoked_at=now(),revoked_by='fa000000-0000-4000-8000-000000000005',
  revoked_reason='focused replay authorization fixture'
where case_id=(select (grant_case_result->>'caseId')::uuid from feature_completion_result)
  and user_id='fa000000-0000-4000-8000-000000000013';

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000013',true);
select throws_ok($test$
  select public.send_support_case_message(
    (select (grant_case_result->>'caseId')::uuid from feature_completion_result),
    'استلم موظف الدعم المفوض مؤقتاً الحالة وبدأ متابعتها.',
    'fa300000-0000-4000-8000-000000000017'
  )
$test$,'SUPPORT_CASE_ACCESS_DENIED','authorization is rechecked before replay after support grant revocation');

reset role;
insert into public.support_case_assignments(
  case_id,assignee_id,assigned_by,assigned_at,expires_at,permissions
) values
  ((select (first_result->>'caseId')::uuid from feature_completion_result),
   'fa000000-0000-4000-8000-000000000006','fa000000-0000-4000-8000-000000000005',
   now(),null,array['read','internal_note','evidence']),
  ((select (second_case_result->>'caseId')::uuid from feature_completion_result),
   'fa000000-0000-4000-8000-000000000006','fa000000-0000-4000-8000-000000000005',
   now(),null,array['read','internal_note','evidence']);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000006',true);
update feature_completion_result set assigned_message_result=public.send_support_case_message(
  (select (first_result->>'caseId')::uuid from feature_completion_result),
  'استلم فريق الدعم الحالة وبدأ المتابعة المصرح بها.',
  'fa300000-0000-4000-8000-000000000007'
);
update feature_completion_result set assigned_message_replay=public.send_support_case_message(
  (select (first_result->>'caseId')::uuid from feature_completion_result),
  'استلم فريق الدعم الحالة وبدأ المتابعة المصرح بها.',
  'fa300000-0000-4000-8000-000000000007'
);
select throws_ok($test$
  select public.send_support_case_message(
    (select (first_result->>'caseId')::uuid from feature_completion_result),
    'نص دعم مختلف تحت مفتاح الرد المقبول نفسه.',
    'fa300000-0000-4000-8000-000000000007'
  )
$test$,'IDEMPOTENCY_KEY_CONFLICT','assigned support cannot change a replayed message body');
select throws_ok($test$
  select public.send_support_case_message(
    (select (second_case_result->>'caseId')::uuid from feature_completion_result),
    'استلم فريق الدعم الحالة وبدأ المتابعة المصرح بها.',
    'fa300000-0000-4000-8000-000000000007'
  )
$test$,'IDEMPOTENCY_KEY_CONFLICT','assigned support cannot reuse a reply key for another case');

reset role;
insert into public.support_case_assignments(
  case_id,assignee_id,assigned_by,assigned_at,expires_at,permissions
) values
  ((select (first_result->>'caseId')::uuid from feature_completion_result),
   'fa000000-0000-4000-8000-000000000007','fa000000-0000-4000-8000-000000000005',
   now()-interval '2 hours',now()-interval '1 hour',array['read']),
  ((select (first_result->>'caseId')::uuid from feature_completion_result),
   'fa000000-0000-4000-8000-000000000008','fa000000-0000-4000-8000-000000000005',
   now()-interval '1 hour',null,array['read']),
  ((select (first_result->>'caseId')::uuid from feature_completion_result),
   'fa000000-0000-4000-8000-000000000009','fa000000-0000-4000-8000-000000000005',
   now(),null,array['read']);
update public.support_case_assignments
set ended_at=now(),ended_reason='focused authorization fixture'
where case_id=(select (first_result->>'caseId')::uuid from feature_completion_result)
  and assignee_id='fa000000-0000-4000-8000-000000000008';

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000011',true);
select throws_ok($test$
  select public.send_support_case_message(
    (select (first_result->>'caseId')::uuid from feature_completion_result),
    'محاولة دعم من موظف غير معيّن للحالة.',
    'fa300000-0000-4000-8000-000000000008'
  )
$test$,'SUPPORT_CASE_ACCESS_DENIED','unassigned support cannot reply');
select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000007',true);
select throws_ok($test$
  select public.send_support_case_message(
    (select (first_result->>'caseId')::uuid from feature_completion_result),
    'محاولة دعم بعد انتهاء صلاحية التعيين.',
    'fa300000-0000-4000-8000-000000000009'
  )
$test$,'SUPPORT_CASE_ACCESS_DENIED','expired support assignment cannot reply');
select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000008',true);
select throws_ok($test$
  select public.send_support_case_message(
    (select (first_result->>'caseId')::uuid from feature_completion_result),
    'محاولة دعم بعد إنهاء التعيين صراحة.',
    'fa300000-0000-4000-8000-000000000010'
  )
$test$,'SUPPORT_CASE_ACCESS_DENIED','ended support assignment cannot reply');
select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000009',true);
select throws_ok($test$
  select public.send_support_case_message(
    (select (first_result->>'caseId')::uuid from feature_completion_result),
    'محاولة دعم بعد سحب دور الموظف.',
    'fa300000-0000-4000-8000-000000000011'
  )
$test$,'SUPPORT_CASE_ACCESS_DENIED','revoked support role cannot reply');

reset role;
update public.rate_limit_buckets
set count=5,limit_value=5,updated_at=now()
where operation='support_case_open'
  and key_hash=encode(extensions.digest(
    'marketplace:support_case_open:fa000000-0000-4000-8000-000000000001','sha256'
  ),'hex');
update public.rate_limit_buckets
set count=30,limit_value=30,updated_at=now()
where operation='support_case_message'
  and key_hash=encode(extensions.digest(
    'marketplace:support_case_message:fa000000-0000-4000-8000-000000000006','sha256'
  ),'hex');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000001',true);
update feature_completion_result set rate_limited_replay=public.open_support_case(
  'مشكلة في الطلب الحالي','أحتاج مساعدة فريق الدعم في متابعة هذه المشكلة.','general',
  'fa300000-0000-4000-8000-000000000001'
);
select throws_ok($test$
  select public.open_support_case(
    'طلب دعم إضافي بعد بلوغ الحد','تفاصيل كافية لطلب جديد يجب أن يرفضه حد المعدل.','general',
    'fa300000-0000-4000-8000-000000000012'
  )
$test$,'RATE_LIMITED','new support intake is rejected after the bounded hourly limit');
select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000006',true);
update feature_completion_result set assigned_message_replay=public.send_support_case_message(
  (select (first_result->>'caseId')::uuid from feature_completion_result),
  'استلم فريق الدعم الحالة وبدأ المتابعة المصرح بها.',
  'fa300000-0000-4000-8000-000000000007'
);
select throws_ok($test$
  select public.send_support_case_message(
    (select (first_result->>'caseId')::uuid from feature_completion_result),
    'رد جديد يجب أن يرفضه حد رسائل الدعم.',
    'fa300000-0000-4000-8000-000000000013'
  )
$test$,'RATE_LIMITED','new support reply is rejected after the bounded per-minute limit');

reset role;
update public.user_roles set revoked_at=now()
where user_id='fa000000-0000-4000-8000-000000000006' and role='support_agent';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000006',true);
select throws_ok($test$
  select public.send_support_case_message(
    (select (first_result->>'caseId')::uuid from feature_completion_result),
    'استلم فريق الدعم الحالة وبدأ المتابعة المصرح بها.',
    'fa300000-0000-4000-8000-000000000007'
  )
$test$,'SUPPORT_CASE_ACCESS_DENIED','authorization is rechecked before replay after support role revocation');

select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000004',true);
select throws_ok($test$
  select public.send_support_case_message(
    (select (first_result->>'caseId')::uuid from feature_completion_result),
    'محاولة رد غير مصرح بها على التذكرة.',
    'fa300000-0000-4000-8000-000000000004'
  )
$test$,'SUPPORT_CASE_ACCESS_DENIED','unrelated accounts cannot reply to a support case');

select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000005',true);
update feature_completion_result set health=public.admin_marketplace_health();

reset role;
update public.support_cases set status='closed'
where id=(select (first_result->>'caseId')::uuid from feature_completion_result);
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000001',true);
update feature_completion_result set late_message_replay=public.send_support_case_message(
  (select (first_result->>'caseId')::uuid from feature_completion_result),
  'هذه معلومات إضافية آمنة لفريق الدعم.',
  'fa300000-0000-4000-8000-000000000003'
);

select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000003',true);
update feature_completion_result set manifest=public.get_provider_document_manifest(
  'fa000000-0000-4000-8000-000000000002'
);
select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000002',true);
update feature_completion_result set owner_manifest=public.get_provider_document_manifest(
  'fa000000-0000-4000-8000-000000000002'
);
select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000004',true);
select throws_ok($test$
  select public.get_provider_document_manifest('fa000000-0000-4000-8000-000000000002')
$test$,'PROVIDER_DOCUMENT_ACCESS_DENIED','unrelated accounts cannot discover provider documents');
select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000005',true);
select throws_ok($test$
  select public.get_provider_document_manifest('fa000000-0000-4000-8000-000000000002')
$test$,'PROVIDER_DOCUMENT_ACCESS_DENIED','operations access does not include private provider documents');
select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000011',true);
select throws_ok($test$
  select public.get_provider_document_manifest('fa000000-0000-4000-8000-000000000002')
$test$,'PROVIDER_DOCUMENT_ACCESS_DENIED','support access does not include private provider documents');
select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000010',true);
select throws_ok($test$
  select public.get_provider_document_manifest('fa000000-0000-4000-8000-000000000002')
$test$,'PROVIDER_DOCUMENT_ACCESS_DENIED','aggregate analysts cannot discover private provider documents');
select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000012',true);
select throws_ok($test$
  select public.get_provider_document_manifest('fa000000-0000-4000-8000-000000000002')
$test$,'PROVIDER_DOCUMENT_ACCESS_DENIED','revoked verification reviewers cannot discover provider documents');
reset role;

select is(
  (select first_result from feature_completion_result),
  (select replay_result from feature_completion_result),
  'support response-loss replay returns the exact case result'
);
select is(
  (select first_result from feature_completion_result),
  (select rate_limited_replay from feature_completion_result),
  'completed support intake replay bypasses a later exhausted rate limit'
);
select is(
  (select count(*) from public.support_cases
   where opened_by='fa000000-0000-4000-8000-000000000001'),
  4::bigint,'only the four accepted support cases are created'
);
select is(
  (select count(*) from public.support_case_messages m
   join public.support_cases c on c.id=m.case_id
   where c.opened_by='fa000000-0000-4000-8000-000000000001'),
  8::bigint,'initial intake and authorized replies are present exactly once'
);
select is(
  (select message_result from feature_completion_result),
  (select message_replay from feature_completion_result),
  'support message response-loss replay returns the exact message result'
);
select is(
  (select message_result from feature_completion_result),
  (select late_message_replay from feature_completion_result),
  'a completed support reply still replays exactly after the case later closes'
);
select is(
  (select assigned_message_result from feature_completion_result),
  (select assigned_message_replay from feature_completion_result),
  'assigned support response-loss replay returns the exact message result'
);
select is(
  (select count(*) from public.support_case_messages
   where id=(select (assigned_message_result->>'messageId')::uuid from feature_completion_result)),
  1::bigint,'assigned support replay creates exactly one message'
);
select is(
  (select count(*) from public.admin_audit_logs
   where actor_id='fa000000-0000-4000-8000-000000000006'
     and action='support.case.message.sent'
     and target_id=(select (first_result->>'caseId')::uuid from feature_completion_result)),
  1::bigint,'assigned support replay creates exactly one audit event'
);
select is(
  (select count(*) from public.notification_outbox
   where user_id='fa000000-0000-4000-8000-000000000001'
     and event_type='support_case_updated'
     and payload->>'messageId'=(
       select assigned_message_result->>'messageId' from feature_completion_result
     )),
  1::bigint,'assigned support replay creates exactly one customer notification'
);
select is(
  (select operations_message_result from feature_completion_result),
  (select operations_message_replay from feature_completion_result),
  'operations response-loss replay returns the exact message result'
);
select is(
  (select count(*) from public.support_case_messages
   where id=(select (operations_message_result->>'messageId')::uuid from feature_completion_result)),
  1::bigint,'operations replay creates exactly one message'
);
select is(
  (select count(*) from public.admin_audit_logs
   where actor_id='fa000000-0000-4000-8000-000000000005'
     and action='support.case.message.sent'
     and target_id=(select (operations_case_result->>'caseId')::uuid from feature_completion_result)),
  1::bigint,'operations replay creates exactly one audit event'
);
select is(
  (select count(*) from public.notification_outbox
   where user_id='fa000000-0000-4000-8000-000000000001'
     and event_type='support_case_updated'
     and payload->>'messageId'=(
       select operations_message_result->>'messageId' from feature_completion_result
     )),
  1::bigint,'operations replay creates exactly one customer notification'
);
select is(
  (select grant_message_result from feature_completion_result),
  (select grant_message_replay from feature_completion_result),
  'temporary support grant response-loss replay returns the exact message result'
);
select is(
  (select count(*) from public.support_case_messages
   where id=(select (grant_message_result->>'messageId')::uuid from feature_completion_result)),
  1::bigint,'temporary support grant replay creates exactly one message'
);
select is(
  (select count(*) from public.admin_audit_logs
   where actor_id='fa000000-0000-4000-8000-000000000013'
     and action='support.case.message.sent'
     and target_id=(select (grant_case_result->>'caseId')::uuid from feature_completion_result)),
  1::bigint,'temporary support grant replay creates exactly one audit event'
);
select is(
  (select count(*) from public.notification_outbox
   where user_id='fa000000-0000-4000-8000-000000000001'
     and event_type='support_case_updated'
     and payload->>'messageId'=(
       select grant_message_result->>'messageId' from feature_completion_result
     )),
  1::bigint,'temporary support grant replay creates exactly one customer notification'
);
select is(
  (select manifest->>'providerId' from feature_completion_result),
  'fa000000-0000-4000-8000-000000000002',
  'the reviewer manifest stays bound to the requested provider'
);
select is(
  (select manifest#>>'{documents,0,uploadId}' from feature_completion_result),
  'fa100000-0000-4000-8000-000000000001',
  'the manifest exposes only the opaque clean upload identity needed by media-access'
);
select ok(
  (select manifest::text !~* '(storage_?path|quarantine_?path|target_?(bucket|path)|final_?path|content_?(hash|sha256)|original_?filename|provider-documents|feature-test/(quarantine|target|clean)|a{64})'
   from feature_completion_result),
  'the manifest contains no private path, bucket, filename, or content hash sentinel'
);
select is(
  (select owner_manifest#>>'{documents,0,uploadId}' from feature_completion_result),
  'fa100000-0000-4000-8000-000000000001',
  'the provider owner can inspect the same safe document metadata'
);
select is(
  (select count(*) from public.admin_audit_logs
   where actor_id='fa000000-0000-4000-8000-000000000003'
     and action='provider.document.manifest.read'
     and target_id='fa000000-0000-4000-8000-000000000002'),
  1::bigint,'privileged document manifest access is audited once'
);
select ok(
  (select jsonb_typeof(health->'ai_provider_failures')='number'
    and jsonb_typeof(health->'transcription_failures')='number'
    and jsonb_typeof(health->'translation_failures')='number'
    and jsonb_typeof(health->'scanner_failures')='number'
    and jsonb_typeof(health->'scanner_cleanup_failures')='number'
    and jsonb_typeof(health->'push_dead_letters')='number'
    and jsonb_typeof(health->'scheduler_failures')='number'
    and jsonb_typeof(health->'open_incidents')='number'
   from feature_completion_result),
  'the beta health projection exposes only aggregate operational failure counts'
);

select * from finish();
rollback;
