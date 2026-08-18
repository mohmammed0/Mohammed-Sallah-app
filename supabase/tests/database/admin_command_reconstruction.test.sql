begin;

select plan(8);

insert into auth.users(
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) select id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',email,
  crypt(gen_random_uuid()::text,gen_salt('bf')),now(),'{}','{}',now(),now()
from (values
  ('fa000000-0000-4000-8000-000000000001'::uuid,'intent-operations@test.invalid'),
  ('fa000000-0000-4000-8000-000000000002'::uuid,'intent-assignee@test.invalid'),
  ('fa000000-0000-4000-8000-000000000003'::uuid,'intent-grantee@test.invalid')
) users(id,email);

insert into public.user_roles(user_id,role) values
  ('fa000000-0000-4000-8000-000000000001','operations_admin'),
  ('fa000000-0000-4000-8000-000000000002','support_agent'),
  ('fa000000-0000-4000-8000-000000000003','support_agent');

insert into public.support_cases(id,opened_by,topic,subject) values(
  'fa100000-0000-4000-8000-000000000001',
  'fa000000-0000-4000-8000-000000000001',
  'response_loss_test',
  'Reconstructed browser action fixture'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000001',true);

create temp table reconstructed_command_results(
  operation text not null,
  attempt integer not null,
  payload jsonb not null
) on commit drop;

create temp table reconstructed_command_defaults(
  expires_at timestamptz not null
) on commit drop;

insert into reconstructed_command_defaults(expires_at)
values(date_trunc('second',now())+interval '8 hours');

insert into reconstructed_command_results(operation,attempt,payload)
select 'assignment',attempt,public.assign_support_case(
  p_case_id=>'fa100000-0000-4000-8000-000000000001',
  p_assignee_id=>'fa000000-0000-4000-8000-000000000002',
  p_permissions=>array['read','internal_note','evidence'],
  p_reason=>'Controlled response-loss assignment reconstruction',
  p_expires_at=>(select expires_at from reconstructed_command_defaults),
  p_idempotency_key=>'browser-intent-assignment-001'
)
from generate_series(1,2) attempt;

insert into reconstructed_command_results(operation,attempt,payload)
select 'grant',attempt,public.grant_support_case_access(
  p_case_id=>'fa100000-0000-4000-8000-000000000001',
  p_user_id=>'fa000000-0000-4000-8000-000000000003',
  p_access_type=>'temporary',
  p_permissions=>array['read','internal_note','evidence'],
  p_reason=>'Controlled response-loss grant reconstruction',
  p_expires_at=>(select expires_at from reconstructed_command_defaults),
  p_idempotency_key=>'browser-intent-grant-001'
)
from generate_series(1,2) attempt;

reset role;

select is(
  (select payload from reconstructed_command_results where operation='assignment' and attempt=1),
  (select payload from reconstructed_command_results where operation='assignment' and attempt=2),
  'a reconstructed support assignment returns the committed response'
);
select is(
  (select count(*) from public.support_case_assignments
   where case_id='fa100000-0000-4000-8000-000000000001' and ended_at is null),
  1::bigint,
  'a discarded assignment response creates one authoritative assignment'
);
select is(
  (select count(*) from public.idempotency_keys
   where user_id='fa000000-0000-4000-8000-000000000001'
     and command='support_case_assign_v1' and key='browser-intent-assignment-001'),
  1::bigint,
  'the reconstructed assignment reuses one idempotency record'
);
select is(
  (select count(*) from public.admin_audit_logs
   where actor_id='fa000000-0000-4000-8000-000000000001'
     and action='support.case.assign'
     and target_id='fa100000-0000-4000-8000-000000000001'),
  1::bigint,
  'the reconstructed assignment records one authoritative audit event'
);
select is(
  (select payload from reconstructed_command_results where operation='grant' and attempt=1),
  (select payload from reconstructed_command_results where operation='grant' and attempt=2),
  'a reconstructed support grant returns the committed response'
);
select is(
  (select count(*) from public.support_case_access_grants
   where case_id='fa100000-0000-4000-8000-000000000001'
     and user_id='fa000000-0000-4000-8000-000000000003' and revoked_at is null),
  1::bigint,
  'a discarded grant response creates one authoritative access grant'
);
select is(
  (select count(*) from public.idempotency_keys
   where user_id='fa000000-0000-4000-8000-000000000001'
     and command='support_access_grant_v1' and key='browser-intent-grant-001'),
  1::bigint,
  'the reconstructed grant reuses one idempotency record'
);
select is(
  (select count(*) from public.admin_audit_logs
   where actor_id='fa000000-0000-4000-8000-000000000001'
     and action='support.case.access.grant'
     and target_id='fa100000-0000-4000-8000-000000000001'),
  1::bigint,
  'the reconstructed grant records one authoritative audit event'
);

select * from finish();
rollback;
