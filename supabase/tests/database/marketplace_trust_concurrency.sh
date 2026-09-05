#!/usr/bin/env bash
set -euo pipefail

database_container="supabase_db_sallah"
customer_id="d1000000-0000-4000-8000-000000000001"
provider_id="d2000000-0000-4000-8000-000000000001"
conversation_id="e0000000-0000-4000-8000-000000000001"
run_id="$(date +%s%N)"
block_key="race-block-${run_id}"
send_key="race-send-${run_id}"
send_first_key="race-send-first-${run_id}"
block_second_key="race-block-second-${run_id}"
post_block_send_key="race-post-block-send-${run_id}"
timezone_key_one="timezone-one-${run_id}"
timezone_key_two="timezone-two-${run_id}"
blocker_output="$(mktemp)"
sender_output="$(mktemp)"
send_first_output="$(mktemp)"
block_second_output="$(mktemp)"
post_block_send_output="$(mktemp)"
blocker_pid=""
sender_first_pid=""

psql_in_container() {
  docker exec -i "${database_container}" psql -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"
}

cleanup() {
  if [[ -n "${blocker_pid}" ]] && kill -0 "${blocker_pid}" 2>/dev/null; then
    wait "${blocker_pid}" || true
  fi
  if [[ -n "${sender_first_pid}" ]] && kill -0 "${sender_first_pid}" 2>/dev/null; then
    wait "${sender_first_pid}" || true
  fi
  psql_in_container >/dev/null 2>&1 <<SQL || true
delete from public.message_attachments
where message_id in (
  select id from public.messages
  where client_message_id in ('${send_key}','${send_first_key}','${post_block_send_key}')
);
delete from public.messages
where client_message_id in ('${send_key}','${send_first_key}','${post_block_send_key}');
delete from public.idempotency_keys
where key in (
  '${block_key}','${send_key}','${send_first_key}','${block_second_key}',
  '${post_block_send_key}','${timezone_key_one}','${timezone_key_two}'
);
delete from public.blocked_users
where (blocker_id='${customer_id}' and blocked_id='${provider_id}')
   or (blocker_id='${provider_id}' and blocked_id='${customer_id}');
delete from public.rate_limit_buckets
where operation in ('user_block_state','message_send')
  and key_hash in (
    encode(extensions.digest('marketplace:user_block_state:${customer_id}','sha256'),'hex'),
    encode(extensions.digest('marketplace:message_send:${provider_id}','sha256'),'hex')
  );
SQL
  rm -f \
    "${blocker_output}" "${sender_output}" "${send_first_output}" \
    "${block_second_output}" "${post_block_send_output}"
}
trap cleanup EXIT

if ! docker inspect "${database_container}" >/dev/null 2>&1; then
  echo "FAIL: local Supabase database container ${database_container} is unavailable" >&2
  exit 1
fi

psql_in_container >/dev/null <<SQL
delete from public.blocked_users
where (blocker_id='${customer_id}' and blocked_id='${provider_id}')
   or (blocker_id='${provider_id}' and blocked_id='${customer_id}');
delete from public.rate_limit_buckets
where operation in ('user_block_state','message_send')
  and key_hash in (
    encode(extensions.digest('marketplace:user_block_state:${customer_id}','sha256'),'hex'),
    encode(extensions.digest('marketplace:message_send:${provider_id}','sha256'),'hex')
  );
SQL

docker exec -i -e PGAPPNAME=sallah_pair_sender_first "${database_container}" \
  psql -v ON_ERROR_STOP=1 -U postgres -d postgres >"${send_first_output}" 2>&1 <<SQL &
begin;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','${provider_id}',true);
select public.send_message_with_attachments(
  '${conversation_id}','Serialized before the block','{}','${send_first_key}'
);
select pg_sleep(3);
commit;
SQL
sender_first_pid=$!

sender_first_ready=false
for _ in $(seq 1 50); do
  if [[ "$(psql_in_container -Atc "select count(*) from pg_stat_activity where application_name='sallah_pair_sender_first' and wait_event='PgSleep'")" == "1" ]]; then
    sender_first_ready=true
    break
  fi
  sleep 0.1
