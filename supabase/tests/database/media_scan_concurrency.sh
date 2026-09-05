#!/usr/bin/env bash
set -euo pipefail

db_container="${SUPABASE_DB_CONTAINER:-supabase_db_sallah}"
tmp_dir="$(mktemp -d)"
owner_id=""
upload_id=""
signature_upload_id=""

sql() {
  docker exec -i "$db_container" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"
}

cleanup() {
  for fixture_upload_id in "$upload_id" "$signature_upload_id"; do
    if [[ -z "$fixture_upload_id" ]]; then
      continue
    fi
    sql <<SQL >/dev/null 2>&1 || true
set session_replication_role=replica;
delete from private.media_scan_events where job_id in (select id from private.media_scan_jobs where upload_id='$fixture_upload_id');
delete from private.media_scan_attestations where job_id in (select id from private.media_scan_jobs where upload_id='$fixture_upload_id');
delete from private.media_scan_artifacts where job_id in (select id from private.media_scan_jobs where upload_id='$fixture_upload_id');
update private.media_scan_jobs set current_attempt_id=null where upload_id='$fixture_upload_id';
delete from private.media_scan_attempts where job_id in (select id from private.media_scan_jobs where upload_id='$fixture_upload_id');
delete from private.media_scan_jobs where upload_id='$fixture_upload_id';
set session_replication_role=origin;
delete from public.upload_security_events where upload_id='$fixture_upload_id';
delete from public.scheduled_jobs where payload->>'uploadId'='$fixture_upload_id';
delete from public.file_uploads where id='$fixture_upload_id';
SQL
  done
  if [[ -n "$owner_id" ]]; then
    sql <<SQL >/dev/null 2>&1 || true
delete from public.user_roles where user_id='$owner_id';
delete from public.profiles where id='$owner_id';
delete from auth.users where id='$owner_id';
SQL
  fi
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

uuid() { sql -c "select gen_random_uuid()"; }
hash_token() { sql -c "select encode(extensions.digest('$1','sha256'),'hex')"; }

owner_id="$(uuid)"
sql <<SQL >/dev/null
insert into auth.users(
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values(
  '$owner_id','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
  '$owner_id@test.invalid',crypt(gen_random_uuid()::text,gen_salt('bf')),now(),'{}','{}',now(),now()
);
SQL

upload_id="$(sql <<SQL
set role authenticated;
set "request.jwt.claim.sub"='$owner_id';
select public.create_unbound_file_upload('request_media','concurrent.png','image/png',4096)->>'uploadId';
SQL
)"
sql -c "insert into storage.objects(bucket_id,name,owner_id,metadata)
select quarantine_bucket,quarantine_path,user_id::text,
  jsonb_build_object('mimetype',declared_mime_type,'size',size_bytes)
from public.file_uploads where id='$upload_id'" >/dev/null
sql <<SQL >/dev/null
set role authenticated;
set "request.jwt.claim.sub"='$owner_id';
select public.start_or_get_media_scan('$upload_id','$(uuid)');
SQL

# A scanner claim and an owner active replay use the same job-then-upload lock
# order. The scanner holds the job briefly so an inverted owner order would
# deterministically deadlock when the scanner continues to the upload row.
token_a="$(uuid)"; op_a="$(uuid)"; hash_a="$(hash_token "$token_a")"
set +e
(
  sql <<SQL >"$tmp_dir/claim-a" 2>"$tmp_dir/claim-a.err"
begin;
select 1 from private.media_scan_jobs where upload_id='$upload_id' for update;
select pg_sleep(1);
set local role service_role;
select public.claim_media_scan_job('worker-a','$op_a','$hash_a',clock_timestamp(),86400);
commit;
SQL
) & pid_a=$!
sleep 0.2
(
  sql <<SQL >"$tmp_dir/owner-replay" 2>"$tmp_dir/owner-replay.err"
set lock_timeout='5s';
set role authenticated;
set "request.jwt.claim.sub"='$owner_id';
select public.start_or_get_media_scan('$upload_id','$(uuid)');
SQL
) & pid_b=$!
wait "$pid_a"; status_a=$?
wait "$pid_b"; status_b=$?
set -e
[[ "$status_a" == "0" && "$status_b" == "0" ]] || {
  echo "owner replay versus scanner claim failed (scanner=$status_a owner=$status_b)" >&2
  sed -n '1,80p' "$tmp_dir/claim-a.err" "$tmp_dir/owner-replay.err" >&2
  exit 1
}

grep -q 'attemptId' "$tmp_dir/claim-a"
attempt_1="$(sql -c "select current_attempt_id from private.media_scan_jobs where upload_id='$upload_id'")"
token_1="$token_a"
attempt_count="$(sql -c "select count(*) from private.media_scan_attempts where job_id=(select id from private.media_scan_jobs where upload_id='$upload_id')")"
[[ "$attempt_count" == "1" ]] || { echo "owner replay versus claim created $attempt_count attempts" >&2; exit 1; }

# Expire the first immutable lease and race reclaim. The new attempt is distinct.
sql <<SQL >/dev/null
with t as (select clock_timestamp() at_time)
update private.media_scan_attempts
set claimed_at=t.at_time-interval '121 seconds',processing_deadline=t.at_time-interval '1 second'
from t where id='$attempt_1';
SQL
token_c="$(uuid)"; token_d="$(uuid)"
op_c="$(uuid)"; op_d="$(uuid)"
hash_c="$(hash_token "$token_c")"; hash_d="$(hash_token "$token_d")"
(
  sql <<SQL >"$tmp_dir/reclaim-c" 2>"$tmp_dir/reclaim-c.err"
set role service_role;
select public.claim_media_scan_job('worker-c','$op_c','$hash_c',clock_timestamp(),86400);
SQL
) & pid_c=$!
(
  sql <<SQL >"$tmp_dir/reclaim-d" 2>"$tmp_dir/reclaim-d.err"
set role service_role;
select public.claim_media_scan_job('worker-d','$op_d','$hash_d',clock_timestamp(),86400);
SQL
) & pid_d=$!
wait "$pid_c"; wait "$pid_d"
reclaim_winners="$(grep -h -c 'attemptId' "$tmp_dir/reclaim-c" "$tmp_dir/reclaim-d" | awk '{s+=$1} END{print s+0}')"
[[ "$reclaim_winners" == "1" ]] || { echo "expected one reclaim winner, got $reclaim_winners" >&2; exit 1; }
attempt_2="$(sql -c "select current_attempt_id from private.media_scan_jobs where upload_id='$upload_id'")"
[[ "$attempt_2" != "$attempt_1" ]] || { echo "reclaim reused stale attempt" >&2; exit 1; }
stored_hash="$(sql -c "select attempt_token_hash from private.media_scan_attempts where id='$attempt_2'")"
if [[ "$stored_hash" == "$hash_c" ]]; then token_2="$token_c"; else token_2="$token_d"; fi
sql -c "update private.media_scan_artifacts set created_at='2000-01-01 00:00:00+00' where attempt_id='$attempt_1' and state='cleanup_pending'" >/dev/null

# The old output can be cleaned while the current attempt remains untouched.
cleanup_token="$(uuid)"; cleanup_hash="$(hash_token "$cleanup_token")"
cleanup_receipt="$(sql <<SQL
set role service_role;
select public.claim_media_scan_artifact_cleanup('cleanup-concurrency','$(uuid)','$cleanup_hash');
SQL
)"
cleanup_attempt="$(sql -c "select attempt_id from private.media_scan_artifacts where id=('$cleanup_receipt'::jsonb->>'artifactId')::uuid")"
[[ "$cleanup_attempt" == "$attempt_1" ]] || { echo "cleanup raced into active attempt" >&2; exit 1; }
sql <<SQL >/dev/null
set role service_role;
select public.complete_media_scan_artifact_cleanup(
  ('$cleanup_receipt'::jsonb->>'artifactId')::uuid,'$cleanup_token','cleanup-concurrency','$(uuid)'
);
SQL

