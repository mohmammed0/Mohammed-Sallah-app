begin;

select no_plan();

select has_function(
  'public','list_open_marketplace_reports',
  array['integer','timestamp with time zone','uuid'],
  'open moderation queue has a versioned keyset pagination RPC'
);
select has_function(
  'public','get_marketplace_report_enforcement_target',array['uuid'],
  'operations have a report-bound enforcement target RPC'
);
select has_function(
  'public','get_marketplace_report_enforcement_targets',array['uuid[]'],
  'operations have a bounded batch enforcement target RPC'
);
select has_function(
  'public','create_marketplace_report_v2',
  array['text','uuid','uuid','text','text','text'],
  'context-bound marketplace reports have an unambiguous v2 RPC'
);
select ok(
  case when to_regprocedure(
    'public.create_marketplace_report_v2(text,uuid,uuid,text,text,text)'
  ) is null then false else has_function_privilege(
    'anon',
    'public.create_marketplace_report_v2(text,uuid,uuid,text,text,text)',
    'EXECUTE'
  ) end=false,
  'anonymous callers cannot execute context-bound report intake'
);
select ok(
  case when to_regprocedure(
    'public.create_marketplace_report_v2(text,uuid,uuid,text,text,text)'
  ) is null then false else has_function_privilege(
    'authenticated',
    'public.create_marketplace_report_v2(text,uuid,uuid,text,text,text)',
    'EXECUTE'
  ) end,
  'authenticated callers can reach context-bound report intake'
);
select ok(
  (select definition~*'unnest\s*\(\s*p_report_ids\s*\)\s+with\s+ordinality'
      and definition!~*'foreach'
      and definition!~*'marketplace_report_enforcement_target_for'
   from (select pg_get_functiondef(
     'public.get_marketplace_report_enforcement_targets(uuid[])'::regprocedure
   ) definition) batch_source),
  'batch enforcement targets use ordinality-based set processing without per-report calls'
);
select ok(
  (select definition~*'join\s+public\.marketplace_reports'
      and definition~*'join\s+public\.jobs'
      and definition~*'join\s+public\.messages'
      and definition~*'join\s+public\.conversations'
      and definition~*'join\s+public\.ratings'
      and definition!~*'(attachment_evidence|text_snapshot|explanation|select\s+\*)'
   from (select pg_get_functiondef(
     'public.get_marketplace_report_enforcement_targets(uuid[])'::regprocedure
   ) definition) batch_source),
  'batch enforcement targets join only the contextual columns needed for one relational plan'
);
select has_function(
  'public','list_marketplace_reports',array['text','integer'],
  'the compatibility moderation projection remains available'
);
select ok(
  case
    when to_regprocedure(
      'public.list_open_marketplace_reports(integer,timestamp with time zone,uuid)'
    ) is null then false
    else has_function_privilege(
      'anon',
      'public.list_open_marketplace_reports(integer,timestamp with time zone,uuid)',
      'EXECUTE'
    )
  end=false,
  'anonymous callers cannot execute the open moderation queue RPC'
);
select ok(
  case
    when to_regprocedure('public.get_marketplace_report_enforcement_target(uuid)') is null
      then false
    else has_function_privilege(
      'anon','public.get_marketplace_report_enforcement_target(uuid)','EXECUTE'
    )
  end=false,
  'anonymous callers cannot execute the enforcement target RPC'
);
select ok(
  case
    when to_regprocedure('public.get_marketplace_report_enforcement_targets(uuid[])') is null
      then false
    else has_function_privilege(
      'anon','public.get_marketplace_report_enforcement_targets(uuid[])','EXECUTE'
    )
  end=false,
  'anonymous callers cannot execute the batch enforcement target RPC'
);
select ok(
  case
    when to_regprocedure('public.get_marketplace_report_enforcement_targets(uuid[])') is null
      then false
    else has_function_privilege(
      'authenticated','public.get_marketplace_report_enforcement_targets(uuid[])','EXECUTE'
    )
  end,
  'authenticated callers reach the batch RPC before its operations authorization check'
);
select ok(
  not has_table_privilege('authenticated','public.marketplace_reports','SELECT'),
  'new projections do not grant authenticated users raw report-table reads'
);

insert into auth.users(
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) select id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',email,
  crypt(gen_random_uuid()::text,gen_salt('bf')),now(),'{}','{}',now(),now()
from (values
  ('b1000000-0000-4000-8000-000000000001'::uuid,'pagination-reporter@test.invalid'),
  ('b1000000-0000-4000-8000-000000000002'::uuid,'pagination-dual-role@test.invalid'),
  ('b1000000-0000-4000-8000-000000000003'::uuid,'pagination-provider@test.invalid'),
  ('b1000000-0000-4000-8000-000000000004'::uuid,'pagination-operations@test.invalid'),
  ('b1000000-0000-4000-8000-000000000005'::uuid,'pagination-support@test.invalid'),
  ('b1000000-0000-4000-8000-000000000006'::uuid,'pagination-read-only@test.invalid'),
  ('b1000000-0000-4000-8000-000000000007'::uuid,'pagination-finance@test.invalid')
) actors(id,email);

insert into auth.users(
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) select
  format('b2000000-0000-4000-8000-%s',lpad(n::text,12,'0'))::uuid,
  '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
  format('pagination-target-%s@test.invalid',n),
  crypt(gen_random_uuid()::text,gen_salt('bf')),now(),'{}','{}',now(),now()
from generate_series(1,161) n;

insert into public.user_roles(user_id,role) values
  ('b1000000-0000-4000-8000-000000000001','provider'),
  ('b1000000-0000-4000-8000-000000000002','provider'),
  ('b1000000-0000-4000-8000-000000000003','provider'),
  ('b1000000-0000-4000-8000-000000000004','operations_admin'),
  ('b1000000-0000-4000-8000-000000000005','support_agent'),
  ('b1000000-0000-4000-8000-000000000006','analyst'),
  ('b1000000-0000-4000-8000-000000000007','finance_reviewer')
on conflict(user_id,role) do update set revoked_at=null;