done
if [[ "${sender_first_ready}" != "true" ]]; then
  cat "${send_first_output}" >&2
  echo 'FAIL: send-first session did not reach its deterministic transaction hold' >&2
  exit 1
fi

block_second_started_ms="$(date +%s%3N)"
set +e
docker exec -i -e PGAPPNAME=sallah_pair_block_second "${database_container}" \
  psql -v ON_ERROR_STOP=1 -U postgres -d postgres >"${block_second_output}" 2>&1 <<SQL
begin;
set local statement_timeout='10s';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','${customer_id}',true);
select public.set_user_block(
  '${provider_id}',true,'Send-first concurrency regression','${block_second_key}'
);
commit;
SQL
block_second_status=$?
set -e
block_second_elapsed_ms=$(( $(date +%s%3N) - block_second_started_ms ))
wait "${sender_first_pid}"
sender_first_pid=""

if [[ ${block_second_status} -ne 0 ]]; then
  cat "${block_second_output}" >&2
  echo 'FAIL: block-second command did not complete after the earlier send committed' >&2
  exit 1
fi
if (( block_second_elapsed_ms < 1500 )); then
  cat "${block_second_output}" >&2
  echo "FAIL: block-second command completed after ${block_second_elapsed_ms}ms without waiting for the send transaction" >&2
  exit 1
fi

send_first_state="$(psql_in_container -Atc "
select
  (select count(*) from public.messages where client_message_id='${send_first_key}')::text
  ||':'||
  (select count(*) from public.blocked_users
    where blocker_id='${customer_id}' and blocked_id='${provider_id}')::text
")"
if [[ "${send_first_state}" != "1:1" ]]; then
  echo "FAIL: send-first serialization produced unexpected final state (${send_first_state})" >&2
  exit 1
fi

set +e
docker exec -i -e PGAPPNAME=sallah_pair_post_block_sender "${database_container}" \
  psql -v ON_ERROR_STOP=1 -U postgres -d postgres >"${post_block_send_output}" 2>&1 <<SQL
begin;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','${provider_id}',true);
select public.send_message_with_attachments(
  '${conversation_id}','Must be denied after block','{}','${post_block_send_key}'
);
commit;
SQL
post_block_send_status=$?
set -e
if [[ ${post_block_send_status} -eq 0 ]]; then
  cat "${post_block_send_output}" >&2
  echo 'FAIL: a new message succeeded after the block committed' >&2
  exit 1
fi
if ! rg -q 'COMMUNICATION_NOT_ALLOWED' "${post_block_send_output}"; then
  cat "${post_block_send_output}" >&2
  echo 'FAIL: post-block message did not fail with COMMUNICATION_NOT_ALLOWED' >&2
  exit 1
fi
post_block_state="$(psql_in_container -Atc "
select
  (select count(*) from public.messages where client_message_id='${post_block_send_key}')::text
  ||':'||
  (select count(*) from public.idempotency_keys where key='${post_block_send_key}')::text
")"
if [[ "${post_block_state}" != "0:0" ]]; then
  echo "FAIL: denied post-block send mutated message/idempotency state (${post_block_state})" >&2
  exit 1
fi

psql_in_container >/dev/null <<SQL
delete from public.message_attachments
where message_id in (
  select id from public.messages where client_message_id='${send_first_key}'
);
delete from public.messages where client_message_id='${send_first_key}';
delete from public.idempotency_keys
where key in ('${send_first_key}','${block_second_key}','${post_block_send_key}');
delete from public.blocked_users
where (blocker_id='${customer_id}' and blocked_id='${provider_id}')
   or (blocker_id='${provider_id}' and blocked_id='${customer_id}');
delete from public.rate_limit_buckets
where operation in ('user_block_state','message_send')
  and key_hash in (
    encode(extensions.digest('marketplace:user_block_state:${customer_id}','sha256'),'hex'),
    encode(extensions.digest('marketplace:message_send:${provider_id}','sha256'),'hex')
  );
SQL

