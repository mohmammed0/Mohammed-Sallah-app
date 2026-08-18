begin;
select plan(16);

create temporary table timing_fixture(kind text primary key,request_id uuid,offer_id uuid,job_id uuid);
grant all on timing_fixture to authenticated;

update public.provider_profiles
set verification_status='verified',accepting_requests=true,active_workload=0,max_active_jobs=5
where user_id='d2000000-0000-4000-8000-000000000001';
update public.provider_services set enabled=true,review_status='approved'
where provider_id='d2000000-0000-4000-8000-000000000001'
  and category_id=(select id from public.service_categories where slug='air-conditioning');
update public.provider_service_areas
set center=extensions.st_setsrid(extensions.st_makepoint(46.6753,24.7136),4326)::extensions.geography,
  radius_m=100000,enabled=true
where provider_id='d2000000-0000-4000-8000-000000000001';
delete from public.provider_availability
where provider_id='d2000000-0000-4000-8000-000000000001';
insert into public.provider_availability(provider_id,weekday,start_time,end_time)
select 'd2000000-0000-4000-8000-000000000001',
  extract(dow from ((date_trunc('day',now() at time zone 'Asia/Riyadh')+interval '3 days 12 hours')))::smallint,
  '01:00','02:00';

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000001',true);
insert into timing_fixture(kind,request_id)
select 'scheduled',public.publish_service_request(jsonb_build_object(
  'idempotency_key','timing-scheduled-publication-001','title','Scheduled timing fixture',
  'original_text','Scheduled AC service request','structured_description','Scheduled AC service request',
  'locale','en','urgency','normal','selected_category_slug','air-conditioning',
  'category_confirmed_by_user',true,'category_selection_source','manual','city_code','riyadh',
  'timing_mode','scheduled',
  'requested_start',(date_trunc('day',now() at time zone 'Asia/Riyadh')+interval '3 days 12 hours') at time zone 'Asia/Riyadh',
  'requested_end',(date_trunc('day',now() at time zone 'Asia/Riyadh')+interval '3 days 13 hours') at time zone 'Asia/Riyadh',
  'exact_location',jsonb_build_object('latitude',24.7136,'longitude',46.6753),
  'media','[]'::jsonb,'customer_approved',true
));
reset role;

select is((select timing_mode::text from public.service_requests r join timing_fixture f on f.request_id=r.id where f.kind='scheduled'),
  'scheduled','scheduled timing is authoritative on the inserted row');
select is((select c.exclusion_reason from public.matching_candidates c
  join public.matching_runs run on run.id=c.matching_run_id
  join timing_fixture f on f.request_id=run.request_id
  where f.kind='scheduled' and c.provider_id='d2000000-0000-4000-8000-000000000001'),
  'outside_availability','first automatic matching evaluates the scheduled future window');
select is((select count(*) from public.request_provider_matches m join timing_fixture f on f.request_id=m.request_id
  where f.kind='scheduled' and m.provider_id='d2000000-0000-4000-8000-000000000001'),
  0::bigint,'scheduled publication creates no temporary flexible invitation');
select is((select count(*) from public.matching_runs run join timing_fixture f on f.request_id=run.request_id where f.kind='scheduled'),
  1::bigint,'scheduled publication performs one complete initial matching run');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000001',true);
insert into timing_fixture(kind,request_id)
select 'flexible',public.publish_service_request(jsonb_build_object(
  'idempotency_key','timing-flexible-publication-001','title','Flexible timing fixture',
  'original_text','Flexible AC service request','structured_description','Flexible AC service request',
  'locale','en','urgency','flexible','selected_category_slug','air-conditioning',
  'category_confirmed_by_user',true,'category_selection_source','manual','city_code','riyadh',
  'timing_mode','flexible','requested_start',null,'requested_end',null,
  'exact_location',jsonb_build_object('latitude',24.7136,'longitude',46.6753),
  'media','[]'::jsonb,'customer_approved',true
));
reset role;

select ok((select requested_start is null and requested_end is null from public.service_requests r
  join timing_fixture f on f.request_id=r.id where f.kind='flexible'),
  'flexible publication has no fabricated window');
select is((select c.eligible from public.matching_candidates c
  join public.matching_runs run on run.id=c.matching_run_id join timing_fixture f on f.request_id=run.request_id
  where f.kind='flexible' and c.provider_id='d2000000-0000-4000-8000-000000000001'),
  true,'flexible matching ignores ordinary current availability only');
select is((select count(*) from public.request_provider_matches m join timing_fixture f on f.request_id=m.request_id
  where f.kind='flexible' and m.provider_id='d2000000-0000-4000-8000-000000000001' and m.status='invited'),
  1::bigint,'eligible flexible provider receives one invitation');

delete from public.provider_availability
where provider_id='d2000000-0000-4000-8000-000000000001';
insert into public.provider_availability(provider_id,weekday,start_time,end_time)
select 'd2000000-0000-4000-8000-000000000001',day,'00:00','23:59'
from generate_series(0,6) day;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000001',true);
insert into timing_fixture(kind,request_id)
select 'asap',public.publish_service_request(jsonb_build_object(
  'idempotency_key','timing-asap-publication-001','title','ASAP timing fixture',
  'original_text','ASAP AC service request','structured_description','ASAP AC service request',
  'locale','en','urgency','urgent','selected_category_slug','air-conditioning',
  'category_confirmed_by_user',true,'category_selection_source','manual','city_code','riyadh',
  'timing_mode','asap','requested_start','2040-01-01T00:00:00Z','requested_end','2040-01-02T00:00:00Z',
  'exact_location',jsonb_build_object('latitude',24.7136,'longitude',46.6753),
  'media','[]'::jsonb,'customer_approved',true
));
reset role;