# A stale worker cannot prepare the replacement attempt's output.
if sql <<SQL >"$tmp_dir/stale" 2>&1
set role service_role;
select public.prepare_media_scan_output(
  '$attempt_1','$token_1','$(uuid)',repeat('1',64),'image/png','image/png',4096,1024,
  repeat('2',64),repeat('3',64),'decode-reencode-png-v1','1.0.0'
);
SQL
then
  echo "stale attempt prepared output" >&2
  exit 1
fi
grep -q 'SCAN_ATTEMPT_STALE' "$tmp_dir/stale"

# Two independent preparation operations race. Exactly one may authorize the
# attempt-specific output path; the loser observes the advanced attempt state.
prepare_fingerprint="$(printf '1%.0s' {1..64})"
manifest_fingerprint="$(printf '4%.0s' {1..64})"
input_path="$(sql -c "select path from private.media_scan_artifacts where attempt_id='$attempt_2' and kind='scan_input'")"
output_path="$(sql -c "select path from private.media_scan_artifacts where attempt_id='$attempt_2' and kind='scan_output'")"
job_deadline="$(sql -c "select processing_deadline from private.media_scan_attempts where id='$attempt_2'")"
prepare_op_a="$(uuid)"; prepare_op_b="$(uuid)"
set +e
(
  sql <<SQL >"$tmp_dir/prepare-a" 2>&1
set role service_role;
select public.prepare_media_scan_output(
  '$attempt_2','$token_2','$prepare_op_a','$prepare_fingerprint','image/png','image/png',4096,1024,
  repeat('2',64),repeat('3',64),'decode-reencode-png-v1','1.0.0'
);
SQL
) & pid_a=$!
(
  sql <<SQL >"$tmp_dir/prepare-b" 2>&1
set role service_role;
select public.prepare_media_scan_output(
  '$attempt_2','$token_2','$prepare_op_b','$prepare_fingerprint','image/png','image/png',4096,1024,
  repeat('2',64),repeat('3',64),'decode-reencode-png-v1','1.0.0'
);
SQL
) & pid_b=$!
wait "$pid_a"; status_a=$?
wait "$pid_b"; status_b=$?
set -e
if [[ "$status_a" == "$status_b" ]]; then
  echo "output preparation race did not produce one winner" >&2
  exit 1