insert into public.provider_profiles(
  user_id,kind,verification_status,accepting_requests
) values
  ('b1000000-0000-4000-8000-000000000001','individual','verified',true),
  ('b1000000-0000-4000-8000-000000000002','individual','verified',true),
  ('b1000000-0000-4000-8000-000000000003','individual','verified',true);

insert into public.admin_roles(
  id,key,name,description,system_role
) values(
  'b6000000-0000-4000-8000-000000000001',
  'pagination-read-only','Pagination read only',
  'Test fixture with moderation read but no mutation authority','analyst'
);
insert into public.admin_role_permissions(admin_role_id,permission_id)
select 'b6000000-0000-4000-8000-000000000001',permission.id
from public.admin_permissions permission
where permission.key='operations.marketplace.read';

insert into public.service_categories(
  id,slug,icon_key,restricted,verification_required,enabled,sort_order
) values(
  'b5000000-0000-4000-8000-000000000001',
  'pagination-fixture-category','fixture',false,true,true,998
);

insert into public.addresses(
  id,user_id,city_id,label,formatted_address,location
) select
  address.id,address.user_id,city.id,'Fixture','Synthetic test address',
  extensions.st_setsrid(extensions.st_makepoint(46.67,24.71),4326)::extensions.geography
from public.cities city
cross join (values
  ('b5100000-0000-4000-8000-000000000001'::uuid,
   'b1000000-0000-4000-8000-000000000001'::uuid),
  ('b5100000-0000-4000-8000-000000000002'::uuid,
   'b1000000-0000-4000-8000-000000000002'::uuid)
) address(id,user_id)
where city.code='riyadh';

insert into public.service_requests(
  id,customer_id,category_id,city_id,title,structured_description,original_text,
  approximate_location,exact_address_id,status,published_at,customer_approved_at
) select
  request.id,request.customer_id,
  'b5000000-0000-4000-8000-000000000001',city.id,
  'Moderation context fixture','Synthetic trust fixture','Synthetic trust fixture',
  extensions.st_setsrid(extensions.st_makepoint(46.67,24.71),4326)::extensions.geography,
  request.address_id,'provider_selected',now(),now()
from public.cities city
cross join (values
  ('b5200000-0000-4000-8000-000000000001'::uuid,
   'b1000000-0000-4000-8000-000000000001'::uuid,
   'b5100000-0000-4000-8000-000000000001'::uuid),
  ('b5200000-0000-4000-8000-000000000002'::uuid,
   'b1000000-0000-4000-8000-000000000002'::uuid,
   'b5100000-0000-4000-8000-000000000002'::uuid),
  ('b5200000-0000-4000-8000-000000000003'::uuid,
   'b1000000-0000-4000-8000-000000000002'::uuid,
   'b5100000-0000-4000-8000-000000000002'::uuid),
  ('b5200000-0000-4000-8000-000000000004'::uuid,
   'b1000000-0000-4000-8000-000000000002'::uuid,
   'b5100000-0000-4000-8000-000000000002'::uuid)
) request(id,customer_id,address_id)
where city.code='riyadh';

insert into public.offers(
  id,request_id,provider_id,total_amount_minor,materials_included,
  estimated_arrival_minutes,estimated_duration_minutes,expires_at,idempotency_key,status
) values
  ('b5300000-0000-4000-8000-000000000001',
   'b5200000-0000-4000-8000-000000000001',
   'b1000000-0000-4000-8000-000000000002',10000,false,30,60,
   now()+interval '1 day','pagination-offer-one','selected'),
  ('b5300000-0000-4000-8000-000000000002',
   'b5200000-0000-4000-8000-000000000002',
   'b1000000-0000-4000-8000-000000000003',10000,false,30,60,
   now()+interval '1 day','pagination-offer-two','selected'),
  ('b5300000-0000-4000-8000-000000000003',
   'b5200000-0000-4000-8000-000000000003',
   'b1000000-0000-4000-8000-000000000002',10000,false,30,60,
   now()+interval '1 day','pagination-offer-three','selected'),
  ('b5300000-0000-4000-8000-000000000004',
   'b5200000-0000-4000-8000-000000000004',
   'b1000000-0000-4000-8000-000000000001',10000,false,30,60,
   now()+interval '1 day','pagination-offer-four','selected');

insert into public.jobs(
  id,request_id,selected_offer_id,customer_id,provider_id,exact_address_id,
  status,approved_total_minor,version
) values
  ('b5400000-0000-4000-8000-000000000001',
   'b5200000-0000-4000-8000-000000000001',
   'b5300000-0000-4000-8000-000000000001',
   'b1000000-0000-4000-8000-000000000001',
   'b1000000-0000-4000-8000-000000000002',
   'b5100000-0000-4000-8000-000000000001','completed',10000,1),
  ('b5400000-0000-4000-8000-000000000002',
   'b5200000-0000-4000-8000-000000000002',
   'b5300000-0000-4000-8000-000000000002',
   'b1000000-0000-4000-8000-000000000002',
   'b1000000-0000-4000-8000-000000000003',
   'b5100000-0000-4000-8000-000000000002','completed',10000,1),
  ('b5400000-0000-4000-8000-000000000003',
   'b5200000-0000-4000-8000-000000000003',
   'b5300000-0000-4000-8000-000000000003',
   'b1000000-0000-4000-8000-000000000002',
   'b1000000-0000-4000-8000-000000000002',
   'b5100000-0000-4000-8000-000000000002','completed',10000,1),
  ('b5400000-0000-4000-8000-000000000004',
   'b5200000-0000-4000-8000-000000000004',
   'b5300000-0000-4000-8000-000000000004',
   'b1000000-0000-4000-8000-000000000002',
   'b1000000-0000-4000-8000-000000000001',
   'b5100000-0000-4000-8000-000000000002','completed',10000,1);

