begin;
select plan(27);

select has_table('public','provider_restricted_qualifications','restricted qualifications have an authoritative reviewer-owned ledger');

insert into auth.users(
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) select id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',email,
  crypt(gen_random_uuid()::text,gen_salt('bf')),now(),'{}','{}',now(),now()
from (values
  ('f2000000-0000-4000-8000-000000000001'::uuid,'matching-customer@test.invalid'),
  ('f2000000-0000-4000-8000-000000000002'::uuid,'matching-near@test.invalid'),
  ('f2000000-0000-4000-8000-000000000003'::uuid,'matching-far@test.invalid'),
  ('f2000000-0000-4000-8000-000000000004'::uuid,'matching-material@test.invalid'),
  ('f2000000-0000-4000-8000-000000000005'::uuid,'matching-reviewer@test.invalid'),
  ('f2000000-0000-4000-8000-000000000006'::uuid,'matching-nonmaterial@test.invalid')
) users(id,email);
insert into public.user_roles(user_id,role) values
  ('f2000000-0000-4000-8000-000000000002','provider'),
  ('f2000000-0000-4000-8000-000000000003','provider'),
  ('f2000000-0000-4000-8000-000000000004','provider'),
  ('f2000000-0000-4000-8000-000000000005','verification_reviewer'),
  ('f2000000-0000-4000-8000-000000000006','provider');
insert into public.provider_profiles(
  user_id,kind,bio,verification_status,accepting_requests,max_active_jobs
) values
  ('f2000000-0000-4000-8000-000000000002','individual','Near restricted provider','verified',true,2),
  ('f2000000-0000-4000-8000-000000000003','individual','Far restricted provider','verified',true,2),
  ('f2000000-0000-4000-8000-000000000004','individual','Material change provider','verified',true,2),
  ('f2000000-0000-4000-8000-000000000006','individual','Nonmaterial provider','verified',true,2);
insert into public.provider_services(provider_id,category_id)
select provider_id,c.id from (values
  ('f2000000-0000-4000-8000-000000000002'::uuid),
  ('f2000000-0000-4000-8000-000000000003'::uuid)
) p(provider_id) cross join lateral(select id from public.service_categories where slug='pest-control') c;
insert into public.provider_services(provider_id,category_id)
select provider_id,c.id from (values
  ('f2000000-0000-4000-8000-000000000004'::uuid),
  ('f2000000-0000-4000-8000-000000000006'::uuid)
) p(provider_id) cross join lateral(select id from public.service_categories where slug='general-handyman') c;
insert into public.provider_service_areas(provider_id,city_id,center,radius_m)
select provider_id,city.id,
  extensions.st_setsrid(extensions.st_makepoint(longitude,latitude),4326)::extensions.geography,100000
from (values
  ('f2000000-0000-4000-8000-000000000002'::uuid,46.671::double precision,24.711::double precision),
  ('f2000000-0000-4000-8000-000000000003'::uuid,46.800::double precision,24.800::double precision)
) p(provider_id,longitude,latitude)
cross join lateral(select id from public.cities where code='riyadh') city;
insert into public.provider_availability(provider_id,weekday,start_time,end_time)
select provider_id,day,'00:00'::time,'23:59:59'::time
from (values
  ('f2000000-0000-4000-8000-000000000002'::uuid),
  ('f2000000-0000-4000-8000-000000000003'::uuid)
) p(provider_id) cross join generate_series(0,6) day;

insert into public.addresses(id,user_id,city_id,label,formatted_address,location)
select 'f2050000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001',
  id,'Selection fixture','Customer exact selection address',
  extensions.st_setsrid(extensions.st_makepoint(46.67,24.71),4326)::extensions.geography
from public.cities where code='riyadh';

insert into public.service_requests(
  id,customer_id,category_id,city_id,title,structured_description,original_text,
  approximate_location,exact_address_id,status,published_at,customer_approved_at
) select 'f2100000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001',cat.id,city.id,
  'Restricted matching','Restricted matching fixture','Restricted matching fixture',
  extensions.st_setsrid(extensions.st_makepoint(46.67,24.71),4326)::extensions.geography,
  'f2050000-0000-4000-8000-000000000001',
  'matching',now(),now()
