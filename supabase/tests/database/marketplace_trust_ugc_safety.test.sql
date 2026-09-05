begin;

select no_plan();

select has_table(
  'public','marketplace_reports',
  'marketplace reports have a private authoritative workflow root'
);
select has_table(
  'public','marketplace_report_events',
  'marketplace report transitions have append-only evidence'
);
select has_table(
  'public','user_block_events',
  'block state changes have append-only evidence'
);
select has_function(
  'public','set_user_block',
  array['uuid','boolean','text','text'],
  'block and unblock use an explicit desired-state command'
);
select has_function(
  'public','create_marketplace_report',
  array['text','uuid','text','text','text'],
  'marketplace reports use one server-authoritative command'
);
select has_function(
  'public','create_marketplace_report_v2',
  array['text','uuid','uuid','text','text','text'],
  'user reports use an explicit authoritative conversation context'
);
select has_function(
  'public','list_marketplace_reports',
  array['text','integer'],
  'moderation reads use a least-privilege RPC projection'
);
select has_function(
  'public','triage_marketplace_report',
  array['uuid','text','text','integer','text'],
  'moderation triage is versioned and idempotent'
);
select has_function(
  'public','resolve_marketplace_report',
  array['uuid','text','text','integer','text'],
  'moderation resolution is versioned and idempotent'
);
select has_function(
  'public','get_marketplace_trust_context',
  array['uuid'],
  'clients receive server-derived communication state'
);
select has_function(
  'public','authorize_message_media',
  array['uuid','uuid'],
  'protected message media uses a dedicated server authority'
);
select has_function(
  'private','lock_marketplace_pair',
  array['uuid','uuid'],
  'block and send commands share one canonical customer/provider transaction lock'
);
select ok(
  (select position(
    'date_trunc(''hour'',clock_timestamp(),''UTC'')'
    in regexp_replace(p.prosrc,'\s','','g')
  )>0
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='private' and p.proname='set_user_block_pre_safe_projection'),
  'block command derives rate buckets in explicit UTC'
);
select ok(
  (select position(
    'date_trunc(''hour'',clock_timestamp(),''UTC'')'
    in regexp_replace(p.prosrc,'\s','','g')
  )>0
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='private' and p.proname='create_marketplace_report_pre_context'),
  'compatibility report intake derives rate buckets in explicit UTC'
);
select ok(
  case when to_regprocedure(
    'public.create_marketplace_report_v2(text,uuid,uuid,text,text,text)'
  ) is null then false else (
    select position(
      'date_trunc(''hour'',clock_timestamp(),''UTC'')'
      in regexp_replace(p.prosrc,'\s','','g')
    )>0
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='create_marketplace_report_v2'
  ) end,
  'context-bound report intake derives rate buckets in explicit UTC'
);
select ok(
  (select position(
    'date_trunc(''minute'',clock_timestamp(),''UTC'')'
    in regexp_replace(p.prosrc,'\s','','g')
  )>0
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='send_message_with_attachments'),
  'message command derives rate buckets in explicit UTC'
);
select ok(
  not has_table_privilege('authenticated','public.blocked_users','INSERT'),
  'authenticated clients cannot insert block rows directly'
);
select ok(
  not has_table_privilege('authenticated','public.blocked_users','UPDATE'),
  'authenticated clients cannot update block rows directly'
);
select ok(
  not has_table_privilege('authenticated','public.blocked_users','DELETE'),
  'authenticated clients cannot delete block rows directly'
);
select ok(
  not has_table_privilege('authenticated','public.messages','INSERT'),
  'authenticated clients cannot insert messages directly'
);
select ok(
  exists(
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public' and tablename='messages'
  ),
  'messages are published for realtime delivery'
);
select ok(
  not exists(
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public'
      and tablename in (
        'marketplace_reports','marketplace_report_events','user_block_events',
        'admin_audit_logs','moderation_actions'
      )
  ),
  'realtime publication does not expose private trust or audit tables'
);
select ok(
  exists(
    select 1 from pg_policies
    where schemaname='public' and tablename='messages'
      and policyname='messages_members_read' and cmd='SELECT'
  ) and not has_table_privilege('authenticated','public.messages','INSERT'),
  'realtime delivery remains subordinate to member-select RLS and RPC-only writes'
);
select is(
  (select count(*) from pg_policies where schemaname='public' and tablename='marketplace_report_events'),
  0::bigint,
  'report events start default-deny without client policies'
);

select ok(
  (select relrowsecurity from pg_class where oid='public.marketplace_reports'::regclass),
  'marketplace reports enable RLS even though clients use projections'
);
select ok(
  (select relrowsecurity from pg_class where oid='public.user_block_events'::regclass),
  'block events enable RLS and remain server-only'
);
select ok(
  not has_function_privilege('anon','public.set_user_block(uuid,boolean,text,text)','EXECUTE'),
  'anonymous callers cannot execute the block command'
);
select ok(
  not has_function_privilege(
    'authenticated','private.set_user_block_pre_safe_projection(uuid,boolean,text,text)','EXECUTE'
  ) and not has_function_privilege(
    'service_role','private.set_user_block_pre_safe_projection(uuid,boolean,text,text)','EXECUTE'
  ),
  'the preserved legacy block implementation is not callable outside its safe public wrapper'
);
select ok(
  not has_function_privilege('anon','public.create_marketplace_report(text,uuid,text,text,text)','EXECUTE'),
  'anonymous callers cannot execute the report command'
);
select ok(
  case when to_regprocedure(
    'public.create_marketplace_report_v2(text,uuid,uuid,text,text,text)'
  ) is null then false else has_function_privilege(
    'anon','public.create_marketplace_report_v2(text,uuid,uuid,text,text,text)','EXECUTE'
  ) end=false,
  'anonymous callers cannot execute context-bound report intake'
);
select ok(
  not has_function_privilege('authenticated','public.authorize_message_media(uuid,uuid)','EXECUTE'),
  'message-media authorization remains service-only'
);
select ok(
  has_function_privilege('service_role','public.authorize_protected_media(uuid,uuid)','EXECUTE'),
  'the media broker has one service-role authorization entrypoint'
);
select ok(
  not has_function_privilege(
    'service_role','public.authorize_clean_media(uuid,uuid)','EXECUTE'
  ),
  'the legacy clean-media entrypoint is not executable by the service role'
);
select ok(
  exists(
    select 1
    from pg_policies
    where schemaname='storage'
      and tablename='objects'
      and policyname='storage_clean_owner_read'
      and cmd='SELECT'
      and position('message-attachments' in coalesce(qual,''))>0
  ),
  'the clean-object read policy explicitly excludes the broker-only message bucket'
);
select ok(
  has_table_privilege('authenticated','storage.objects','SELECT'),
  'authenticated storage reads remain available only through bucket-scoped RLS'
);

insert into auth.users(
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) select id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',email,
  crypt(gen_random_uuid()::text,gen_salt('bf')),now(),'{}','{}',now(),now()
from (values
  ('c1000000-0000-4000-8000-000000000001'::uuid,'trust-customer@test.invalid'),
  ('c1000000-0000-4000-8000-000000000002'::uuid,'trust-provider@test.invalid'),
  ('c1000000-0000-4000-8000-000000000003'::uuid,'trust-outsider@test.invalid'),
  ('c1000000-0000-4000-8000-000000000004'::uuid,'trust-provider-two@test.invalid'),
  ('c1000000-0000-4000-8000-000000000005'::uuid,'trust-support-assigned@test.invalid'),
  ('c1000000-0000-4000-8000-000000000006'::uuid,'trust-support-unassigned@test.invalid'),
  ('c1000000-0000-4000-8000-000000000007'::uuid,'trust-operations@test.invalid'),
  ('c1000000-0000-4000-8000-000000000008'::uuid,'trust-super@test.invalid'),
  ('c1000000-0000-4000-8000-000000000009'::uuid,'trust-finance@test.invalid'),
  ('c1000000-0000-4000-8000-000000000010'::uuid,'trust-verification@test.invalid'),
  ('c1000000-0000-4000-8000-000000000011'::uuid,'trust-analyst@test.invalid')
) users(id,email);

insert into public.user_roles(user_id,role) values
  ('c1000000-0000-4000-8000-000000000001','provider'),
  ('c1000000-0000-4000-8000-000000000002','provider'),
  ('c1000000-0000-4000-8000-000000000004','provider'),
  ('c1000000-0000-4000-8000-000000000005','support_agent'),
  ('c1000000-0000-4000-8000-000000000006','support_agent'),
  ('c1000000-0000-4000-8000-000000000007','operations_admin'),
  ('c1000000-0000-4000-8000-000000000008','super_admin'),
  ('c1000000-0000-4000-8000-000000000009','finance_reviewer'),
  ('c1000000-0000-4000-8000-000000000010','verification_reviewer'),
  ('c1000000-0000-4000-8000-000000000011','analyst')
on conflict(user_id,role) do update set revoked_at=null;

insert into public.provider_profiles(
  user_id,kind,verification_status,accepting_requests
) values
  ('c1000000-0000-4000-8000-000000000002','individual','verified',true),
  ('c1000000-0000-4000-8000-000000000004','individual','verified',true);

insert into public.service_categories(
  id,slug,icon_key,restricted,verification_required,enabled,sort_order
) values(
  'c1020000-0000-4000-8000-000000000001','trust-fixture-category',
  'fixture',false,true,true,999
);

insert into public.addresses(
  id,user_id,city_id,label,formatted_address,location
) select
  'c1100000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000001',
  city.id,
  'Trust fixture','Synthetic test location',
  extensions.st_setsrid(extensions.st_makepoint(46.67,24.71),4326)::extensions.geography
from public.cities city where city.code='riyadh';

