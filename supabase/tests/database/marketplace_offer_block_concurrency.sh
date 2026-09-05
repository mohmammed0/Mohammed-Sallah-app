#!/usr/bin/env bash
set -euo pipefail

database_container="supabase_db_sallah"
customer_id="d1000000-0000-4000-8000-000000000001"
provider_id="d2000000-0000-4000-8000-000000000001"
submit_block_request="f9100000-0000-4000-8000-000000000001"
submit_first_request="f9100000-0000-4000-8000-000000000002"
select_block_request="f9100000-0000-4000-8000-000000000003"
select_first_request="f9100000-0000-4000-8000-000000000004"
select_block_offer="f9200000-0000-4000-8000-000000000003"
select_first_offer="f9200000-0000-4000-8000-000000000004"
run_id="$(date +%s%N)"
block_submit_first_key="offer-race-block-submit-first-${run_id}"
block_after_submit_key="offer-race-block-after-submit-${run_id}"
block_select_first_key="offer-race-block-select-first-${run_id}"
block_after_select_key="offer-race-block-after-select-${run_id}"
submit_after_block_key="offer-race-submit-after-block-${run_id}"
submit_before_block_key="offer-race-submit-before-block-${run_id}"
select_after_block_key="offer-race-select-after-block-${run_id}"
select_before_block_key="offer-race-select-before-block-${run_id}"
hold_output="$(mktemp)"
command_output="$(mktemp)"
other_output="$(mktemp)"
hold_pid=""

psql_in_container() {
  docker exec -i "${database_container}" psql -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"
}

cleanup() {
  if [[ -n "${hold_pid}" ]] && kill -0 "${hold_pid}" 2>/dev/null; then
    wait "${hold_pid}" || true
  fi
  psql_in_container >/dev/null 2>&1 <<SQL || true
delete from public.blocked_users
where (blocker_id='${customer_id}' and blocked_id='${provider_id}')
   or (blocker_id='${provider_id}' and blocked_id='${customer_id}');
delete from public.conversation_members
where conversation_id in (
  select conversation.id from public.conversations conversation
  join public.jobs job on job.id=conversation.job_id
  where job.request_id in (
    '${submit_block_request}','${submit_first_request}',
    '${select_block_request}','${select_first_request}'
  )
);
delete from public.conversations
where job_id in (
  select id from public.jobs where request_id in (
    '${submit_block_request}','${submit_first_request}',
    '${select_block_request}','${select_first_request}'
  )
);
delete from public.payments
where job_id in (
  select id from public.jobs where request_id in (
    '${submit_block_request}','${submit_first_request}',
    '${select_block_request}','${select_first_request}'
  )
);
delete from public.job_status_history
where job_id in (
  select id from public.jobs where request_id in (
    '${submit_block_request}','${submit_first_request}',
    '${select_block_request}','${select_first_request}'
  )
);
delete from public.job_events
where job_id in (
  select id from public.jobs where request_id in (
    '${submit_block_request}','${submit_first_request}',
    '${select_block_request}','${select_first_request}'
  )
);
delete from public.jobs where request_id in (
  '${submit_block_request}','${submit_first_request}',
  '${select_block_request}','${select_first_request}'
);
delete from public.offers where request_id in (
  '${submit_block_request}','${submit_first_request}',
  '${select_block_request}','${select_first_request}'
);
delete from public.request_provider_matches where request_id in (
  '${submit_block_request}','${submit_first_request}',
  '${select_block_request}','${select_first_request}'
);
delete from public.matching_runs where request_id in (
  '${submit_block_request}','${submit_first_request}',
  '${select_block_request}','${select_first_request}'
);
delete from public.notification_outbox
where payload->>'requestId' in (
  '${submit_block_request}','${submit_first_request}',
  '${select_block_request}','${select_first_request}'
);
delete from public.service_requests where id in (
  '${submit_block_request}','${submit_first_request}',
  '${select_block_request}','${select_first_request}'
);
delete from public.idempotency_keys where key in (
  '${block_submit_first_key}','${block_after_submit_key}',
  '${block_select_first_key}','${block_after_select_key}',
  '${submit_after_block_key}','${submit_before_block_key}',
  '${select_after_block_key}','${select_before_block_key}'
);
delete from public.rate_limit_buckets
where operation='user_block_state'
  and key_hash=encode(
    extensions.digest('marketplace:user_block_state:${customer_id}','sha256'),'hex'
  );
update public.provider_profiles set active_workload=2
where user_id='${provider_id}';
SQL
  rm -f "${hold_output}" "${command_output}" "${other_output}"
}
trap cleanup EXIT