fi
prepare_events="$(sql -c "select count(*) from private.media_scan_events where attempt_id='$attempt_2' and action='prepare_output'")"
[[ "$prepare_events" == "1" ]] || { echo "preparation race wrote $prepare_events events" >&2; exit 1; }

# Read back and attest the current attempt after the preparation winner.
sql <<SQL >/dev/null
set role service_role;
select public.authorize_media_scan_readback('$attempt_2','$token_2','$(uuid)',1024,repeat('3',64));
select public.record_media_scan_attestation(
  '$attempt_2','$token_2','$(uuid)','$manifest_fingerprint',
  jsonb_build_object(
    'schemaVersion','sallah-media-attestation-v1','attemptId','$attempt_2',
    'inputRef','$input_path','outputRef','$output_path',
    'purpose','request_media','detectedInputMime','image/png','detectedOutputMime','image/png',
    'inputSize',4096,'outputSize',1024,
    'inputSha256',repeat('2',64),'outputSha256',repeat('3',64),'readbackSha256',repeat('3',64),
    'storageFingerprint',repeat('a',32),
    'originalScan','clean','finalScan','clean','sanitized',true,
    'sanitizer','decode-reencode-png-v1','sanitizerVersion','1.0.0',
    'clamavEngineVersion','1.4.3','signatureVersion','28094',
    'signatureTimestamp',clock_timestamp()-interval '1 minute','signatureAgeSeconds',60,
    'processingDurationMs',1000,'jobDeadline','$job_deadline',
    'nonce',gen_random_uuid(),'correlationId',gen_random_uuid()
  )
);
SQL

# A timely attestation retains authority for the complete fixed metadata
# margin even though its processing deadline has elapsed.
sql <<SQL >/dev/null
with t as (select clock_timestamp() at_time)
update private.media_scan_attempts
set claimed_at=t.at_time-interval '121 seconds',processing_deadline=t.at_time-interval '1 second',
    attested_at=t.at_time-interval '1 second',finalization_deadline=t.at_time+interval '14 seconds'
from t where id='$attempt_2';
SQL
margin_claim="$(sql <<SQL
set role service_role;
select public.claim_media_scan_job('worker-margin','$(uuid)',repeat('a',64),clock_timestamp(),86400);
SQL
)"
[[ -z "$margin_claim" ]] || { echo "attested attempt was reclaimed inside finalization margin" >&2; exit 1; }
margin_current="$(sql -c "select current_attempt_id::text||':'||state from private.media_scan_jobs where upload_id='$upload_id'")"
[[ "$margin_current" == "$attempt_2:scanning" ]] || { echo "finalization authority changed inside margin: $margin_current" >&2; exit 1; }