insert into public.provider_services(provider_id,category_id,review_status)
values(
  'c1000000-0000-4000-8000-000000000002',
  'c1020000-0000-4000-8000-000000000001','approved'
);
insert into public.provider_service_areas(provider_id,city_id,center,radius_m)
select
  'c1000000-0000-4000-8000-000000000002',city.id,
  extensions.st_setsrid(
    extensions.st_makepoint(46.67,24.71),4326
  )::extensions.geography,50000
from public.cities city where city.code='riyadh';
insert into public.provider_availability(provider_id,weekday,start_time,end_time)
select
  'c1000000-0000-4000-8000-000000000002',day,
  '00:00'::time,'23:59:59'::time
from generate_series(0,6) day;

insert into public.service_requests(
  id,customer_id,category_id,city_id,title,structured_description,original_text,
  approximate_location,exact_address_id,status,published_at,customer_approved_at
) select
  'c1200000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000001',
  'c1020000-0000-4000-8000-000000000001',
  city.id,
  'Trust fixture request','Synthetic trust fixture','Synthetic trust fixture',
  extensions.st_setsrid(extensions.st_makepoint(46.67,24.71),4326)::extensions.geography,
  'c1100000-0000-4000-8000-000000000001','provider_selected',now(),now()
from public.cities city where city.code='riyadh';

insert into public.service_requests(
  id,customer_id,category_id,city_id,title,structured_description,original_text,
  approximate_location,exact_address_id,status,published_at,customer_approved_at
) select
  request_id,
  'c1000000-0000-4000-8000-000000000001',
  'c1020000-0000-4000-8000-000000000001',city.id,
  title,'Synthetic block/offer linearization fixture',
  'Synthetic block/offer linearization fixture',
  extensions.st_setsrid(
    extensions.st_makepoint(46.67,24.71),4326
  )::extensions.geography,
  'c1100000-0000-4000-8000-000000000001',
  'receiving_offers',now(),now()
from (values
  ('c1210000-0000-4000-8000-000000000001'::uuid,'Offer submission replay fixture'),
  ('c1210000-0000-4000-8000-000000000002'::uuid,'Offer selection replay fixture'),
  ('c1210000-0000-4000-8000-000000000003'::uuid,'Blocked fresh selection fixture')
) fixture(request_id,title)
cross join public.cities city
where city.code='riyadh';

insert into public.matching_runs(
  id,request_id,configuration_version,weights,status,completed_at
) values
  ('c1250000-0000-4000-8000-000000000001',
   'c1210000-0000-4000-8000-000000000001','trust-block-race','{}','completed',now()),
  ('c1250000-0000-4000-8000-000000000002',
   'c1210000-0000-4000-8000-000000000002','trust-block-race','{}','completed',now()),
  ('c1250000-0000-4000-8000-000000000003',
   'c1210000-0000-4000-8000-000000000003','trust-block-race','{}','completed',now());
insert into public.request_provider_matches(
  request_id,provider_id,matching_run_id,score,status,expires_at
) values
  ('c1210000-0000-4000-8000-000000000001',
   'c1000000-0000-4000-8000-000000000002',
   'c1250000-0000-4000-8000-000000000001',0.9,'invited',now()+interval '1 day'),
  ('c1210000-0000-4000-8000-000000000002',
   'c1000000-0000-4000-8000-000000000002',
   'c1250000-0000-4000-8000-000000000002',0.9,'offered',now()+interval '1 day'),
  ('c1210000-0000-4000-8000-000000000003',
   'c1000000-0000-4000-8000-000000000002',
   'c1250000-0000-4000-8000-000000000003',0.9,'offered',now()+interval '1 day');
insert into public.offers(
  id,request_id,provider_id,total_amount_minor,visit_fee_minor,
  labor_amount_minor,materials_included,materials_estimate_minor,
  estimated_arrival_minutes,estimated_duration_minutes,warranty_days,
  provider_note,expires_at,idempotency_key,status
) values
  ('c1310000-0000-4000-8000-000000000001',
   'c1210000-0000-4000-8000-000000000002',
   'c1000000-0000-4000-8000-000000000002',12000,1000,11000,false,0,
   30,90,7,'Selection replay fixture',now()+interval '1 day',
   'trust-selection-fixture','active'),
  ('c1310000-0000-4000-8000-000000000002',
   'c1210000-0000-4000-8000-000000000003',
   'c1000000-0000-4000-8000-000000000002',13000,1000,12000,false,0,
   30,90,7,'Blocked fresh selection fixture',now()+interval '1 day',
   'trust-blocked-selection-fixture','active');

insert into public.offers(
  id,request_id,provider_id,total_amount_minor,materials_included,
  estimated_arrival_minutes,estimated_duration_minutes,expires_at,idempotency_key,status
) values(
  'c1300000-0000-4000-8000-000000000001',
  'c1200000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000002',10000,false,30,60,
  now()+interval '1 day','trust-fixture-offer','selected'
);

insert into public.jobs(
  id,request_id,selected_offer_id,customer_id,provider_id,exact_address_id,
  status,approved_total_minor,version
) values(
  'c1400000-0000-4000-8000-000000000001',
  'c1200000-0000-4000-8000-000000000001',
  'c1300000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000002',
  'c1100000-0000-4000-8000-000000000001','completed',10000,1
);

insert into public.conversations(id,job_id,status) values(
  'c1500000-0000-4000-8000-000000000001',
  'c1400000-0000-4000-8000-000000000001','active'
);
insert into public.conversation_members(conversation_id,user_id,member_role) values
  ('c1500000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','customer'),
  ('c1500000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000002','provider');

insert into public.messages(id,conversation_id,sender_id,body,client_message_id) values
  ('c1600000-0000-4000-8000-000000000001',
   'c1500000-0000-4000-8000-000000000001',
   'c1000000-0000-4000-8000-000000000002',
   'A synthetic provider message preserved as report evidence','trust-fixture-provider-message'),
  ('c1600000-0000-4000-8000-000000000009',
   'c1500000-0000-4000-8000-000000000001',
   'c1000000-0000-4000-8000-000000000003',
   'Corrupt sender fixture outside both job parties','trust-corrupt-sender-message');

insert into public.file_uploads(
  id,user_id,purpose,resource_id,original_filename,extension,declared_mime_type,
  detected_mime_type,size_bytes,max_size_bytes,quarantine_path,target_bucket,
  target_path,final_path,content_sha256,status,scanner,sanitized,scanned_at
) values(
  'c1700000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000002','message_attachment',
  'c1500000-0000-4000-8000-000000000001','evidence.jpg','jpg','image/jpeg',
  'image/jpeg',321,20971520,'trust/quarantine/evidence.jpg','message-attachments',
  'trust/clean/evidence.jpg','trust/clean/evidence.jpg',repeat('a',64),
  'clean','deterministic-test-fixture',false,now()
),(
  'c1700000-0000-4000-8000-000000000002',
  'c1000000-0000-4000-8000-000000000001','message_attachment',
  null,'blocked-send.jpg','jpg','image/jpeg',
  'image/jpeg',654,20971520,'trust/quarantine/blocked-send.jpg','message-attachments',
  'trust/clean/blocked-send.jpg','trust/clean/blocked-send.jpg',repeat('b',64),
  'clean','deterministic-test-fixture',false,now()
),(
  'c1700000-0000-4000-8000-000000000003',
  'c1000000-0000-4000-8000-000000000002','completion_proof',
  'c1400000-0000-4000-8000-000000000001','completion.jpg','jpg','image/jpeg',
  'image/jpeg',777,20971520,'trust/quarantine/completion.jpg','completion-proofs',
  'trust/clean/completion.jpg','trust/clean/completion.jpg',repeat('c',64),
  'clean','deterministic-test-fixture',false,now()
),(
  'c1700000-0000-4000-8000-000000000004',
  'c1000000-0000-4000-8000-000000000001','message_attachment',
  null,'canonical-two.jpg','jpg','image/jpeg',
  'image/jpeg',432,20971520,'trust/quarantine/canonical-two.jpg','message-attachments',
  'trust/clean/canonical-two.jpg','trust/clean/canonical-two.jpg',repeat('d',64),
  'clean','deterministic-test-fixture',false,now()
),(
  'c1700000-0000-4000-8000-000000000005',
  'c1000000-0000-4000-8000-000000000001','message_attachment',
  null,'blocked-send.jpg','jpg','image/jpeg',
  'image/jpeg',876,20971520,'trust/quarantine/blocked-send-two.jpg','message-attachments',
  'trust/clean/blocked-send-two.jpg','trust/clean/blocked-send-two.jpg',repeat('e',64),
  'clean','deterministic-test-fixture',false,now()
);
insert into storage.objects(id,bucket_id,name,owner_id,metadata)
values
  ('c1710000-0000-4000-8000-000000000001','message-attachments',
   'trust/clean/evidence.jpg','c1000000-0000-4000-8000-000000000002',
   jsonb_build_object('mimetype','image/jpeg','size',321)),
  ('c1710000-0000-4000-8000-000000000003','completion-proofs',
   'trust/clean/completion.jpg','c1000000-0000-4000-8000-000000000002',
   jsonb_build_object('mimetype','image/jpeg','size',777));
insert into public.message_attachments(
  id,message_id,uploader_id,storage_path,mime_type,size_bytes,file_upload_id
) values(
  'c1800000-0000-4000-8000-000000000001',
  'c1600000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000002','trust/clean/evidence.jpg',
  'image/jpeg',321,'c1700000-0000-4000-8000-000000000001'
);

insert into public.ratings(
  id,job_id,customer_id,provider_id,score,review,moderation_status
) values
(
  'c1900000-0000-4000-8000-000000000001',
  'c1400000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000003',
  'c1000000-0000-4000-8000-000000000004',1,
  'Corrupt rating fixture outside both job parties','published'
);

