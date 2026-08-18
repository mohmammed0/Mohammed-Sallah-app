-- Local-only deterministic demo journey. This file is referenced only by local Supabase config.
-- Never apply it to a production project.

insert into auth.users(
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  confirmation_token,recovery_token,email_change_token_new,email_change,last_sign_in_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
)
select id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',email,
  crypt(
    case
      -- Known only to local Playwright runs. This seed file is never used by production config.
      when email='admin.demo@example.invalid' then 'LocalE2E-Only!2026'
      when email='finance.demo@example.invalid' then 'LocalFinanceE2E-Only!2026'
      when email='provider.demo@example.invalid' then 'LocalProviderE2E-Only!2026'
      else gen_random_uuid()::text
    end,
    gen_salt('bf')
  ),now(),'','','','',now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('display_name',display_name,'preferred_locale',locale),now(),now()
from (values
  ('d1000000-0000-4000-8000-000000000001'::uuid,'customer.demo@example.invalid','عميل العرض','ar'),
  ('d1000000-0000-4000-8000-000000000002'::uuid,'customer2.demo@example.invalid','عميل الصلاحيات','en'),
  ('d2000000-0000-4000-8000-000000000001'::uuid,'provider.demo@example.invalid','مقدم خدمة أُردي','ur'),
  ('d2000000-0000-4000-8000-000000000002'::uuid,'provider2.demo@example.invalid','مقدم خدمة منافس','hi'),
  ('d2000000-0000-4000-8000-000000000003'::uuid,'provider.suspended@example.invalid','مقدم خدمة موقوف','ar'),
  ('d3000000-0000-4000-8000-000000000001'::uuid,'admin.demo@example.invalid','مدير العمليات','ar'),
  ('d3000000-0000-4000-8000-000000000002'::uuid,'support.demo@example.invalid','موظف الدعم','ar'),
  ('d3000000-0000-4000-8000-000000000003'::uuid,'reviewer.demo@example.invalid','مراجع التحقق','ar'),
  ('d3000000-0000-4000-8000-000000000004'::uuid,'finance.demo@example.invalid','مراجع المالية','ar')
) demo(id,email,display_name,locale)
on conflict(id) do nothing;