insert into public.conversations(id,job_id,status,created_at) values
  ('b5500000-0000-4000-8000-000000000001',
   'b5400000-0000-4000-8000-000000000001','active','2026-07-01 00:00:00+00'),
  ('b5500000-0000-4000-8000-000000000002',
   'b5400000-0000-4000-8000-000000000002','active','2026-07-15 00:00:00+00'),
  ('b5500000-0000-4000-8000-000000000004',
   'b5400000-0000-4000-8000-000000000004','active','2026-08-01 00:00:00+00');
insert into public.conversation_members(conversation_id,user_id,member_role) values
  ('b5500000-0000-4000-8000-000000000001',
   'b1000000-0000-4000-8000-000000000001','customer'),
  ('b5500000-0000-4000-8000-000000000001',
   'b1000000-0000-4000-8000-000000000002','provider'),
  ('b5500000-0000-4000-8000-000000000002',
   'b1000000-0000-4000-8000-000000000002','customer'),
  ('b5500000-0000-4000-8000-000000000002',
   'b1000000-0000-4000-8000-000000000003','provider'),
  ('b5500000-0000-4000-8000-000000000004',
   'b1000000-0000-4000-8000-000000000002','customer'),
  ('b5500000-0000-4000-8000-000000000004',
   'b1000000-0000-4000-8000-000000000001','provider');
insert into public.messages(
  id,conversation_id,sender_id,body,client_message_id
) values(
  'b5600000-0000-4000-8000-000000000001',
  'b5500000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000002',
  'Synthetic dual-role provider message','pagination-provider-message'
);
insert into public.ratings(
  id,job_id,customer_id,provider_id,score,review,moderation_status
) values(
  'b5700000-0000-4000-8000-000000000001',
  'b5400000-0000-4000-8000-000000000002',
  'b1000000-0000-4000-8000-000000000002',
  'b1000000-0000-4000-8000-000000000003',1,
  'Synthetic dual-role customer rating','published'
);

insert into public.support_cases(
  id,opened_by,topic,priority,status,subject,created_at
) select
  format('b4000000-0000-4000-8000-%s',lpad(n::text,12,'0'))::uuid,
  'b1000000-0000-4000-8000-000000000001',
  'marketplace_abuse','normal','open','Pagination fixture report',
  '2026-08-01 00:00:00+00'::timestamptz+n*interval '1 minute'
from generate_series(1,161) n;

insert into public.marketplace_reports(
  id,reporter_id,reported_user_id,target_type,target_id,support_case_id,
  reason_category,status,priority,created_at,updated_at,text_snapshot,
  attachment_evidence
) select
  format('b3000000-0000-4000-8000-%s',lpad(n::text,12,'0'))::uuid,
  'b1000000-0000-4000-8000-000000000001',
  format('b2000000-0000-4000-8000-%s',lpad(n::text,12,'0'))::uuid,
  'user',format('b2000000-0000-4000-8000-%s',lpad(n::text,12,'0'))::uuid,
  format('b4000000-0000-4000-8000-%s',lpad(n::text,12,'0'))::uuid,
  'other',
  case
    when n<=40 and n%2=0 then 'resolved'
    when n<=40 then 'dismissed'
    when n%3=0 then 'submitted'
    when n%3=1 then 'triaged'
    else 'escalated'
  end,
  'normal',
  case
    when n<=40 then '2026-08-01 00:00:00+00'::timestamptz+n*interval '1 minute'
    else '2026-08-02 00:00:00+00'::timestamptz+floor((n-41)/7)*interval '1 minute'
  end,
  case
    when n<=40 then '2026-08-01 00:00:00+00'::timestamptz+n*interval '1 minute'
    else '2026-08-02 00:00:00+00'::timestamptz+floor((n-41)/7)*interval '1 minute'
  end,
  case when n=41 then 'Scoped support evidence must stay private' else null end,
  case when n=41 then jsonb_build_array(jsonb_build_object(
    'attachmentId','b7000000-0000-4000-8000-000000000001',
    'uploadId','b7100000-0000-4000-8000-000000000001',
    'mimeType','image/jpeg','sizeBytes',321,'contentSha256',repeat('a',64)
  )) else '[]'::jsonb end
from generate_series(1,161) n;

insert into public.marketplace_report_events(
  id,report_id,actor_id,event_type,from_status,to_status,reason,payload,
  idempotency_key,created_at
) values(
  'b7200000-0000-4000-8000-000000000001',
  'b3000000-0000-4000-8000-000000000041',
  'b1000000-0000-4000-8000-000000000001',
  'triaged','submitted','triaged','Scoped support history fixture','{}',
  'pagination-history-fixture','2026-08-02 00:01:00+00'
);

insert into public.support_case_assignments(
  case_id,assignee_id,assigned_by,permissions
) values(
  'b4000000-0000-4000-8000-000000000041',
  'b1000000-0000-4000-8000-000000000005',
  'b1000000-0000-4000-8000-000000000004',array['read']::text[]
);

insert into public.support_cases(
  id,opened_by,request_id,job_id,topic,priority,status,subject
) values
  ('b5800000-0000-4000-8000-000000000001',
   'b1000000-0000-4000-8000-000000000001',
   'b5200000-0000-4000-8000-000000000001',
   'b5400000-0000-4000-8000-000000000001',
   'marketplace_abuse','normal','open','Provider target'),
  ('b5800000-0000-4000-8000-000000000002',
   'b1000000-0000-4000-8000-000000000003',
   'b5200000-0000-4000-8000-000000000002',
   'b5400000-0000-4000-8000-000000000002',
   'marketplace_abuse','normal','open','Customer target'),
  ('b5800000-0000-4000-8000-000000000003',
   'b1000000-0000-4000-8000-000000000001',
   'b5200000-0000-4000-8000-000000000001',
   'b5400000-0000-4000-8000-000000000001',
   'marketplace_abuse','normal','open','Message target'),
  ('b5800000-0000-4000-8000-000000000004',
   'b1000000-0000-4000-8000-000000000003',
   'b5200000-0000-4000-8000-000000000002',
   'b5400000-0000-4000-8000-000000000002',
   'marketplace_abuse','normal','open','Rating target'),
  ('b5800000-0000-4000-8000-000000000005',
   'b1000000-0000-4000-8000-000000000001',null,null,
   'marketplace_abuse','normal','open','Missing target context'),
  ('b5800000-0000-4000-8000-000000000006',
   'b1000000-0000-4000-8000-000000000003',
   'b5200000-0000-4000-8000-000000000001',
   'b5400000-0000-4000-8000-000000000001',
   'marketplace_abuse','normal','open','Unrelated target context'),
  ('b5800000-0000-4000-8000-000000000007',
   'b1000000-0000-4000-8000-000000000003',
   'b5200000-0000-4000-8000-000000000003',
   'b5400000-0000-4000-8000-000000000003',
   'marketplace_abuse','normal','open','Ambiguous target context');

