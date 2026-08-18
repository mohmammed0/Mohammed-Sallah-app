begin;
select plan(34);

select has_table('public','customer_acceptance_evidence','completion decisions preserve authoritative evidence references');

insert into auth.users(
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) select id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',email,
  crypt(gen_random_uuid()::text,gen_salt('bf')),now(),'{}','{}',now(),now()
from (values
  ('f1000000-0000-4000-8000-000000000001'::uuid,'atomic-customer@test.invalid'),
  ('f1000000-0000-4000-8000-000000000002'::uuid,'atomic-provider@test.invalid'),
  ('f1000000-0000-4000-8000-000000000003'::uuid,'atomic-operations@test.invalid'),
  ('f1000000-0000-4000-8000-000000000004'::uuid,'atomic-support@test.invalid')
) users(id,email);
insert into public.user_roles(user_id,role) values
  ('f1000000-0000-4000-8000-000000000002','provider'),
  ('f1000000-0000-4000-8000-000000000003','operations_admin'),
  ('f1000000-0000-4000-8000-000000000004','support_agent');
insert into public.provider_profiles(user_id,kind,verification_status,accepting_requests,active_workload)
values('f1000000-0000-4000-8000-000000000002','individual','verified',true,0);
insert into public.addresses(id,user_id,city_id,label,formatted_address,location)
select 'f1100000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001',id,
  'Atomic fixture','Synthetic exact address',
  extensions.st_setsrid(extensions.st_makepoint(46.67,24.71),4326)::extensions.geography
from public.cities where code='riyadh';
insert into public.service_requests(
  id,customer_id,category_id,city_id,title,structured_description,original_text,
  approximate_location,exact_address_id,status,published_at,customer_approved_at
) select 'f1200000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001',cat.id,city.id,
  'Atomic completion','Atomic completion fixture','Atomic completion fixture',
  extensions.st_setsrid(extensions.st_makepoint(46.67,24.71),4326)::extensions.geography,
  'f1100000-0000-4000-8000-000000000001','provider_selected',now(),now()
from public.service_categories cat cross join public.cities city
where cat.slug='general-handyman' and city.code='riyadh';
insert into public.offers(
  id,request_id,provider_id,total_amount_minor,materials_included,estimated_arrival_minutes,
  estimated_duration_minutes,expires_at,idempotency_key,status
) values(
  'f1300000-0000-4000-8000-000000000001','f1200000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000002',17500,false,30,90,now()+interval '1 day',
  'atomic-offer-key','selected'
);
insert into public.jobs(
  id,request_id,selected_offer_id,customer_id,provider_id,exact_address_id,status,approved_total_minor,version
) values(
  'f1400000-0000-4000-8000-000000000001','f1200000-0000-4000-8000-000000000001',
  'f1300000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000002','f1100000-0000-4000-8000-000000000001',
  'completion_submitted',17500,1
);
insert into public.payments(
  job_id,customer_id,provider_id,provider_name,amount_minor,status,payment_mode,idempotency_key
) values(
  'f1400000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000002','Atomic provider',17500,'offline','offline','atomic-payment-key'
);
insert into public.conversations(id,job_id)
values('f1500000-0000-4000-8000-000000000001','f1400000-0000-4000-8000-000000000001');
insert into public.conversation_members(conversation_id,user_id,member_role) values
  ('f1500000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001','customer'),
  ('f1500000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000002','provider');
insert into public.file_uploads(
  id,user_id,purpose,resource_id,original_filename,extension,declared_mime_type,detected_mime_type,
  size_bytes,max_size_bytes,quarantine_path,target_bucket,target_path,final_path,content_sha256,
  status,scanner,sanitized,scanned_at
) values(
  'f1600000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000002',
  'completion_proof','f1400000-0000-4000-8000-000000000001','proof.jpg','jpg','image/jpeg','image/jpeg',
  120,20971520,'atomic/quarantine.jpg','completion-proofs','atomic/proof.jpg','atomic/proof.jpg',
  repeat('a',64),'clean','fixture',false,now()
),(
  'f1600000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000001',
  'support_evidence','f1400000-0000-4000-8000-000000000001','rejection.jpg','jpg','image/jpeg','image/jpeg',
  140,20971520,'atomic/customer-quarantine.jpg','support-evidence',
  'atomic/customer-rejection.jpg','atomic/customer-rejection.jpg',
  repeat('b',64),'clean','fixture',false,now()
),(
  'f1600000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000002',
  'completion_proof','f1400000-0000-4000-8000-000000000001','corrected.jpg','jpg',
  'image/jpeg','image/jpeg',180,20971520,'atomic/corrected-quarantine.jpg',
  'completion-proofs','atomic/corrected.jpg','atomic/corrected.jpg',
  repeat('c',64),'clean','fixture',false,now()
);
insert into public.completion_proofs(
  job_id,provider_id,storage_path,mime_type,size_bytes,description,file_upload_id
) values(
  'f1400000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000002',
  'atomic/proof.jpg','image/jpeg',120,'Rejected completion proof','f1600000-0000-4000-8000-000000000001'
);