from public.service_categories cat cross join public.cities city
where cat.slug='pest-control' and city.code='riyadh';

select set_config('request.jwt.claim.role','service_role',true);
select public.run_matching('f2100000-0000-4000-8000-000000000001',20);
select is((select exclusion_reason from public.matching_candidates
  where provider_id='f2000000-0000-4000-8000-000000000002' order by created_at desc limit 1),
  'restricted_category_unqualified','matching records the explicit pre-qualification exclusion');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','f2000000-0000-4000-8000-000000000002',true);
select throws_ok(
  format('update public.provider_services set qualified_for_restricted=true where provider_id=%L and category_id=%L',
    'f2000000-0000-4000-8000-000000000002',
    (select id from public.service_categories where slug='pest-control')),
  'PROVIDER_SELF_QUALIFICATION_FORBIDDEN','provider cannot self-set restricted qualification');
select is((select qualified_for_restricted from public.provider_services
  where provider_id='f2000000-0000-4000-8000-000000000002'),false,
  'failed self-qualification leaves the compatibility field false');

select set_config('request.jwt.claim.sub','f2000000-0000-4000-8000-000000000005',true);
select lives_ok(
  format('select public.set_provider_restricted_qualification(%L,%L,null,true,%L,%L)',
    'f2000000-0000-4000-8000-000000000002',
    (select id from public.service_categories where slug='pest-control'),
    'Reviewer validated the restricted service evidence','qualification-near-key'),
  'verification reviewer grants the restricted qualification');
select lives_ok(
  format('select public.set_provider_restricted_qualification(%L,%L,null,true,%L,%L)',
    'f2000000-0000-4000-8000-000000000003',
    (select id from public.service_categories where slug='pest-control'),
    'Reviewer validated the second provider evidence','qualification-far-key'),
  'reviewer may grant the second restricted qualification');
reset role;
select is((select count(*) from public.provider_qualification_events where event_type='granted'),2::bigint,
  'qualification grants append explicit audit events');

select set_config('request.jwt.claim.role','service_role',true);
select public.run_matching('f2100000-0000-4000-8000-000000000001',20);
select ok(exists(select 1 from public.request_provider_matches
  where request_id='f2100000-0000-4000-8000-000000000001'
    and provider_id='f2000000-0000-4000-8000-000000000002' and status='invited'),
  'matching invites the provider after reviewer qualification');
select ok((select score from public.request_provider_matches
    where request_id='f2100000-0000-4000-8000-000000000001' and provider_id='f2000000-0000-4000-8000-000000000002')
  > (select score from public.request_provider_matches
    where request_id='f2100000-0000-4000-8000-000000000001' and provider_id='f2000000-0000-4000-8000-000000000003'),
  'normalized real distance orders the nearer provider ahead of the farther provider');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','f2000000-0000-4000-8000-000000000002',true);
select lives_ok(
  $$select public.submit_offer(jsonb_build_object(
    'requestId','f2100000-0000-4000-8000-000000000001','expectedRequestVersion',
    (select version from public.service_requests where id='f2100000-0000-4000-8000-000000000001'),
    'idempotencyKey','qualified-active-offer-key','totalAmountMinor',12000,'visitFeeMinor',1000,
    'laborAmountMinor',11000,'materialsIncluded',false,'materialsEstimateMinor',0,
    'estimatedArrivalMinutes',30,'estimatedDurationMinutes',90,'warrantyDays',7,
    'note','Qualified offer before qualification revocation','expiresAt',now()+interval '1 day'
  ))$$,
  'qualified provider submits an active offer before revocation'
);
reset role;
select is((select status::text from public.offers
  where provider_id='f2000000-0000-4000-8000-000000000002'
    and request_id='f2100000-0000-4000-8000-000000000001'),
  'active','offer is active while the provider remains qualified');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','f2000000-0000-4000-8000-000000000005',true);