insert into public.marketplace_reports(
  id,reporter_id,reported_user_id,target_type,target_id,conversation_id,message_id,
  rating_id,job_id,request_id,support_case_id,reason_category,status,priority,
  created_at,updated_at
) values
  ('b5900000-0000-4000-8000-000000000001',
   'b1000000-0000-4000-8000-000000000001',
   'b1000000-0000-4000-8000-000000000002','user',
   'b1000000-0000-4000-8000-000000000002',
   'b5500000-0000-4000-8000-000000000001',null,null,
   'b5400000-0000-4000-8000-000000000001',
   'b5200000-0000-4000-8000-000000000001',
   'b5800000-0000-4000-8000-000000000001','safety','resolved','high',now(),now()),
  ('b5900000-0000-4000-8000-000000000002',
   'b1000000-0000-4000-8000-000000000003',
   'b1000000-0000-4000-8000-000000000002','user',
   'b1000000-0000-4000-8000-000000000002',
   'b5500000-0000-4000-8000-000000000002',null,null,
   'b5400000-0000-4000-8000-000000000002',
   'b5200000-0000-4000-8000-000000000002',
   'b5800000-0000-4000-8000-000000000002','safety','resolved','high',now(),now()),
  ('b5900000-0000-4000-8000-000000000003',
   'b1000000-0000-4000-8000-000000000001',
   'b1000000-0000-4000-8000-000000000002','message',
   'b5600000-0000-4000-8000-000000000001',
   'b5500000-0000-4000-8000-000000000001',
   'b5600000-0000-4000-8000-000000000001',null,
   'b5400000-0000-4000-8000-000000000001',
   'b5200000-0000-4000-8000-000000000001',
   'b5800000-0000-4000-8000-000000000003','harassment','resolved','normal',now(),now()),
  ('b5900000-0000-4000-8000-000000000004',
   'b1000000-0000-4000-8000-000000000003',
   'b1000000-0000-4000-8000-000000000002','rating',
   'b5700000-0000-4000-8000-000000000001',null,null,
   'b5700000-0000-4000-8000-000000000001',
   'b5400000-0000-4000-8000-000000000002',
   'b5200000-0000-4000-8000-000000000002',
   'b5800000-0000-4000-8000-000000000004','rating_abuse','resolved','normal',now(),now()),
  ('b5900000-0000-4000-8000-000000000005',
   'b1000000-0000-4000-8000-000000000001',
   'b2000000-0000-4000-8000-000000000001','user',
   'b2000000-0000-4000-8000-000000000001',null,null,null,null,null,
   'b5800000-0000-4000-8000-000000000005','other','resolved','normal',now(),now()),
  ('b5900000-0000-4000-8000-000000000006',
   'b1000000-0000-4000-8000-000000000003',
   'b2000000-0000-4000-8000-000000000161','user',
   'b2000000-0000-4000-8000-000000000161',null,null,null,
   'b5400000-0000-4000-8000-000000000001',
   'b5200000-0000-4000-8000-000000000001',
   'b5800000-0000-4000-8000-000000000006','other','resolved','normal',now(),now()),
  ('b5900000-0000-4000-8000-000000000007',
   'b1000000-0000-4000-8000-000000000003',
   'b1000000-0000-4000-8000-000000000002','user',
   'b1000000-0000-4000-8000-000000000002',null,null,null,
   'b5400000-0000-4000-8000-000000000003',
   'b5200000-0000-4000-8000-000000000003',
   'b5800000-0000-4000-8000-000000000007','other','resolved','normal',now(),now());