insert into auth.identities(provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
select email,id,jsonb_build_object('sub',id::text,'email',email,'email_verified',true),'email',now(),now(),now()
from (values
  ('d1000000-0000-4000-8000-000000000001'::uuid,'customer.demo@example.invalid'),
  ('d1000000-0000-4000-8000-000000000002'::uuid,'customer2.demo@example.invalid'),
  ('d2000000-0000-4000-8000-000000000001'::uuid,'provider.demo@example.invalid'),
  ('d2000000-0000-4000-8000-000000000002'::uuid,'provider2.demo@example.invalid'),
  ('d2000000-0000-4000-8000-000000000003'::uuid,'provider.suspended@example.invalid'),
  ('d3000000-0000-4000-8000-000000000001'::uuid,'admin.demo@example.invalid'),
  ('d3000000-0000-4000-8000-000000000002'::uuid,'support.demo@example.invalid'),
  ('d3000000-0000-4000-8000-000000000003'::uuid,'reviewer.demo@example.invalid'),
  ('d3000000-0000-4000-8000-000000000004'::uuid,'finance.demo@example.invalid')
) demo(id,email)
on conflict(provider_id,provider) do nothing;

update public.profiles set status='suspended' where id='d2000000-0000-4000-8000-000000000003';
insert into public.user_roles(user_id,role) values
 ('d2000000-0000-4000-8000-000000000001','provider'),
 ('d2000000-0000-4000-8000-000000000002','provider'),
 ('d2000000-0000-4000-8000-000000000003','provider'),
 ('d3000000-0000-4000-8000-000000000001','operations_admin'),
 ('d3000000-0000-4000-8000-000000000002','support_agent'),
 ('d3000000-0000-4000-8000-000000000003','verification_reviewer'),
 ('d3000000-0000-4000-8000-000000000004','finance_reviewer')
on conflict(user_id,role) do nothing;

insert into public.admin_role_assignments(user_id,admin_role_id,granted_by,reason)
select demo.user_id,roles.id,'d3000000-0000-4000-8000-000000000001','local deterministic demo role'
from (values
 ('d3000000-0000-4000-8000-000000000001'::uuid,'operations'),
 ('d3000000-0000-4000-8000-000000000002'::uuid,'support'),
 ('d3000000-0000-4000-8000-000000000003'::uuid,'verification')
) demo(user_id,role_key)
join public.admin_roles roles on roles.key=demo.role_key
on conflict(user_id,admin_role_id) do nothing;

insert into public.provider_profiles(
  user_id,kind,business_name,bio,preferred_brief_locale,verification_status,
  accepting_requests,service_radius_km,rating_average,rating_count,completed_jobs,response_rate
) values
 ('d2000000-0000-4000-8000-000000000001','individual','فني الرياض التجريبي','حساب عرض محلي فقط','ur','verified',true,40,4.80,24,41,.95),
 ('d2000000-0000-4000-8000-000000000002','company','شركة المنافس التجريبية','حساب عرض محلي فقط','hi','verified',true,35,4.55,17,29,.90),
 ('d2000000-0000-4000-8000-000000000003','individual','مقدم موقوف تجريبي','حساب عرض محلي فقط','ar','suspended',false,20,3.10,4,3,.40)
on conflict(user_id) do nothing;

insert into public.provider_services(provider_id,category_id)
select provider_id,category.id
from (values
 ('d2000000-0000-4000-8000-000000000001'::uuid),
 ('d2000000-0000-4000-8000-000000000002'::uuid),
 ('d2000000-0000-4000-8000-000000000003'::uuid)
) providers(provider_id)
cross join lateral(select id from public.service_categories where slug='air-conditioning') category
on conflict(provider_id,category_id) do nothing;

insert into public.provider_service_areas(provider_id,city_id,center,radius_m)
select provider_id,city.id,st_setsrid(st_makepoint(0,0),4326)::geography,40000
from (values
 ('d2000000-0000-4000-8000-000000000001'::uuid),
 ('d2000000-0000-4000-8000-000000000002'::uuid),
 ('d2000000-0000-4000-8000-000000000003'::uuid)
) providers(provider_id)
cross join lateral(select id from public.cities where code='riyadh') city;

insert into public.addresses(id,user_id,city_id,label,formatted_address,location,is_default)
select 'da000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001',id,
  'بيانات اختبار','بيانات اختبار اصطناعية بلا عنوان فعلي',st_setsrid(st_makepoint(0,0),4326)::geography,true
from public.cities where code='riyadh';
insert into public.addresses(id,user_id,city_id,label,formatted_address,location,is_default)
select 'da000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000002',id,
  'بيانات اختبار ثانية','بيانات اختبار اصطناعية بلا عنوان فعلي',st_setsrid(st_makepoint(0,0),4326)::geography,true
from public.cities where code='riyadh';

insert into public.service_requests(
  id,customer_id,category_id,city_id,title,structured_description,original_text,original_locale,
  urgency,requested_start,approximate_location,exact_address_id,customer_approved_at,published_at,status
)
select request_id,customer_id,category.id,city.id,title,description,original_text,locale,urgency,
  now()+schedule_offset,approximate_location,address_id,now()-interval '2 days',now()-interval '2 days',status
from (values
 ('db000000-0000-4000-8000-000000000001'::uuid,'d1000000-0000-4000-8000-000000000001'::uuid,'مكيف لا يبرد','ضعف تبريد مستمر مع صوت خفيف، دون مؤشرات خطر فورية.','المكيف لا يبرد من أمس ويصدر صوتًا خفيفًا.','ar','normal'::public.request_urgency,interval '1 day',st_setsrid(st_makepoint(0,0),4326)::geography,'da000000-0000-4000-8000-000000000001'::uuid,'provider_selected'::public.request_status),
 ('db000000-0000-4000-8000-000000000002'::uuid,'d1000000-0000-4000-8000-000000000002'::uuid,'AC maintenance quote','Routine split AC maintenance requested.','The split AC needs routine maintenance.','en','flexible'::public.request_urgency,interval '3 days',st_setsrid(st_makepoint(0,0),4326)::geography,'da000000-0000-4000-8000-000000000002'::uuid,'provider_selected'::public.request_status),
 ('db000000-0000-4000-8000-000000000003'::uuid,'d1000000-0000-4000-8000-000000000001'::uuid,'تنظيف وحدة تكييف','تم تنظيف الوحدة واختبارها.','أحتاج تنظيف المكيف.','ar','normal'::public.request_urgency,-interval '4 days',st_setsrid(st_makepoint(0,0),4326)::geography,'da000000-0000-4000-8000-000000000001'::uuid,'provider_selected'::public.request_status)
) requests(request_id,customer_id,title,description,original_text,locale,urgency,schedule_offset,approximate_location,address_id,status)
cross join lateral(select id from public.service_categories where slug='air-conditioning') category
cross join lateral(select id from public.cities where code='riyadh') city;

insert into public.request_visibility(request_id,max_providers,expires_at) values
 ('db000000-0000-4000-8000-000000000001',10,now()+interval '2 days'),
 ('db000000-0000-4000-8000-000000000002',10,now()+interval '2 days'),
 ('db000000-0000-4000-8000-000000000003',10,now()+interval '2 days');
insert into public.matching_runs(id,request_id,configuration_version,weights,status,candidate_count) values
 ('dc000000-0000-4000-8000-000000000001','db000000-0000-4000-8000-000000000001','demo-v1','{"distance":0.25}','completed',1),
 ('dc000000-0000-4000-8000-000000000002','db000000-0000-4000-8000-000000000002','demo-v1','{"distance":0.25}','completed',2),
 ('dc000000-0000-4000-8000-000000000003','db000000-0000-4000-8000-000000000003','demo-v1','{"distance":0.25}','completed',1);
insert into public.request_provider_matches(request_id,provider_id,matching_run_id,score,status,expires_at) values
 ('db000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','dc000000-0000-4000-8000-000000000001',.95,'selected',now()+interval '2 days'),
 ('db000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-000000000001','dc000000-0000-4000-8000-000000000002',.91,'offered',now()+interval '2 days'),
 ('db000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-000000000002','dc000000-0000-4000-8000-000000000002',.87,'invited',now()+interval '2 days'),
 ('db000000-0000-4000-8000-000000000003','d2000000-0000-4000-8000-000000000001','dc000000-0000-4000-8000-000000000003',.93,'selected',now()+interval '2 days');

insert into public.offers(
 id,request_id,provider_id,total_amount_minor,visit_fee_minor,labor_amount_minor,materials_included,
 estimated_arrival_minutes,estimated_duration_minutes,warranty_days,provider_note,expires_at,status,idempotency_key
) values
 ('dd000000-0000-4000-8000-000000000001','db000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001',28000,5000,23000,false,45,120,30,'عرض محلي تجريبي',now()+interval '2 days','selected','demo-offer-1'),
 ('dd000000-0000-4000-8000-000000000002','db000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-000000000001',24000,4000,20000,false,60,90,14,'Local demo offer A',now()+interval '2 days','selected','demo-offer-2a'),
 ('dd000000-0000-4000-8000-000000000003','db000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-000000000002',26000,3000,23000,true,40,100,30,'Local demo offer B',now()+interval '2 days','rejected','demo-offer-2b'),
 ('dd000000-0000-4000-8000-000000000004','db000000-0000-4000-8000-000000000003','d2000000-0000-4000-8000-000000000001',18000,3000,15000,false,30,60,7,'عرض مكتمل تجريبي',now()+interval '2 days','selected','demo-offer-3');

insert into public.jobs(
 id,request_id,selected_offer_id,customer_id,provider_id,exact_address_id,status,scheduled_start,approved_total_minor,completed_at
) values
 ('de000000-0000-4000-8000-000000000001','db000000-0000-4000-8000-000000000001','dd000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000001','awaiting_change_order_approval',now()+interval '1 day',28000,null),
 ('de000000-0000-4000-8000-000000000002','db000000-0000-4000-8000-000000000003','dd000000-0000-4000-8000-000000000004','d1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000001','completed',now()-interval '4 days',18000,now()-interval '3 days'),
 ('de000000-0000-4000-8000-000000000003','db000000-0000-4000-8000-000000000002','dd000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000002','in_progress',now()+interval '3 days',24000,null);
update public.provider_profiles set active_workload=2 where user_id='d2000000-0000-4000-8000-000000000001';

insert into public.change_orders(
 id,job_id,provider_id,reason,description,added_amount_minor,revised_total_minor,status,expires_at,idempotency_key
) values(
 'df000000-0000-4000-8000-000000000001','de000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001',
 'قطعة إضافية بعد المعاينة','استبدال مكثف تالف بعد موافقة العميل',7000,35000,'pending',now()+interval '12 hours','demo-change-1'
);
insert into public.change_order_items(change_order_id,description,quantity,unit_amount_minor)
values('df000000-0000-4000-8000-000000000001','مكثف بديل وتركيب',1,7000);
insert into public.file_uploads(
  id,user_id,purpose,resource_id,original_filename,extension,declared_mime_type,
  detected_mime_type,size_bytes,max_size_bytes,quarantine_path,target_bucket,target_path,
  final_path,content_sha256,status,scanner,sanitized,scanned_at
)
values(
  'dd000000-0000-4000-8000-000000000099','d2000000-0000-4000-8000-000000000001',
  'completion_proof','de000000-0000-4000-8000-000000000002','completion.jpg','jpg',
  'image/jpeg','image/jpeg',1024,20971520,
  'd2000000-0000-4000-8000-000000000001/dd000000-0000-4000-8000-000000000099/completion.jpg',
  'completion-proofs','d2000000-0000-4000-8000-000000000001/jobs/demo/completion.jpg',
  'd2000000-0000-4000-8000-000000000001/jobs/demo/completion.jpg',repeat('0',64),
  'clean','deterministic-demo-fixture',true,now()-interval '3 days'
);
insert into public.completion_proofs(job_id,provider_id,storage_path,mime_type,size_bytes,description,captured_at)
values('de000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001/jobs/demo/completion.jpg','image/jpeg',1024,'إثبات محلي غير مرفوع',now()-interval '3 days');
insert into public.customer_acceptances(job_id,customer_id,accepted,reason,accepted_total_minor)
values('de000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000001',true,'قبول تجريبي',18000);
insert into public.ratings(job_id,customer_id,provider_id,score,review)
values('de000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001',5,'خدمة تجريبية ممتازة');

insert into public.conversations(id,job_id,status) values
 ('e0000000-0000-4000-8000-000000000001','de000000-0000-4000-8000-000000000001','active'),
 ('e0000000-0000-4000-8000-000000000002','de000000-0000-4000-8000-000000000002','closed');
insert into public.conversation_members(conversation_id,user_id,member_role) values
 ('e0000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','customer'),
 ('e0000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','provider'),
 ('e0000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000001','customer'),
 ('e0000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-000000000001','provider');
insert into public.messages(conversation_id,sender_id,body,client_message_id) values
 ('e0000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','البوابة مفتوحة عند الوصول.','demo-message-1'),
 ('e0000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','تم، سأرسل تحديث الموقع عند التوجه.','demo-message-2');

insert into public.payments(
 id,job_id,customer_id,provider_id,provider_name,amount_minor,status,payment_mode,idempotency_key
) values(
 'e1000000-0000-4000-8000-000000000001','de000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000001',
 'd2000000-0000-4000-8000-000000000001','offline',18000,'offline','offline','demo-payment-1'
);
insert into public.support_cases(id,opened_by,job_id,topic,priority,status,subject)
values('e2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','de000000-0000-4000-8000-000000000001','change_order','high','open','استفسار عن تغيير النطاق');
insert into public.support_case_assignments(case_id,assignee_id,assigned_by)
values('e2000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000002','d3000000-0000-4000-8000-000000000001');
insert into public.support_case_messages(case_id,sender_id,body,visible_to_user)
values('e2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','أحتاج توضيح القطعة الإضافية.',true);
insert into public.cancellation_requests(
  id,job_id,requester_id,lifecycle_state,reason,status,expected_job_version,idempotency_key
) values(
  'e2500000-0000-4000-8000-000000000001','de000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001','awaiting_change_order_approval',
  'طلب إلغاء تجريبي للاختبار المتكامل','pending',1,'demo-cancellation-request'
);
insert into public.disputes(
  id,job_id,opened_by,reason,priority,status,assigned_to,
  expected_job_version,idempotency_key,pre_dispute_job_status
)
values(
  'e3000000-0000-4000-8000-000000000001','de000000-0000-4000-8000-000000000003',
  'd1000000-0000-4000-8000-000000000002','نزاع عرض محلي غير نهائي','normal','open',
  'd3000000-0000-4000-8000-000000000002',1,'demo-dispute-open','in_progress'
);
update public.jobs set status='disputed',version=2
where id='de000000-0000-4000-8000-000000000003';
insert into public.dispute_events(dispute_id,actor_id,event_type,reason)
values('e3000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000002','opened','طلب مراجعة تجريبي');
insert into public.financial_holds(job_id,amount_minor,reason,created_by,dispute_id)
values(
  'de000000-0000-4000-8000-000000000003',24000,'demo_dispute_hold',
  'd3000000-0000-4000-8000-000000000002','e3000000-0000-4000-8000-000000000001'
);
insert into public.financial_action_intents(
  id,source_type,source_id,payment_id,action_type,amount_minor,status,idempotency_key,created_by
) values(
  'e4000000-0000-4000-8000-000000000001','cancellation',
  'e2500000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001',
  'manual_refund',1000,'pending','demo-finance-review-intent',
  'd3000000-0000-4000-8000-000000000001'
);
insert into public.notification_outbox(user_id,event_type,channel,payload,deduplication_key,status) values
 ('d1000000-0000-4000-8000-000000000001','change_order','in_app','{"jobId":"de000000-0000-4000-8000-000000000001"}','demo-change-order-customer','pending'),
 ('d2000000-0000-4000-8000-000000000001','provider_matched','in_app','{"requestId":"db000000-0000-4000-8000-000000000002"}','demo-provider-match','pending');