create temp table trust_results(key text primary key,payload jsonb);
grant select,insert,update,delete on trust_results to authenticated;
grant select,insert,update,delete on trust_results to service_role;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
insert into trust_results(key,payload) values(
  'preissued_message_media',
  public.authorize_protected_media(
    'c1000000-0000-4000-8000-000000000001',
    'c1700000-0000-4000-8000-000000000001'
  )
);
select is(
  (select payload->>'deliveryMode' from trust_results where key='preissued_message_media'),
  'authenticated_proxy',
  'message media is delivered through a per-request authorization proxy rather than a storage URL'
);
select is(
  public.authorize_protected_media(
    'c1000000-0000-4000-8000-000000000002',
    'c1700000-0000-4000-8000-000000000003'
  )->>'deliveryMode',
  'signed_url',
  'non-message media preserves the existing short-lived signed storage URL delivery path'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
insert into trust_results(key,payload) values(
  'initial_trust_context',
  public.get_marketplace_trust_context('c1500000-0000-4000-8000-000000000001')
);
select is(
  (select payload from trust_results where key='initial_trust_context'),
  jsonb_build_object(
    'conversationId','c1500000-0000-4000-8000-000000000001'::uuid,
    'counterpartyUserId','c1000000-0000-4000-8000-000000000002'::uuid,
    'blockedByMe',false,
    'canCommunicate',true,
    'restriction',null
  ),
  'an available trust context exposes only the safe five-field contract'
);
insert into trust_results(key,payload) values(
  'pre_block_message',
  public.send_message_with_attachments(
    'c1500000-0000-4000-8000-000000000001',
    'Message created before the block','{}','trust-pre-block-message'
  )
);
select ok(
  (select payload->>'messageId' from trust_results where key='pre_block_message') is not null,
  'the authoritative message command stores a pre-block message'
);
insert into trust_results(key,payload) values(
  'canonical_attachment_message',
  public.send_message_with_attachments(
    'c1500000-0000-4000-8000-000000000001',
    'Canonical attachment ordering',
    array[
      'c1700000-0000-4000-8000-000000000002'::uuid,
      'c1700000-0000-4000-8000-000000000004'::uuid
    ],
    'trust-canonical-attachments'
  )
);
select lives_ok(
  $$insert into trust_results(key,payload) values(
    'canonical_attachment_replay',
    public.send_message_with_attachments(
      'c1500000-0000-4000-8000-000000000001',
      'Canonical attachment ordering',
      array[
        'c1700000-0000-4000-8000-000000000004'::uuid,
        'c1700000-0000-4000-8000-000000000002'::uuid
      ],
      'trust-canonical-attachments'
    )
  )$$,
  'an idempotent replay accepts the same attachment set in reversed client order'
);
select is(
  (select payload->>'messageId' from trust_results where key='canonical_attachment_replay'),
  (select payload->>'messageId' from trust_results where key='canonical_attachment_message'),
  'canonical attachment order reconstructs the original message response'
);
select throws_ok(
  $$select public.send_message_with_attachments(
    'c1500000-0000-4000-8000-000000000001',
    'Duplicate attachment identifiers',
    array[
      'c1700000-0000-4000-8000-000000000005'::uuid,
      'c1700000-0000-4000-8000-000000000005'::uuid
    ],
    'trust-duplicate-attachment-identifiers'
  )$$,
  'DUPLICATE_MESSAGE_ATTACHMENT',
  'duplicate attachment identifiers fail with a bounded domain error'
);
select throws_ok(
  $$select public.send_message_with_attachments(
    'c1500000-0000-4000-8000-000000000001',
    'Null attachment identifier',array[null::uuid],
    'trust-null-attachment-identifier'
  )$$,
  'MESSAGE_ATTACHMENT_ID_REQUIRED',
  'null attachment identifiers fail with a bounded domain error'
);
select throws_ok(
  $$select public.send_message_with_attachments(
    'c1500000-0000-4000-8000-000000000001',
    'Attachment reuse attempt',
    array['c1700000-0000-4000-8000-000000000002'::uuid],
    'trust-reused-attachment'
  )$$,
  'MESSAGE_ATTACHMENT_ALREADY_USED',
  'an upload already attached to a message cannot be attached again'
);
select throws_ok(
  $$insert into public.messages(conversation_id,sender_id,body,client_message_id) values(
    'c1500000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000001','Direct bypass','direct-bypass-key'
  )$$,
  'permission denied for table messages',
  'direct message insertion is denied even to a member'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000002',true);
insert into trust_results(key,payload) values(
  'pre_block_offer_submission',
  to_jsonb(public.submit_offer(jsonb_build_object(
    'requestId','c1210000-0000-4000-8000-000000000001',
    'expectedRequestVersion',
      (select version from public.service_requests
       where id='c1210000-0000-4000-8000-000000000001'),
    'idempotencyKey','trust-submit-offer-before-block',
    'totalAmountMinor',12000,'visitFeeMinor',1000,'laborAmountMinor',11000,
    'materialsIncluded',false,'materialsEstimateMinor',0,
    'estimatedArrivalMinutes',30,'estimatedDurationMinutes',90,'warrantyDays',7,
    'note','Offer completed before block','expiresAt',now()+interval '1 day'
  )))
);
select ok(
  (select (payload#>>'{}')::uuid from trust_results
   where key='pre_block_offer_submission') is not null,
  'an eligible provider can submit an offer before either party blocks'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
insert into trust_results(key,payload) values(
  'pre_block_offer_selection',
  to_jsonb(public.select_offer(
    'c1310000-0000-4000-8000-000000000001',
    'trust-select-offer-before-block'
  ))
);
select ok(
  (select (payload#>>'{}')::uuid from trust_results
   where key='pre_block_offer_selection') is not null,
  'an eligible customer can select an offer before either party blocks'
);
insert into trust_results(key,payload) values(
  'customer_block',
  public.set_user_block(
    'c1000000-0000-4000-8000-000000000002',true,
    'Stop direct communication','trust-customer-block'
  )
);
select is(
  (select payload->>'changed' from trust_results where key='customer_block'),
  'true',
  'block applies the requested directional state'
);
select is(
  (select payload from trust_results where key='customer_block'),
  jsonb_build_object(
    'targetUserId','c1000000-0000-4000-8000-000000000002'::uuid,
    'blocked',true,
    'changed',true,
    'canCommunicate',false
  ),
  'a fresh block acknowledgement exposes only actor intent and generic communication state'
);
select ok(
  not ((select payload from trust_results where key='customer_block') ? 'eventId'),
  'normal block acknowledgement does not disclose hidden audit event identifiers'
);
select is(
  public.set_user_block(
    'c1000000-0000-4000-8000-000000000002',true,
    'Stop direct communication','trust-customer-block'
  ),
  (select payload from trust_results where key='customer_block'),
  'a repeated block command reconstructs its original response'
);
insert into trust_results(key,payload) values(
  'customer_owned_block_context',
  public.get_marketplace_trust_context('c1500000-0000-4000-8000-000000000001')
);
select is(
  (select payload from trust_results where key='customer_owned_block_context'),
  jsonb_build_object(
    'conversationId','c1500000-0000-4000-8000-000000000001'::uuid,
    'counterpartyUserId','c1000000-0000-4000-8000-000000000002'::uuid,
    'blockedByMe',true,
    'canCommunicate',false,
    'restriction','blocked'
  ),
  'an actor-owned block is disclosed only as the actor-owned safe restriction'
);
select throws_ok(
  $$select public.select_offer(
    'c1310000-0000-4000-8000-000000000001',
    'trust-select-offer-before-block'
  )$$,
  'OFFER_PROVIDER_INELIGIBLE:customer_provider_blocked',
  'an exact completed selection replay rechecks a later block before replay'
);
select throws_ok(
  $$select public.select_offer(
    'c1310000-0000-4000-8000-000000000002',
    'trust-select-offer-after-block'
  )$$,
  'OFFER_PROVIDER_INELIGIBLE:customer_provider_blocked',
  'a block established before fresh selection denies job and conversation creation'
);
select throws_ok(
  $$select count(*) from public.user_block_events$$,
  'permission denied for table user_block_events',
  'block event evidence is not directly readable by marketplace clients'
);
reset role;
select is(
  (select count(*) from public.user_block_events
   where actor_id='c1000000-0000-4000-8000-000000000001'
     and idempotency_key='trust-customer-block'),
  1::bigint,
  'a block retry never duplicates immutable evidence'
);
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
select cmp_ok(
  (select count(*) from public.messages),'>=',2::bigint,
  'blocked participants retain historical text as report evidence'
);
select is(
  (select count(*) from public.message_attachments),0::bigint,
  'blocked participants cannot read protected attachment metadata'
);
select is(
  (select count(*) from public.blocked_users),1::bigint,
  'a blocker can read only the directional row they own'
);
select throws_ok(
  $$insert into public.blocked_users(blocker_id,blocked_id,reason) values(
    'c1000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000004','Direct bypass'
  )$$,
  'permission denied for table blocked_users',
  'direct block insertion cannot bypass relationship and audit checks'
);
select throws_ok(
  $$select public.send_message_with_attachments(
    'c1500000-0000-4000-8000-000000000001','Blocked old conversation','{}',
    'trust-blocked-old-conversation'
  )$$,
  'COMMUNICATION_NOT_ALLOWED',
  'an old conversation identifier cannot bypass the block'
);
select throws_ok(
  $$select public.send_message_with_attachments(
    'c1500000-0000-4000-8000-000000000001','Message created before the block','{}',
    'trust-pre-block-message'
  )$$,
  'COMMUNICATION_NOT_ALLOWED',
  'a once-valid idempotent message replay rechecks the current block first'
);
select throws_ok(
  $$select public.send_message_with_attachments(
    'c1500000-0000-4000-8000-000000000001','Blocked attachment send',
    array['c1700000-0000-4000-8000-000000000005'::uuid],
    'trust-blocked-real-attachment'
  )$$,
  'COMMUNICATION_NOT_ALLOWED',
  'a real clean attachment upload cannot bypass a newly effective block'
);
select lives_ok(
  $$select public.set_active_role('provider'::public.user_role)$$,
  'a dual-role fixture can switch its presentation role'
);
select throws_ok(
  $$select public.send_message_with_attachments(
    'c1500000-0000-4000-8000-000000000001','Role switch bypass','{}',
    'trust-role-switch-bypass'
  )$$,
  'COMMUNICATION_NOT_ALLOWED',
  'presentation role switching cannot bypass actual job-party enforcement'
);
reset role;

select is(
  (select resource_id from public.file_uploads
   where id='c1700000-0000-4000-8000-000000000005'),
  null,
  'a blocked attachment send leaves the clean upload unbound and creates no partial message link'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000002',true);
select cmp_ok(
  (select count(*) from public.messages),'>=',2::bigint,
  'the blocked counterparty also retains historical text evidence'
);
select is(
  (select count(*) from public.message_attachments),0::bigint,
  'the blocked counterparty is mutually denied attachment metadata'
);
select is(
  (select count(*) from public.blocked_users),0::bigint,
  'the blocked counterparty cannot enumerate who blocked them through raw rows'
);
select throws_ok(
  $$select public.send_message_with_attachments(
    'c1500000-0000-4000-8000-000000000001','Reverse blocked send','{}',
    'trust-reverse-blocked-send'
  )$$,
  'COMMUNICATION_NOT_ALLOWED',
  'a block in either direction denies the counterparty message command'
);
select throws_ok(
  $$select public.submit_offer(jsonb_build_object(
    'requestId','c1210000-0000-4000-8000-000000000001',
    'expectedRequestVersion',
      (select version from public.service_requests
       where id='c1210000-0000-4000-8000-000000000001'),
    'idempotencyKey','trust-submit-offer-before-block',
    'totalAmountMinor',12000,'visitFeeMinor',1000,'laborAmountMinor',11000,
    'materialsIncluded',false,'materialsEstimateMinor',0,
    'estimatedArrivalMinutes',30,'estimatedDurationMinutes',90,'warrantyDays',7,
    'note','Offer completed before block','expiresAt',now()+interval '1 day'
  ))$$,
  'PROVIDER_NOT_ELIGIBLE:customer_provider_blocked',
  'an exact completed offer replay rechecks a later block before replay'
);
select throws_ok(
  $$select public.submit_offer(jsonb_build_object(
    'requestId','c1210000-0000-4000-8000-000000000001',
    'expectedRequestVersion',
      (select version from public.service_requests
       where id='c1210000-0000-4000-8000-000000000001'),
    'idempotencyKey','trust-submit-offer-after-block',
    'totalAmountMinor',12500,'visitFeeMinor',1000,'laborAmountMinor',11500,
    'materialsIncluded',false,'materialsEstimateMinor',0,
    'estimatedArrivalMinutes',30,'estimatedDurationMinutes',90,'warrantyDays',7,
    'note','Fresh offer must observe block','expiresAt',now()+interval '1 day'
  ))$$,
  'PROVIDER_NOT_ELIGIBLE:customer_provider_blocked',
  'a block established before fresh offer submission denies mutation'
);
reset role;

select is(
  (select count(*) from public.offers
   where request_id='c1210000-0000-4000-8000-000000000001'),
  1::bigint,
  'blocked offer replay and fresh submission preserve the one pre-block offer'
);
select is(
  (select count(*) from public.idempotency_keys
   where user_id='c1000000-0000-4000-8000-000000000002'
     and command='submit_offer_v2'
     and key in (
       'trust-submit-offer-before-block','trust-submit-offer-after-block'
     )),
  1::bigint,
  'blocked offer commands create no new idempotency mutation'
);
select is(
  (select count(*) from public.jobs
   where request_id='c1210000-0000-4000-8000-000000000002'),
  1::bigint,
  'blocked exact selection replay preserves the one pre-block job'
);
select is(
  (select count(*) from public.conversations conversation
   join public.jobs job on job.id=conversation.job_id
   where job.request_id='c1210000-0000-4000-8000-000000000002'),
  1::bigint,
  'blocked exact selection replay preserves the one pre-block conversation'
);
select is(
  (select count(*) from public.jobs
   where request_id='c1210000-0000-4000-8000-000000000003'),
  0::bigint,
  'block-before-selection creates no job for the denied offer'
);
select is(
  (select count(*) from public.idempotency_keys
   where user_id='c1000000-0000-4000-8000-000000000001'
     and command='select_offer_v3'
     and key in (
       'trust-select-offer-before-block','trust-select-offer-after-block'
     )),
  1::bigint,
  'blocked selection commands create no new idempotency mutation'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000002',true);
select is(
  (select count(*) from storage.objects
   where bucket_id='message-attachments' and name='trust/clean/evidence.jpg'),
  0::bigint,
  'a blocked uploader cannot directly select or list clean message objects'
);
select is(
  (select count(*) from storage.objects
   where bucket_id='completion-proofs' and name='trust/clean/completion.jpg'),
  1::bigint,
  'the clean-object policy preserves legitimate owner reads outside message media'
);
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
select is(
  (select count(*) from storage.objects
   where bucket_id='message-attachments' and name='trust/clean/evidence.jpg'),
  0::bigint,
  'the blocked counterparty cannot directly select or list clean message objects'
);
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000009',true);
select is(
  (select count(*) from storage.objects
   where bucket_id='message-attachments' and name='trust/clean/evidence.jpg'),
  0::bigint,
  'finance cannot bypass message-media case scope through direct storage reads'
);
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000011',true);
select is(
  (select count(*) from storage.objects
   where bucket_id='message-attachments' and name='trust/clean/evidence.jpg'),
  0::bigint,
  'analysts cannot directly read clean message objects'
);
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000005',true);
select is(
  (select count(*) from storage.objects
   where bucket_id='message-attachments' and name='trust/clean/evidence.jpg'),
  0::bigint,
  'support cannot bypass message-media case scope through direct storage reads'
);
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000007',true);
select is(
  (select count(*) from storage.objects
   where bucket_id='message-attachments' and name='trust/clean/evidence.jpg'),
  0::bigint,
  'operations cannot bypass message-media case scope through direct storage reads'
);
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000008',true);
select is(
  (select count(*) from storage.objects
   where bucket_id='message-attachments' and name='trust/clean/evidence.jpg'),
  0::bigint,
  'super admins cannot bypass message-media case scope through direct storage reads'
);
reset role;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select is(
  (select count(*) from storage.objects
   where bucket_id='message-attachments' and name='trust/clean/evidence.jpg'),
  1::bigint,
  'the service-role media proxy can still fetch a broker-authorized message object'
);
select throws_ok(
  $$select public.authorize_protected_media(
    'c1000000-0000-4000-8000-000000000002',
    'c1700000-0000-4000-8000-000000000001'
  )$$,
  'MEDIA_ACCESS_DENIED',
  'even the uploader cannot obtain signed message media while either party blocks'
);
select throws_ok(
  $$select public.authorize_clean_media(
    'c1000000-0000-4000-8000-000000000002',
    'c1700000-0000-4000-8000-000000000001'
  )$$,
  'permission denied for function authorize_clean_media',
  'the legacy service-role media entrypoint cannot bypass a live block'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
insert into trust_results(key,payload) values(
  'customer_unblock',
  public.set_user_block(
    'c1000000-0000-4000-8000-000000000002',false,
    'Restore direct communication','trust-customer-unblock'
  )
);
select is(
  (select payload from trust_results where key='customer_unblock'),
  jsonb_build_object(
    'targetUserId','c1000000-0000-4000-8000-000000000002'::uuid,
    'blocked',false,
    'changed',true,
    'canCommunicate',false
  ),
  'unblock returns fail-closed communication state until the conversation context refreshes'
);
select is(
  public.set_user_block(
    'c1000000-0000-4000-8000-000000000002',false,
    'Restore direct communication','trust-customer-unblock'
  ),
  (select payload from trust_results where key='customer_unblock'),
  'a repeated unblock reconstructs the original acknowledgement without another audit event'
);
select lives_ok(
  $$select public.send_message_with_attachments(
    'c1500000-0000-4000-8000-000000000001','Communication restored','{}',
    'trust-after-customer-unblock'
  )$$,
  'message delivery resumes after the effective mutual block is removed'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000002',true);
select lives_ok(
  $$select public.set_user_block(
    'c1000000-0000-4000-8000-000000000001',true,
    'Provider blocks customer','trust-provider-block'
  )$$,
  'the provider can create its own directional block'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
insert into trust_results(key,payload) values(
  'counterparty_owned_block_context',
  public.get_marketplace_trust_context('c1500000-0000-4000-8000-000000000001')
);
select is(
  (select payload from trust_results where key='counterparty_owned_block_context'),
  jsonb_build_object(
    'conversationId','c1500000-0000-4000-8000-000000000001'::uuid,
    'counterpartyUserId','c1000000-0000-4000-8000-000000000002'::uuid,
    'blockedByMe',false,
    'canCommunicate',false,
    'restriction','communication_unavailable'
  ),
  'a counterparty-owned block is collapsed into the generic unavailable context'
);
insert into trust_results(key,payload) values(
  'customer_reblock_while_reverse',
  public.set_user_block(
    'c1000000-0000-4000-8000-000000000002',true,
    'Reapply own block while unavailable','trust-customer-reblock-while-reverse'
  )
);
select is(
  (select payload from trust_results where key='customer_reblock_while_reverse'),
  jsonb_build_object(
    'targetUserId','c1000000-0000-4000-8000-000000000002'::uuid,
    'blocked',true,
    'changed',true,
    'canCommunicate',false
  ),
  'an actor may add their own block without receiving counterparty direction metadata'
);
select is(
  public.get_marketplace_trust_context(
    'c1500000-0000-4000-8000-000000000001'
  ),
  jsonb_build_object(
    'conversationId','c1500000-0000-4000-8000-000000000001'::uuid,
    'counterpartyUserId','c1000000-0000-4000-8000-000000000002'::uuid,
    'blockedByMe',true,
    'canCommunicate',false,
    'restriction','blocked'
  ),
  'the actor-owned block remains available as the safe unblock affordance'
);
insert into trust_results(key,payload) values(
  'customer_unblock_while_reverse',
  public.set_user_block(
    'c1000000-0000-4000-8000-000000000002',false,
    'Remove only own block while unavailable','trust-customer-unblock-while-reverse'
  )
);
select is(
  (select payload from trust_results where key='customer_unblock_while_reverse'),
  jsonb_build_object(
    'targetUserId','c1000000-0000-4000-8000-000000000002'::uuid,
    'blocked',false,
    'changed',true,
    'canCommunicate',false
  ),
  'a fresh unblock with a remaining hidden restriction returns only generic unavailability'
);
select is(
  public.set_user_block(
    'c1000000-0000-4000-8000-000000000002',false,
    'Remove only own block while unavailable','trust-customer-unblock-while-reverse'
  ),
  (select payload from trust_results where key='customer_unblock_while_reverse'),
  'an unblock replay reconstructs the same safe projection without hidden block direction'
);
insert into trust_results(key,payload) values(
  'customer_noop_unblock',
  public.set_user_block(
    'c1000000-0000-4000-8000-000000000002',false,
    'Confirm own block removed','trust-customer-noop-unblock'
  )
);
select is(
  (select payload->>'changed' from trust_results where key='customer_noop_unblock'),
  'false',
  'unblock is an explicit idempotent desired state rather than a toggle'
);
select is(
  (select payload from trust_results where key='customer_noop_unblock'),
  jsonb_build_object(
    'targetUserId','c1000000-0000-4000-8000-000000000002'::uuid,
    'blocked',false,
    'changed',false,
    'canCommunicate',false
  ),
  'a no-op unblock reveals only that communication remains generically unavailable'
);
select is(
  public.set_user_block(
    'c1000000-0000-4000-8000-000000000002',false,
    'Confirm own block removed','trust-customer-noop-unblock'
  ),
  (select payload from trust_results where key='customer_noop_unblock'),
  'a no-op unblock replay contains no hidden direction or enforcement metadata'
);
select is(
  (select count(*) from public.blocked_users),
  0::bigint,
  'the actor cannot infer a counterparty-owned block through raw block rows'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000002',true);
select is(
  public.set_user_block(
    'c1000000-0000-4000-8000-000000000001',false,
    'Provider restores communication','trust-provider-unblock'
  ),
  jsonb_build_object(
    'targetUserId','c1000000-0000-4000-8000-000000000001'::uuid,
    'blocked',false,
    'changed',true,
    'canCommunicate',false
  ),
  'the owner of the reverse block receives the same fail-closed acknowledgement'
);
select throws_ok(
  $$select public.set_user_block(
    'c1000000-0000-4000-8000-000000000002',true,
    'Self target','trust-self-block'
  )$$,
  'BLOCK_TARGET_NOT_AVAILABLE',
  'self-blocking is denied with a bounded non-enumerating error'
);
select throws_ok(
  $$select public.set_user_block(
    'ffffffff-ffff-4fff-8fff-ffffffffffff',true,
    'Unknown target','trust-unknown-block'
  )$$,
  'BLOCK_TARGET_NOT_AVAILABLE',
  'an unknown target uses the same bounded error category'
);
select throws_ok(
  $$select public.set_user_block(
    'c1000000-0000-4000-8000-000000000004',true,
    'No marketplace relationship','trust-unrelated-block'
  )$$,
  'BLOCK_TARGET_NOT_AVAILABLE',
  'an unrelated identity cannot be blocked through arbitrary UUID submission'
);
reset role;

select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000007',true);
update public.provider_profiles set verification_status='suspended'
where user_id='c1000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
insert into trust_results(key,payload) values(
  'generic_unavailable_context',
  public.get_marketplace_trust_context('c1500000-0000-4000-8000-000000000001')
);
select is(
  (select payload from trust_results where key='generic_unavailable_context'),
  (select payload from trust_results where key='counterparty_owned_block_context'),
  'counterparty blocking and another unavailable condition have the same safe actor projection'
);
insert into trust_results(key,payload) values(
  'generic_unavailable_noop_unblock',
  public.set_user_block(
    'c1000000-0000-4000-8000-000000000002',false,
    'Confirm own block removed while unavailable','trust-generic-unavailable-noop-unblock'
  )
);
select is(
  (select payload from trust_results where key='generic_unavailable_noop_unblock'),
  (select payload from trust_results where key='customer_noop_unblock'),
  'a no-op unblock cannot distinguish hidden counterparty blocking from another unavailable condition'
);
select is(
  public.set_user_block(
    'c1000000-0000-4000-8000-000000000002',false,
    'Confirm own block removed while unavailable','trust-generic-unavailable-noop-unblock'
  ),
  (select payload from trust_results where key='generic_unavailable_noop_unblock'),
  'the fail-closed no-op unblock projection is stable on exact replay'
);
reset role;
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000007',true);
update public.provider_profiles set verification_status='verified'
where user_id='c1000000-0000-4000-8000-000000000002';

delete from public.rate_limit_buckets
where key_hash=encode(extensions.digest(
  'marketplace:user_block_state:c1000000-0000-4000-8000-000000000002','sha256'
),'hex') and operation='user_block_state';
insert into public.rate_limit_buckets(key_hash,operation,window_start,count,limit_value)
values(
  encode(extensions.digest(
    'marketplace:user_block_state:c1000000-0000-4000-8000-000000000002','sha256'
  ),'hex'),
  'user_block_state',date_trunc('hour',clock_timestamp()),19,20
);
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000002',true);
select lives_ok(
  $$select public.set_user_block(
    'c1000000-0000-4000-8000-000000000001',true,
    'Public block threshold check','trust-public-block-limit-20'
  )$$,
  'the public block command accepts the twentieth operation in its actor-hour bucket'
);
select throws_ok(
  $$select public.set_user_block(
    'c1000000-0000-4000-8000-000000000001',false,
    'Public block threshold check','trust-public-block-limit-21'
  )$$,
  'RATE_LIMITED',
  'the public block command rejects the twenty-first operation in the same actor-hour bucket'
);
reset role;
select is(
  (select count from public.rate_limit_buckets
   where key_hash=encode(extensions.digest(
     'marketplace:user_block_state:c1000000-0000-4000-8000-000000000002','sha256'
   ),'hex') and operation='user_block_state'),
  20,
  'a rejected public block command does not commit a counter beyond the threshold'
);
select ok(
  (select window_start=date_trunc('hour',window_start)
   from public.rate_limit_buckets
   where key_hash=encode(extensions.digest(
     'marketplace:user_block_state:c1000000-0000-4000-8000-000000000002','sha256'
   ),'hex') and operation='user_block_state'),
  'the public block limit uses a deterministic UTC hour bucket'
);
delete from public.rate_limit_buckets
where key_hash=encode(extensions.digest(
  'marketplace:user_block_state:c1000000-0000-4000-8000-000000000002','sha256'
),'hex') and operation='user_block_state';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000002',true);
select lives_ok(
  $$select public.set_user_block(
    'c1000000-0000-4000-8000-000000000001',false,
    'Clean up threshold block','trust-public-block-cleanup'
  )$$,
  'the threshold fixture restores communication through the same public command'
);
reset role;

select ok(
  (select bool_and(private.consume_actor_rate_limit(
    'c1000000-0000-4000-8000-000000000003','ugc-block-threshold',
    date_trunc('hour',clock_timestamp()),20
  )) from generate_series(1,20)),
  'the first twenty actor-scoped block operations fit the conservative hourly limit'
);
select ok(
  not private.consume_actor_rate_limit(
    'c1000000-0000-4000-8000-000000000003','ugc-block-threshold',
    date_trunc('hour',clock_timestamp()),20
  ),
  'the twenty-first block operation is rejected atomically'
);
select ok(
  private.consume_actor_rate_limit(
    'c1000000-0000-4000-8000-000000000004','ugc-block-threshold',
    date_trunc('hour',clock_timestamp()),20
  ),
  'one actor exhausting a limit does not consume another actor bucket'
);

insert into trust_results(key,payload) values(
  'corrupt_report_baseline',
  jsonb_build_object(
    'reports',(select count(*) from public.marketplace_reports),
    'supportCases',(select count(*) from public.support_cases),
    'events',(select count(*) from public.marketplace_report_events),
    'idempotency',(select count(*) from public.idempotency_keys)
  )
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
select throws_ok($test$
  do $block$
  begin
    perform public.create_marketplace_report(
      'message','c1600000-0000-4000-8000-000000000009','harassment',
      'Corrupt sender relationship must fail closed','trust-corrupt-message-v1'
    );
    raise exception 'EXPECTED_DENIAL_MISSING';
  end $block$
$test$,'REPORT_TARGET_NOT_AVAILABLE',
  'legacy message report intake rejects a sender outside both job parties');
select throws_ok($test$
  do $block$
  begin
    perform public.create_marketplace_report_v2(
      'message','c1600000-0000-4000-8000-000000000009',null::uuid,'harassment',
      'Corrupt sender relationship must fail closed','trust-corrupt-message-v2'
    );
    raise exception 'EXPECTED_DENIAL_MISSING';
  end $block$
$test$,'REPORT_TARGET_NOT_AVAILABLE',
  'context-bound message intake shares the corrupt-party rejection');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000004',true);
select throws_ok($test$
  do $block$
  begin
    perform public.create_marketplace_report(
      'rating','c1900000-0000-4000-8000-000000000001','rating_abuse',
      'Corrupt rating relationship must fail closed','trust-corrupt-rating-v1'
    );
    raise exception 'EXPECTED_DENIAL_MISSING';
  end $block$
$test$,'REPORT_TARGET_NOT_AVAILABLE',
  'legacy rating intake rejects customer and provider identities outside the job parties');
select throws_ok($test$
  do $block$
  begin
    perform public.create_marketplace_report_v2(
      'rating','c1900000-0000-4000-8000-000000000001',null::uuid,'rating_abuse',
      'Corrupt rating relationship must fail closed','trust-corrupt-rating-v2'
    );
    raise exception 'EXPECTED_DENIAL_MISSING';
  end $block$
$test$,'REPORT_TARGET_NOT_AVAILABLE',
  'context-bound rating intake shares the corrupt-party rejection');
reset role;

select is(
  jsonb_build_object(
    'reports',(select count(*) from public.marketplace_reports),
    'supportCases',(select count(*) from public.support_cases),
    'events',(select count(*) from public.marketplace_report_events),
    'idempotency',(select count(*) from public.idempotency_keys)
  ),
  (select payload from trust_results where key='corrupt_report_baseline'),
  'corrupt message and rating targets leave no report, case, event, or idempotency mutation'
);

update public.ratings
set customer_id='c1000000-0000-4000-8000-000000000001',
    provider_id='c1000000-0000-4000-8000-000000000002',
    review='Synthetic rating content for abuse-intake testing'
where id='c1900000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
insert into trust_results(key,payload) values(
  'message_report',
  public.create_marketplace_report(
    'message','c1600000-0000-4000-8000-000000000001','harassment',
    'The provider message should be reviewed','trust-message-report'
  )
);
select is(
  (select payload->>'status' from trust_results where key='message_report'),
  'submitted',
  'a participant can report a counterparty message'
);
select ok(
  not ((select payload from trust_results where key='message_report') ? 'supportCaseId'),
  'the reporter acknowledgement does not reveal the internal support case'
);
select is(
  public.create_marketplace_report(
    'message','c1600000-0000-4000-8000-000000000001','harassment',
    'The provider message should be reviewed','trust-message-report'
  )->>'reportId',
  (select payload->>'reportId' from trust_results where key='message_report'),
  'same report key and payload reconstruct the original report'
);
insert into trust_results(key,payload) values(
  'message_report_deduplicated',
  public.create_marketplace_report(
    'message','c1600000-0000-4000-8000-000000000001','spam',
    'A second active intake should deduplicate','trust-message-report-second-key'
  )
);
select is(
  (select payload->>'reportId' from trust_results where key='message_report_deduplicated'),
  (select payload->>'reportId' from trust_results where key='message_report'),
  'a second active report for the same target returns the authoritative report'
);
select is(
  (select payload->>'deduplicated' from trust_results where key='message_report_deduplicated'),
  'true',
  'active-target deduplication is explicit to the caller'
);
select ok(
  position('supportCaseId' in public.get_my_marketplace_reports(20)::text)=0
    and position('reportedUserId' in public.get_my_marketplace_reports(20)::text)=0
    and position('textSnapshot' in public.get_my_marketplace_reports(20)::text)=0,
  'the reporter projection excludes internal linkage, counterparty IDs, and evidence snapshots'
);
select throws_ok(
  $$select public.get_my_marketplace_reports(null)$$,
  'INVALID_PAGE_LIMIT',
  'a null reporter page limit cannot disable the bounded projection limit'
);
select throws_ok(
  $$insert into public.marketplace_reports(
    reporter_id,reported_user_id,target_type,target_id,support_case_id,reason_category
  ) values(
    'c1000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000002','user',
    'c1000000-0000-4000-8000-000000000002',gen_random_uuid(),'other'
  )$$,
  'permission denied for table marketplace_reports',
  'clients cannot forge report rows or support-case links directly'
);
insert into trust_results(key,payload) values(
  'user_report',
  public.create_marketplace_report_v2(
    'user','c1000000-0000-4000-8000-000000000002',
    'c1500000-0000-4000-8000-000000000001','safety',
    'Review the marketplace relationship','trust-user-report'
  )
);
select is(
  (select payload->>'status' from trust_results where key='user_report'),
  'submitted',
  'a legitimate job participant can report the counterparty user'
);
select throws_ok(
  $$select public.create_marketplace_report(
    'user','c1000000-0000-4000-8000-000000000002','other',
    'Legacy intake has no exact context','trust-v1-user-report-denied'
  )$$,
  'REPORT_CONTEXT_REQUIRED',
  'legacy user report intake fails closed until callers provide exact context'
);
select throws_ok(
  $$select public.create_marketplace_report_v2(
    'user','c1000000-0000-4000-8000-000000000004',
    'c1500000-0000-4000-8000-000000000001','other',
    'No relationship','trust-unrelated-user-report'
  )$$,
  'REPORT_TARGET_NOT_AVAILABLE',
  'an unrelated marketplace identity cannot be reported by arbitrary UUID'
);
select throws_ok(
  $$select public.create_marketplace_report(
    'message','c1600000-0000-4000-8000-000000000001','not-a-category',
    'Invalid category','trust-invalid-report-category'
  )$$,
  'REPORT_REASON_INVALID',
  'report reason categories are bounded server-side'
);
select throws_ok(
  $$select public.create_marketplace_report(
    'message','c1600000-0000-4000-8000-000000000001','other',
    repeat('x',1001),'trust-oversized-report-explanation'
  )$$,
  'REPORT_EXPLANATION_INVALID',
  'report explanations enforce the evidence bound before storage'
);
select throws_ok(
  format(
    'select public.create_marketplace_report(%L,%L::uuid,%L,%L,%L)',
    'message',(select payload->>'messageId' from trust_results where key='pre_block_message'),
    'other','Self-authored message','trust-self-message-report'
  ),
  'REPORT_TARGET_NOT_AVAILABLE',
  'a participant cannot forge a report against their own message'
);
select throws_ok(
  $$select public.create_marketplace_report(
    'rating','c1900000-0000-4000-8000-000000000001','rating_abuse',
    'Customer cannot report their own rating','trust-customer-rating-report'
  )$$,
  'REPORT_TARGET_NOT_AVAILABLE',
  'the customer cannot report their own rating as counterparty abuse'
);
reset role;

delete from public.rate_limit_buckets
where key_hash=encode(extensions.digest(
  'marketplace:marketplace_report:c1000000-0000-4000-8000-000000000001','sha256'
),'hex') and operation='marketplace_report';
insert into public.rate_limit_buckets(key_hash,operation,window_start,count,limit_value)
values(
  encode(extensions.digest(
    'marketplace:marketplace_report:c1000000-0000-4000-8000-000000000001','sha256'
  ),'hex'),
  'marketplace_report',date_trunc('hour',clock_timestamp()),9,10
);
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
select lives_ok(
  $$select public.create_marketplace_report(
    'message','c1600000-0000-4000-8000-000000000001','harassment',
    'Public report threshold check','trust-public-report-limit-10'
  )$$,
  'the public report command accepts the tenth operation in its actor-hour bucket'
);
select throws_ok(
  $$select public.create_marketplace_report(
    'message','c1600000-0000-4000-8000-000000000001','harassment',
    'Public report threshold check','trust-public-report-limit-11'
  )$$,
  'RATE_LIMITED',
  'the public report command rejects the eleventh operation in the same actor-hour bucket'
);
reset role;
select is(
  (select count from public.rate_limit_buckets
   where key_hash=encode(extensions.digest(
     'marketplace:marketplace_report:c1000000-0000-4000-8000-000000000001','sha256'
   ),'hex') and operation='marketplace_report'),
  10,
  'a rejected public report command does not commit a counter beyond the threshold'
);
select ok(
  (select window_start=date_trunc('hour',window_start)
   from public.rate_limit_buckets
   where key_hash=encode(extensions.digest(
     'marketplace:marketplace_report:c1000000-0000-4000-8000-000000000001','sha256'
   ),'hex') and operation='marketplace_report'),
  'the public report limit uses a deterministic UTC hour bucket'
);
delete from public.rate_limit_buckets
where key_hash=encode(extensions.digest(
  'marketplace:marketplace_report:c1000000-0000-4000-8000-000000000001','sha256'
),'hex') and operation='marketplace_report';

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000003',true);
select throws_ok(
  $$select public.send_message_with_attachments(
    'c1500000-0000-4000-8000-000000000001','Unrelated sender bypass','{}',
    'trust-outsider-message-send'
  )$$,
  'CONVERSATION_ACCESS_DENIED',
  'an unrelated sender is rejected at membership before communication-state checks'
);
select throws_ok(
  $$select public.create_marketplace_report(
    'message','c1600000-0000-4000-8000-000000000001','other',
    'Forged unrelated reference','trust-outsider-message-report'
  )$$,
  'REPORT_TARGET_NOT_AVAILABLE',
  'an unrelated user cannot report or inspect a private message identifier'
);
reset role;

select is(
  (select count(*) from public.marketplace_reports where target_type='message'),
  1::bigint,
  'message report retry and active deduplication create one workflow root'
);
select is(
  (select count(*) from public.marketplace_report_events
   where report_id=(select (payload->>'reportId')::uuid from trust_results where key='message_report')),
  1::bigint,
  'initial report retries create one immutable submission event'
);
select is(
  (select text_snapshot from public.marketplace_reports
   where id=(select (payload->>'reportId')::uuid from trust_results where key='message_report')),
  'A synthetic provider message preserved as report evidence',
  'message evidence is a server-derived bounded snapshot'
);
select ok(
  (select attachment_evidence @> jsonb_build_array(jsonb_build_object(
      'attachmentId','c1800000-0000-4000-8000-000000000001',
      'uploadId','c1700000-0000-4000-8000-000000000001',
      'mimeType','image/jpeg','sizeBytes',321,'contentSha256',repeat('a',64)
    ))
   from public.marketplace_reports
   where id=(select (payload->>'reportId')::uuid from trust_results where key='message_report')),
  'report evidence stores attachment metadata and hash without copying media'
);
select ok(
  position('storage_path' in (
    select attachment_evidence::text from public.marketplace_reports
    where id=(select (payload->>'reportId')::uuid from trust_results where key='message_report')
  ))=0,
  'report evidence contains no private object path'
);
select is(
  (select count(*) from public.support_cases
   where id=(select support_case_id from public.marketplace_reports
             where id=(select (payload->>'reportId')::uuid from trust_results where key='message_report'))
     and topic='marketplace_abuse'),
  1::bigint,
  'every accepted report links exactly one controlled abuse support case'
);

insert into public.support_case_assignments(
  case_id,assignee_id,assigned_by,permissions
) select
  report.support_case_id,'c1000000-0000-4000-8000-000000000005',
  'c1000000-0000-4000-8000-000000000007',
  array['read','internal_note','evidence']::text[]
from public.marketplace_reports report
where report.id=(select (payload->>'reportId')::uuid from trust_results where key='message_report');

insert into public.support_case_access_grants(
  case_id,user_id,access_type,permissions,reason,granted_by,expires_at
) select
  report.support_case_id,'c1000000-0000-4000-8000-000000000006','temporary',
  array['read']::text[],'Read-only report projection regression',
  'c1000000-0000-4000-8000-000000000007',now()+interval '1 hour'
from public.marketplace_reports report
where report.id=(select (payload->>'reportId')::uuid from trust_results where key='message_report');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000002',true);
insert into trust_results(key,payload) values(
  'rating_report',
  public.create_marketplace_report(
    'rating','c1900000-0000-4000-8000-000000000001','rating_abuse',
    'The completed-job rating should be reviewed','trust-rating-report'
  )
);
select is(
  (select payload->>'status' from trust_results where key='rating_report'),
  'submitted',
  'the rated provider can submit rating-abuse intake for its completed job'
);
select ok(
  position('supportCaseId' in public.get_my_marketplace_reports(20)::text)=0,
  'rating reporters receive the same safe acknowledgement projection'
);
reset role;

select ok(
  (select bool_and(private.consume_actor_rate_limit(
    'c1000000-0000-4000-8000-000000000003','ugc-report-threshold',
    date_trunc('hour',clock_timestamp()),10
  )) from generate_series(1,10)),
  'the first ten reports fit the conservative actor-scoped hourly limit'
);
select ok(
  not private.consume_actor_rate_limit(
    'c1000000-0000-4000-8000-000000000003','ugc-report-threshold',
    date_trunc('hour',clock_timestamp()),10
  ),
  'the eleventh report operation is rejected atomically'
);
select ok(
  private.consume_actor_rate_limit(
    'c1000000-0000-4000-8000-000000000004','ugc-report-threshold',
    date_trunc('hour',clock_timestamp()),10
  ),
  'report rate-limit exhaustion remains isolated per actor'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
select throws_ok(
  $$select public.list_marketplace_reports(null,50)$$,
  'MODERATION_PERMISSION_REQUIRED',
  'an ordinary marketplace participant cannot open the moderation queue'
);
select throws_ok(
  $$select count(*) from public.marketplace_reports$$,
  'permission denied for table marketplace_reports',
  'reporters cannot replace the safe projection with a direct workflow-root read'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000005',true);
select is(
  jsonb_array_length(public.list_marketplace_reports(null,50)->'reports'),
  1,
  'assigned support reads only the report linked to its active case assignment'
);
select cmp_ok(
  jsonb_array_length((
    select report->'history'
    from jsonb_array_elements(public.list_marketplace_reports(null,50)->'reports') report
    where report->>'reportId'=(select payload->>'reportId' from trust_results where key='message_report')
  )),
  '>=',1,
  'the staff report projection includes immutable report history rather than only current state'
);
select throws_ok(
  format(
    'select public.triage_marketplace_report(%L::uuid,%L,%L,%s,%L)',
    (select payload->>'reportId' from trust_results where key='message_report'),
    'high','Support cannot independently triage reports',1,'trust-support-triage-denied'
  ),
  'MODERATION_PERMISSION_REQUIRED',
  'assigned support cannot use operations triage authority'
);
insert into trust_results(key,payload) values(
  'support_escalation',
  public.resolve_marketplace_report(
    (select (payload->>'reportId')::uuid from trust_results where key='message_report'),
    'escalated','Assigned support escalated the abuse evidence',1,
    'trust-support-escalation'
  )
);
select is(
  (select payload->>'version' from trust_results where key='support_escalation'),
  '2',
  'assigned support can escalate its case-scoped report with an expected version'
);
select is(
  public.resolve_marketplace_report(
    (select (payload->>'reportId')::uuid from trust_results where key='message_report'),
    'escalated','Assigned support escalated the abuse evidence',1,
    'trust-support-escalation'
  )->>'version',
  '2',
  'a repeated support escalation reconstructs the original transition'
);
select throws_ok(
  format(
    'select public.resolve_marketplace_report(%L::uuid,%L,%L,%s,%L)',
    (select payload->>'reportId' from trust_results where key='message_report'),
    'resolved','Support cannot make final moderation decisions',2,
    'trust-support-resolve-denied'
  ),
  'MODERATION_PERMISSION_REQUIRED',
  'assigned support cannot dismiss or resolve a report'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000006',true);
select is(
  jsonb_array_length(public.list_marketplace_reports(null,50)->'reports'),
  1,
  'temporary read-only support receives only its explicitly linked report'
);
select ok(
  not exists(
    select 1
    from jsonb_array_elements(public.list_marketplace_reports(null,50)->'reports') report
    where report ? 'textSnapshot' or report ? 'attachmentEvidence'
  ),
  'support with read but without evidence capability receives no text snapshot or attachment evidence'
);
select throws_ok(
  format(
    'select public.resolve_marketplace_report(%L::uuid,%L,%L,%s,%L)',
    (select payload->>'reportId' from trust_results where key='message_report'),
    'escalated','Unassigned support cannot act on this case',2,
    'trust-unassigned-support-denied'
  ),
  'MODERATION_PERMISSION_REQUIRED',
  'unassigned support cannot transition a known report identifier'
);
reset role;

update public.support_case_access_grants
set revoked_at=now(),revoked_by='c1000000-0000-4000-8000-000000000007',
  revoked_reason='Read-only projection regression complete'
where user_id='c1000000-0000-4000-8000-000000000006' and revoked_at is null;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000009',true);
select throws_ok(
  $$select public.list_marketplace_reports(null,50)$$,
  'MODERATION_PERMISSION_REQUIRED',
  'finance staff do not inherit marketplace moderation access'
);
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000010',true);
select throws_ok(
  $$select public.list_marketplace_reports(null,50)$$,
  'MODERATION_PERMISSION_REQUIRED',
  'verification staff do not inherit marketplace moderation access'
);
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000011',true);
select throws_ok(
  $$select public.list_marketplace_reports(null,50)$$,
  'MODERATION_PERMISSION_REQUIRED',
  'analysts remain aggregate-only and cannot inspect reports'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000007',true);
select throws_ok(
  $$select public.list_marketplace_reports(null,null)$$,
  'INVALID_PAGE_LIMIT',
  'a null staff page limit cannot disable the bounded moderation projection limit'
);
select is(
  jsonb_array_length(public.list_marketplace_reports(null,50)->'reports'),
  3,
  'operations can read the bounded moderation projection for all active reports'
);
select throws_ok(
  $$update public.marketplace_reports set priority='urgent'$$,
  'permission denied for table marketplace_reports',
  'operations cannot bypass versioned moderation RPCs with direct updates'
);
insert into trust_results(key,payload) values(
  'operations_triage',
  public.triage_marketplace_report(
    (select (payload->>'reportId')::uuid from trust_results where key='user_report'),
    'urgent','Operations triaged the safety report',1,'trust-operations-triage'
  )
);
select is(
  (select payload->>'version' from trust_results where key='operations_triage'),
  '2',
  'operations triage advances the report version exactly once'
);
select is(
  public.triage_marketplace_report(
    (select (payload->>'reportId')::uuid from trust_results where key='user_report'),
    'urgent','Operations triaged the safety report',1,'trust-operations-triage'
  )->>'version',
  '2',
  'operations triage replay reconstructs the stored result'
);
select throws_ok(
  format(
    'select public.triage_marketplace_report(%L::uuid,%L,%L,%s,%L)',
    (select payload->>'reportId' from trust_results where key='user_report'),
    'high','Stale operator version must not overwrite',1,'trust-stale-triage'
  ),
  'VERSION_CONFLICT',
  'stale moderation versions cannot overwrite a concurrent transition'
);
select lives_ok(
  format(
    'insert into trust_results(key,payload) values(%L,public.resolve_marketplace_report(%L::uuid,%L,%L,%s,%L))',
    'operations_resolution',
    (select payload->>'reportId' from trust_results where key='user_report'),
    'resolved','Operations completed the safety review',2,'trust-operations-triage'
  ),
  'triage and resolution idempotency keys occupy independent command namespaces'
);
select is(
  (select payload->>'version' from trust_results where key='operations_resolution'),
  '3',
  'operations resolution advances the version and closes the report'
);
select throws_ok(
  format(
    'select public.triage_marketplace_report(%L::uuid,%L,%L,null,%L)',
    (select payload->>'reportId' from trust_results where key='user_report'),
    'urgent','Null version must not bypass triage concurrency','trust-null-triage-version'
  ),
  'EXPECTED_VERSION_REQUIRED',
  'a null expected version cannot bypass triage optimistic concurrency'
);
select throws_ok(
  format(
    'select public.resolve_marketplace_report(%L::uuid,%L,%L,null,%L)',
    (select payload->>'reportId' from trust_results where key='user_report'),
    'resolved','Null version must not bypass resolution concurrency','trust-null-resolve-version'
  ),
  'EXPECTED_VERSION_REQUIRED',
  'a null expected version cannot bypass resolution optimistic concurrency'
);
select is(
  public.resolve_marketplace_report(
    (select (payload->>'reportId')::uuid from trust_results where key='message_report'),
    'resolved','Operations completed the escalated message review',2,
    'trust-escalated-message-resolution'
  )->>'status',
  'resolved',
  'operations can resolve a case-scoped support escalation'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000008',true);
select is(
  jsonb_array_length(public.list_marketplace_reports(null,50)->'reports'),
  3,
  'super admin receives the same bounded moderation projection'
);
select is(
  public.resolve_marketplace_report(
    (select (payload->>'reportId')::uuid from trust_results where key='rating_report'),
    'dismissed','Super admin reviewed the rating evidence',1,'trust-super-rating-dismissal'
  )->>'status',
  'dismissed',
  'super admin can dismiss a rating-abuse report through the audited command'
);
reset role;

update public.support_case_assignments
set ended_at=now(),ended_reason='Trust regression verifies immediate revocation'
where assignee_id='c1000000-0000-4000-8000-000000000005' and ended_at is null;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000005',true);
select throws_ok(
  format(
    'select public.resolve_marketplace_report(%L::uuid,%L,%L,%s,%L)',
    (select payload->>'reportId' from trust_results where key='message_report'),
    'escalated','Assigned support escalated the abuse evidence',1,
    'trust-support-escalation'
  ),
  'MODERATION_PERMISSION_REQUIRED',
  'ended support scope is rechecked before an old completed escalation can replay'
);
select is(
  jsonb_array_length(public.list_marketplace_reports(null,50)->'reports'),
  0,
  'ended support assignment immediately removes queue visibility'
);
reset role;

select is(
  (select count(*) from public.marketplace_report_events
   where report_id=(select (payload->>'reportId')::uuid from trust_results where key='user_report')),
  3::bigint,
  'submission, triage, and resolution each append one report event'
);
select is(
  (select count(*) from public.admin_audit_logs
   where target_type='marketplace_report'
     and target_id=(select (payload->>'reportId')::uuid from trust_results where key='user_report')),
  2::bigint,
  'privileged triage and resolution each append an immutable admin audit record'
);
select is(
  (select count(*) from public.marketplace_report_events
   where report_id=(select (payload->>'reportId')::uuid from trust_results where key='message_report')
     and event_type='escalated'),
  1::bigint,
  'support escalation retry creates one immutable transition event'
);
select throws_ok(
  $$update public.marketplace_report_events set reason='tampered' where event_type='submitted'$$,
  'APPEND_ONLY_RECORD',
  'report event evidence cannot be updated'
);
select throws_ok(
  $$delete from public.user_block_events$$,
  'APPEND_ONLY_RECORD',
  'block event evidence cannot be deleted'
);

insert into public.idempotency_keys(user_id,command,key,request_hash,response,status)
values(
  'c1000000-0000-4000-8000-000000000001','select_offer_v3',
  'trust-suspended-selection-replay',
  private.canonical_request_hash(jsonb_build_object(
    'offerId','c1300000-0000-4000-8000-000000000001'::uuid
  )),
  jsonb_build_object('id','c1400000-0000-4000-8000-000000000001'::uuid),
  'completed'
);
update public.profiles set status='suspended'
where id='c1000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
select throws_ok(
  $$select public.select_offer(
    'c1300000-0000-4000-8000-000000000001','trust-suspended-selection-replay'
  )$$,
  'ACCOUNT_NOT_ACTIVE',
  'a suspended customer cannot execute or replay the final offer-selection command'
);
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000002',true);
select throws_ok(
  $$select public.send_message_with_attachments(
    'c1500000-0000-4000-8000-000000000001','Suspended customer bypass','{}',
    'trust-suspended-customer-send'
  )$$,
  'COMMUNICATION_NOT_ALLOWED',
  'customer suspension immediately denies provider-to-customer messaging'
);
select cmp_ok(
  (select count(*) from public.messages),'>=',3::bigint,
  'suspension does not erase historical participant text evidence'
);
reset role;
update public.profiles set status='active'
where id='c1000000-0000-4000-8000-000000000001';

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000007',true);
update public.provider_profiles set verification_status='suspended',accepting_requests=false
where user_id='c1000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
select throws_ok(
  $$select public.send_message_with_attachments(
    'c1500000-0000-4000-8000-000000000001','Suspended provider bypass','{}',
    'trust-suspended-provider-send'
  )$$,
  'COMMUNICATION_NOT_ALLOWED',
  'provider suspension immediately denies customer-to-provider messaging'
);
reset role;
update public.provider_profiles set verification_status='verified',accepting_requests=true
where user_id='c1000000-0000-4000-8000-000000000002';

delete from public.rate_limit_buckets
where key_hash=encode(extensions.digest(
  'marketplace:message_send:c1000000-0000-4000-8000-000000000001','sha256'
),'hex') and operation='message_send';
insert into public.rate_limit_buckets(key_hash,operation,window_start,count,limit_value)
values(
  encode(extensions.digest(
    'marketplace:message_send:c1000000-0000-4000-8000-000000000001','sha256'
  ),'hex'),
  'message_send',date_trunc('minute',clock_timestamp()),59,60
);
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
select lives_ok(
  $$select public.send_message_with_attachments(
    'c1500000-0000-4000-8000-000000000001','Public message threshold check','{}',
    'trust-public-message-limit-60'
  )$$,
  'the public message command accepts the sixtieth operation in its actor-minute bucket'
);
select throws_ok(
  $$select public.send_message_with_attachments(
    'c1500000-0000-4000-8000-000000000001','Public message threshold check','{}',
    'trust-public-message-limit-61'
  )$$,
  'RATE_LIMITED',
  'the public message command rejects the sixty-first operation in the same actor-minute bucket'
);
reset role;
select is(
  (select count from public.rate_limit_buckets
   where key_hash=encode(extensions.digest(
     'marketplace:message_send:c1000000-0000-4000-8000-000000000001','sha256'
   ),'hex') and operation='message_send'),
  60,
  'a rejected public message command does not commit a counter beyond the threshold'
);
select ok(
  (select window_start=date_trunc('minute',window_start)
   from public.rate_limit_buckets
   where key_hash=encode(extensions.digest(
     'marketplace:message_send:c1000000-0000-4000-8000-000000000001','sha256'
   ),'hex') and operation='message_send'),
  'the public message limit uses a deterministic UTC minute bucket'
);

select ok(
  (select bool_and(private.consume_actor_rate_limit(
    'c1000000-0000-4000-8000-000000000003','ugc-message-threshold',
    date_trunc('minute',clock_timestamp()),60
  )) from generate_series(1,60)),
  'the first sixty messages fit the conservative actor-scoped minute limit'
);
select ok(
  not private.consume_actor_rate_limit(
    'c1000000-0000-4000-8000-000000000003','ugc-message-threshold',
    date_trunc('minute',clock_timestamp()),60
  ),
  'the sixty-first message operation is rejected atomically'
);
select ok(
  private.consume_actor_rate_limit(
    'c1000000-0000-4000-8000-000000000004','ugc-message-threshold',
    date_trunc('minute',clock_timestamp()),60
  ),
  'message rate-limit exhaustion remains isolated per actor'
);

insert into public.marketplace_report_events(
  report_id,actor_id,event_type,from_status,to_status,reason,payload,idempotency_key,created_at
)
select
  (select (payload->>'reportId')::uuid from trust_results where key='user_report'),
  'c1000000-0000-4000-8000-000000000007','resolved','resolved','resolved',
  'Synthetic bounded-history event '||ordinal,
  jsonb_build_object('ordinal',ordinal),'trust-history-bound-'||ordinal,
  now()+ordinal*interval '1 millisecond'
from generate_series(1,55) ordinal;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000007',true);
select is(
  jsonb_array_length((
    select report->'history'
    from jsonb_array_elements(public.list_marketplace_reports(null,50)->'reports') report
    where report->>'reportId'=(select payload->>'reportId' from trust_results where key='user_report')
  )),
  50,
  'embedded report history is capped at fifty newest events'
);
select is(
  (select report->'historyMeta'->>'truncated'
   from jsonb_array_elements(public.list_marketplace_reports(null,50)->'reports') report
   where report->>'reportId'=(select payload->>'reportId' from trust_results where key='user_report')),
  'true',
  'bounded history explicitly reports when older events were truncated'
);
select cmp_ok(
  (select (report->'historyMeta'->>'total')::integer
   from jsonb_array_elements(public.list_marketplace_reports(null,50)->'reports') report
   where report->>'reportId'=(select payload->>'reportId' from trust_results where key='user_report')),
  '>',50,
  'history metadata exposes the total transition count without embedding every event'
);
reset role;

update public.marketplace_reports
set status='triaged',priority='urgent',version=100,resolved_at=null
where id=(select (payload->>'reportId')::uuid from trust_results where key='user_report');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000007',true);
select throws_ok(
  format(
    'select public.triage_marketplace_report(%L::uuid,%L,%L,%s,%L)',
    (select payload->>'reportId' from trust_results where key='user_report'),
    'urgent','Same state and priority must not append another event',100,
    'trust-triage-no-change'
  ),
  'REPORT_NO_CHANGE',
  'same-state and same-priority triage cannot create no-op event spam'
);
reset role;

update public.marketplace_reports
set status='escalated',version=100,resolved_at=null
where id=(select (payload->>'reportId')::uuid from trust_results where key='message_report');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000007',true);
select throws_ok(
  format(
    'select public.resolve_marketplace_report(%L::uuid,%L,%L,%s,%L)',
    (select payload->>'reportId' from trust_results where key='message_report'),
    'escalated','Same resolution state must not append another event',100,
    'trust-resolution-no-change'
  ),
  'REPORT_NO_CHANGE',
  'same-state resolution cannot create no-op event spam'
);
reset role;

select * from finish();
rollback;