docker exec -i -e PGAPPNAME=sallah_pair_blocker "${database_container}" \
  psql -v ON_ERROR_STOP=1 -U postgres -d postgres >"${blocker_output}" 2>&1 <<SQL &
begin;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','${customer_id}',true);
select public.set_user_block(
  '${provider_id}',true,'Deterministic concurrency regression','${block_key}'
);
select pg_sleep(3);
commit;
SQL
blocker_pid=$!

blocker_ready=false
for _ in $(seq 1 50); do
  if [[ "$(psql_in_container -Atc "select count(*) from pg_stat_activity where application_name='sallah_pair_blocker' and wait_event='PgSleep'")" == "1" ]]; then
    blocker_ready=true
    break
  fi
  sleep 0.1
done
if [[ "${blocker_ready}" != "true" ]]; then
  cat "${blocker_output}" >&2
  echo 'FAIL: blocker session did not reach its deterministic transaction hold' >&2
  exit 1
fi

send_started_ms="$(date +%s%3N)"
set +e
docker exec -i -e PGAPPNAME=sallah_pair_sender "${database_container}" \
  psql -v ON_ERROR_STOP=1 -U postgres -d postgres >"${sender_output}" 2>&1 <<SQL
begin;
set local statement_timeout='10s';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','${provider_id}',true);
select public.send_message_with_attachments(
  '${conversation_id}','Must observe committed block','{}','${send_key}'
);
commit;
SQL
send_status=$?
set -e
send_elapsed_ms=$(( $(date +%s%3N) - send_started_ms ))
wait "${blocker_pid}"
blocker_pid=""

if [[ ${send_status} -eq 0 ]]; then
  cat "${sender_output}" >&2
  echo 'FAIL: concurrent send completed without observing the committed block' >&2
  exit 1
fi
if ! rg -q 'COMMUNICATION_NOT_ALLOWED' "${sender_output}"; then
  cat "${sender_output}" >&2
  echo 'FAIL: concurrent send did not fail with COMMUNICATION_NOT_ALLOWED' >&2
  exit 1
fi
if (( send_elapsed_ms < 1500 )); then
  cat "${sender_output}" >&2
  echo "FAIL: concurrent send failed after ${send_elapsed_ms}ms without waiting for the pair transaction" >&2
  exit 1
fi

psql_in_container >/dev/null <<SQL
delete from public.blocked_users
where (blocker_id='${customer_id}' and blocked_id='${provider_id}')
   or (blocker_id='${provider_id}' and blocked_id='${customer_id}');
delete from public.rate_limit_buckets
where operation='user_block_state'
  and key_hash=encode(
    extensions.digest('marketplace:user_block_state:${customer_id}','sha256'),'hex'
  );
SQL

for timezone_case in "Asia/Kathmandu:${timezone_key_one}" "UTC:${timezone_key_two}"; do
  session_timezone="${timezone_case%%:*}"
  idempotency_key="${timezone_case#*:}"
  psql_in_container >/dev/null <<SQL
begin;
set local timezone='${session_timezone}';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','${customer_id}',true);
select public.set_user_block(
  '${provider_id}',false,'Timezone bucket regression','${idempotency_key}'
);
commit;
SQL
done

timezone_bucket_result="$(psql_in_container -Atc "
select count(*)::text||':'||coalesce(sum(count),0)::text||':'||
       bool_and(window_start=date_trunc('hour',window_start,'UTC'))::text
from public.rate_limit_buckets
where operation='user_block_state'
  and key_hash=encode(
    extensions.digest('marketplace:user_block_state:${customer_id}','sha256'),'hex'
  )")"
if [[ "${timezone_bucket_result}" != "1:2:true" ]]; then
  echo "FAIL: session timezones produced divergent absolute buckets (${timezone_bucket_result})" >&2
  exit 1
fi

echo "PASS: concurrent send waited ${send_elapsed_ms}ms and observed the committed block"
echo "PASS: block-second waited ${block_second_elapsed_ms}ms for the earlier send, then denied subsequent communication"
echo 'PASS: Asia/Kathmandu and UTC sessions mapped to one explicit UTC rate bucket'
