begin;
select plan(15);

insert into auth.users(
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) select id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',email,
  crypt(gen_random_uuid()::text,gen_salt('bf')),now(),'{}','{}',now(),now()
from (values
  ('f4000000-0000-4000-8000-000000000001'::uuid,'export-owner@test.invalid'),
  ('f4000000-0000-4000-8000-000000000002'::uuid,'export-provider@test.invalid'),
  ('f4000000-0000-4000-8000-000000000003'::uuid,'export-third@test.invalid'),
  ('f4000000-0000-4000-8000-000000000004'::uuid,'export-support@test.invalid')
) users(id,email);
insert into public.user_roles(user_id,role) values
  ('f4000000-0000-4000-8000-000000000002','provider'),
  ('f4000000-0000-4000-8000-000000000004','support_agent');
insert into public.provider_profiles(
  user_id,kind,business_name,commercial_registration_reference,verification_status,accepting_requests
) values(
  'f4000000-0000-4000-8000-000000000002','company','Export provider','CR-OWNER-VISIBLE-7788','verified',true
);
insert into public.addresses(id,user_id,city_id,label,formatted_address,location)
select 'f4100000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000001',id,
  'Export fixture','Owner address without portable coordinates',
  extensions.st_setsrid(extensions.st_makepoint(46.67,24.71),4326)::extensions.geography
from public.cities where code='riyadh';
insert into public.service_requests(
  id,customer_id,category_id,city_id,title,structured_description,original_text,
  approximate_location,exact_address_id,status,published_at,customer_approved_at
) select 'f4200000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000001',cat.id,city.id,
  'Export request','Owner export semantic request','Owner export semantic request',
  extensions.st_setsrid(extensions.st_makepoint(46.67,24.71),4326)::extensions.geography,
  'f4100000-0000-4000-8000-000000000001','provider_selected',now(),now()
from public.service_categories cat cross join public.cities city
where cat.slug='general-handyman' and city.code='riyadh';
insert into public.request_translations(request_id,source_locale,target_locale,original_content,translated_content,status)
values('f4200000-0000-4000-8000-000000000001','ar','en','{"text":"original"}','{"text":"translated"}','completed');
insert into public.offers(
  id,request_id,provider_id,total_amount_minor,materials_included,estimated_arrival_minutes,
  estimated_duration_minutes,expires_at,idempotency_key,status
) values(
  'f4300000-0000-4000-8000-000000000001','f4200000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000002',22500,false,30,90,now()+interval '1 day','export-offer','selected'
);
insert into public.jobs(
  id,request_id,selected_offer_id,customer_id,provider_id,exact_address_id,status,approved_total_minor
) values(
  'f4400000-0000-4000-8000-000000000001','f4200000-0000-4000-8000-000000000001',
  'f4300000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000002','f4100000-0000-4000-8000-000000000001','in_progress',22500
);
insert into public.conversations(id,job_id)
values('f4500000-0000-4000-8000-000000000001','f4400000-0000-4000-8000-000000000001');
insert into public.conversation_members(conversation_id,user_id,member_role,joined_at,left_at) values
  ('f4500000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000001','customer',now()-interval '2 days',now()-interval '1 day'),
  ('f4500000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000002','provider',now()-interval '2 days',null);
insert into public.messages(id,conversation_id,sender_id,body,client_message_id)
values(
  'f4600000-0000-4000-8000-000000000001','f4500000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000002','RECEIVED_PROVIDER_MESSAGE_MARKER','export-provider-message'
);
insert into public.file_uploads(
  id,user_id,purpose,resource_id,original_filename,extension,declared_mime_type,detected_mime_type,
  size_bytes,max_size_bytes,quarantine_path,target_bucket,target_path,final_path,content_sha256,
  status,scanner,sanitized,scanned_at
) values
  ('f4700000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000002','message_attachment',
    'f4500000-0000-4000-8000-000000000001','counterparty.jpg','jpg','image/jpeg','image/jpeg',123,20971520,
    'export/private-quarantine-marker.jpg','message-attachments','export/private-storage-marker.jpg',
    'export/private-storage-marker.jpg',repeat('a',64),'clean','fixture',false,now()),
  ('f4700000-0000-4000-8000-000000000002','f4000000-0000-4000-8000-000000000001','request_media',null,
    'ai.png','png','image/png','image/png',456,10485760,'export/ai-quarantine.png','request-media',
    'export/ai-private-storage.png','export/ai-private-storage.png',repeat('b',64),'clean','fixture',false,now()),
  ('f4700000-0000-4000-8000-000000000003','f4000000-0000-4000-8000-000000000004','support_evidence',
    'f4a00000-0000-4000-8000-000000000001','evidence.jpg','jpg','image/jpeg','image/jpeg',321,20971520,
    'export/support-quarantine.jpg','support-evidence','support/private-evidence-marker.jpg',
    'support/private-evidence-marker.jpg',repeat('c',64),'clean','fixture',false,now());