if ! docker inspect "${database_container}" >/dev/null 2>&1; then
  echo "FAIL: local Supabase database container ${database_container} is unavailable" >&2
  exit 1
fi

cleanup
trap cleanup EXIT

psql_in_container >/dev/null <<SQL
update public.profiles set status='active'
where id in ('${customer_id}','${provider_id}');
update public.user_roles set revoked_at=null
where user_id='${provider_id}' and role='provider';
update public.provider_profiles
set verification_status='verified',accepting_requests=true,active_workload=2
where user_id='${provider_id}';
update public.provider_job_eligibility_reviews
set status='resolved',resolved_at=now()
where provider_id='${provider_id}' and status='open';

insert into public.service_requests(
  id,customer_id,category_id,city_id,title,structured_description,original_text,
  original_locale,urgency,timing_mode,approximate_location,exact_address_id,
  status,published_at,customer_approved_at
)
select fixture.id,'${customer_id}',category.id,city.id,fixture.title,
  'Deterministic offer/block concurrency fixture',
  'Deterministic offer/block concurrency fixture','en','normal','flexible',
  extensions.st_setsrid(
    extensions.st_makepoint(46.6753,24.7136),4326
  )::extensions.geography,
  'da000000-0000-4000-8000-000000000001','receiving_offers',now(),now()
from (values
  ('${submit_block_request}'::uuid,'Block before submit'),
  ('${submit_first_request}'::uuid,'Submit before block'),
  ('${select_block_request}'::uuid,'Block before select'),
  ('${select_first_request}'::uuid,'Select before block')
) fixture(id,title)
cross join lateral(
  select id from public.service_categories where slug='air-conditioning'
) category
cross join lateral(select id from public.cities where code='riyadh') city;

insert into public.matching_runs(
  id,request_id,configuration_version,weights,status,completed_at
)
select gen_random_uuid(),id,'offer-block-race','{}','completed',now()
from public.service_requests
where id in (
  '${submit_block_request}','${submit_first_request}',
  '${select_block_request}','${select_first_request}'
);
insert into public.request_provider_matches(
  request_id,provider_id,matching_run_id,score,status,expires_at
)
select run.request_id,'${provider_id}',run.id,0.9,
  case when run.request_id in (
    '${submit_block_request}','${submit_first_request}'
  ) then 'invited' else 'offered' end,
  now()+interval '1 day'
from public.matching_runs run
where run.request_id in (
  '${submit_block_request}','${submit_first_request}',
  '${select_block_request}','${select_first_request}'
);
insert into public.offers(
  id,request_id,provider_id,total_amount_minor,visit_fee_minor,
  labor_amount_minor,materials_included,materials_estimate_minor,
  estimated_arrival_minutes,estimated_duration_minutes,warranty_days,
  provider_note,expires_at,idempotency_key,status
) values
  ('${select_block_offer}','${select_block_request}','${provider_id}',
   12000,1000,11000,false,0,30,90,7,'Block before select',
   now()+interval '1 day','offer-race-select-block-fixture','active'),
  ('${select_first_offer}','${select_first_request}','${provider_id}',
   13000,1000,12000,false,0,30,90,7,'Select before block',
   now()+interval '1 day','offer-race-select-first-fixture','active');
SQL

start_block_hold() {
  local application_name="$1"
  local block_key="$2"
  : >"${hold_output}"
  docker exec -i -e PGAPPNAME="${application_name}" "${database_container}" \
    psql -v ON_ERROR_STOP=1 -U postgres -d postgres >"${hold_output}" 2>&1 <<SQL &
begin;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','${customer_id}',true);
select public.set_user_block(
  '${provider_id}',true,'Deterministic offer command race','${block_key}'
);
select pg_sleep(3);
commit;
SQL
  hold_pid=$!
}

wait_for_hold() {
  local application_name="$1"
  local ready="false"
  for _ in $(seq 1 50); do
    if [[ "$(psql_in_container -Atc "select count(*) from pg_stat_activity where application_name='${application_name}' and wait_event='PgSleep'")" == "1" ]]; then
      ready="true"
      break
    fi
    sleep 0.1
  done
  if [[ "${ready}" != "true" ]]; then
    cat "${hold_output}" >&2
    echo "FAIL: ${application_name} did not reach its deterministic transaction hold" >&2
    exit 1
  fi
}