create temp table atomic_context(key text primary key,payload jsonb);
grant select,insert,update,delete on atomic_context to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
insert into atomic_context(key,payload) values(
  'rejection',public.accept_completion(
    'f1400000-0000-4000-8000-000000000001',false,
    'The submitted completion evidence does not show the repaired leak',1,'',
    'atomic-rejection-key',array['f1600000-0000-4000-8000-000000000002'::uuid]
  )
);
select is((select payload->>'status' from atomic_context where key='rejection'),'disputed',
  'completion rejection transitions the job to disputed atomically');
select ok((select payload->>'disputeId' from atomic_context where key='rejection') is not null,
  'completion rejection returns its authoritative dispute');
reset role;
select is((select count(*) from public.customer_acceptances where job_id='f1400000-0000-4000-8000-000000000001'),1::bigint,
  'exactly one customer rejection is stored');
select is((select count(*) from public.disputes where job_id='f1400000-0000-4000-8000-000000000001'),1::bigint,
  'exactly one authoritative dispute is stored');
select is((select count(*) from public.dispute_events where event_type='opened_from_completion_rejection'),1::bigint,
  'the dispute opened event is append-only');
select is((select count(*) from public.job_status_history where job_id='f1400000-0000-4000-8000-000000000001' and new_status='disputed'),1::bigint,
  'job status history records the rejection transition');
select is((select count(*) from public.job_events where job_id='f1400000-0000-4000-8000-000000000001' and event_type='completion_rejected_dispute_opened'),1::bigint,
  'job event links the completion rejection and dispute');
select is((select count(*) from public.financial_holds where job_id='f1400000-0000-4000-8000-000000000001' and status='held'),1::bigint,
  'an applicable financial hold is created');
select is((select count(*) from public.notification_outbox where user_id='f1000000-0000-4000-8000-000000000002' and event_type='completion_rejected_dispute_opened'),1::bigint,
  'provider receives one rejection notification');
select is((select count(*) from public.notification_outbox where user_id in (
  'f1000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000004') and event_type='operations_dispute_queue'),1::bigint,
  'only the operations queue receives an unassigned dispute');
select is((select count(*) from public.customer_acceptance_evidence),1::bigint,
  'rejection evidence remains linked to the acceptance');
select is((select pre_dispute_job_status::text from public.disputes where job_id='f1400000-0000-4000-8000-000000000001'),
  'completion_submitted','the resumable pre-dispute job state is preserved');

set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
select is(
  public.accept_completion(
    'f1400000-0000-4000-8000-000000000001',false,
    'The submitted completion evidence does not show the repaired leak',1,'',
    'atomic-rejection-key',array['f1600000-0000-4000-8000-000000000002'::uuid]
  )->>'disputeId',
  (select payload->>'disputeId' from atomic_context where key='rejection'),
  'same key and canonical payload replay the same dispute'
);
select throws_ok(
  $$select public.accept_completion(
    'f1400000-0000-4000-8000-000000000001',false,
    'A different rejection reason must conflict with the original request',1,'',
    'atomic-rejection-key',array['f1600000-0000-4000-8000-000000000002'::uuid]
  )$$,'IDEMPOTENCY_KEY_CONFLICT','same key with a different payload is rejected');
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000004',true);
select throws_ok(
  format(
    'select public.resolve_dispute(%L,%L,0,%L,%L,2,%L)',
    (select payload->>'disputeId' from atomic_context where key='rejection'),
    'no_financial_action','resume','Unassigned support must not resolve this dispute','atomic-support-scope-key'
  ),'SUPPORT_CASE_SCOPE_REQUIRED','unassigned support cannot resolve an unrelated dispute');