insert into public.message_attachments(
  message_id,uploader_id,storage_path,mime_type,size_bytes,file_upload_id
) values(
  'f4600000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000002',
  'export/private-storage-marker.jpg','image/jpeg',123,'f4700000-0000-4000-8000-000000000001'
);
insert into public.message_delivery_events(message_id,user_id,status)
values('f4600000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000001','delivered');
insert into public.upload_security_events(upload_id,user_id,event_type,metadata)
values('f4700000-0000-4000-8000-000000000002','f4000000-0000-4000-8000-000000000001','clean',
  '{"internalScannerDetail":"must-not-export"}');

insert into public.cancellation_requests(
  id,job_id,requester_id,lifecycle_state,reason,status
) values(
  'f4800000-0000-4000-8000-000000000001','f4400000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000002','in_progress','Provider opened cancellation','rejected'
);
insert into public.cancellation_decisions(
  cancellation_request_id,actor_id,decision,reason,impact_snapshot
) values(
  'f4800000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000004',
  'rejected','User-visible cancellation decision','{"visible":true}'
);
insert into public.disputes(
  id,job_id,opened_by,reason,status,pre_dispute_job_status
) values(
  'f4900000-0000-4000-8000-000000000001','f4400000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000002','PROVIDER_OPENED_DISPUTE_MARKER','open','in_progress'
);
insert into public.dispute_events(dispute_id,actor_id,event_type,reason,payload,visible_to_participants)
values('f4900000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000004',
  'waiting_customer','USER_VISIBLE_DISPUTE_EVENT','{}',true);

insert into public.support_cases(id,opened_by,job_id,topic,subject)
values(
  'f4a00000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000001',
  'f4400000-0000-4000-8000-000000000001','export_help','Owner support case'
),(
  'f4a00000-0000-4000-8000-000000000002','f4000000-0000-4000-8000-000000000003',
  null,'unrelated','UNRELATED_THIRD_PARTY_MARKER'
);
insert into public.support_case_messages(case_id,sender_id,body,visible_to_user) values
  ('f4a00000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000004','USER_VISIBLE_SUPPORT_REPLY',true),
  ('f4a00000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000004','INTERNAL_SUPPORT_MESSAGE_MARKER',false),
  ('f4a00000-0000-4000-8000-000000000002','f4000000-0000-4000-8000-000000000003','UNRELATED_THIRD_PARTY_MESSAGE',true);
insert into public.support_internal_notes(case_id,author_id,body)
values('f4a00000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000004','INTERNAL_NOTE_MUST_NOT_EXPORT');
insert into public.support_case_evidence(
  case_id,uploader_id,private_storage_path,mime_type,size_bytes,content_hash
) values(
  'f4a00000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000004',
  'support/private-evidence-marker.jpg','image/jpeg',321,repeat('c',64)
);

insert into public.payments(
  id,job_id,customer_id,provider_id,provider_name,provider_reference,amount_minor,status,payment_mode,idempotency_key
) values(
  'f4b00000-0000-4000-8000-000000000001','f4400000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000002',
  'Export provider','PAYMENT_PROVIDER_SECRET_MARKER',22500,'captured','gateway','export-payment'
);
insert into public.invoices(
  job_id,invoice_number,seller_snapshot,customer_snapshot,subtotal_minor,vat_minor,platform_fee_minor,
  total_minor,payment_method,status,issued_at,private_pdf_path
) values(
  'f4400000-0000-4000-8000-000000000001','INV-EXPORT-1',
  '{"name":"Provider","email":"counterparty-secret@test.invalid"}',
  '{"name":"Owner","phone":"+966500000000"}',22500,0,0,22500,'gateway','issued',now(),'invoice/private.pdf'
);
insert into public.receipts(payment_id,receipt_number,amount_minor,issued_at,private_pdf_path)
values('f4b00000-0000-4000-8000-000000000001','REC-EXPORT-1',22500,now(),'receipt/private.pdf');

insert into public.ai_sessions(id,user_id,purpose,status,locale,provider,model)
values('f4c00000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000001',
  'service_request_intake','active','ar','deterministic','rules-v1');