# Two independent finalizers may both observe clean, but only one mutates/audits.
final_op_a="$(uuid)"; final_op_b="$(uuid)"
(
  sql <<SQL >"$tmp_dir/final-a" 2>"$tmp_dir/final-a.err"
set role service_role;
select public.finalize_media_scan_job('$attempt_2','$token_2','$final_op_a','$manifest_fingerprint');
SQL
) & pid_a=$!
(
  sql <<SQL >"$tmp_dir/final-b" 2>"$tmp_dir/final-b.err"
set role service_role;
select public.finalize_media_scan_job('$attempt_2','$token_2','$final_op_b','$manifest_fingerprint');
SQL
) & pid_b=$!
wait "$pid_a"; wait "$pid_b"
grep -q '"status": "clean"' "$tmp_dir/final-a"
grep -q '"status": "clean"' "$tmp_dir/final-b"
final_events="$(sql -c "select count(*) from private.media_scan_events where attempt_id='$attempt_2' and action='finalize'")"
[[ "$final_events" == "1" ]] || { echo "completion race wrote $final_events final events" >&2; exit 1; }

# Same nonce, different operations, independent sessions: exactly one succeeds.
nonce="$(uuid)"; nonce_op_a="$(uuid)"; nonce_op_b="$(uuid)"; ts="$(date +%s)"
set +e
(
  sql <<SQL >"$tmp_dir/nonce-a" 2>&1
set role service_role;
select public.consume_media_scanner_nonce('scanner-race','claim','$nonce',$ts,repeat('8',64),'$nonce_op_a');
SQL
) & pid_a=$!
(
  sql <<SQL >"$tmp_dir/nonce-b" 2>&1
set role service_role;
select public.consume_media_scanner_nonce('scanner-race','claim','$nonce',$ts,repeat('8',64),'$nonce_op_b');
SQL
) & pid_b=$!
wait "$pid_a"; status_a=$?
wait "$pid_b"; status_b=$?
set -e
if [[ "$status_a" == "$status_b" ]]; then
  echo "nonce race did not produce one winner and one replay denial" >&2
  exit 1
fi
nonce_rows="$(sql -c "select count(*) from private.media_scanner_nonces where nonce='$nonce'")"
[[ "$nonce_rows" == "1" ]] || { echo "nonce race stored $nonce_rows rows" >&2; exit 1; }
if [[ "$status_a" == "0" ]]; then
  nonce_winner_op="$nonce_op_a"
  nonce_loser_file="$tmp_dir/nonce-b"
else
  nonce_winner_op="$nonce_op_b"
  nonce_loser_file="$tmp_dir/nonce-a"
fi
grep -q 'SCANNER_NONCE_REPLAY' "$nonce_loser_file" || {
  echo "simultaneous duplicate did not fail as SCANNER_NONCE_REPLAY" >&2
  exit 1
}

# An exact captured-request replay, including the same nonce-operation UUID,
# is authentication replay rather than domain-operation recovery.
set +e
sql <<SQL >"$tmp_dir/nonce-exact-replay" 2>&1
set role service_role;
select public.consume_media_scanner_nonce('scanner-race','claim','$nonce',$ts,repeat('8',64),'$nonce_winner_op');
SQL
nonce_exact_status=$?
set -e
[[ "$nonce_exact_status" != "0" ]] || { echo "exact nonce replay returned the accepted receipt" >&2; exit 1; }
grep -q 'SCANNER_NONCE_REPLAY' "$tmp_dir/nonce-exact-replay"
if grep -q '"accepted": true' "$tmp_dir/nonce-exact-replay"; then
  echo "exact nonce replay recovered a privileged acceptance receipt" >&2
  exit 1
fi

# Expiry never makes a consumed nonce reusable; a distinct nonce remains
# independently consumable with a fresh nonce-operation UUID.
sql -c "update private.media_scanner_nonces set expires_at=clock_timestamp()-interval '1 second' where nonce='$nonce'" >/dev/null
set +e
sql <<SQL >"$tmp_dir/nonce-expired" 2>&1
set role service_role;
select public.consume_media_scanner_nonce('scanner-race','claim','$nonce',extract(epoch from clock_timestamp())::bigint,repeat('8',64),'$(uuid)');
SQL
nonce_expired_status=$?
set -e
[[ "$nonce_expired_status" != "0" ]] || { echo "expired consumed nonce was reused" >&2; exit 1; }
grep -q 'SCANNER_NONCE_REPLAY' "$tmp_dir/nonce-expired"