clear_block() {
  psql_in_container >/dev/null <<SQL
delete from public.blocked_users
where (blocker_id='${customer_id}' and blocked_id='${provider_id}')
   or (blocker_id='${provider_id}' and blocked_id='${customer_id}');
SQL
}

start_block_hold "sallah_block_before_submit" "${block_submit_first_key}"
wait_for_hold "sallah_block_before_submit"
submit_started_ms="$(date +%s%3N)"
set +e
docker exec -i -e PGAPPNAME=sallah_submit_after_block "${database_container}" \
  psql -v ON_ERROR_STOP=1 -U postgres -d postgres >"${command_output}" 2>&1 <<SQL
begin;
set local statement_timeout='10s';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','${provider_id}',true);
select public.submit_offer(jsonb_build_object(
  'requestId','${submit_block_request}',
  'expectedRequestVersion',(select version from public.service_requests where id='${submit_block_request}'),
  'idempotencyKey','${submit_after_block_key}',
  'totalAmountMinor',12000,'visitFeeMinor',1000,'laborAmountMinor',11000,
  'materialsIncluded',false,'materialsEstimateMinor',0,
  'estimatedArrivalMinutes',30,'estimatedDurationMinutes',90,'warrantyDays',7,
  'note','Must observe prior block','expiresAt',now()+interval '1 day'
));
commit;
SQL
submit_status=$?
set -e
submit_elapsed_ms=$(( $(date +%s%3N) - submit_started_ms ))
wait "${hold_pid}"
hold_pid=""
if [[ ${submit_status} -eq 0 ]] || ! rg -q 'PROVIDER_NOT_ELIGIBLE:customer_provider_blocked' "${command_output}" || (( submit_elapsed_ms < 1500 )); then
  cat "${command_output}" >&2
  echo "FAIL: block-before-submit did not serialize and deny after ${submit_elapsed_ms}ms" >&2
  exit 1
fi
clear_block

: >"${command_output}"
docker exec -i -e PGAPPNAME=sallah_submit_before_block "${database_container}" \
  psql -v ON_ERROR_STOP=1 -U postgres -d postgres >"${command_output}" 2>&1 <<SQL &
begin;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','${provider_id}',true);
select public.submit_offer(jsonb_build_object(
  'requestId','${submit_first_request}',
  'expectedRequestVersion',(select version from public.service_requests where id='${submit_first_request}'),
  'idempotencyKey','${submit_before_block_key}',
  'totalAmountMinor',12500,'visitFeeMinor',1000,'laborAmountMinor',11500,
  'materialsIncluded',false,'materialsEstimateMinor',0,
  'estimatedArrivalMinutes',30,'estimatedDurationMinutes',90,'warrantyDays',7,
  'note','Command owns pair lock first','expiresAt',now()+interval '1 day'
));
select pg_sleep(3);
commit;
SQL
hold_pid=$!
wait_for_hold "sallah_submit_before_block"
block_started_ms="$(date +%s%3N)"
docker exec -i -e PGAPPNAME=sallah_block_after_submit "${database_container}" \
  psql -v ON_ERROR_STOP=1 -U postgres -d postgres >"${other_output}" 2>&1 <<SQL
begin;
set local statement_timeout='10s';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','${customer_id}',true);
select public.set_user_block(
  '${provider_id}',true,'Block after serialized offer','${block_after_submit_key}'
);
commit;
SQL
submit_block_elapsed_ms=$(( $(date +%s%3N) - block_started_ms ))
wait "${hold_pid}"
hold_pid=""
if (( submit_block_elapsed_ms < 1500 )); then
  cat "${other_output}" >&2
  echo "FAIL: submit-before-block did not hold the pair lock (${submit_block_elapsed_ms}ms)" >&2
  exit 1