insert into public.ai_messages(
  id,session_id,actor,original_content,sequence_number,client_message_id,input_kind
) values(
  'f4d00000-0000-4000-8000-000000000001','f4c00000-0000-4000-8000-000000000001',
  'user','AI message with media',1,'export-ai-message','image'
);
insert into public.ai_message_media(message_id,file_upload_id,media_kind)
values('f4d00000-0000-4000-8000-000000000001','f4700000-0000-4000-8000-000000000002','image');
insert into public.ai_usage_events(user_id,session_id,provider,model,operation,input_units,output_units,success)
values('f4000000-0000-4000-8000-000000000001','f4c00000-0000-4000-8000-000000000001',
  'deterministic','rules-v1','diagnostic',10,5,true);
insert into public.notification_outbox(user_id,event_type,channel,payload,deduplication_key,status,delivered_at)
values('f4000000-0000-4000-8000-000000000001','export-notification','in_app','{}','export-notification','delivered',now());

insert into public.data_export_requests(id,user_id,status) values
  ('f4e00000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000001','processing'),
  ('f4e00000-0000-4000-8000-000000000002','f4000000-0000-4000-8000-000000000002','processing');
create temp table export_context(key text primary key,payload jsonb);
insert into export_context(key,payload) values
  ('owner',public.build_data_export('f4e00000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000001')),
  ('provider',public.build_data_export('f4e00000-0000-4000-8000-000000000002','f4000000-0000-4000-8000-000000000002'));

select ok((select payload->'messages' @> '[{"body":"RECEIVED_PROVIDER_MESSAGE_MARKER"}]'::jsonb
  from export_context where key='owner'),'received conversation messages are exported for historical members');
select ok((select payload->'messageAttachments' @> '[{"uploaderReference":"counterparty"}]'::jsonb
  from export_context where key='owner'),'counterparty-uploaded attachment metadata is exported');
select ok((select payload->'cancellations' @> '[{"requesterReference":"counterparty"}]'::jsonb
  from export_context where key='owner'),'provider-opened cancellation affecting the owner is exported');
select ok((select payload->'disputes' @> '[{"openedByReference":"counterparty"}]'::jsonb
  from export_context where key='owner'),'counterparty-opened dispute affecting the owner is exported');
select ok((select payload::text like '%USER_VISIBLE_DISPUTE_EVENT%' from export_context where key='owner'),
  'user-visible dispute events are exported');
select ok((select payload::text like '%USER_VISIBLE_SUPPORT_REPLY%' from export_context where key='owner'),
  'user-visible support replies are exported');
select ok((select payload::text not like '%INTERNAL_NOTE_MUST_NOT_EXPORT%'
  and payload::text not like '%INTERNAL_SUPPORT_MESSAGE_MARKER%' from export_context where key='owner'),
  'internal support notes and messages are excluded');
select ok((select payload::text not like '%UNRELATED_THIRD_PARTY_MARKER%'
  and payload::text not like '%UNRELATED_THIRD_PARTY_MESSAGE%' from export_context where key='owner'),
  'unrelated third-party data is excluded');
select is((select jsonb_array_length(payload->'invoices') from export_context where key='owner'),1,
  'owner export includes the invoice involving the user');
select is((select jsonb_array_length(payload->'receipts') from export_context where key='owner'),1,
  'owner export includes the receipt involving the user');
select ok((select jsonb_array_length(payload->'aiMessageMedia')=1
  and jsonb_array_length(payload->'aiUsage')=1
  and jsonb_array_length(payload->'requestTranslations')=1 from export_context where key='owner'),
  'AI usage, media metadata, and translations are covered');
select is((select payload->'providerProfile'->>'commercial_registration_reference'
  from export_context where key='provider'),'CR-OWNER-VISIBLE-7788',
  'provider-owned commercial registration reference is included');
select is((select jsonb_array_length(payload->'messageDeliveryHistory') from export_context where key='owner'),1,
  'message delivery history belonging to the user is included');
select is((select jsonb_array_length(payload->'uploadSecurityEvents') from export_context where key='owner'),1,
  'user-owned upload security event is included with minimized metadata');
select ok((select payload::text not like '%private-storage-marker%'
  and payload::text not like '%private-evidence-marker%'
  and payload::text not like '%PAYMENT_PROVIDER_SECRET_MARKER%'
  and payload::text not like '%counterparty-secret@test.invalid%' from export_context where key='owner'),
  'storage paths, provider secrets, and counterparty contact fields are redacted');

select * from finish();
rollback;