select public.set_provider_restricted_qualification(
  'f2000000-0000-4000-8000-000000000002',
  (select id from public.service_categories where slug='pest-control'),null,false,
  'Restricted qualification revoked after evidence expired','qualification-revoke-key'
);
reset role;
select is((select status::text from public.offers
  where provider_id='f2000000-0000-4000-8000-000000000002'
    and request_id='f2100000-0000-4000-8000-000000000001'),
  'withdrawn','qualification revocation proactively invalidates the active offer');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','f2000000-0000-4000-8000-000000000001',true);
select is((select value->>'selectable'
  from jsonb_array_elements(public.get_customer_offers(
    'f2100000-0000-4000-8000-000000000001'
  )) value where value->>'providerId'='f2000000-0000-4000-8000-000000000002'),
  'false','customer offer view clearly disables the revoked provider offer');
reset role;
update public.offers set status='active'
where provider_id='f2000000-0000-4000-8000-000000000002'
  and request_id='f2100000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','f2000000-0000-4000-8000-000000000001',true);
select throws_ok(
  format('select public.select_offer(%L,%L)',
    (select id from public.offers
      where provider_id='f2000000-0000-4000-8000-000000000002'
        and request_id='f2100000-0000-4000-8000-000000000001'),
    'stale-selection-after-revocation-key'),
  'OFFER_PROVIDER_INELIGIBLE:restricted_category_unqualified',
  'select_offer independently revalidates a stale active offer after revocation'
);
reset role;
select is((select count(*) from public.jobs
  where request_id='f2100000-0000-4000-8000-000000000001'),0::bigint,
  'denied stale selection cannot create a job');
update public.offers set status='withdrawn'
where provider_id='f2000000-0000-4000-8000-000000000002'
  and request_id='f2100000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','f2000000-0000-4000-8000-000000000002',true);
select throws_ok(
  $$select public.submit_offer(jsonb_build_object(
    'requestId','f2100000-0000-4000-8000-000000000001','expectedRequestVersion',
    (select version from public.service_requests where id='f2100000-0000-4000-8000-000000000001'),
    'idempotencyKey','revoked-offer-key','totalAmountMinor',12000,'visitFeeMinor',1000,
    'laborAmountMinor',11000,'materialsIncluded',false,'materialsEstimateMinor',0,
    'estimatedArrivalMinutes',30,'estimatedDurationMinutes',90,'warrantyDays',7,
    'note','Must not be accepted','expiresAt',now()+interval '1 day'
  ))$$,'PROVIDER_NOT_ELIGIBLE:restricted_category_unqualified',
  'offer submission independently rejects a revoked qualification');
select throws_ok(
  $$select public.get_provider_request_brief('f2100000-0000-4000-8000-000000000001')$$,
  'PROVIDER_BRIEF_ACCESS_DENIED',
  'request brief authorization is removed immediately after qualification revocation closes the match');

reset role;
select set_config('request.jwt.claim.sub','f2000000-0000-4000-8000-000000000005',true);
update public.provider_restricted_qualifications set qualified=true
where provider_id='f2000000-0000-4000-8000-000000000002';
update public.service_requests
set requested_start=(
    date_trunc('day',now() at time zone 'Asia/Riyadh')+interval '2 days 10 hours'
  ) at time zone 'Asia/Riyadh',
  requested_end=(
    date_trunc('day',now() at time zone 'Asia/Riyadh')+interval '2 days 11 hours'
  ) at time zone 'Asia/Riyadh'
where id='f2100000-0000-4000-8000-000000000001';
delete from public.provider_availability
where provider_id='f2000000-0000-4000-8000-000000000002';
insert into public.provider_availability(provider_id,weekday,start_time,end_time)
values(
  'f2000000-0000-4000-8000-000000000002',
  extract(dow from now() at time zone 'Asia/Riyadh')::smallint,
  '00:00','23:59:59'
);
select is(private.provider_request_eligibility(
  'f2000000-0000-4000-8000-000000000002','f2100000-0000-4000-8000-000000000001',now())->>'reason',
  'outside_availability','available now but unavailable in the scheduled window is excluded');
delete from public.provider_availability where provider_id='f2000000-0000-4000-8000-000000000002';
insert into public.provider_availability(provider_id,weekday,start_time,end_time)
select 'f2000000-0000-4000-8000-000000000002',
  extract(dow from requested_start at time zone 'Asia/Riyadh')::smallint,
  '09:00'::time,'12:00'::time
