begin;
select plan(53);

select has_table('public','job_location_sharing_sessions','bounded location sharing sessions exist');

insert into auth.users(
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
  ('a1000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','p0-customer@test.invalid',crypt(gen_random_uuid()::text,gen_salt('bf')),now(),'{}','{}',now(),now()),
  ('a1000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','p0-provider@test.invalid',crypt(gen_random_uuid()::text,gen_salt('bf')),now(),'{}','{}',now(),now()),
  ('a1000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','p0-unmatched@test.invalid',crypt(gen_random_uuid()::text,gen_salt('bf')),now(),'{}','{}',now(),now()),
  ('a1000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','p0-support@test.invalid',crypt(gen_random_uuid()::text,gen_salt('bf')),now(),'{}','{}',now(),now()),
  ('a1000000-0000-4000-8000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','p0-analyst@test.invalid',crypt(gen_random_uuid()::text,gen_salt('bf')),now(),'{}','{}',now(),now());

insert into public.user_roles(user_id,role) values
  ('a1000000-0000-4000-8000-000000000002','provider'),
  ('a1000000-0000-4000-8000-000000000003','provider'),
  ('a1000000-0000-4000-8000-000000000004','support_agent'),
  ('a1000000-0000-4000-8000-000000000005','analyst');
insert into public.provider_profiles(user_id,kind,verification_status,accepting_requests) values
  ('a1000000-0000-4000-8000-000000000002','individual','verified',true),
  ('a1000000-0000-4000-8000-000000000003','individual','verified',true);
insert into public.provider_services(provider_id,category_id,review_status)
select 'a1000000-0000-4000-8000-000000000002',id,'approved'
from public.service_categories where slug='general-handyman';
insert into public.provider_service_areas(provider_id,city_id,center,radius_m)
select 'a1000000-0000-4000-8000-000000000002',id,
  extensions.st_setsrid(extensions.st_makepoint(46.67,24.71),4326)::extensions.geography,50000
from public.cities where code='riyadh';
insert into public.provider_availability(provider_id,weekday,start_time,end_time)
select 'a1000000-0000-4000-8000-000000000002',day,'00:00'::time,'23:59:59'::time
from generate_series(0,6) day;

insert into public.addresses(id,user_id,city_id,label,formatted_address,location)
select 'a1100000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',id,
  'P0 fixture','Private exact P0 fixture',
  extensions.st_setsrid(extensions.st_makepoint(46.6753,24.7136),4326)::extensions.geography
from public.cities where code='riyadh';
insert into public.service_requests(
  id,customer_id,category_id,city_id,title,structured_description,original_text,
  approximate_location,exact_address_id,status,published_at,customer_approved_at,version
)
select 'a1200000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',cat.id,city.id,
  'P0 request','Detailed approved request summary','Original customer description',
  extensions.st_setsrid(extensions.st_makepoint(46.67,24.71),4326)::extensions.geography,
  'a1100000-0000-4000-8000-000000000001','provider_selected',now(),now(),
  3
from public.service_categories cat cross join public.cities city
where cat.slug='general-handyman' and city.code='riyadh';
insert into public.ai_sessions(id,user_id,request_id,purpose,status,locale,provider,model)
values(
  'a1250000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',
  'a1200000-0000-4000-8000-000000000001','service_request','completed','ar','deterministic','p0'
);
insert into public.ai_diagnostics(
  id,session_id,request_id,schema_version,provider,model,prompt_version,structured_output
) values(
  'a1260000-0000-4000-8000-000000000001','a1250000-0000-4000-8000-000000000001',
  'a1200000-0000-4000-8000-000000000001','1','deterministic','p0','p0',
  '{"enoughInformation":true,"recommendedCapabilities":["leak-diagnosis"]}'::jsonb
);
insert into public.matching_runs(id,request_id,configuration_version,weights,status)
values('a1300000-0000-4000-8000-000000000001','a1200000-0000-4000-8000-000000000001','p0','{}','completed');
insert into public.request_provider_matches(
  request_id,provider_id,matching_run_id,score,status,expires_at
) values(
  'a1200000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002',
  'a1300000-0000-4000-8000-000000000001',0.95,'selected',now()+interval '1 day'
);
insert into public.offers(
  id,request_id,provider_id,total_amount_minor,materials_included,
  estimated_arrival_minutes,estimated_duration_minutes,expires_at,idempotency_key,status
) values(
  'a1400000-0000-4000-8000-000000000001','a1200000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000002',12500,false,30,90,now()+interval '1 day','p0-offer-key','selected'
);
insert into public.jobs(
  id,request_id,selected_offer_id,customer_id,provider_id,exact_address_id,
  status,approved_total_minor,version
) values(
  'a1500000-0000-4000-8000-000000000001','a1200000-0000-4000-8000-000000000001',
  'a1400000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000002','a1100000-0000-4000-8000-000000000001',
  'en_route',12500,5
);
insert into public.conversations(id,job_id) values(
  'a1550000-0000-4000-8000-000000000001','a1500000-0000-4000-8000-000000000001'
);
insert into public.conversation_members(conversation_id,user_id,member_role) values
  ('a1550000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','customer'),
  ('a1550000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002','provider');
insert into public.support_cases(id,opened_by,job_id,topic,subject)
values(
  'a1580000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',
  'a1500000-0000-4000-8000-000000000001','completion_review','P0 scoped support case'
);
insert into public.support_case_assignments(
  case_id,assignee_id,assigned_by,permissions
) values(
  'a1580000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000004',
  'a1000000-0000-4000-8000-000000000004',array['read','internal_note','evidence','exact_location']
);

insert into public.file_uploads(
  id,user_id,purpose,resource_id,original_filename,extension,declared_mime_type,
  detected_mime_type,size_bytes,max_size_bytes,quarantine_path,target_bucket,target_path,
  final_path,content_sha256,status,scanner,sanitized,scanned_at
) values
  (
    'a1600000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002',
    'completion_proof','a1500000-0000-4000-8000-000000000001','proof.jpg','jpg','image/jpeg',
    'image/jpeg',120,20971520,'a1000000-0000-4000-8000-000000000002/proof-quarantine.jpg',
    'completion-proofs','a1000000-0000-4000-8000-000000000002/proof.jpg',
    'a1000000-0000-4000-8000-000000000002/proof.jpg',repeat('a',64),'clean','p0-scanner',false,now()
  ),
  (
    'a1600000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000002',
    'completion_proof','a1500000-0000-4000-8000-000000000001','dirty.jpg','jpg','image/jpeg',
    null,120,20971520,'a1000000-0000-4000-8000-000000000002/dirty-quarantine.jpg',
    'completion-proofs','a1000000-0000-4000-8000-000000000002/dirty.jpg',
    null,null,'created',null,false,null
  ),
  (
    'a1600000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000001',
    'message_attachment','a1550000-0000-4000-8000-000000000001','message.jpg','jpg','image/jpeg',
    'image/jpeg',140,20971520,'a1000000-0000-4000-8000-000000000001/message-quarantine.jpg',
    'message-attachments','a1000000-0000-4000-8000-000000000001/message.jpg',
    'a1000000-0000-4000-8000-000000000001/message.jpg',repeat('b',64),'clean','p0-scanner',false,now()
  );
insert into public.completion_proofs(
  id,job_id,provider_id,storage_path,mime_type,size_bytes,description,file_upload_id
) values(
  'a1700000-0000-4000-8000-000000000001','a1500000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000002/proof.jpg',
  'image/jpeg',120,'P0 proof','a1600000-0000-4000-8000-000000000001'
);

create temp table p0_context(key text primary key,id uuid,payload jsonb);
grant select,insert,update,delete on p0_context to authenticated,service_role;

set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
select is(
  round((public.get_authorized_job_location('a1500000-0000-4000-8000-000000000001')->'destination'->>'latitude')::numeric,4),
  24.7136::numeric,'customer receives exact job coordinates through the authorized RPC'
);
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',true);
select is(
  round((public.get_authorized_job_location('a1500000-0000-4000-8000-000000000001')->'destination'->>'longitude')::numeric,4),
  46.6753::numeric,'selected provider receives exact job coordinates'
);
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000003',true);
select throws_ok(
  $$select public.get_authorized_job_location('a1500000-0000-4000-8000-000000000001')$$,
  'EXACT_LOCATION_ACCESS_DENIED','unmatched provider cannot obtain exact coordinates'
);
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000004',true);
select is(
  (public.get_authorized_job_location(
    'a1500000-0000-4000-8000-000000000001',
    'a1580000-0000-4000-8000-000000000001',
    'P0 assigned support exact location review'
  )->>'jobId')::uuid,
  'a1500000-0000-4000-8000-000000000001'::uuid,'narrowly authorized support may read job location'
);

select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',true);
select throws_ok(
  $$select public.start_job_location_sharing('a1500000-0000-4000-8000-000000000001',30,false)$$,
  'LOCATION_SHARING_CONSENT_REQUIRED','foreground location sharing requires explicit consent'
);
insert into p0_context(key,payload)
values('share',public.start_job_location_sharing('a1500000-0000-4000-8000-000000000001',30,true));
select is((select payload->>'state' from p0_context where key='share'),'sharing','provider starts a bounded foreground share');
select ok(
  public.record_job_location(
    'a1500000-0000-4000-8000-000000000001',
    (select (payload->>'sessionId')::uuid from p0_context where key='share'),
    24.72,46.68,12
  ) is not null,'provider records a location only inside the consented session'
);
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
select is(
  round((public.get_authorized_job_location('a1500000-0000-4000-8000-000000000001')->'providerLocation'->>'latitude')::numeric,2),
  24.72::numeric,'customer sees the current non-expired provider location'
);
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',true);
select is(
  public.stop_job_location_sharing(
    (select (payload->>'sessionId')::uuid from p0_context where key='share'),'p0-test'
  )->>'state','stopped','provider can stop sharing explicitly'
);
select throws_ok(
  format(
    'select public.record_job_location(%L,%L,24.72,46.68,12)',
    'a1500000-0000-4000-8000-000000000001',
    (select payload->>'sessionId' from p0_context where key='share')
  ),'ACTIVE_LOCATION_SHARING_SESSION_REQUIRED','stopped sessions cannot record more locations'
);

select is(
  public.get_provider_request_brief('a1200000-0000-4000-8000-000000000001')->>'title',
  'P0 request','selected provider receives the complete request brief'
);
select ok(
  public.get_provider_request_brief('a1200000-0000-4000-8000-000000000001') ? 'approximateLocation',
  'provider brief includes only approximate map coordinates'
);
select ok(
  not (public.get_provider_request_brief('a1200000-0000-4000-8000-000000000001') ? 'exactAddress'),
  'provider brief never contains an exact-address field'
);
select is(
  jsonb_array_length(public.get_provider_request_brief('a1200000-0000-4000-8000-000000000001')->'requiredCapabilities'),
  1,'provider brief carries AI-declared required capabilities'
);
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000003',true);
select throws_ok(
  $$select public.get_provider_request_brief('a1200000-0000-4000-8000-000000000001')$$,
  'PROVIDER_BRIEF_ACCESS_DENIED','unmatched provider cannot read the request brief'
);

select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
select is(
  jsonb_array_length(public.get_completion_proof_manifest('a1500000-0000-4000-8000-000000000001')->'proofs'),
  1,'customer receives the authorized clean completion-proof manifest'
);
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000003',true);
select throws_ok(
  $$select public.get_completion_proof_manifest('a1500000-0000-4000-8000-000000000001')$$,
  'JOB_ACCESS_DENIED','unmatched provider cannot read completion evidence'
);
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000004',true);
select is(
  jsonb_array_length(public.get_completion_proof_manifest('a1500000-0000-4000-8000-000000000001')->'proofs'),
  1,'authorized support may review completion evidence'
);

reset role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select lives_ok(
  $$select public.authorize_clean_media(
    'a1000000-0000-4000-8000-000000000001','a1600000-0000-4000-8000-000000000001'
  )$$,'signed-media service authorizes a clean proof for a job participant'
);
select throws_ok(
  $$select public.authorize_clean_media(
    'a1000000-0000-4000-8000-000000000003','a1600000-0000-4000-8000-000000000001'
  )$$,'MEDIA_ACCESS_DENIED','signed-media service rejects an unrelated user'
);
select throws_ok(
  $$select public.authorize_clean_media(
    'a1000000-0000-4000-8000-000000000002','a1600000-0000-4000-8000-000000000002'
  )$$,'CLEAN_MEDIA_NOT_FOUND','signed-media service never signs an unscanned object'
);
select lives_ok(
  $$select public.authorize_clean_media(
    'a1000000-0000-4000-8000-000000000002','a1600000-0000-4000-8000-000000000003'
  )$$,'signed-media service authorizes clean message media for a conversation participant'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000003',true);
select throws_ok(
  $$select public.send_message_with_attachments(
    'a1550000-0000-4000-8000-000000000001','outsider message','{}','p0-outsider-message'
  )$$,'CONVERSATION_ACCESS_DENIED','an unrelated provider cannot send into the conversation'
);
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
insert into p0_context(key,payload) values(
  'message',public.send_message_with_attachments(
    'a1550000-0000-4000-8000-000000000001','clean attachment',
    array['a1600000-0000-4000-8000-000000000003'::uuid],'p0-customer-message'
  )
);
select is((select payload->>'attachmentCount' from p0_context where key='message'),'1',
  'message command atomically binds one clean attachment');
select is(
  (select count(*) from public.message_attachments where file_upload_id='a1600000-0000-4000-8000-000000000003'),
  1::bigint,'the clean upload is represented by exactly one message attachment row'
);
select is(
  public.send_message_with_attachments(
    'a1550000-0000-4000-8000-000000000001','clean attachment',
    array['a1600000-0000-4000-8000-000000000003'::uuid],'p0-customer-message'
  )->>'messageId',
  (select payload->>'messageId' from p0_context where key='message'),
  'message command replay returns the original message'
);
select is(
  (select count(*) from public.messages where sender_id='a1000000-0000-4000-8000-000000000001' and client_message_id='p0-customer-message'),
  1::bigint,'message idempotency prevents duplicate rows'
);
select throws_ok(
  $$select public.send_message_with_attachments(
    'a1550000-0000-4000-8000-000000000001','dirty attachment',
    array['a1600000-0000-4000-8000-000000000002'::uuid],'p0-dirty-message'
  )$$,'CLEAN_MESSAGE_ATTACHMENT_REQUIRED','a dirty or foreign-purpose upload cannot be attached'
);
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',true);
select is(
  public.send_message_with_attachments(
    'a1550000-0000-4000-8000-000000000001','provider reply','{}','p0-provider-message'
  )->>'attachmentCount','0','the provider participant can send a reply without an attachment'
);
select is(
  (select count(*) from public.messages where conversation_id='a1550000-0000-4000-8000-000000000001'),
  2::bigint,'conversation contains exactly the two authorized messages'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
select throws_ok(
  $$select public.set_active_role('provider')$$,
  'ROLE_NOT_OWNED_OR_REVOKED','customer cannot enter a provider role they do not own'
);
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',true);
select is(public.set_active_role('provider')->>'activeRole','provider','owned provider role persists as active context');
reset role;
update public.user_roles set revoked_at=now()
where user_id='a1000000-0000-4000-8000-000000000002' and role='provider';
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',true);
select ok(
  not (public.get_session_context()->'roles' ? 'provider'),
  'revoked provider role is absent from restored session context'
);
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000005',true);
select is(
  (select count(*) from public.profiles where id='a1000000-0000-4000-8000-000000000001'),
  0::bigint,'analyst cannot read customer PII'
);
reset role;
update public.user_roles set revoked_at=now()
where user_id='a1000000-0000-4000-8000-000000000004' and role='support_agent';
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000004',true);
select throws_ok(
  $$select public.get_authorized_job_location(
    'a1500000-0000-4000-8000-000000000001',
    'a1580000-0000-4000-8000-000000000001',
    'P0 role revoked exact location review'
  )$$,
  'EXACT_LOCATION_ACCESS_DENIED','revoked support role loses exact-location permission immediately'
);

reset role;
insert into auth.sessions(id,user_id,created_at,updated_at,not_after) values(
  'a1800000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',
  now(),now(),now()+interval '1 day'
);
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select public.record_account_reauthentication(
  'a1000000-0000-4000-8000-000000000001','a1800000-0000-4000-8000-000000000001','password'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","session_id":"a1800000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
insert into p0_context(key,id) select 'deletion',public.request_account_deletion();
select is(
  (select status from public.account_deletion_requests where id=(select id from p0_context where key='deletion')),
  'blocked_retention','active job blocks account deletion deterministically'
);
select is(
  ((select retention_snapshot from public.account_deletion_requests where id=(select id from p0_context where key='deletion'))->>'activeJobs')::integer,
  1,'deletion blocker snapshot reports the active job'
);
select ok(
  (select count(*) from public.notification_outbox where event_type='account_deletion_blocked')>=1,
  'blocked deletion notifies the customer'
);

reset role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
insert into p0_context(key,payload)
select 'still_blocked',public.reconcile_blocked_account_deletions((select id from p0_context where key='deletion'));
select is((select payload from p0_context where key='still_blocked'),'{"checked":1,"unblocked":0}'::jsonb,'reconciliation keeps unresolved blockers locked and visible');
select ok(
  (select count(*) from public.notification_outbox where event_type='account_deletion_still_blocked')>=1,
  'still-blocked reconciliation notifies the customer'
);
reset role;
update public.jobs set status='cancelled',version=version+1 where id='a1500000-0000-4000-8000-000000000001';
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
insert into p0_context(key,payload)
select 'unblocked',public.reconcile_blocked_account_deletions((select id from p0_context where key='deletion'));
reset role;
select is((select payload->>'unblocked' from p0_context where key='unblocked'),'1','cleared blockers schedule deletion automatically');
select is(
  (select status from public.account_deletion_requests where id=(select id from p0_context where key='deletion')),
  'verified','unblocked deletion advances to verified'
);
select is(
  (select count(*) from public.scheduled_jobs where job_type='account_deletion' and payload->>'requestId'=(select id::text from p0_context where key='deletion')),
  1::bigint,'reconciliation creates exactly one deletion job'
);
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select is(
  (public.reconcile_blocked_account_deletions((select id from p0_context where key='deletion'))->>'checked'),
  '0','reconciliation retry is idempotent after unblocking'
);
reset role;
select is(
  (select count(*) from public.scheduled_jobs where job_type='account_deletion' and payload->>'requestId'=(select id::text from p0_context where key='deletion')),
  1::bigint,'idempotent retry cannot duplicate the deletion job'
);
select ok(
  (select count(*) from public.notification_outbox where event_type in ('account_deletion_unblocked','account_deletion_scheduled'))>=1,
  'unblocked and scheduled state notifies the customer'
);
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
insert into p0_context(key,payload) values('claimed',public.claim_privacy_job('p0-worker'));
reset role;
select is((select payload->>'jobType' from p0_context where key='claimed'),'account_deletion','worker claims the reconciled deletion job');
select is(
  (select status from public.account_deletion_requests where id=(select id from p0_context where key='deletion')),
  'processing','worker claim advances the deletion state to processing'
);
select ok(
  (select count(*) from public.notification_outbox where event_type='account_deletion_processing')>=1,
  'processing state notifies the customer'
);
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select lives_ok(
  format(
    'select public.fail_privacy_job(%L,%L,%L)',
    (select (payload->>'jobId')::uuid from p0_context where key='claimed'),
    (select id from p0_context where key='deletion'),'storage_delete_failed'
  ),'retryable worker failure is recorded without stranding the request'
);
reset role;
select is(
  (select status from public.account_deletion_requests where id=(select id from p0_context where key='deletion')),
  'verified','retryable failure returns deletion to a claimable verified state'
);
select ok(
  (select count(*) from public.notification_outbox where event_type='account_deletion_scheduled')>=1,
  'retry state remains visible to the customer'
);

select * from finish();
rollback;