fi
set +e
docker exec -i "${database_container}" psql -v ON_ERROR_STOP=1 -U postgres -d postgres >"${other_output}" 2>&1 <<SQL
begin;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','${provider_id}',true);
select public.submit_offer(jsonb_build_object(
  'requestId','${submit_first_request}',
  'expectedRequestVersion',(select version from public.service_requests where id='${submit_first_request}'),
  'idempotencyKey','${submit_before_block_key}',
  'totalAmountMinor',12500,'visitFeeMinor',1000,'laborAmountMinor',11500,
  'materialsIncluded',false,'materialsEstimateMinor',0,
  'estimatedArrivalMinutes',30,'estimatedDurationMinutes',90,'warrantyDays',7,
  'note','Command owns pair lock first','expiresAt',now()+interval '1 day'
));
commit;
SQL
replay_status=$?
set -e
if [[ ${replay_status} -eq 0 ]] || ! rg -q 'PROVIDER_NOT_ELIGIBLE:customer_provider_blocked' "${other_output}"; then
  cat "${other_output}" >&2
  echo 'FAIL: a post-block exact submit replay did not fail closed' >&2
  exit 1
fi
clear_block

start_block_hold "sallah_block_before_select" "${block_select_first_key}"
wait_for_hold "sallah_block_before_select"
select_started_ms="$(date +%s%3N)"
set +e
docker exec -i -e PGAPPNAME=sallah_select_after_block "${database_container}" \
  psql -v ON_ERROR_STOP=1 -U postgres -d postgres >"${command_output}" 2>&1 <<SQL
begin;
set local statement_timeout='10s';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','${customer_id}',true);
select public.select_offer('${select_block_offer}','${select_after_block_key}');
commit;
SQL
select_status=$?
set -e
select_elapsed_ms=$(( $(date +%s%3N) - select_started_ms ))
wait "${hold_pid}"
hold_pid=""
if [[ ${select_status} -eq 0 ]] || ! rg -q 'OFFER_PROVIDER_INELIGIBLE:customer_provider_blocked' "${command_output}" || (( select_elapsed_ms < 1500 )); then
  cat "${command_output}" >&2
  echo "FAIL: block-before-select did not serialize and deny after ${select_elapsed_ms}ms" >&2
  exit 1
fi
clear_block

: >"${command_output}"
docker exec -i -e PGAPPNAME=sallah_select_before_block "${database_container}" \
  psql -v ON_ERROR_STOP=1 -U postgres -d postgres >"${command_output}" 2>&1 <<SQL &
begin;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','${customer_id}',true);
select public.select_offer('${select_first_offer}','${select_before_block_key}');
select pg_sleep(3);
commit;
SQL
hold_pid=$!
wait_for_hold "sallah_select_before_block"
block_started_ms="$(date +%s%3N)"
docker exec -i -e PGAPPNAME=sallah_block_after_select "${database_container}" \
  psql -v ON_ERROR_STOP=1 -U postgres -d postgres >"${other_output}" 2>&1 <<SQL
begin;
set local statement_timeout='10s';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','${customer_id}',true);
select public.set_user_block(
  '${provider_id}',true,'Block after serialized selection','${block_after_select_key}'
);
commit;
SQL
select_block_elapsed_ms=$(( $(date +%s%3N) - block_started_ms ))
wait "${hold_pid}"
hold_pid=""
if (( select_block_elapsed_ms < 1500 )); then
  cat "${other_output}" >&2
  echo "FAIL: select-before-block did not hold the pair lock (${select_block_elapsed_ms}ms)" >&2
  exit 1
fi
set +e
docker exec -i "${database_container}" psql -v ON_ERROR_STOP=1 -U postgres -d postgres >"${other_output}" 2>&1 <<SQL
begin;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','${customer_id}',true);
select public.select_offer('${select_first_offer}','${select_before_block_key}');
commit;
SQL
replay_status=$?
set -e
if [[ ${replay_status} -eq 0 ]] || ! rg -q 'OFFER_PROVIDER_INELIGIBLE:customer_provider_blocked' "${other_output}"; then
  cat "${other_output}" >&2
  echo 'FAIL: a post-block exact select replay did not fail closed' >&2
  exit 1
fi

echo "PASS: block-before-submit serialized for ${submit_elapsed_ms}ms and denied mutation"
echo "PASS: submit-before-block held the pair lock for ${submit_block_elapsed_ms}ms and post-block replay denied"
echo "PASS: block-before-select serialized for ${select_elapsed_ms}ms and denied job/conversation creation"
echo "PASS: select-before-block held the pair lock for ${select_block_elapsed_ms}ms and post-block replay denied"