from public.service_requests where id='f2100000-0000-4000-8000-000000000001';
select is(private.provider_request_eligibility(
  'f2000000-0000-4000-8000-000000000002','f2100000-0000-4000-8000-000000000001',now())->>'eligible',
  'true','unavailable now but available for the scheduled window remains eligible');
insert into public.provider_blackout_periods(provider_id,starts_at,ends_at,reason)
values('f2000000-0000-4000-8000-000000000002',
  now()-interval '1 hour',now()+interval '1 hour','current-only blackout');
select is(private.provider_request_eligibility(
  'f2000000-0000-4000-8000-000000000002','f2100000-0000-4000-8000-000000000001',now())->>'eligible',
  'true','a blackout outside the scheduled request window does not exclude the provider');
delete from public.provider_blackout_periods
where provider_id='f2000000-0000-4000-8000-000000000002';
insert into public.provider_blackout_periods(provider_id,starts_at,ends_at,reason)
select 'f2000000-0000-4000-8000-000000000002',
  requested_start+interval '15 minutes',requested_end+interval '15 minutes',
  'scheduled overlap'
from public.service_requests where id='f2100000-0000-4000-8000-000000000001';
select is(private.provider_request_eligibility(
  'f2000000-0000-4000-8000-000000000002','f2100000-0000-4000-8000-000000000001',now())->>'reason',
  'blackout_overlap','only a blackout overlapping the requested window excludes the provider');
delete from public.provider_blackout_periods
where provider_id='f2000000-0000-4000-8000-000000000002';
update public.provider_profiles set active_workload=max_active_jobs
where user_id='f2000000-0000-4000-8000-000000000002';
select is(private.provider_request_eligibility(
  'f2000000-0000-4000-8000-000000000002','f2100000-0000-4000-8000-000000000001',now())->>'reason',
  'capacity_reached','active workload at capacity excludes the provider');
update public.provider_profiles set active_workload=0 where user_id='f2000000-0000-4000-8000-000000000002';

insert into public.service_subcategories(category_id,slug,restricted)
select id,'restricted-chemical-treatment',true from public.service_categories where slug='pest-control';
update public.service_requests set subcategory_id=(select id from public.service_subcategories where slug='restricted-chemical-treatment')
where id='f2100000-0000-4000-8000-000000000001';
update public.provider_services set subcategory_id=(select id from public.service_subcategories where slug='restricted-chemical-treatment')
where provider_id='f2000000-0000-4000-8000-000000000002';
select is(private.provider_request_eligibility(
  'f2000000-0000-4000-8000-000000000002','f2100000-0000-4000-8000-000000000001',now())->>'reason',
  'restricted_subcategory_unqualified','restricted subcategory requires its own reviewer qualification');

set local role authenticated;
select set_config('request.jwt.claim.sub','f2000000-0000-4000-8000-000000000004',true);
insert into public.provider_services(provider_id,category_id)
select 'f2000000-0000-4000-8000-000000000004',id from public.service_categories where slug='pest-control';
reset role;
select is((select verification_status::text from public.provider_profiles where user_id='f2000000-0000-4000-8000-000000000004'),
  'submitted','verified provider adding a service category is returned to review');
select is((select accepting_requests from public.provider_profiles where user_id='f2000000-0000-4000-8000-000000000004'),
  false,'material provider changes immediately stop new request acceptance');

set local role authenticated;
select set_config('request.jwt.claim.sub','f2000000-0000-4000-8000-000000000006',true);
update public.provider_profiles set bio='Updated ordinary biography that does not affect verification'
where user_id='f2000000-0000-4000-8000-000000000006';
reset role;
select is((select verification_status::text from public.provider_profiles where user_id='f2000000-0000-4000-8000-000000000006'),
  'verified','ordinary biography edits preserve verified status');
select is((select accepting_requests from public.provider_profiles where user_id='f2000000-0000-4000-8000-000000000006'),
  true,'ordinary non-material edits preserve request acceptance');

select * from finish();
rollback;