create temp table moderation_extension_results(
  key text primary key,
  payload jsonb
);
grant select,insert,update,delete on moderation_extension_results to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000001',true);
select throws_ok(
  $$select public.create_marketplace_report(
    'user','b1000000-0000-4000-8000-000000000002','safety',
    'Legacy user intake lacks authoritative context','pagination-v1-user-denied'
  )$$,
  'REPORT_CONTEXT_REQUIRED',
  'v1 user report intake fails closed and requires the context-bound API'
);
select throws_ok(
  $$select public.create_marketplace_report_v2(
    'user','b1000000-0000-4000-8000-000000000002',null,
    'safety','Missing conversation','pagination-v2-user-missing-context'
  )$$,
  'REPORT_CONTEXT_REQUIRED',
  'a user report cannot omit its authoritative conversation'
);
select throws_ok(
  $$select public.create_marketplace_report_v2(
    'user','b1000000-0000-4000-8000-000000000003',
    'b5500000-0000-4000-8000-000000000001','safety',
    'Target is not the other participant','pagination-v2-user-target-mismatch'
  )$$,
  'REPORT_TARGET_NOT_AVAILABLE',
  'a user report target must be the exact other conversation participant'
);
select throws_ok(
  $$select public.create_marketplace_report_v2(
    'user','b1000000-0000-4000-8000-000000000003',
    'b5500000-0000-4000-8000-000000000002','safety',
    'Actor is not a member','pagination-v2-user-wrong-conversation'
  )$$,
  'REPORT_TARGET_NOT_AVAILABLE',
  'a caller cannot bind a user report to another pair conversation'
);
select throws_ok(
  $$select public.create_marketplace_report_v2(
    'message','b5600000-0000-4000-8000-000000000001',
    'b5500000-0000-4000-8000-000000000001','harassment',
    'Message context must be derived','pagination-v2-message-context-rejected'
  )$$,
  'REPORT_CONTEXT_NOT_ALLOWED',
  'message reports reject caller-supplied context instead of trusting it'
);
select lives_ok(
  $$insert into moderation_extension_results(key,payload) values(
    'v2_old_context',public.create_marketplace_report_v2(
      'user','b1000000-0000-4000-8000-000000000002',
      'b5500000-0000-4000-8000-000000000001','safety',
      'Report the provider in the older exact job','pagination-v2-old-context'
    )
  )$$,
  'a non-latest reversed dual-role relationship is reported by exact conversation'
);
select is(
  public.create_marketplace_report_v2(
    'user','b1000000-0000-4000-8000-000000000002',
    'b5500000-0000-4000-8000-000000000001','safety',
    'Report the provider in the older exact job','pagination-v2-old-context'
  )->>'reportId',
  (select payload->>'reportId' from moderation_extension_results where key='v2_old_context'),
  'context-bound report intake replays the exact request after response loss'
);
select throws_ok(
  $$select public.create_marketplace_report_v2(
    'user','b1000000-0000-4000-8000-000000000002',
    'b5500000-0000-4000-8000-000000000004','safety',
    'Same key with another valid conversation','pagination-v2-old-context'
  )$$,
  'IDEMPOTENCY_KEY_CONFLICT',
  'conversation context participates in the canonical request hash'
);
select lives_ok(
  $$insert into moderation_extension_results(key,payload) values(
    'v2_same_context_dedupe',public.create_marketplace_report_v2(
      'user','b1000000-0000-4000-8000-000000000002',
      'b5500000-0000-4000-8000-000000000001','spam',
      'Same context should deduplicate','pagination-v2-same-context'
    )
  )$$,
  'a second active report in the same conversation is deduplicated'
);
select lives_ok(
  $$insert into moderation_extension_results(key,payload) values(
    'v2_new_context',public.create_marketplace_report_v2(
      'user','b1000000-0000-4000-8000-000000000002',
      'b5500000-0000-4000-8000-000000000004','safety',
      'Report the customer in the newer reversed job','pagination-v2-new-context'
    )
  )$$,
  'the same dual-role user can be reported in a distinct job conversation'
);
select lives_ok(
  $$insert into moderation_extension_results(key,payload) values(
    'v2_message_compat',public.create_marketplace_report_v2(
      'message','b5600000-0000-4000-8000-000000000001',null,
      'harassment','Derived message context remains compatible',
      'pagination-v2-message-compatible'
    )
  )$$,
  'message reports preserve authoritative derivation when context is null'
);
reset role;

