-- Configuration/catalog seed only. No demo users or fake production activity.
insert into public.cities(code,name_ar,name_en) values
 ('riyadh','الرياض','Riyadh'),('jeddah','جدة','Jeddah'),('dammam','الدمام','Dammam')
on conflict(code) do update set name_ar=excluded.name_ar,name_en=excluded.name_en;

with catalog(slug,icon_key,restricted,sort_order,name_ar,name_en,description_ar,description_en) as (values
 ('air-conditioning','snowflake',false,10,'التكييف','Air conditioning','تركيب وصيانة وإصلاح أنظمة التكييف','Installation, maintenance, and repair of AC systems'),
 ('plumbing','droplets',false,20,'السباكة','Plumbing','تسربات وتمديدات وأدوات صحية','Leaks, piping, and fixtures'),
 ('electrical','zap',false,30,'الكهرباء','Electrical','أعطال وتمديدات كهربائية منزلية','Home electrical faults and wiring'),
 ('appliance-repair','washer',false,40,'إصلاح الأجهزة','Appliance repair','تشخيص وإصلاح الأجهزة المنزلية','Diagnosis and repair of home appliances'),
 ('cleaning','sparkles',false,50,'التنظيف','Cleaning','تنظيف المنازل والمنشآت','Home and facility cleaning'),
 ('painting','paintbrush',false,60,'الدهان','Painting','دهان داخلي وخارجي','Interior and exterior painting'),
 ('carpentry','hammer',false,70,'النجارة','Carpentry','أعمال الخشب والإصلاح','Woodwork and repair'),
 ('furniture-assembly','armchair',false,80,'تركيب الأثاث','Furniture assembly','تركيب وفك الأثاث','Furniture assembly and disassembly'),
 ('pest-control','bug',true,90,'مكافحة الآفات','Pest control','خدمات مكافحة الآفات المؤهلة','Qualified pest control services'),
 ('water-tanks','container',false,100,'خزانات المياه','Water tanks','تنظيف وصيانة خزانات المياه','Water tank cleaning and maintenance'),
 ('moving','truck',false,110,'نقل العفش','Moving services','نقل وتغليف الأثاث','Furniture moving and packing'),
 ('landscaping','tree',false,120,'تنسيق الحدائق','Landscaping','العناية بالحدائق والتنسيق','Garden care and landscaping'),
 ('general-handyman','wrench',false,130,'فني عام','General handyman','إصلاحات وتركيبات منزلية عامة','General home repairs and installations'),
 ('renovation','hard-hat',false,140,'الترميم','Renovation','ترميم وتحسين المساحات','Space renovation and improvement'),
 ('masonry','bricks',false,150,'البناء','Masonry','أعمال بناء وإصلاحات خرسانية','Masonry and concrete repair'),
 ('tiling','grid',false,160,'البلاط','Tiling','تركيب وإصلاح البلاط','Tile installation and repair'),
 ('roofing-waterproofing','umbrella',true,170,'الأسطح والعزل','Roofing and waterproofing','عزل وإصلاح الأسطح المؤهل','Qualified roofing and waterproofing'),
 ('doors-locks','key',false,180,'الأبواب والأقفال','Doors and locks','تركيب وإصلاح الأبواب والأقفال','Door and lock installation and repair'),
 ('security-cameras','camera',true,190,'كاميرات المراقبة','Security cameras','تركيب وصيانة أنظمة المراقبة المؤهلة','Qualified security camera installation and maintenance'),
 ('internet-networking','wifi',false,200,'الإنترنت والشبكات','Internet and networking','إعداد وإصلاح الشبكات المنزلية','Home network setup and repair'),
 ('elevators','move-vertical',true,210,'المصاعد','Elevators','خدمة متخصصة ومقيدة للمصاعد','Restricted specialized elevator service'),
 ('other','more-horizontal',false,220,'خدمة أخرى','Other service','خدمة قابلة للتصنيف والمراجعة','Service requiring classification and review')
), inserted as (
 insert into public.service_categories(slug,icon_key,restricted,sort_order) select slug,icon_key,restricted,sort_order from catalog
 on conflict(slug) do update set icon_key=excluded.icon_key,restricted=excluded.restricted,sort_order=excluded.sort_order returning id,slug
)
insert into public.service_category_translations(category_id,locale,name,description)
select i.id,'ar',c.name_ar,c.description_ar from inserted i join catalog c using(slug)
union all select i.id,'en',c.name_en,c.description_en from inserted i join catalog c using(slug)
union all select i.id,'ur',c.name_en,c.description_en from inserted i join catalog c using(slug)
union all select i.id,'hi',c.name_en,c.description_en from inserted i join catalog c using(slug)
on conflict(category_id,locale) do update set name=excluded.name,description=excluded.description;