set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000003',true);
select lives_ok(
  format(
    'select public.resolve_dispute(%L,%L,0,%L,%L,2,%L)',
    (select payload->>'disputeId' from atomic_context where key='rejection'),
    'no_financial_action','resume','Operations reviewed the rejection evidence','atomic-resolution-key'
  ),'the rejection dispute is resolvable through the existing workflow'
);
reset role;
select is((select status::text from public.disputes where job_id='f1400000-0000-4000-8000-000000000001'),
  'resolved','resolution closes the authoritative dispute');
select is((select status::text from public.jobs where id='f1400000-0000-4000-8000-000000000001'),
  'in_progress','resolution resumes the provider into valid rework state');

set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000002',true);
insert into atomic_context(key,payload) values(
  'second_submission',public.submit_completion(
    'f1400000-0000-4000-8000-000000000001',
    jsonb_build_array(jsonb_build_object(
      'uploadId','f1600000-0000-4000-8000-000000000003',
      'mimeType','image/jpeg','sizeBytes',180,
      'description','Corrected completion after the resumed work'
    )),
    'atomic-second-submission-key'
  )
);
select is((select payload->>'status' from atomic_context where key='second_submission'),
  'completion_submitted','provider submits a corrected second completion attempt');
reset role;
select is((select count(*) from public.completion_attempts
  where job_id='f1400000-0000-4000-8000-000000000001'),2::bigint,
  'both completion attempts are retained');
select is((select count(*) from public.customer_acceptances
  where job_id='f1400000-0000-4000-8000-000000000001' and not accepted),1::bigint,
  'the first rejection remains authoritative history');

set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
insert into atomic_context(key,payload) values(
  'second_acceptance',public.accept_completion(
    'f1400000-0000-4000-8000-000000000001',true,
    'The corrected work is complete and accepted',5,'Corrected successfully',
    'atomic-second-acceptance-key','{}'::uuid[]
  )
);
select is((select payload->>'status' from atomic_context where key='second_acceptance'),
  'completed','customer accepts the corrected completion attempt');
reset role;
select is((select count(*) from public.customer_acceptances
  where job_id='f1400000-0000-4000-8000-000000000001'),2::bigint,
  'one decision is retained for each completion attempt');
select is((select count(*) from public.job_terminal_effects
  where job_id='f1400000-0000-4000-8000-000000000001' and outcome='completed'),1::bigint,
  'terminal completion effects are marked exactly once');
select is((select active_workload from public.provider_profiles
  where user_id='f1000000-0000-4000-8000-000000000002'),0,
  'provider active workload decrements exactly once on final completion');
select is((select completed_jobs from public.provider_profiles
  where user_id='f1000000-0000-4000-8000-000000000002'),1,
  'provider completion metrics increment exactly once');
select is((select rating_count from public.provider_profiles
  where user_id='f1000000-0000-4000-8000-000000000002'),1,
  'only the customer acceptance creates a rating');
select is((select string_agg(status,',' order by attempt_number)
  from public.completion_attempts
  where job_id='f1400000-0000-4000-8000-000000000001'),
  'rejected,accepted','completion attempt history preserves both final decisions');
select throws_ok(
  $$update public.jobs set status='disputed' where id='f1400000-0000-4000-8000-000000000001'$$,
  'DISPUTED_JOB_REQUIRES_OPEN_DISPUTE','resolved or absent cases cannot leave an orphan disputed job'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
insert into atomic_context(key,payload) values(
  'message',public.send_message_with_attachments(
    'f1500000-0000-4000-8000-000000000001','Idempotent message','{}','atomic-message-key'
  )
);
select ok((select payload->>'messageId' from atomic_context where key='message') is not null,
  'core message command stores its first result');
select is(
  public.send_message_with_attachments(
    'f1500000-0000-4000-8000-000000000001','Idempotent message','{}','atomic-message-key'
  )->>'messageId',(select payload->>'messageId' from atomic_context where key='message'),
  'core message replay returns the original result'
);
select throws_ok(
  $$select public.send_message_with_attachments(
    'f1500000-0000-4000-8000-000000000001','Different body','{}','atomic-message-key'
  )$$,'IDEMPOTENCY_KEY_CONFLICT','core message key cannot be reused for another payload');
reset role;
insert into public.idempotency_keys(user_id,command,key,request_hash,status)
values('f1000000-0000-4000-8000-000000000001','test_processing','processing-key',repeat('f',64),'processing');
select throws_ok(
  $$select private.idempotency_replay(
    'f1000000-0000-4000-8000-000000000001','test_processing','processing-key',repeat('f',64)
  )$$,'IDEMPOTENCY_COMMAND_IN_PROGRESS','an existing processing command cannot execute twice');
select * from finish();
rollback;