nonce_fresh="$(uuid)"; nonce_fresh_op="$(uuid)"
nonce_fresh_result="$(sql <<SQL
set role service_role;
select public.consume_media_scanner_nonce('scanner-race','claim','$nonce_fresh',extract(epoch from clock_timestamp())::bigint,repeat('9',64),'$nonce_fresh_op');
SQL
)"
grep -q '"accepted": true' <<<"$nonce_fresh_result"
nonce_fresh_rows="$(sql -c "select count(*) from private.media_scanner_nonces where nonce='$nonce_fresh'")"
[[ "$nonce_fresh_rows" == "1" ]] || { echo "fresh nonce stored $nonce_fresh_rows rows" >&2; exit 1; }

# Signature evidence that was fresh when the claim statement started must be
# rechecked after an authoritative upload-row wait.
signature_upload_id="$(sql <<SQL
set role authenticated;
set "request.jwt.claim.sub"='$owner_id';
select public.create_unbound_file_upload('request_media','signature-wait.png','image/png',4096)->>'uploadId';
SQL
)"
sql -c "insert into storage.objects(bucket_id,name,owner_id,metadata)
select quarantine_bucket,quarantine_path,user_id::text,
  jsonb_build_object('mimetype',declared_mime_type,'size',size_bytes)
from public.file_uploads where id='$signature_upload_id'" >/dev/null

# Antivirus database timestamps permit no positive skew. The separate 30s
# scanner-control HMAC window is not a ClamAV freshness allowance.
set +e
sql <<SQL >"$tmp_dir/signature-future-one" 2>&1
set role service_role;
select public.claim_media_scan_job(
  'worker-signature-future-one','$(uuid)',repeat('c',64),clock_timestamp()+interval '1 second',60
);
SQL
signature_future_one_status=$?
sql <<SQL >"$tmp_dir/signature-future-twenty" 2>&1
set role service_role;
select public.claim_media_scan_job(
  'worker-signature-future-twenty','$(uuid)',repeat('d',64),clock_timestamp()+interval '20 seconds',60
);
SQL
signature_future_twenty_status=$?
set -e
[[ "$signature_future_one_status" != "0" ]] || { echo "one-second future signature claimed work" >&2; exit 1; }
[[ "$signature_future_twenty_status" != "0" ]] || { echo "twenty-second future signature claimed work" >&2; exit 1; }
grep -q 'SCANNER_SIGNATURE_STALE' "$tmp_dir/signature-future-one"
grep -q 'SCANNER_SIGNATURE_STALE' "$tmp_dir/signature-future-twenty"
future_signature_attempts="$(sql -c "select count(*) from private.media_scan_attempts where job_id=(select id from private.media_scan_jobs where upload_id='$signature_upload_id')")"
[[ "$future_signature_attempts" == "0" ]] || { echo "future signature evidence created $future_signature_attempts attempts" >&2; exit 1; }

sql <<SQL >/dev/null
set role authenticated;
set "request.jwt.claim.sub"='$owner_id';
select public.start_or_get_media_scan('$signature_upload_id','$(uuid)');
SQL
(
  sql <<SQL >"$tmp_dir/signature-blocker" 2>&1
begin;
select 1 from public.file_uploads where id='$signature_upload_id' for update;
select pg_sleep(3);
commit;
SQL
) & blocker_pid=$!
sleep 0.5
set +e
sql <<SQL >"$tmp_dir/signature-claim" 2>&1
set role service_role;
select public.claim_media_scan_job(
  'worker-signature-wait','$(uuid)',repeat('b',64),clock_timestamp()-interval '59 seconds',60
);
SQL
signature_status=$?
wait "$blocker_pid"; blocker_status=$?
set -e
[[ "$blocker_status" == "0" ]] || { echo "signature lock blocker failed" >&2; exit 1; }
[[ "$signature_status" != "0" ]] || { echo "signature freshness was not rechecked after lock wait" >&2; exit 1; }
grep -q 'SCANNER_SIGNATURE_STALE' "$tmp_dir/signature-claim"
signature_attempts="$(sql -c "select count(*) from private.media_scan_attempts where job_id=(select id from private.media_scan_jobs where upload_id='$signature_upload_id')")"
[[ "$signature_attempts" == "0" ]] || { echo "stale post-wait signature created $signature_attempts attempts" >&2; exit 1; }

echo "media scan concurrency: PASS (owner-claim-lock=1 claim=1 reclaim=1 cleanup-old=1 prepare-event=1 margin=1 finalize-event=1 nonce-race=1 nonce-exact-replay=1 nonce-expired=1 nonce-fresh=1 signature-future=2 signature-wait=1)"