select is(
  (select payload->>'reportId' from moderation_extension_results
   where key='v2_same_context_dedupe'),
  (select payload->>'reportId' from moderation_extension_results
   where key='v2_old_context'),
  'same-conversation user reports share one active authoritative report'
);
select isnt(
  (select payload->>'reportId' from moderation_extension_results where key='v2_new_context'),
  (select payload->>'reportId' from moderation_extension_results where key='v2_old_context'),
  'distinct conversations produce distinct active reports for the same user pair'
);
select is(
  (select conversation_id from public.marketplace_reports
   where id=(select (payload->>'reportId')::uuid from moderation_extension_results
             where key='v2_old_context')),
  'b5500000-0000-4000-8000-000000000001'::uuid,
  'the report stores the exact conversation instead of the latest relationship'
);
select is(
  (select job_id from public.marketplace_reports
   where id=(select (payload->>'reportId')::uuid from moderation_extension_results
             where key='v2_new_context')),
  'b5400000-0000-4000-8000-000000000004'::uuid,
  'stored job context is derived from the selected conversation'
);
select is(
  (select request_id from public.marketplace_reports
   where id=(select (payload->>'reportId')::uuid from moderation_extension_results
             where key='v2_new_context')),
  'b5200000-0000-4000-8000-000000000004'::uuid,
  'stored request context is derived from the selected conversation job'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000004',true);
select lives_ok(
  $$insert into moderation_extension_results(key,payload)
    values('open_page_one',public.list_open_marketplace_reports(100,null,null))$$,
  'operations can load the first bounded open-report page'
);
select lives_ok(
  $$insert into moderation_extension_results(key,payload)
    select 'open_page_two',public.list_open_marketplace_reports(
      100,
      (payload->'nextCursor'->>'createdAt')::timestamptz,
      (payload->'nextCursor'->>'reportId')::uuid
    ) from moderation_extension_results where key='open_page_one'$$,
  'operations can continue from the opaque created-at and report-ID cursor'
);
reset role;

select is(
  jsonb_array_length(coalesce(
    (select payload->'reports' from moderation_extension_results where key='open_page_one'),
    '[]'::jsonb
  )),100,
  'the first page contains 100 open reports even when older final reports exist'
);
select is(
  (select payload->>'hasMore' from moderation_extension_results where key='open_page_one'),
  'true','the first open page advertises another page'
);
select is(
  (select payload->'nextCursor'->>'reportId'
   from moderation_extension_results where key='open_page_one'),
  (select payload->'reports'->99->>'reportId'
   from moderation_extension_results where key='open_page_one'),
  'the next cursor is the last returned report rather than an offset'
);
select is(
  jsonb_array_length(coalesce(
    (select payload->'reports' from moderation_extension_results where key='open_page_two'),
    '[]'::jsonb
  )),
  (select count(*)::integer-100 from public.marketplace_reports
   where status in ('submitted','triaged','escalated')),
  'the second page reaches every remaining open fixture report'
);
select is(
  (select payload->>'hasMore' from moderation_extension_results where key='open_page_two'),
  'false','the final open page terminates pagination'
);
select is(
  (select payload->'nextCursor'
   from moderation_extension_results where key='open_page_two'),
  'null'::jsonb,'the final page returns a null next cursor'
);
select ok(
  (select bool_and(report->>'status' in ('submitted','triaged','escalated'))
   from moderation_extension_results result
   cross join lateral jsonb_array_elements(result.payload->'reports') report
   where result.key in ('open_page_one','open_page_two')),
  'resolved and dismissed reports never occupy open queue slots'
);
select is(
  (select count(distinct report->>'reportId')
   from moderation_extension_results result
   cross join lateral jsonb_array_elements(result.payload->'reports') report
   where result.key in ('open_page_one','open_page_two')),
  (select count(*) from public.marketplace_reports
   where status in ('submitted','triaged','escalated')),
  'all open reports are reachable exactly once across keyset pages'
);
select is(
  (select count(*)
   from jsonb_array_elements(
     (select payload->'reports' from moderation_extension_results where key='open_page_one')
   ) first_page
   join jsonb_array_elements(
     (select payload->'reports' from moderation_extension_results where key='open_page_two')
   ) second_page on second_page->>'reportId'=first_page->>'reportId'),
  0::bigint,'keyset pages contain no duplicate report IDs'
);
select ok(
  (select (
      (first_page.payload->'reports'->99->>'createdAt')::timestamptz,
      (first_page.payload->'reports'->99->>'reportId')::uuid
    ) < (
      (second_page.payload->'reports'->0->>'createdAt')::timestamptz,
      (second_page.payload->'reports'->0->>'reportId')::uuid
    )
   from moderation_extension_results first_page
   cross join moderation_extension_results second_page
   where first_page.key='open_page_one' and second_page.key='open_page_two'),
  'created-at and UUID ordering remains strict when a timestamp spans the page boundary'
);
select ok(
  (select report ? 'textSnapshot' and report ? 'attachmentEvidence'
   from jsonb_array_elements(
     (select payload->'reports' from moderation_extension_results where key='open_page_one')
   ) report
   where report->>'reportId'='b3000000-0000-4000-8000-000000000041'),
  'operations retain bounded evidence in the open projection'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000005',true);
select lives_ok(
  $$insert into moderation_extension_results(key,payload)
    values('support_open_page',public.list_open_marketplace_reports(100,null,null))$$,
  'scoped support can use the paginated queue without broad operations access'
);
reset role;
select is(
  jsonb_array_length(coalesce(
    (select payload->'reports' from moderation_extension_results where key='support_open_page'),
    '[]'::jsonb
  )),1,
  'support pagination returns only the actively assigned case'
);
select is(
  (select jsonb_array_length(report->'history')
   from jsonb_array_elements(
     (select payload->'reports' from moderation_extension_results where key='support_open_page')
   ) report),
  1,'scoped support retains bounded immutable report history'
);
select ok(
  (select not (report ? 'textSnapshot') and not (report ? 'attachmentEvidence')
   from jsonb_array_elements(
     (select payload->'reports' from moderation_extension_results where key='support_open_page')
   ) report),
  'read-only support receives no report evidence through pagination'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000001',true);
select throws_ok(
  $$select public.list_open_marketplace_reports(50,null,null)$$,
  'MODERATION_PERMISSION_REQUIRED',
  'ordinary marketplace users cannot read the open moderation queue'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000004',true);
select throws_ok(
  $$select public.list_open_marketplace_reports(null,null,null)$$,
  'INVALID_PAGE_LIMIT','null cannot disable the open queue page bound'
);
select throws_ok(
  $$select public.list_open_marketplace_reports(0,null,null)$$,
  'INVALID_PAGE_LIMIT','zero is not a valid open queue page bound'
);
select throws_ok(
  $$select public.list_open_marketplace_reports(101,null,null)$$,
  'INVALID_PAGE_LIMIT','open queue pages cannot exceed 100 reports'
);
select throws_ok(
  $$select public.list_open_marketplace_reports(
    50,'2026-08-02 00:00:00+00',null
  )$$,
  'INVALID_PAGE_CURSOR','partial open queue cursors fail closed'
);

select lives_ok(
  $$insert into moderation_extension_results(key,payload) values
    ('provider_user_target',public.get_marketplace_report_enforcement_target(
      'b5900000-0000-4000-8000-000000000001'
    ))$$,
  'operations can resolve a dual-role provider from its report job context'
);
select lives_ok(
  $$insert into moderation_extension_results(key,payload) values
    ('customer_user_target',public.get_marketplace_report_enforcement_target(
      'b5900000-0000-4000-8000-000000000002'
    ))$$,
  'a final report remains available for its separately authorized enforcement action'
);
select lives_ok(
  $$insert into moderation_extension_results(key,payload) values
    ('provider_message_target',public.get_marketplace_report_enforcement_target(
      'b5900000-0000-4000-8000-000000000003'
    ))$$,
  'message context derives a dual-role sender as the job provider'
);
select lives_ok(
  $$insert into moderation_extension_results(key,payload) values
    ('customer_rating_target',public.get_marketplace_report_enforcement_target(
      'b5900000-0000-4000-8000-000000000004'
    ))$$,
  'rating context derives a dual-role rating author as the job customer'
);
select lives_ok(
  $$insert into moderation_extension_results(key,payload)
    select 'v2_old_enforcement',public.get_marketplace_report_enforcement_target(
      (payload->>'reportId')::uuid
    ) from moderation_extension_results where key='v2_old_context'$$,
  'operations derive enforcement from the older stored user-report conversation'
);
select lives_ok(
  $$insert into moderation_extension_results(key,payload)
    select 'v2_new_enforcement',public.get_marketplace_report_enforcement_target(
      (payload->>'reportId')::uuid
    ) from moderation_extension_results where key='v2_new_context'$$,
  'operations derive enforcement from the newer reversed user-report conversation'
);
reset role;

select is(
  (select payload->>'targetRole' from moderation_extension_results
   where key='provider_user_target'),
  'provider','user reports use the reported user role in the authoritative job'
);
select is(
  (select payload->>'targetRole' from moderation_extension_results
   where key='customer_user_target'),
  'customer','global provider membership cannot override customer job context'
);
select is(
  (select payload->>'targetRole' from moderation_extension_results
   where key='provider_message_target'),
  'provider','message sender role comes from the message conversation job'
);
select is(
  (select payload->>'targetRole' from moderation_extension_results
   where key='customer_rating_target'),
  'customer','rating author role comes from the rating job'
);
select is(
  (select payload->>'targetRole' from moderation_extension_results
   where key='v2_old_enforcement'),
  'provider','the same dual-role target is a provider in the older exact context'
);
select is(
  (select payload->>'targetRole' from moderation_extension_results
   where key='v2_new_enforcement'),
  'customer','the same dual-role target is a customer in the newer exact context'
);
select ok(
  (select bool_and((select count(*) from jsonb_object_keys(result.payload))=4)
   from moderation_extension_results result
   where result.key in (
     'provider_user_target','customer_user_target',
     'provider_message_target','customer_rating_target'
   )),
  'enforcement targets expose only report, case, user, and contextual role identifiers'
);
select is(
  (select payload->>'reportedUserId' from moderation_extension_results
   where key='customer_user_target'),
  'b1000000-0000-4000-8000-000000000002',
  'enforcement target is bound to the report instead of caller input'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000004',true);
select lives_ok(
  $$insert into moderation_extension_results(key,payload) values(
    'batch_targets',public.get_marketplace_report_enforcement_targets(array[
      'b5900000-0000-4000-8000-000000000001'::uuid,
      'b5900000-0000-4000-8000-000000000002'::uuid,
      'b5900000-0000-4000-8000-000000000003'::uuid,
      'b5900000-0000-4000-8000-000000000004'::uuid
    ])
  )$$,
  'operations can resolve a bounded batch of contextual enforcement targets'
);
reset role;
select is(
  (select payload from moderation_extension_results where key='batch_targets'),
  jsonb_build_object('targets',jsonb_build_array(
    jsonb_build_object(
      'reportId','b5900000-0000-4000-8000-000000000001',
      'supportCaseId','b5800000-0000-4000-8000-000000000001',
      'reportedUserId','b1000000-0000-4000-8000-000000000002',
      'targetRole','provider'
    ),
    jsonb_build_object(
      'reportId','b5900000-0000-4000-8000-000000000002',
      'supportCaseId','b5800000-0000-4000-8000-000000000002',
      'reportedUserId','b1000000-0000-4000-8000-000000000002',
      'targetRole','customer'
    ),
    jsonb_build_object(
      'reportId','b5900000-0000-4000-8000-000000000003',
      'supportCaseId','b5800000-0000-4000-8000-000000000003',
      'reportedUserId','b1000000-0000-4000-8000-000000000002',
      'targetRole','provider'
    ),
    jsonb_build_object(
      'reportId','b5900000-0000-4000-8000-000000000004',
      'supportCaseId','b5800000-0000-4000-8000-000000000004',
      'reportedUserId','b1000000-0000-4000-8000-000000000002',
      'targetRole','customer'
    )
  )),
  'batch output preserves input order and exposes exactly four non-PII fields per target'
);

update public.marketplace_reports
set reporter_id='b1000000-0000-4000-8000-000000000003',
    conversation_id='b5500000-0000-4000-8000-000000000002',
    job_id='b5400000-0000-4000-8000-000000000002',
    request_id='b5200000-0000-4000-8000-000000000002'
where id='b5900000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000004',true);
select throws_ok(
  $$select public.get_marketplace_report_enforcement_target(
    'b5900000-0000-4000-8000-000000000003'
  )$$,
  'REPORT_ENFORCEMENT_TARGET_NOT_AVAILABLE',
  'scalar enforcement fails closed when a message belongs to another conversation'
);
select throws_ok(
  $$select public.get_marketplace_report_enforcement_targets(array[
    'b5900000-0000-4000-8000-000000000003'::uuid
  ])$$,
  'REPORT_ENFORCEMENT_TARGET_NOT_AVAILABLE',
  'batch enforcement matches scalar failure for cross-conversation message context'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000004',true);
select throws_ok(
  $$select public.get_marketplace_report_enforcement_targets(null::uuid[])$$,
  'INVALID_REPORT_TARGET_BATCH',
  'a null enforcement-target batch fails closed'
);
select throws_ok(
  $$select public.get_marketplace_report_enforcement_targets(array[]::uuid[])$$,
  'INVALID_REPORT_TARGET_BATCH',
  'an empty enforcement-target batch fails closed'
);
select throws_ok(
  $$select public.get_marketplace_report_enforcement_targets(array[
    'b5900000-0000-4000-8000-000000000001'::uuid,null::uuid
  ])$$,
  'INVALID_REPORT_TARGET_BATCH',
  'a batch containing a null report ID fails closed'
);
select throws_ok(
  $$select public.get_marketplace_report_enforcement_targets(array[
    'b5900000-0000-4000-8000-000000000001'::uuid,
    'b5900000-0000-4000-8000-000000000001'::uuid
  ])$$,
  'DUPLICATE_REPORT_ID',
  'duplicate report IDs are rejected instead of producing duplicate enforcement actions'
);
select throws_ok(
  $$select public.get_marketplace_report_enforcement_targets(array(
    select format('ba000000-0000-4000-8000-%s',lpad(n::text,12,'0'))::uuid
    from generate_series(1,101) n
  ))$$,
  'INVALID_REPORT_TARGET_BATCH',
  'an enforcement-target batch cannot exceed 100 unique reports'
);
select throws_ok(
  $$select public.get_marketplace_report_enforcement_targets(array[
    'b5900000-0000-4000-8000-000000000001'::uuid,
    'b5900000-0000-4000-8000-000000000099'::uuid,
    'b5900000-0000-4000-8000-000000000002'::uuid
  ])$$,
  'REPORT_ENFORCEMENT_TARGET_NOT_AVAILABLE',
  'one missing report fails the whole batch without a partial projection'
);
select throws_ok(
  $$select public.get_marketplace_report_enforcement_targets(array[
    'b5900000-0000-4000-8000-000000000001'::uuid,
    'b5900000-0000-4000-8000-000000000007'::uuid
  ])$$,
  'REPORT_ENFORCEMENT_TARGET_NOT_AVAILABLE',
  'one ambiguous report fails the whole batch without a partial projection'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000005',true);
select throws_ok(
  $$select public.get_marketplace_report_enforcement_targets(array[
    'b5900000-0000-4000-8000-000000000001'::uuid
  ])$$,
  'MODERATION_PERMISSION_REQUIRED',
  'support cannot obtain batch account-enforcement targets'
);
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000006',true);
select throws_ok(
  $$select public.get_marketplace_report_enforcement_targets(array[
    'b5900000-0000-4000-8000-000000000001'::uuid
  ])$$,
  'MODERATION_PERMISSION_REQUIRED',
  'operations read without mutate cannot obtain batch enforcement targets'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000004',true);
select throws_ok(
  $$select public.get_marketplace_report_enforcement_target(
    'b5900000-0000-4000-8000-000000000099'
  )$$,
  'REPORT_ENFORCEMENT_TARGET_NOT_AVAILABLE',
  'unknown reports fail closed without an existence oracle'
);
select throws_ok(
  $$select public.get_marketplace_report_enforcement_target(
    'b5900000-0000-4000-8000-000000000005'
  )$$,
  'REPORT_ENFORCEMENT_TARGET_NOT_AVAILABLE',
  'reports missing authoritative marketplace context fail closed'
);
select throws_ok(
  $$select public.get_marketplace_report_enforcement_target(
    'b5900000-0000-4000-8000-000000000006'
  )$$,
  'REPORT_ENFORCEMENT_TARGET_NOT_AVAILABLE',
  'reported users unrelated to the authoritative job fail closed'
);
select throws_ok(
  $$select public.get_marketplace_report_enforcement_target(
    'b5900000-0000-4000-8000-000000000007'
  )$$,
  'REPORT_ENFORCEMENT_TARGET_NOT_AVAILABLE',
  'ambiguous customer/provider job context fails closed'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000005',true);
select throws_ok(
  $$select public.get_marketplace_report_enforcement_target(
    'b5900000-0000-4000-8000-000000000001'
  )$$,
  'MODERATION_PERMISSION_REQUIRED',
  'scoped support cannot obtain an account-enforcement target'
);
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000006',true);
select throws_ok(
  $$select public.get_marketplace_report_enforcement_target(
    'b5900000-0000-4000-8000-000000000001'
  )$$,
  'MODERATION_PERMISSION_REQUIRED',
  'operations read without mutation permission cannot obtain an enforcement target'
);
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000007',true);
select throws_ok(
  $$select public.get_marketplace_report_enforcement_target(
    'b5900000-0000-4000-8000-000000000001'
  )$$,
  'MODERATION_PERMISSION_REQUIRED',
  'finance staff cannot obtain marketplace enforcement targets'
);
reset role;

insert into public.push_tokens(
  id,user_id,token_ciphertext,provider,enabled
) values(
  'b1900000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  'encrypted-pagination-target-token','expo',true
);
insert into auth.sessions(id,user_id,created_at,updated_at,not_after) values(
  'b1800000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  now(),now(),now()+interval '1 day'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000004',true);
select lives_ok(
  $$select public.admin_set_customer_status(
    'b1000000-0000-4000-8000-000000000001','suspended',
    '  Credible policy abuse report  ','customer-status-response-loss-001'
  )$$,
  'operations can suspend a customer through the authoritative command'
);
select lives_ok(
  $$select public.admin_set_customer_status(
    'b1000000-0000-4000-8000-000000000001','suspended',
    'Credible policy abuse report','customer-status-response-loss-001'
  )$$,
  'the same normalized status command replays after response loss'
);
select throws_ok(
  $$select public.admin_set_customer_status(
    'b1000000-0000-4000-8000-000000000001','suspended',
    'Different policy abuse reason','customer-status-response-loss-001'
  )$$,
  'IDEMPOTENCY_KEY_CONFLICT',
  'the same customer-status key rejects an altered canonical payload'
);
reset role;

select is(
  (select status from public.profiles
   where id='b1000000-0000-4000-8000-000000000001'),
  'suspended'::public.account_status,
  'the customer status mutation is authoritative'
);
select is(
  (select count(*) from public.moderation_actions
   where target_user_id='b1000000-0000-4000-8000-000000000001'
     and actor_id='b1000000-0000-4000-8000-000000000004'
     and action_type='customer.suspend'),
  1::bigint,
  'response-loss replay emits one customer suspension moderation action'
);
select is(
  (select count(*) from public.admin_audit_logs
   where target_id='b1000000-0000-4000-8000-000000000001'
     and actor_id='b1000000-0000-4000-8000-000000000004'
     and action='customer.status.change'),
  1::bigint,
  'response-loss replay emits one customer status audit event'
);
select is(
  (select count(*) from public.idempotency_keys
   where user_id='b1000000-0000-4000-8000-000000000004'
     and command='admin_set_customer_status_v2'
     and key='customer-status-response-loss-001'
     and status='completed'
     and request_hash is not null
     and response=jsonb_build_object('status','suspended')),
  1::bigint,
  'the status command completes one hashed v2 idempotency record with a safe response'
);
select is(
  (select enabled from public.push_tokens
   where id='b1900000-0000-4000-8000-000000000001'),
  false,
  'customer suspension disables existing push tokens'
);
select is(
  (select count(*) from auth.sessions
   where id='b1800000-0000-4000-8000-000000000001'),
  0::bigint,
  'customer suspension revokes existing sessions'
);

update public.user_roles set revoked_at=now()
where user_id='b1000000-0000-4000-8000-000000000004'
  and role='operations_admin';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000004',true);
select throws_ok(
  $$select public.admin_set_customer_status(
    'b1000000-0000-4000-8000-000000000001','suspended',
    'Credible policy abuse report','customer-status-response-loss-001'
  )$$,
  'OPERATIONS_PERMISSION_REQUIRED',
  'current operations authorization is rechecked before a completed replay'
);
reset role;
update public.user_roles set revoked_at=null
where user_id='b1000000-0000-4000-8000-000000000004'
  and role='operations_admin';

select * from finish();
rollback;