insert into public.admin_permissions(key,description,risk_level) values
 ('dashboard.read','Read marketplace health','low'),('providers.verify','Review and verify providers','high'),('users.suspend','Suspend or reactivate users','high'),
 ('support.manage','Manage support cases','medium'),('disputes.resolve','Resolve disputes','high'),('finance.read','Read financial records','high'),
 ('finance.mutate','Refund, hold, and settle funds','critical'),('catalog.manage','Manage service catalog','medium'),('settings.manage','Manage feature flags and settings','critical'),('audit.read','Read audit records','high')
on conflict(key) do update set description=excluded.description,risk_level=excluded.risk_level;
insert into public.admin_roles(key,name,description,system_role) values
 ('operations','Operations administrator','Marketplace operations','operations_admin'),('verification','Verification reviewer','Provider verification','verification_reviewer'),
 ('support','Support agent','Cases and disputes','support_agent'),('finance','Finance reviewer','Financial review','finance_reviewer'),
 ('analyst','Read-only analyst','Read-only marketplace insights','analyst'),('super_admin','Super administrator','Restricted emergency administration','super_admin')
on conflict(key) do update set name=excluded.name,description=excluded.description;

insert into public.feature_flags(key,enabled,environments,rules) values
 ('phone_otp',false,'{}','{}'),('background_location',false,'{}','{}'),('online_payments',false,'{}','{}'),
 ('ai_diagnostics',true,array['local','test','preview'],'{}'),('push_notifications',false,'{}','{}')
on conflict(key) do update set enabled=excluded.enabled,environments=excluded.environments,rules=excluded.rules;
insert into public.system_settings(key,value) values
 ('market.currency','{"code":"SAR","minorUnits":2}'),('market.timezone','{"iana":"Asia/Riyadh"}'),('market.primary_city','{"code":"riyadh"}'),
 ('matching.weights','{"version":"v1","distance":0.25,"availability":0.15,"rating":0.2,"response":0.15,"workload":0.15,"completedJobs":0.1}'),
 ('commission.default','{"rateBps":0,"pilot":true}'),('payments.mode','{"production":"offline","test":"fake"}'),
 ('media.limits','{"imageBytes":10485760,"videoBytes":20971520,"audioSeconds":120}'),
 ('safety.guidance','{"reviewed":false,"ar":"","en":""}')
on conflict(key) do update set value=excluded.value,version=public.system_settings.version+1;

insert into public.legal_documents(document_type,version,locale,content_hash,published_at,effective_at,requires_acceptance) values
 ('privacy','draft-1','ar',encode(digest('privacy-draft-ar','sha256'),'hex'),now(),now(),true),
 ('terms','draft-1','ar',encode(digest('terms-draft-ar','sha256'),'hex'),now(),now(),true),
 ('privacy','draft-1','en',encode(digest('privacy-draft-en','sha256'),'hex'),now(),now(),true),
 ('terms','draft-1','en',encode(digest('terms-draft-en','sha256'),'hex'),now(),now(),true)
on conflict(document_type,version,locale) do nothing;

insert into public.ai_prompt_versions(purpose,version,schema_version,system_prompt_hash,enabled) values
 ('diagnostic','diagnostic-v1','1.0',encode(digest('system-prompt-reviewed-at-deploy','sha256'),'hex'),true),
 ('translation','translation-v1','1.0',encode(digest('translation-prompt-reviewed-at-deploy','sha256'),'hex'),true)
on conflict(purpose,version) do update set schema_version=excluded.schema_version;

insert into public.notification_templates(event_type,channel,locale,body_template) values
 ('new_offer','in_app','ar','لديك عرض جديد لطلب الخدمة.'),('offer_selected','in_app','ar','تم اختيار عرضك.'),
 ('provider_matched','in_app','ar','لديك طلب خدمة مؤهل جديد.'),('change_order','in_app','ar','هناك تغيير نطاق يحتاج قرارك.'),
 ('completion_submitted','in_app','ar','أرسل مقدم الخدمة إثبات الإنجاز.'),('support_update','in_app','ar','يوجد تحديث على حالة الدعم.')
on conflict(event_type,channel,locale,version) do nothing;