select ok((select abs(extract(epoch from (r.requested_start-transaction_timestamp())))<1
  from public.service_requests r join timing_fixture f on f.request_id=r.id where f.kind='asap'),
  'ASAP publication evaluates the server publication instant, not a client window');
select is((select requested_end-requested_start from public.service_requests r
  join timing_fixture f on f.request_id=r.id where f.kind='asap'),interval '60 minutes',
  'ASAP stores one bounded default duration');
select ok((select (private.provider_request_eligibility(
    'd2000000-0000-4000-8000-000000000001',r.id,r.requested_start+interval '1 minute',true)->>'windowStart')::timestamptz=r.requested_start
    and (private.provider_request_eligibility(
    'd2000000-0000-4000-8000-000000000001',r.id,r.requested_start+interval '1 minute',true)->>'windowEnd')::timestamptz=r.requested_end
  from public.service_requests r join timing_fixture f on f.request_id=r.id where f.kind='asap'),
  'ASAP eligibility reuses the stored start and end');
select is((select private.provider_request_eligibility(
    'd2000000-0000-4000-8000-000000000001',r.id,r.requested_end,true)->>'reason'
  from public.service_requests r join timing_fixture f on f.request_id=r.id where f.kind='asap'),
  'asap_window_expired','expired ASAP window returns its distinct policy reason');

update public.service_requests set
  requested_start=case
    when (requested_start at time zone 'Asia/Riyadh')::date
      <>(requested_end at time zone 'Asia/Riyadh')::date
      then (date_trunc('day',now() at time zone 'Asia/Riyadh')+interval '2 days 12 hours') at time zone 'Asia/Riyadh'
    else requested_start end,
  requested_end=case
    when (requested_start at time zone 'Asia/Riyadh')::date
      <>(requested_end at time zone 'Asia/Riyadh')::date
      then (date_trunc('day',now() at time zone 'Asia/Riyadh')+interval '2 days 13 hours') at time zone 'Asia/Riyadh'
    else requested_end end
where id=(select request_id from timing_fixture where kind='asap');
select set_config('request.jwt.claim.role','service_role',true);
select public.run_matching(request_id,20) from timing_fixture where kind='asap';
select set_config('request.jwt.claim.role','',true);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000001',true);
update timing_fixture set offer_id=public.submit_offer(jsonb_build_object(
  'requestId',request_id,'idempotencyKey','timing-asap-offer-001','totalAmountMinor',22000,
  'visitFeeMinor',2000,'laborAmountMinor',20000,'materialsIncluded',false,
  'materialsEstimateMinor',null,'estimatedArrivalMinutes',30,'estimatedDurationMinutes',60,
  'warrantyDays',7,'note','ASAP stored-window offer','expiresAt',now()+interval '1 day',
  'expectedRequestVersion',(select version from public.service_requests where id=request_id)
)) where kind='asap';
reset role;
select is((select count(*) from public.offers o join timing_fixture f on f.offer_id=o.id where f.kind='asap' and o.status='active'),
  1::bigint,'offer submission succeeds against the same stored ASAP window');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000001',true);
update timing_fixture set job_id=public.select_offer(offer_id,'timing-asap-selection-001') where kind='asap';
reset role;
select ok((select j.scheduled_start=r.requested_start and j.scheduled_end=r.requested_end
  from timing_fixture f join public.jobs j on j.id=f.job_id join public.service_requests r on r.id=f.request_id
  where f.kind='asap'),'offer selection persists the same stored ASAP window on the job');
select ok((select (e.payload->'eligibility'->>'windowStart')::timestamptz=r.requested_start
    and (e.payload->'eligibility'->>'windowEnd')::timestamptz=r.requested_end
  from timing_fixture f join public.jobs j on j.id=f.job_id join public.service_requests r on r.id=f.request_id
  join public.job_events e on e.job_id=j.id and e.event_type='offer_selected'
  where f.kind='asap'),'selection audit records the same stored ASAP window');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000001',true);
select throws_ok(
  $$select public.publish_service_request(jsonb_build_object(
    'idempotency_key','timing-publication-rollback-001','title','Atomic rollback fixture',
    'original_text','Publication must roll back after media validation failure',
    'structured_description','Publication must roll back after media validation failure',
    'locale','en','urgency','normal','selected_category_slug','air-conditioning',
    'category_confirmed_by_user',true,'category_selection_source','manual','city_code','riyadh',
    'timing_mode','scheduled','requested_start',now()+interval '2 days',
    'requested_end',now()+interval '2 days 1 hour',
    'exact_location',jsonb_build_object('latitude',24.7136,'longitude',46.6753),
    'media',jsonb_build_array(jsonb_build_object(
      'upload_id','fa200000-0000-4000-8000-000000000001'
    )),'customer_approved',true
  ))$$,
  'CLEAN_REQUEST_MEDIA_REQUIRED',
  'a failure after the insert rolls the publication statement back'
);
reset role;
select is((select count(*) from public.service_requests where title='Atomic rollback fixture'),
  0::bigint,'failed publication leaves no partial request or matching state');

select * from finish();
rollback;
