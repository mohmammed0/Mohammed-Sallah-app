begin;

-- M2V replaces the uncommitted synchronous scanner contract. Media bytes never
-- enter Edge; PostgreSQL is the attempt/lease/replay authority only.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function private.invoke_media_scan_cleanup_schedule() returns void
language plpgsql security definer set search_path='' as $$
declare
  worker_url text;
  worker_secret text;
begin
  select decrypted_secret into worker_url
  from vault.decrypted_secrets
  where name='sallah_media_scan_privacy_worker_url';
  select decrypted_secret into worker_secret
  from vault.decrypted_secrets
  where name='sallah_media_scan_privacy_worker_secret';

  if worker_url is null or worker_secret is null then
    raise exception 'MEDIA_SCAN_CLEANUP_CONFIGURATION_MISSING';
  end if;
  if worker_url !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]{0,252}/functions/v1/privacy-worker$'
     or octet_length(convert_to(worker_secret,'UTF8')) not between 32 and 256 then
    raise exception 'MEDIA_SCAN_CLEANUP_CONFIGURATION_INVALID';
  end if;

  perform net.http_post(
    url:=worker_url,
    body:='{}'::jsonb,
    headers:=jsonb_build_object(
      'Content-Type','application/json',
      'x-worker-secret',worker_secret
    ),
    timeout_milliseconds:=10000
  );
end
$$;

revoke all on function private.invoke_media_scan_cleanup_schedule()
from public,anon,authenticated,service_role;

create function private.media_scan_deadline_is_open(
  p_at_time timestamptz,
  p_deadline timestamptz
) returns boolean
language sql immutable strict set search_path='' as $$
  select p_at_time<p_deadline
$$;

revoke all on function private.media_scan_deadline_is_open(timestamptz,timestamptz)
from public,anon,authenticated,service_role;

do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname='sallah-media-scan-cleanup';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule(
    'sallah-media-scan-cleanup',
    '*/15 * * * *',
    'select private.invoke_media_scan_cleanup_schedule();'
  );
end
$$;

do $$
declare constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid='public.file_uploads'::regclass
    and contype='c'
    and pg_get_constraintdef(oid) like '%final_path%target_path%';
  if constraint_name is not null then
    execute format('alter table public.file_uploads drop constraint %I',constraint_name);
  end if;
end
$$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values
  ('scan-input','scan-input',false,20971520,array['application/octet-stream']::text[]),
  ('scan-output','scan-output',false,20971520,array[
    'image/jpeg','image/png','image/webp','audio/mp4','video/mp4'
  ]::text[])
on conflict(id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

create table private.media_scan_jobs (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null unique references public.file_uploads(id) on delete cascade,
  state text not null default 'queued' check (state in (
    'queued','scanning','clean','rejected','retryable_failure','terminal_failure'
  )),
  current_attempt_id uuid,
  attempt_count integer not null default 0 check (attempt_count between 0 and 3),
  safe_terminal_category text check (
    safe_terminal_category is null or safe_terminal_category ~ '^[a-z][a-z0-9_]{0,63}$'
  ),
  sanitized boolean not null default false,
  result_mime_type text check (
    result_mime_type is null or result_mime_type in (
      'image/jpeg','image/png','image/webp','audio/mp4','video/mp4'
    )
  ),
  result_size_bytes bigint check (result_size_bytes is null or result_size_bytes between 1 and 20971520),
  retry_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz
);

create table private.media_scan_attempts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references private.media_scan_jobs(id) on delete cascade,
  ordinal integer not null check (ordinal between 1 and 3),
  attempt_token_hash text not null check (attempt_token_hash ~ '^[0-9a-f]{64}$'),
  worker_id text not null check (worker_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,119}$'),
  state text not null default 'processing' check (state in (
    'processing','output_prepared','readback_authorized','attested','completed',
    'rejected','retryable_failure','terminal_failure','expired'
  )),
  claimed_at timestamptz not null,
  processing_deadline timestamptz not null,
  finalization_deadline timestamptz,
  heartbeat_at timestamptz not null,
  signature_timestamp timestamptz not null,
  signature_max_age_seconds integer not null check (signature_max_age_seconds between 60 and 604800),
  prepare_fingerprint text check (prepare_fingerprint is null or prepare_fingerprint ~ '^[0-9a-f]{64}$'),
  manifest_fingerprint text check (manifest_fingerprint is null or manifest_fingerprint ~ '^[0-9a-f]{64}$'),
  input_mime_type text,
  output_mime_type text,
  input_size_bytes bigint,
  output_size_bytes bigint,
  input_sha256 text check (input_sha256 is null or input_sha256 ~ '^[0-9a-f]{64}$'),
  output_sha256 text check (output_sha256 is null or output_sha256 ~ '^[0-9a-f]{64}$'),
  sanitizer_id text,
  sanitizer_version text,
  terminal_category text,
  attested_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(job_id,ordinal),
  check (processing_deadline=claimed_at+interval '120 seconds'),
  check (finalization_deadline is null or finalization_deadline=processing_deadline+interval '15 seconds')
);

alter table private.media_scan_jobs
  add constraint media_scan_jobs_current_attempt_fk
  foreign key(current_attempt_id) references private.media_scan_attempts(id);

create table private.media_scan_artifacts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references private.media_scan_jobs(id) on delete cascade,
  attempt_id uuid references private.media_scan_attempts(id) on delete cascade,
  kind text not null check (kind in ('quarantine','scan_input','scan_output','final_candidate')),
  bucket text not null,
  path text not null,
  state text not null check (state in (
    'source','pending','available','upload_authorized','readback_authorized','attested',
    'promotion_pending','retained','cleanup_pending','cleanup_claimed','cleanup_failed',
    'cleanup_dead_letter','deleted'
  )),
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes between 1 and 20971520),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  cleanup_token_hash text check (cleanup_token_hash is null or cleanup_token_hash ~ '^[0-9a-f]{64}$'),
  cleanup_worker_id text,
  cleanup_lease_expires_at timestamptz,
  cleanup_retry_at timestamptz,
  cleanup_attempts integer not null default 0 check (cleanup_attempts between 0 and 20),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz,
  unique(bucket,path),
  unique(attempt_id,kind),
  check ((kind='quarantine' and attempt_id is null) or (kind<>'quarantine' and attempt_id is not null)),
  check ((state='cleanup_claimed' and cleanup_token_hash is not null and cleanup_worker_id is not null and cleanup_lease_expires_at is not null) or state<>'cleanup_claimed'),
  check ((state='cleanup_failed' and cleanup_retry_at is not null) or state<>'cleanup_failed')
);

create table private.media_scan_attestations (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references private.media_scan_jobs(id) on delete cascade,
  attempt_id uuid not null unique references private.media_scan_attempts(id) on delete cascade,
  manifest_fingerprint text not null unique check (manifest_fingerprint ~ '^[0-9a-f]{64}$'),
  manifest jsonb not null check (jsonb_typeof(manifest)='object' and pg_column_size(manifest)<=32768),
  scanner_engine_version text not null,
  signature_version text not null,
  signature_timestamp timestamptz not null,
  signature_age_seconds integer not null check (signature_age_seconds>=0),
  sanitizer_id text not null,
  sanitizer_version text not null,
  processing_duration_ms integer not null check (processing_duration_ms between 0 and 120000),
  correlation_id uuid not null,
  nonce uuid not null unique,
  created_at timestamptz not null default clock_timestamp()
);

create table private.media_scan_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references private.media_scan_jobs(id) on delete cascade,
  attempt_id uuid references private.media_scan_attempts(id) on delete cascade,
  operation_id uuid not null unique,
  action text not null check (action ~ '^[a-z][a-z0-9_]{0,63}$'),
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  response jsonb,
  created_at timestamptz not null default clock_timestamp()
);

create table private.media_scanner_nonces (
  nonce uuid primary key,
  worker_id text not null check (worker_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,119}$'),
  action text not null,
  request_timestamp bigint not null,
  body_sha256 text not null check (body_sha256 ~ '^[0-9a-f]{64}$'),
  operation_id uuid not null unique,
  consumed_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null
);

create table private.media_scanner_attestation_nonces (
  nonce uuid primary key,
  worker_id text not null check (worker_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,119}$'),
  action text not null check (action='complete'),
  attempt_id uuid not null unique references private.media_scan_attempts(id) on delete cascade,
  manifest_fingerprint text not null check (manifest_fingerprint ~ '^[0-9a-f]{64}$'),
  consumed_at timestamptz not null,
  expires_at timestamptz not null
);

create index media_scan_jobs_claim_idx on private.media_scan_jobs(state,retry_at,created_at,id);
create index media_scan_attempts_deadline_idx on private.media_scan_attempts(processing_deadline,id)
where state in ('processing','output_prepared','readback_authorized','attested');
create index media_scan_artifacts_cleanup_idx on private.media_scan_artifacts(
  state,cleanup_retry_at,cleanup_lease_expires_at,created_at,id
)
where state in ('cleanup_pending','cleanup_claimed','cleanup_failed');
create index media_scanner_nonces_expiry_idx on private.media_scanner_nonces(expires_at);
create index media_scanner_attestation_nonces_expiry_idx
on private.media_scanner_attestation_nonces(expires_at);

alter table private.media_scan_jobs enable row level security;
alter table private.media_scan_attempts enable row level security;
alter table private.media_scan_artifacts enable row level security;
alter table private.media_scan_attestations enable row level security;
alter table private.media_scan_events enable row level security;
alter table private.media_scanner_nonces enable row level security;
alter table private.media_scanner_attestation_nonces enable row level security;

revoke all on table private.media_scan_jobs from public,anon,authenticated,service_role;
revoke all on table private.media_scan_attempts from public,anon,authenticated,service_role;
revoke all on table private.media_scan_artifacts from public,anon,authenticated,service_role;
revoke all on table private.media_scan_attestations from public,anon,authenticated,service_role;
revoke all on table private.media_scan_events from public,anon,authenticated,service_role;
revoke all on table private.media_scanner_nonces from public,anon,authenticated,service_role;
revoke all on table private.media_scanner_attestation_nonces
from public,anon,authenticated,service_role;

create function private.media_scan_immutable() returns trigger
language plpgsql set search_path='' as $$
begin
  raise exception 'APPEND_ONLY_RECORD';
end
$$;
create trigger media_scan_attestations_immutable before update or delete on private.media_scan_attestations
for each row execute function private.media_scan_immutable();
create trigger media_scan_events_immutable before update or delete on private.media_scan_events
for each row execute function private.media_scan_immutable();

create function private.media_scan_fingerprint(p_value jsonb) returns text
language sql immutable set search_path='' as $$
  select encode(extensions.digest(p_value::text,'sha256'),'hex')
$$;

create function private.media_scan_token_hash(p_token uuid) returns text
language sql immutable set search_path='' as $$
  select encode(extensions.digest(p_token::text,'sha256'),'hex')
$$;

create function private.media_scan_operation_lock(p_operation_id uuid) returns void
language plpgsql set search_path='' as $$
begin
  if p_operation_id is null then raise exception 'OPERATION_ID_REQUIRED'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation_id::text,0));
end
$$;

create function private.media_scan_replay(
  p_operation_id uuid,p_action text,p_fingerprint text
) returns jsonb
language plpgsql set search_path='' as $$
declare prior private.media_scan_events%rowtype;
begin
  select * into prior from private.media_scan_events where operation_id=p_operation_id;
  if prior.id is null then return null; end if;
  if prior.action is distinct from p_action or prior.fingerprint is distinct from p_fingerprint then
    raise exception 'OPERATION_REPLAY_MISMATCH';
  end if;
  return jsonb_build_object('replayed',true,'response',prior.response);
end
$$;

revoke all on function private.media_scan_immutable() from public,anon,authenticated,service_role;
revoke all on function private.media_scan_fingerprint(jsonb) from public,anon,authenticated,service_role;
revoke all on function private.media_scan_token_hash(uuid) from public,anon,authenticated,service_role;
revoke all on function private.media_scan_operation_lock(uuid) from public,anon,authenticated,service_role;
revoke all on function private.media_scan_replay(uuid,text,text) from public,anon,authenticated,service_role;

-- Storage policies retain their authorization without granting owners access
-- to the operational upload ledger itself.
create function private.can_insert_quarantine_object(p_bucket text,p_path text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.file_uploads f
    where f.user_id=(select auth.uid())
      and f.quarantine_bucket=p_bucket and f.quarantine_path=p_path
      and f.status='created' and f.expires_at>clock_timestamp()
  )
$$;

create function private.can_read_clean_storage_object(
  p_bucket text,p_path text,p_owner_id text
) returns boolean
language sql stable security definer set search_path='' as $$
  select
    p_bucket not in ('quarantine','message-attachments','scan-input','scan-output')
    and (
      p_owner_id=(select auth.uid())::text
      or (select private.is_admin())
    )
    and (
      p_bucket in ('exports','invoices')
      or exists(
        select 1 from public.file_uploads f
        where f.target_bucket=p_bucket and f.final_path=p_path and f.status='clean'
          and ((select private.is_admin()) or f.user_id=(select auth.uid()))
      )
    )
$$;

create function private.can_delete_clean_storage_object(
  p_bucket text,p_path text,p_owner_id text
) returns boolean
language sql stable security definer set search_path='' as $$
  select
    p_bucket not in ('quarantine','message-attachments','scan-input','scan-output')
    and p_owner_id=(select auth.uid())::text
    and exists(
      select 1 from public.file_uploads f
      where f.user_id=(select auth.uid()) and f.target_bucket=p_bucket
        and f.final_path=p_path and f.status='clean'
    )
$$;

revoke all on function private.can_insert_quarantine_object(text,text) from public,anon,authenticated,service_role;
revoke all on function private.can_read_clean_storage_object(text,text,text) from public,anon,authenticated,service_role;
revoke all on function private.can_delete_clean_storage_object(text,text,text) from public,anon,authenticated,service_role;
grant usage on schema private to authenticated;
grant execute on function private.can_insert_quarantine_object(text,text) to authenticated;
grant execute on function private.can_read_clean_storage_object(text,text,text) to authenticated;
grant execute on function private.can_delete_clean_storage_object(text,text,text) to authenticated;

drop policy if exists storage_quarantine_ticket_insert on storage.objects;
drop policy if exists storage_clean_owner_read on storage.objects;
drop policy if exists storage_clean_owner_delete on storage.objects;
create policy storage_quarantine_ticket_insert on storage.objects for insert to authenticated
with check (private.can_insert_quarantine_object(bucket_id,name));
create policy storage_clean_owner_read on storage.objects for select to authenticated
using (
  bucket_id not in ('quarantine','message-attachments','scan-input','scan-output')
  and private.can_read_clean_storage_object(bucket_id,name,owner_id)
);
create policy storage_clean_owner_delete on storage.objects for delete to authenticated
using (
  bucket_id not in ('quarantine','message-attachments','scan-input','scan-output')
  and private.can_delete_clean_storage_object(bucket_id,name,owner_id)
);

drop policy if exists file_upload_owner_read on public.file_uploads;
drop policy if exists upload_events_owner_read on public.upload_security_events;
revoke all on public.file_uploads,public.upload_security_events from public,anon,authenticated;

create function private.media_scan_safe_response(p_job private.media_scan_jobs) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object(
    'uploadId',p_job.upload_id,
    'status',p_job.state,
    'terminalCategory',p_job.safe_terminal_category,
    'sanitized',p_job.sanitized,
    'mimeType',p_job.result_mime_type,
    'sizeBytes',p_job.result_size_bytes,
    'retryAt',p_job.retry_at,
    'createdAt',p_job.created_at,
    'updatedAt',p_job.updated_at
  )
$$;
revoke all on function private.media_scan_safe_response(private.media_scan_jobs) from public,anon,authenticated,service_role;

create function private.media_scan_adopt_untracked_upload(
  p_upload public.file_uploads,p_at_time timestamptz
) returns private.media_scan_jobs
language plpgsql set search_path='' as $$
declare
  job private.media_scan_jobs%rowtype;
  artifact_state text;
begin
  if p_upload.id is null
     or (
       p_upload.status not in ('clean','rejected','expired')
       and p_upload.expires_at>p_at_time
     ) then
    raise exception 'UPLOAD_NOT_TERMINAL';
  end if;

  insert into private.media_scan_jobs(
    upload_id,state,safe_terminal_category,sanitized,result_mime_type,result_size_bytes,
    created_at,updated_at,completed_at
  ) values(
    p_upload.id,
    case p_upload.status
      when 'clean' then 'clean'
      when 'rejected' then 'rejected'
      else 'terminal_failure'
    end,
    case
      when p_upload.status='rejected' then
        case when coalesce(p_upload.failure_category,'') ~ '^[a-z][a-z0-9_]{0,63}$'
          then p_upload.failure_category else 'legacy_rejected' end
      when p_upload.status='clean' then null
      else 'upload_expired'
    end,
    p_upload.status='clean' and coalesce(p_upload.sanitized,false),
    case when p_upload.status='clean'
      and coalesce(p_upload.detected_mime_type,p_upload.declared_mime_type)
        in ('image/jpeg','image/png','image/webp','audio/mp4','video/mp4')
      then coalesce(p_upload.detected_mime_type,p_upload.declared_mime_type)
      else null end,
    case when p_upload.status='clean' then p_upload.size_bytes else null end,
    p_upload.created_at,p_at_time,p_at_time
  ) returning * into job;

  artifact_state:=case
    when p_upload.quarantine_cleaned_at is null then 'cleanup_pending'
    else 'deleted'
  end;
  insert into private.media_scan_artifacts(
    job_id,kind,bucket,path,state,mime_type,size_bytes,created_at,updated_at,deleted_at
  ) values(
    job.id,'quarantine',p_upload.quarantine_bucket,p_upload.quarantine_path,
    artifact_state,p_upload.declared_mime_type,p_upload.size_bytes,p_upload.created_at,p_at_time,
    case when artifact_state='deleted' then p_upload.quarantine_cleaned_at else null end
  );

  update public.file_uploads set
    status='expired',failure_category=coalesce(failure_category,'upload_expired'),
    locked_at=null
  where id=p_upload.id and status not in ('clean','rejected');
  return job;
end
$$;

revoke all on function private.media_scan_adopt_untracked_upload(
  public.file_uploads,timestamptz
) from public,anon,authenticated,service_role;

create function public.start_or_get_media_scan(p_upload_id uuid,p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=(select auth.uid());
  upload public.file_uploads%rowtype;
  job private.media_scan_jobs%rowtype;
  at_time timestamptz;
  fingerprint text;
  response jsonb;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into upload from public.file_uploads where id=p_upload_id and user_id=actor;
  if upload.id is null then raise exception 'UPLOAD_NOT_FOUND'; end if;

  perform private.media_scan_operation_lock(p_operation_id);
  fingerprint:=private.media_scan_fingerprint(jsonb_build_array('start',upload.id,actor));
  response:=private.media_scan_replay(p_operation_id,'start',fingerprint);
  if response is not null then return response->'response'; end if;

  -- First-job creation is serialized without taking the upload row ahead of a
  -- possible job row. Existing owner and scanner paths both lock job -> upload.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('media_scan_start:'||p_upload_id::text,0)
  );
  select * into job from private.media_scan_jobs where upload_id=p_upload_id for update;
  select * into upload from public.file_uploads where id=p_upload_id and user_id=actor for update;
  if upload.id is null then raise exception 'UPLOAD_NOT_FOUND'; end if;
  if job.id is not null then
    return private.media_scan_safe_response(job);
  end if;
  at_time:=clock_timestamp();

  if upload.status in ('clean','rejected','expired') or upload.expires_at<=at_time then
    job:=private.media_scan_adopt_untracked_upload(upload,at_time);
    response:=private.media_scan_safe_response(job);
    insert into private.media_scan_events(job_id,operation_id,action,fingerprint,response)
    values(job.id,p_operation_id,'start',fingerprint,response);
    return response;
  end if;

  if not exists(
    select 1 from storage.objects object
    where object.bucket_id=upload.quarantine_bucket
      and object.name=upload.quarantine_path
      and object.owner_id=actor::text
      and coalesce((object.metadata->>'size')::bigint,-1)=upload.size_bytes
      and lower(coalesce(object.metadata->>'mimetype',''))=lower(upload.declared_mime_type)
  ) then
    raise exception 'QUARANTINE_UPLOAD_INCOMPLETE';
  end if;
  insert into private.media_scan_jobs(upload_id,state)
  values(upload.id,'queued') returning * into job;
  insert into private.media_scan_artifacts(
    job_id,kind,bucket,path,state,mime_type,size_bytes,created_at
  ) values(
    job.id,'quarantine',upload.quarantine_bucket,upload.quarantine_path,'source',
    upload.declared_mime_type,upload.size_bytes,upload.created_at
  );
  response:=private.media_scan_safe_response(job);
  insert into private.media_scan_events(job_id,operation_id,action,fingerprint,response)
  values(job.id,p_operation_id,'start',fingerprint,response);
  return response;
end
$$;

create function public.get_my_file_upload_status(p_upload_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=(select auth.uid()); job private.media_scan_jobs%rowtype;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  select j.* into job
  from private.media_scan_jobs j join public.file_uploads f on f.id=j.upload_id
  where f.id=p_upload_id and f.user_id=actor;
  if job.id is null then raise exception 'UPLOAD_NOT_FOUND'; end if;
  return private.media_scan_safe_response(job);
end
$$;

revoke all on function public.start_or_get_media_scan(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.get_my_file_upload_status(uuid) from public,anon,authenticated,service_role;
grant execute on function public.start_or_get_media_scan(uuid,uuid) to authenticated;
grant execute on function public.get_my_file_upload_status(uuid) to authenticated;

create function public.claim_media_scan_job(
  p_worker_id text,
  p_operation_id uuid,
  p_attempt_token_hash text,
  p_signature_timestamp timestamptz,
  p_signature_max_age_seconds integer
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  at_time timestamptz;
  request_time timestamptz;
  job private.media_scan_jobs%rowtype;
  previous private.media_scan_attempts%rowtype;
  attempt private.media_scan_attempts%rowtype;
  upload public.file_uploads%rowtype;
  fingerprint text;
  replay jsonb;
  response jsonb;
  input_key uuid:=gen_random_uuid();
  output_key uuid:=gen_random_uuid();
  final_key uuid:=gen_random_uuid();
  input_path text;
  output_path text;
  final_path text;
begin
  if current_setting('role',true) is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if coalesce(p_worker_id,'') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,119}$' then raise exception 'INVALID_WORKER_ID'; end if;
  if coalesce(p_attempt_token_hash,'') !~ '^[0-9a-f]{64}$' then raise exception 'INVALID_ATTEMPT_TOKEN_HASH'; end if;
  if p_signature_max_age_seconds not between 60 and 604800 then raise exception 'INVALID_SIGNATURE_MAX_AGE'; end if;

  perform private.media_scan_operation_lock(p_operation_id);
  fingerprint:=private.media_scan_fingerprint(jsonb_build_array(
    'claim',p_worker_id,p_attempt_token_hash,p_signature_timestamp,p_signature_max_age_seconds
  ));
  replay:=private.media_scan_replay(p_operation_id,'claim',fingerprint);
  if replay is not null then return replay->'response'; end if;
  request_time:=clock_timestamp();
  if p_signature_timestamp is null
     or p_signature_timestamp>request_time
     or p_signature_timestamp<request_time-make_interval(secs=>p_signature_max_age_seconds) then
    raise exception 'SCANNER_SIGNATURE_STALE';
  end if;

  select j.* into job
  from private.media_scan_jobs j
  where
    j.state='queued'
    or (j.state='retryable_failure' and coalesce(j.retry_at,'-infinity'::timestamptz)<=request_time)
    or (
      j.state='scanning' and exists(
        select 1 from private.media_scan_attempts a
        where a.id=j.current_attempt_id and (
          (a.state='attested' and a.finalization_deadline<=request_time)
          or (
            a.state in ('processing','output_prepared','readback_authorized')
            and a.processing_deadline<=request_time
          )
        )
      )
    )
  order by j.created_at,j.id
  limit 1 for update skip locked;

  if job.id is null then
    insert into private.media_scan_events(operation_id,action,fingerprint,response)
    values(p_operation_id,'claim',fingerprint,null);
    return null;
  end if;

  select * into upload from public.file_uploads where id=job.upload_id for update;
  if job.state='scanning' then
    select * into previous from private.media_scan_attempts where id=job.current_attempt_id for update;
  end if;
  at_time:=clock_timestamp();
  if p_signature_timestamp is null
     or p_signature_timestamp>at_time
     or p_signature_timestamp<at_time-make_interval(secs=>p_signature_max_age_seconds) then
    raise exception 'SCANNER_SIGNATURE_STALE';
  end if;
  if upload.id is null or upload.expires_at<=at_time then
    update private.media_scan_jobs
    set state='terminal_failure',safe_terminal_category='upload_expired',retry_at=null,updated_at=at_time,completed_at=at_time
    where id=job.id returning * into job;
    update public.file_uploads set status='expired',failure_category='upload_expired',locked_at=null where id=upload.id;
    update private.media_scan_artifacts set state='cleanup_pending',updated_at=at_time
    where job_id=job.id and state not in ('retained','deleted');
    response:=null;
    insert into private.media_scan_events(job_id,operation_id,action,fingerprint,response)
    values(job.id,p_operation_id,'claim',fingerprint,response);
    return null;
  end if;

  if job.state='scanning' then
    if previous.id is null or not coalesce((
      (previous.state='attested' and previous.finalization_deadline<=at_time)
      or (
        previous.state in ('processing','output_prepared','readback_authorized')
        and previous.processing_deadline<=at_time
      )
    ),false) then
      insert into private.media_scan_events(job_id,attempt_id,operation_id,action,fingerprint,response)
      values(job.id,previous.id,p_operation_id,'claim',fingerprint,null);
      return null;
    end if;
    update private.media_scan_attempts
    set state='expired',terminal_category='attempt_deadline_exceeded',updated_at=at_time
    where id=previous.id;
    update private.media_scan_artifacts
    set state='cleanup_pending',updated_at=at_time
    where attempt_id=previous.id and kind in ('scan_input','scan_output','final_candidate') and state<>'retained';
    if job.attempt_count>=3 then
      update private.media_scan_jobs
      set state='terminal_failure',safe_terminal_category='scan_attempt_limit',retry_at=null,updated_at=at_time,completed_at=at_time
      where id=job.id returning * into job;
      update public.file_uploads set status='rejected',failure_category='scan_attempt_limit',locked_at=null where id=upload.id;
      update private.media_scan_artifacts set state='cleanup_pending',updated_at=at_time
      where job_id=job.id and state not in ('retained','deleted');
      insert into private.media_scan_events(job_id,attempt_id,operation_id,action,fingerprint,response)
      values(job.id,previous.id,p_operation_id,'claim',fingerprint,null);
      return null;
    end if;
  end if;

  input_path:=substr(replace(input_key::text,'-',''),1,2)||'/'||substr(replace(input_key::text,'-',''),3,2)||'/'||input_key::text;
  output_path:=substr(replace(output_key::text,'-',''),1,2)||'/'||substr(replace(output_key::text,'-',''),3,2)||'/'||output_key::text;
  final_path:='clean/'||substr(replace(final_key::text,'-',''),1,2)||'/'||substr(replace(final_key::text,'-',''),3,2)||'/'||final_key::text;

  insert into private.media_scan_attempts(
    job_id,ordinal,attempt_token_hash,worker_id,state,claimed_at,processing_deadline,
    heartbeat_at,signature_timestamp,signature_max_age_seconds
  ) values(
    job.id,job.attempt_count+1,p_attempt_token_hash,p_worker_id,'processing',at_time,
    at_time+interval '120 seconds',at_time,p_signature_timestamp,p_signature_max_age_seconds
  ) returning * into attempt;

  insert into private.media_scan_artifacts(job_id,attempt_id,kind,bucket,path,state)
  values
    (job.id,attempt.id,'scan_input','scan-input',input_path,'pending'),
    (job.id,attempt.id,'scan_output','scan-output',output_path,'pending'),
    (job.id,attempt.id,'final_candidate',upload.target_bucket,final_path,'pending');

  update private.media_scan_jobs
  set state='scanning',current_attempt_id=attempt.id,attempt_count=attempt.ordinal,
      safe_terminal_category=null,retry_at=null,updated_at=at_time
  where id=job.id returning * into job;
  update public.file_uploads
  set status='scanning',attempts=attempt.ordinal,locked_at=at_time,failure_category=null
  where id=upload.id;

  response:=jsonb_build_object(
    'status','scanning','jobId',job.id,'attemptId',attempt.id,'workerId',attempt.worker_id,
    'attemptOrdinal',attempt.ordinal,
    'claimedAt',attempt.claimed_at,'processingDeadline',attempt.processing_deadline,
    'leaseExpiresAt',attempt.processing_deadline,
    'purpose',upload.purpose,'declaredMimeType',upload.declared_mime_type,
    'sizeBytes',upload.size_bytes,'maxSizeBytes',upload.max_size_bytes,
    'sourceBucket',upload.quarantine_bucket,'sourcePath',upload.quarantine_path,
    'inputBucket','scan-input','inputPath',input_path,
    'outputBucket','scan-output','outputPath',output_path,
    'finalBucket',upload.target_bucket,'finalPath',final_path
  );
  insert into private.media_scan_events(job_id,attempt_id,operation_id,action,fingerprint,response)
  values(job.id,attempt.id,p_operation_id,'claim',fingerprint,response);
  return response;
end
$$;

create function public.heartbeat_media_scan_attempt(
  p_attempt_id uuid,p_attempt_token uuid,p_operation_id uuid
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare at_time timestamptz; attempt_job_id uuid; attempt private.media_scan_attempts%rowtype; job private.media_scan_jobs%rowtype;
  fingerprint text; replay jsonb; response jsonb;
begin
  if current_setting('role',true) is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  perform private.media_scan_operation_lock(p_operation_id);
  fingerprint:=private.media_scan_fingerprint(jsonb_build_array('heartbeat',p_attempt_id,p_attempt_token));
  replay:=private.media_scan_replay(p_operation_id,'heartbeat',fingerprint);
  if replay is not null then return replay->'response'; end if;
  select job_id into attempt_job_id from private.media_scan_attempts where id=p_attempt_id;
  select * into job from private.media_scan_jobs where id=attempt_job_id for update;
  select * into attempt from private.media_scan_attempts where id=p_attempt_id for update;
  if attempt.id is null or attempt.job_id is distinct from job.id or attempt.attempt_token_hash is distinct from private.media_scan_token_hash(p_attempt_token) then raise exception 'SCAN_ATTEMPT_STALE'; end if;
  if job.current_attempt_id is distinct from attempt.id or job.state<>'scanning' then raise exception 'SCAN_ATTEMPT_STALE'; end if;
  at_time:=clock_timestamp();
  if at_time>=attempt.processing_deadline then raise exception 'SCAN_ATTEMPT_EXPIRED'; end if;
  if attempt.state not in ('processing','output_prepared','readback_authorized') then raise exception 'SCAN_ATTEMPT_STALE'; end if;
  update private.media_scan_attempts set heartbeat_at=at_time,updated_at=at_time where id=attempt.id;
  response:=jsonb_build_object('attemptId',attempt.id,'status',attempt.state,'processingDeadline',attempt.processing_deadline);
  insert into private.media_scan_events(job_id,attempt_id,operation_id,action,fingerprint,response)
  values(job.id,attempt.id,p_operation_id,'heartbeat',fingerprint,response);
  return response;
end
$$;

create function public.prepare_media_scan_output(
  p_attempt_id uuid,
  p_attempt_token uuid,
  p_operation_id uuid,
  p_prepare_fingerprint text,
  p_input_mime_type text,
  p_output_mime_type text,
  p_input_size_bytes bigint,
  p_output_size_bytes bigint,
  p_input_sha256 text,
  p_output_sha256 text,
  p_sanitizer_id text,
  p_sanitizer_version text
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare at_time timestamptz; attempt_job_id uuid; attempt private.media_scan_attempts%rowtype; job private.media_scan_jobs%rowtype;
  upload public.file_uploads%rowtype; artifact private.media_scan_artifacts%rowtype;
  fingerprint text; replay jsonb; response jsonb;
begin
  if current_setting('role',true) is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if coalesce(p_prepare_fingerprint,'') !~ '^[0-9a-f]{64}$'
     or coalesce(p_input_sha256,'') !~ '^[0-9a-f]{64}$'
     or coalesce(p_output_sha256,'') !~ '^[0-9a-f]{64}$'
     or coalesce(p_sanitizer_id,'') !~ '^[a-z0-9][a-z0-9._-]{0,63}$'
     or coalesce(p_sanitizer_version,'') !~ '^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$' then
    raise exception 'INVALID_SCAN_METADATA';
  end if;
  if p_output_mime_type not in ('image/jpeg','image/png','image/webp','audio/mp4','video/mp4')
     or p_input_mime_type is distinct from p_output_mime_type then
    raise exception 'UNSUPPORTED_MEDIA_POLICY';
  end if;

  perform private.media_scan_operation_lock(p_operation_id);
  fingerprint:=private.media_scan_fingerprint(jsonb_build_array(
    'prepare_output',p_attempt_id,p_attempt_token,p_prepare_fingerprint,p_input_mime_type,
    p_output_mime_type,p_input_size_bytes,p_output_size_bytes,p_input_sha256,p_output_sha256,
    p_sanitizer_id,p_sanitizer_version
  ));
  replay:=private.media_scan_replay(p_operation_id,'prepare_output',fingerprint);
  if replay is not null then return replay->'response'; end if;

  select job_id into attempt_job_id from private.media_scan_attempts where id=p_attempt_id;
  select * into job from private.media_scan_jobs where id=attempt_job_id for update;
  select * into attempt from private.media_scan_attempts where id=p_attempt_id for update;
  if attempt.id is null or attempt.job_id is distinct from job.id or attempt.attempt_token_hash is distinct from private.media_scan_token_hash(p_attempt_token) then raise exception 'SCAN_ATTEMPT_STALE'; end if;
  if job.current_attempt_id is distinct from attempt.id or job.state<>'scanning' then raise exception 'SCAN_ATTEMPT_STALE'; end if;
  at_time:=clock_timestamp();
  if at_time>=attempt.processing_deadline then raise exception 'SCAN_ATTEMPT_EXPIRED'; end if;
  if attempt.state<>'processing' then raise exception 'SCAN_ATTEMPT_STALE'; end if;
  select * into upload from public.file_uploads where id=job.upload_id;
  if p_input_size_bytes is distinct from upload.size_bytes
     or p_output_size_bytes not between 1 and upload.max_size_bytes
     or p_input_mime_type is distinct from upload.declared_mime_type then
    raise exception 'INVALID_SCAN_METADATA';
  end if;
  if (upload.purpose='request_audio' and (
        p_input_mime_type<>'audio/mp4' or
        p_sanitizer_id<>'sallah.ffmpeg.remux.audio-mp4'
      ))
     or (upload.purpose='completion_proof' and p_input_mime_type='video/mp4' and
        p_sanitizer_id<>'sallah.ffmpeg.remux.video-mp4')
     or (p_input_mime_type in ('audio/mp4','video/mp4') and upload.purpose not in (
        'request_audio','completion_proof'
      ))
     or (p_input_mime_type like 'image/%' and
        p_sanitizer_id !~ '^decode-reencode-(jpeg|png|webp)-v1$') then
    raise exception 'UNSUPPORTED_MEDIA_POLICY';
  end if;

  update private.media_scan_attempts set
    state='output_prepared',prepare_fingerprint=p_prepare_fingerprint,
    input_mime_type=p_input_mime_type,output_mime_type=p_output_mime_type,
    input_size_bytes=p_input_size_bytes,output_size_bytes=p_output_size_bytes,
    input_sha256=p_input_sha256,output_sha256=p_output_sha256,
    sanitizer_id=p_sanitizer_id,sanitizer_version=p_sanitizer_version,updated_at=at_time
  where id=attempt.id;
  update private.media_scan_artifacts set
    state='upload_authorized',mime_type=p_output_mime_type,size_bytes=p_output_size_bytes,
    sha256=p_output_sha256,updated_at=at_time
  where attempt_id=attempt.id and kind='scan_output' returning * into artifact;
  response:=jsonb_build_object(
    'attemptId',attempt.id,'status','output_prepared','outputBucket',artifact.bucket,
    'outputPath',artifact.path,'processingDeadline',attempt.processing_deadline,'upsert',false,
    'purpose',upload.purpose,'detectedInputMime',p_input_mime_type,
    'detectedOutputMime',p_output_mime_type,'jobDeadline',attempt.processing_deadline
  );
  insert into private.media_scan_events(job_id,attempt_id,operation_id,action,fingerprint,response)
  values(job.id,attempt.id,p_operation_id,'prepare_output',fingerprint,response);
  return response;
end
$$;

create function public.authorize_media_scan_readback(
  p_attempt_id uuid,p_attempt_token uuid,p_operation_id uuid,
  p_output_size_bytes bigint,p_output_sha256 text
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare at_time timestamptz; attempt_job_id uuid; attempt private.media_scan_attempts%rowtype; job private.media_scan_jobs%rowtype;
  artifact private.media_scan_artifacts%rowtype; fingerprint text; replay jsonb; response jsonb;
begin
  if current_setting('role',true) is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  perform private.media_scan_operation_lock(p_operation_id);
  fingerprint:=private.media_scan_fingerprint(jsonb_build_array('authorize_readback',p_attempt_id,p_attempt_token,p_output_size_bytes,p_output_sha256));
  replay:=private.media_scan_replay(p_operation_id,'authorize_readback',fingerprint);
  if replay is not null then return replay->'response'; end if;
  select job_id into attempt_job_id from private.media_scan_attempts where id=p_attempt_id;
  select * into job from private.media_scan_jobs where id=attempt_job_id for update;
  select * into attempt from private.media_scan_attempts where id=p_attempt_id for update;
  if attempt.id is null or attempt.job_id is distinct from job.id or attempt.attempt_token_hash is distinct from private.media_scan_token_hash(p_attempt_token) then raise exception 'SCAN_ATTEMPT_STALE'; end if;
  if job.current_attempt_id is distinct from attempt.id or job.state<>'scanning' then raise exception 'SCAN_ATTEMPT_STALE'; end if;
  at_time:=clock_timestamp();
  if at_time>=attempt.processing_deadline then raise exception 'SCAN_ATTEMPT_EXPIRED'; end if;
  if attempt.state<>'output_prepared'
     or p_output_size_bytes is distinct from attempt.output_size_bytes
     or p_output_sha256 is distinct from attempt.output_sha256 then raise exception 'OUTPUT_METADATA_MISMATCH'; end if;
  update private.media_scan_attempts set state='readback_authorized',updated_at=at_time where id=attempt.id;
  update private.media_scan_artifacts set state='readback_authorized',updated_at=at_time
  where attempt_id=attempt.id and kind='scan_output' returning * into artifact;
  response:=jsonb_build_object('attemptId',attempt.id,'status','readback_authorized','outputBucket',artifact.bucket,'outputPath',artifact.path,'sizeBytes',artifact.size_bytes,'sha256',artifact.sha256);
  insert into private.media_scan_events(job_id,attempt_id,operation_id,action,fingerprint,response)
  values(job.id,attempt.id,p_operation_id,'authorize_readback',fingerprint,response);
  return response;
end
$$;

create function public.record_media_scan_attestation(
  p_attempt_id uuid,p_attempt_token uuid,p_operation_id uuid,
  p_manifest_fingerprint text,p_manifest jsonb
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare at_time timestamptz; attempt_job_id uuid; attempt private.media_scan_attempts%rowtype; job private.media_scan_jobs%rowtype;
  upload public.file_uploads%rowtype;
  input_artifact private.media_scan_artifacts%rowtype; output_artifact private.media_scan_artifacts%rowtype;
  fingerprint text; replay jsonb; response jsonb; signature_time timestamptz; signature_age integer;
  input_size bigint; output_size bigint; processing_duration integer; sanitized boolean;
  job_deadline timestamptz; nonce_id uuid; correlation_id uuid;
begin
  if current_setting('role',true) is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if coalesce(p_manifest_fingerprint,'') !~ '^[0-9a-f]{64}$'
     or coalesce(jsonb_typeof(p_manifest),'null')<>'object' or pg_column_size(p_manifest)>32768
     or (select array_agg(key order by key) from jsonb_object_keys(p_manifest) key) is distinct from array[
       'attemptId','clamavEngineVersion','correlationId','detectedInputMime','detectedOutputMime',
       'finalScan','inputRef','inputSha256','inputSize','jobDeadline','nonce','originalScan',
       'outputRef','outputSha256','outputSize','processingDurationMs','purpose','readbackSha256',
       'sanitized','sanitizer','sanitizerVersion','schemaVersion','signatureAgeSeconds',
       'signatureTimestamp','signatureVersion','storageFingerprint'
     ]::text[] then
    raise exception 'INVALID_ATTESTATION';
  end if;
  perform private.media_scan_operation_lock(p_operation_id);
  fingerprint:=private.media_scan_fingerprint(jsonb_build_array('attest',p_attempt_id,p_attempt_token,p_manifest_fingerprint,p_manifest));
  replay:=private.media_scan_replay(p_operation_id,'attest',fingerprint);
  if replay is not null then return replay->'response'; end if;
  select job_id into attempt_job_id from private.media_scan_attempts where id=p_attempt_id;
  select * into job from private.media_scan_jobs where id=attempt_job_id for update;
  select * into attempt from private.media_scan_attempts where id=p_attempt_id for update;
  if attempt.id is null or attempt.job_id is distinct from job.id or attempt.attempt_token_hash is distinct from private.media_scan_token_hash(p_attempt_token) then raise exception 'SCAN_ATTEMPT_STALE'; end if;
  if job.current_attempt_id is distinct from attempt.id or job.state<>'scanning' then raise exception 'SCAN_ATTEMPT_STALE'; end if;
  at_time:=clock_timestamp();
  if not private.media_scan_deadline_is_open(at_time,attempt.processing_deadline) then
    raise exception 'SCAN_ATTEMPT_EXPIRED';
  end if;
  if attempt.state<>'readback_authorized' then raise exception 'SCAN_ATTEMPT_STALE'; end if;
  select * into upload from public.file_uploads where id=job.upload_id;
  select * into input_artifact from private.media_scan_artifacts where attempt_id=attempt.id and kind='scan_input';
  select * into output_artifact from private.media_scan_artifacts where attempt_id=attempt.id and kind='scan_output';
  begin
    signature_time:=(p_manifest->>'signatureTimestamp')::timestamptz;
    signature_age:=(p_manifest->>'signatureAgeSeconds')::integer;
    input_size:=(p_manifest->>'inputSize')::bigint;
    output_size:=(p_manifest->>'outputSize')::bigint;
    processing_duration:=(p_manifest->>'processingDurationMs')::integer;
    sanitized:=(p_manifest->>'sanitized')::boolean;
    job_deadline:=(p_manifest->>'jobDeadline')::timestamptz;
    nonce_id:=(p_manifest->>'nonce')::uuid;
    correlation_id:=(p_manifest->>'correlationId')::uuid;
  exception when others then raise exception 'INVALID_ATTESTATION'; end;
  if p_manifest->>'schemaVersion' is distinct from 'sallah-media-attestation-v1'
     or p_manifest->>'attemptId' is distinct from attempt.id::text
     or p_manifest->>'inputRef' is distinct from input_artifact.path
     or p_manifest->>'outputRef' is distinct from output_artifact.path
     or p_manifest->>'purpose' is distinct from upload.purpose
     or p_manifest->>'detectedInputMime' is distinct from attempt.input_mime_type
     or p_manifest->>'detectedOutputMime' is distinct from attempt.output_mime_type
     or input_size is distinct from attempt.input_size_bytes
     or output_size is distinct from attempt.output_size_bytes
     or p_manifest->>'inputSha256' is distinct from attempt.input_sha256
     or p_manifest->>'outputSha256' is distinct from attempt.output_sha256
     or p_manifest->>'readbackSha256' is distinct from attempt.output_sha256
     or coalesce(p_manifest->>'storageFingerprint','') !~ '^[0-9a-f]{32,64}$'
     or p_manifest->>'originalScan' is distinct from 'clean'
     or p_manifest->>'finalScan' is distinct from 'clean'
     or sanitized is distinct from true
     or p_manifest->>'sanitizer' is distinct from attempt.sanitizer_id
     or p_manifest->>'sanitizerVersion' is distinct from attempt.sanitizer_version
     or coalesce(p_manifest->>'clamavEngineVersion','') !~ '^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$'
     or coalesce(p_manifest->>'signatureVersion','') !~ '^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$'
     or signature_age<0 or signature_age>attempt.signature_max_age_seconds
     or signature_time>at_time
     or signature_time<at_time-make_interval(secs=>attempt.signature_max_age_seconds)
     or abs(signature_age-extract(epoch from (at_time-signature_time)))>5
     or processing_duration not between 0 and 120000
     or job_deadline is distinct from attempt.processing_deadline then
    raise exception 'INVALID_ATTESTATION';
  end if;

  insert into private.media_scanner_attestation_nonces(
    nonce,worker_id,action,attempt_id,manifest_fingerprint,consumed_at,expires_at
  ) values(
    nonce_id,attempt.worker_id,'complete',attempt.id,p_manifest_fingerprint,at_time,
    attempt.processing_deadline+interval '15 seconds'
  ) on conflict(nonce) do nothing;
  if not found then raise exception 'SCANNER_ATTESTATION_NONCE_REPLAY'; end if;

  insert into private.media_scan_attestations(
    job_id,attempt_id,manifest_fingerprint,manifest,scanner_engine_version,
    signature_version,signature_timestamp,signature_age_seconds,sanitizer_id,
    sanitizer_version,processing_duration_ms,correlation_id,nonce
  ) values(
    job.id,attempt.id,p_manifest_fingerprint,p_manifest,p_manifest->>'clamavEngineVersion',
    p_manifest->>'signatureVersion',signature_time,signature_age,attempt.sanitizer_id,
    attempt.sanitizer_version,processing_duration,correlation_id,nonce_id
  );
  update private.media_scan_attempts set
    state='attested',manifest_fingerprint=p_manifest_fingerprint,attested_at=at_time,
    finalization_deadline=processing_deadline+interval '15 seconds',updated_at=at_time
  where id=attempt.id;
  update private.media_scan_artifacts set state='attested',updated_at=at_time
  where attempt_id=attempt.id and kind='scan_output';
  update private.media_scan_artifacts set state='promotion_pending',updated_at=at_time
  where attempt_id=attempt.id and kind='final_candidate';
  response:=jsonb_build_object('attemptId',attempt.id,'status','attested','manifestFingerprint',p_manifest_fingerprint,'finalizationDeadline',attempt.processing_deadline+interval '15 seconds');
  insert into private.media_scan_events(job_id,attempt_id,operation_id,action,fingerprint,response)
  values(job.id,attempt.id,p_operation_id,'attest',fingerprint,response);
  return response;
end
$$;

create function public.finalize_media_scan_job(
  p_attempt_id uuid,p_attempt_token uuid,p_operation_id uuid,p_manifest_fingerprint text
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare at_time timestamptz; attempt_job_id uuid; attempt private.media_scan_attempts%rowtype; job private.media_scan_jobs%rowtype;
  final_artifact private.media_scan_artifacts%rowtype; fingerprint text; replay jsonb; response jsonb;
begin
  if current_setting('role',true) is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  perform private.media_scan_operation_lock(p_operation_id);
  fingerprint:=private.media_scan_fingerprint(jsonb_build_array('finalize',p_attempt_id,p_attempt_token,p_manifest_fingerprint));
  replay:=private.media_scan_replay(p_operation_id,'finalize',fingerprint);
  if replay is not null then return replay->'response'; end if;
  select job_id into attempt_job_id from private.media_scan_attempts where id=p_attempt_id;
  select * into job from private.media_scan_jobs where id=attempt_job_id for update;
  select * into attempt from private.media_scan_attempts where id=p_attempt_id for update;
  if attempt.id is null or attempt.job_id is distinct from job.id or attempt.attempt_token_hash is distinct from private.media_scan_token_hash(p_attempt_token) then raise exception 'SCAN_ATTEMPT_STALE'; end if;
  if job.state='clean' and attempt.state='completed' and attempt.manifest_fingerprint=p_manifest_fingerprint then
    return jsonb_build_object('uploadId',job.upload_id,'status','clean','sanitized',true,'mimeType',job.result_mime_type,'sizeBytes',job.result_size_bytes);
  end if;
  if job.current_attempt_id is distinct from attempt.id or job.state<>'scanning' then raise exception 'SCAN_ATTEMPT_STALE'; end if;
  at_time:=clock_timestamp();
  if attempt.state<>'attested' or attempt.manifest_fingerprint is distinct from p_manifest_fingerprint then raise exception 'SCAN_ATTESTATION_MISMATCH'; end if;
  if attempt.finalization_deadline is null
     or not private.media_scan_deadline_is_open(at_time,attempt.finalization_deadline) then
    raise exception 'SCAN_ATTEMPT_EXPIRED';
  end if;
  select * into final_artifact from private.media_scan_artifacts where attempt_id=attempt.id and kind='final_candidate' for update;
  if final_artifact.state<>'promotion_pending' then raise exception 'FINAL_PROMOTION_NOT_READY'; end if;

  update public.file_uploads set
    status='clean',detected_mime_type=attempt.output_mime_type,size_bytes=attempt.output_size_bytes,
    content_sha256=attempt.output_sha256,final_path=final_artifact.path,sanitized=true,
    scanned_at=at_time,locked_at=null,failure_category=null
  where id=job.upload_id;
  update private.media_scan_jobs set
    state='clean',sanitized=true,result_mime_type=attempt.output_mime_type,
    result_size_bytes=attempt.output_size_bytes,safe_terminal_category=null,retry_at=null,
    updated_at=at_time,completed_at=at_time
  where id=job.id returning * into job;
  update private.media_scan_attempts set state='completed',completed_at=at_time,updated_at=at_time where id=attempt.id;
  update private.media_scan_artifacts set state='retained',updated_at=at_time where id=final_artifact.id;
  update private.media_scan_artifacts set state='cleanup_pending',updated_at=at_time
  where job_id=job.id and state<>'retained' and state<>'deleted';
  response:=jsonb_build_object(
    'uploadId',job.upload_id,'status','clean','sanitized',true,
    'storageBucket',final_artifact.bucket,'storagePath',final_artifact.path,
    'mimeType',job.result_mime_type,'sizeBytes',job.result_size_bytes
  );
  insert into private.media_scan_events(job_id,attempt_id,operation_id,action,fingerprint,response)
  values(job.id,attempt.id,p_operation_id,'finalize',fingerprint,response);
  return response;
end
$$;

create function public.reject_media_scan_job(
  p_attempt_id uuid,p_attempt_token uuid,p_operation_id uuid,p_failure_category text
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare at_time timestamptz; attempt_job_id uuid; attempt private.media_scan_attempts%rowtype; job private.media_scan_jobs%rowtype;
  fingerprint text; replay jsonb; response jsonb;
begin
  if current_setting('role',true) is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if coalesce(p_failure_category,'') !~ '^[a-z][a-z0-9_]{0,63}$' then raise exception 'INVALID_FAILURE_CATEGORY'; end if;
  perform private.media_scan_operation_lock(p_operation_id);
  fingerprint:=private.media_scan_fingerprint(jsonb_build_array('reject',p_attempt_id,p_attempt_token,p_failure_category));
  replay:=private.media_scan_replay(p_operation_id,'reject',fingerprint);
  if replay is not null then return replay->'response'; end if;
  select job_id into attempt_job_id from private.media_scan_attempts where id=p_attempt_id;
  select * into job from private.media_scan_jobs where id=attempt_job_id for update;
  select * into attempt from private.media_scan_attempts where id=p_attempt_id for update;
  if attempt.id is null or attempt.job_id is distinct from job.id or attempt.attempt_token_hash is distinct from private.media_scan_token_hash(p_attempt_token) then raise exception 'SCAN_ATTEMPT_STALE'; end if;
  if job.current_attempt_id is distinct from attempt.id or job.state<>'scanning' then raise exception 'SCAN_ATTEMPT_STALE'; end if;
  at_time:=clock_timestamp();
  if at_time>=attempt.processing_deadline then raise exception 'SCAN_ATTEMPT_EXPIRED'; end if;
  if attempt.state not in ('processing','output_prepared','readback_authorized') then raise exception 'SCAN_ATTEMPT_STALE'; end if;
  update private.media_scan_attempts set state='rejected',terminal_category=p_failure_category,updated_at=at_time,completed_at=at_time where id=attempt.id;
  update private.media_scan_jobs set state='rejected',safe_terminal_category=p_failure_category,retry_at=null,updated_at=at_time,completed_at=at_time where id=job.id returning * into job;
  update public.file_uploads set status='rejected',failure_category=p_failure_category,locked_at=null,final_path=null,content_sha256=null where id=job.upload_id;
  update private.media_scan_artifacts set state='cleanup_pending',updated_at=at_time where job_id=job.id and state<>'retained' and state<>'deleted';
  response:=private.media_scan_safe_response(job);
  insert into private.media_scan_events(job_id,attempt_id,operation_id,action,fingerprint,response)
  values(job.id,attempt.id,p_operation_id,'reject',fingerprint,response);
  return response;
end
$$;

create function public.fail_media_scan_attempt(
  p_attempt_id uuid,p_attempt_token uuid,p_operation_id uuid,p_failure_category text
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare at_time timestamptz; attempt_job_id uuid; attempt private.media_scan_attempts%rowtype; job private.media_scan_jobs%rowtype;
  fingerprint text; replay jsonb; response jsonb; terminal boolean;
begin
  if current_setting('role',true) is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if coalesce(p_failure_category,'') !~ '^[a-z][a-z0-9_]{0,63}$' then raise exception 'INVALID_FAILURE_CATEGORY'; end if;
  perform private.media_scan_operation_lock(p_operation_id);
  fingerprint:=private.media_scan_fingerprint(jsonb_build_array('fail',p_attempt_id,p_attempt_token,p_failure_category));
  replay:=private.media_scan_replay(p_operation_id,'fail',fingerprint);
  if replay is not null then return replay->'response'; end if;
  select job_id into attempt_job_id from private.media_scan_attempts where id=p_attempt_id;
  select * into job from private.media_scan_jobs where id=attempt_job_id for update;
  select * into attempt from private.media_scan_attempts where id=p_attempt_id for update;
  if attempt.id is null or attempt.job_id is distinct from job.id or attempt.attempt_token_hash is distinct from private.media_scan_token_hash(p_attempt_token) then raise exception 'SCAN_ATTEMPT_STALE'; end if;
  if job.current_attempt_id is distinct from attempt.id or job.state<>'scanning' then raise exception 'SCAN_ATTEMPT_STALE'; end if;
  at_time:=clock_timestamp();
  if at_time>=attempt.processing_deadline then raise exception 'SCAN_ATTEMPT_EXPIRED'; end if;
  if attempt.state not in ('processing','output_prepared','readback_authorized') then raise exception 'SCAN_ATTEMPT_STALE'; end if;
  terminal:=job.attempt_count>=3;
  update private.media_scan_attempts set
    state=case when terminal then 'terminal_failure' else 'retryable_failure' end,
    terminal_category=p_failure_category,updated_at=at_time,completed_at=at_time
  where id=attempt.id;
  update private.media_scan_jobs set
    state=case when terminal then 'terminal_failure' else 'retryable_failure' end,
    safe_terminal_category=p_failure_category,
    retry_at=case when terminal then null else at_time+interval '5 seconds' end,
    updated_at=at_time,completed_at=case when terminal then at_time else null end
  where id=job.id returning * into job;
  update public.file_uploads set
    status=case when terminal then 'rejected' else 'failed' end,
    failure_category=p_failure_category,locked_at=null
  where id=job.upload_id;
  if terminal then
    update private.media_scan_artifacts set state='cleanup_pending',updated_at=at_time
    where job_id=job.id and state not in ('retained','deleted');
  else
    update private.media_scan_artifacts set state='cleanup_pending',updated_at=at_time
    where attempt_id=attempt.id and state not in ('retained','deleted');
  end if;
  response:=private.media_scan_safe_response(job);
  insert into private.media_scan_events(job_id,attempt_id,operation_id,action,fingerprint,response)
  values(job.id,attempt.id,p_operation_id,'fail',fingerprint,response);
  return response;
end
$$;

create function public.get_media_scan_attempt_status(
  p_attempt_id uuid,p_attempt_token uuid
) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare attempt private.media_scan_attempts%rowtype; job private.media_scan_jobs%rowtype;
  upload public.file_uploads%rowtype;
  input_artifact private.media_scan_artifacts%rowtype;
  output_artifact private.media_scan_artifacts%rowtype;
  final_artifact private.media_scan_artifacts%rowtype;
begin
  if current_setting('role',true) is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select * into attempt from private.media_scan_attempts where id=p_attempt_id;
  if attempt.id is null or attempt.attempt_token_hash is distinct from private.media_scan_token_hash(p_attempt_token) then raise exception 'SCAN_ATTEMPT_STALE'; end if;
  select * into job from private.media_scan_jobs where id=attempt.job_id;
  select * into upload from public.file_uploads where id=job.upload_id;
  select * into input_artifact from private.media_scan_artifacts where attempt_id=attempt.id and kind='scan_input';
  select * into output_artifact from private.media_scan_artifacts where attempt_id=attempt.id and kind='scan_output';
  select * into final_artifact from private.media_scan_artifacts where attempt_id=attempt.id and kind='final_candidate';
  return jsonb_build_object(
    'jobId',job.id,'attemptId',attempt.id,'jobState',job.state,'attemptState',attempt.state,
    'workerId',attempt.worker_id,
    'current',job.current_attempt_id=attempt.id and job.state='scanning',
    'claimedAt',attempt.claimed_at,
    'processingDeadline',attempt.processing_deadline,'finalizationDeadline',attempt.finalization_deadline,
    'purpose',upload.purpose,'declaredMimeType',upload.declared_mime_type,
    'detectedInputMime',attempt.input_mime_type,'detectedOutputMime',attempt.output_mime_type,
    'inputSize',attempt.input_size_bytes,'outputSize',attempt.output_size_bytes,
    'inputSha256',attempt.input_sha256,'outputSha256',attempt.output_sha256,
    'sanitizer',attempt.sanitizer_id,'sanitizerVersion',attempt.sanitizer_version,
    'manifestFingerprint',attempt.manifest_fingerprint,
    'inputBucket',input_artifact.bucket,'inputPath',input_artifact.path,
    'inputArtifactState',input_artifact.state,
    'outputBucket',output_artifact.bucket,'outputPath',output_artifact.path,
    'outputArtifactState',output_artifact.state,
    'finalBucket',final_artifact.bucket,'finalPath',final_artifact.path,
    'finalArtifactState',final_artifact.state
  );
end
$$;

create function public.consume_media_scanner_nonce(
  p_worker_id text,p_action text,p_nonce uuid,p_request_timestamp bigint,p_body_sha256 text,p_operation_id uuid
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare at_time timestamptz; fingerprint text; response jsonb;
begin
  if current_setting('role',true) is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if coalesce(p_worker_id,'') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,119}$'
     or coalesce(p_action,'') !~ '^[a-z][a-z0-9_]{0,63}$'
     or coalesce(p_body_sha256,'') !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_SCANNER_REQUEST';
  end if;
  perform private.media_scan_operation_lock(p_operation_id);
  fingerprint:=private.media_scan_fingerprint(jsonb_build_array(
    'consume_nonce',p_worker_id,p_action,p_nonce,p_request_timestamp,p_body_sha256
  ));
  at_time:=clock_timestamp();
  if exists(select 1 from private.media_scanner_nonces where nonce=p_nonce) then raise exception 'SCANNER_NONCE_REPLAY'; end if;
  if abs(extract(epoch from at_time)::bigint-p_request_timestamp)>30 then raise exception 'SCANNER_TIMESTAMP_OUTSIDE_WINDOW'; end if;
  insert into private.media_scanner_nonces(
    nonce,worker_id,action,request_timestamp,body_sha256,operation_id,consumed_at,expires_at
  ) values(
    p_nonce,p_worker_id,p_action,p_request_timestamp,p_body_sha256,p_operation_id,
    at_time,at_time+interval '10 minutes'
  )
  on conflict(nonce) do nothing;
  if not found then raise exception 'SCANNER_NONCE_REPLAY'; end if;
  response:=jsonb_build_object(
    'accepted',true,'workerId',p_worker_id,'action',p_action,'nonce',p_nonce,
    'timestamp',p_request_timestamp
  );
  insert into private.media_scan_events(operation_id,action,fingerprint,response)
  values(p_operation_id,'consume_nonce',fingerprint,response);
  return response;
end
$$;

create function public.claim_media_scan_artifact_cleanup(
  p_worker_id text,p_operation_id uuid,p_cleanup_token_hash text
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare at_time timestamptz; artifact private.media_scan_artifacts%rowtype;
  orphan_upload_id uuid; orphan_upload public.file_uploads%rowtype;
  orphan_job private.media_scan_jobs%rowtype;
  fingerprint text; replay jsonb; response jsonb;
begin
  if current_setting('role',true) is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if coalesce(p_worker_id,'') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,119}$' then raise exception 'INVALID_WORKER_ID'; end if;
  if coalesce(p_cleanup_token_hash,'') !~ '^[0-9a-f]{64}$' then raise exception 'INVALID_CLEANUP_TOKEN_HASH'; end if;
  perform private.media_scan_operation_lock(p_operation_id);
  fingerprint:=private.media_scan_fingerprint(jsonb_build_array('claim_cleanup',p_worker_id,p_cleanup_token_hash));
  replay:=private.media_scan_replay(p_operation_id,'claim_cleanup',fingerprint);
  if replay is not null then return replay->'response'; end if;
  at_time:=clock_timestamp();

  -- A client may upload the quarantine object and lose its response before the
  -- first scan start. Project one expired, unstarted ticket into the V2 private
  -- cleanup authority. The advisory lock matches start_or_get_media_scan so a
  -- late owner start and cleanup cannot create competing jobs.
  select f.id into orphan_upload_id
  from public.file_uploads f
  where f.quarantine_cleaned_at is null
    and (f.expires_at<=at_time or f.status in ('clean','rejected','expired'))
    and not exists(select 1 from private.media_scan_jobs j where j.upload_id=f.id)
  order by f.created_at,f.id
  limit 1;
  if orphan_upload_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('media_scan_start:'||orphan_upload_id::text,0)
    );
    select f.* into orphan_upload
    from public.file_uploads f
    where f.id=orphan_upload_id
      and f.quarantine_cleaned_at is null
      and (f.expires_at<=at_time or f.status in ('clean','rejected','expired'))
      and not exists(select 1 from private.media_scan_jobs j where j.upload_id=f.id)
    for update;
    if orphan_upload.id is not null then
      orphan_job:=private.media_scan_adopt_untracked_upload(orphan_upload,at_time);
      insert into private.media_scan_events(job_id,operation_id,action,fingerprint,response)
      values(
        orphan_job.id,gen_random_uuid(),'untracked_quarantine_aged',
        private.media_scan_fingerprint(jsonb_build_array(
          'untracked_quarantine_aged',orphan_upload.id
        )),
        jsonb_build_object('status','cleanup_pending')
      );
    end if;
  end if;

  with aged as (
    update private.media_scan_artifacts a set
      state='cleanup_pending',cleanup_token_hash=null,cleanup_worker_id=null,
      cleanup_lease_expires_at=null,cleanup_retry_at=null,updated_at=at_time
    from private.media_scan_jobs j
    left join private.media_scan_attempts current_attempt
      on current_attempt.id=j.current_attempt_id
    where a.job_id=j.id
      and a.created_at<=at_time-interval '24 hours'
      and a.state not in (
        'retained','cleanup_pending','cleanup_claimed','cleanup_failed',
        'cleanup_dead_letter','deleted'
      )
      and not (
        j.state='scanning'
        and j.current_attempt_id is not null
        and current_attempt.state in ('processing','output_prepared','readback_authorized','attested')
        and coalesce(current_attempt.finalization_deadline,current_attempt.processing_deadline)>at_time
        and (a.attempt_id=j.current_attempt_id or a.kind='quarantine')
      )
    returning a.id,a.job_id,a.attempt_id
  )
  insert into private.media_scan_events(job_id,attempt_id,operation_id,action,fingerprint,response)
  select aged.job_id,aged.attempt_id,gen_random_uuid(),'artifact_cleanup_aged',
    private.media_scan_fingerprint(jsonb_build_array('artifact_cleanup_aged',aged.id)),
    jsonb_build_object('artifactId',aged.id,'status','cleanup_pending')
  from aged;

  with dead_lettered as (
    update private.media_scan_artifacts a set
      state='cleanup_dead_letter',cleanup_token_hash=null,cleanup_worker_id=null,
      cleanup_lease_expires_at=null,cleanup_retry_at=null,updated_at=at_time
    where a.cleanup_attempts>=20
      and (
        a.state='cleanup_failed'
        or (a.state='cleanup_claimed' and a.cleanup_lease_expires_at<=at_time)
      )
    returning a.id,a.job_id,a.attempt_id
  )
  insert into private.media_scan_events(job_id,attempt_id,operation_id,action,fingerprint,response)
  select dead_lettered.job_id,dead_lettered.attempt_id,gen_random_uuid(),
    'artifact_cleanup_dead_lettered',
    private.media_scan_fingerprint(jsonb_build_array('artifact_cleanup_dead_lettered',dead_lettered.id)),
    jsonb_build_object('artifactId',dead_lettered.id,'status','cleanup_dead_letter')
  from dead_lettered;

  select a.* into artifact
  from private.media_scan_artifacts a
  where
    a.state='cleanup_pending'
    or (
      a.state='cleanup_failed' and a.cleanup_attempts<20
      and a.cleanup_retry_at<=at_time
    )
    or (
      a.state='cleanup_claimed' and a.cleanup_attempts<20
      and a.cleanup_lease_expires_at<=at_time
    )
  order by a.created_at,a.id
  limit 1 for update skip locked;
  if artifact.id is null then
    insert into private.media_scan_events(operation_id,action,fingerprint,response)
    values(p_operation_id,'claim_cleanup',fingerprint,null);
    return null;
  end if;
  if artifact.state='retained' then raise exception 'RETAINED_ARTIFACT_CANNOT_BE_CLEANED'; end if;
  update private.media_scan_artifacts set
    state='cleanup_claimed',cleanup_token_hash=p_cleanup_token_hash,
    cleanup_worker_id=p_worker_id,cleanup_lease_expires_at=at_time+interval '5 minutes',
    cleanup_retry_at=null,cleanup_attempts=cleanup_attempts+1,updated_at=at_time
  where id=artifact.id returning * into artifact;
  response:=jsonb_build_object(
    'artifactId',artifact.id,'kind',artifact.kind,'bucket',artifact.bucket,'path',artifact.path,
    'leaseExpiresAt',artifact.cleanup_lease_expires_at
  );
  insert into private.media_scan_events(job_id,attempt_id,operation_id,action,fingerprint,response)
  values(artifact.job_id,artifact.attempt_id,p_operation_id,'claim_cleanup',fingerprint,response);
  return response;
end
$$;

create function public.cleanup_expired_media_scanner_nonces(
  p_operation_id uuid
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare at_time timestamptz; fingerprint text; replay jsonb; response jsonb;
  request_deleted integer:=0; attestation_deleted integer:=0;
begin
  if current_setting('role',true) is distinct from 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED';
  end if;
  perform private.media_scan_operation_lock(p_operation_id);
  fingerprint:=private.media_scan_fingerprint(jsonb_build_array('cleanup_expired_scanner_nonces'));
  replay:=private.media_scan_replay(p_operation_id,'cleanup_expired_scanner_nonces',fingerprint);
  if replay is not null then return replay->'response'; end if;
  at_time:=clock_timestamp();
  delete from private.media_scanner_nonces where expires_at<=at_time;
  get diagnostics request_deleted=row_count;
  delete from private.media_scanner_attestation_nonces where expires_at<=at_time;
  get diagnostics attestation_deleted=row_count;
  response:=jsonb_build_object(
    'deleted',request_deleted+attestation_deleted,
    'requestNoncesDeleted',request_deleted,
    'attestationNoncesDeleted',attestation_deleted
  );
  insert into private.media_scan_events(operation_id,action,fingerprint,response)
  values(p_operation_id,'cleanup_expired_scanner_nonces',fingerprint,response);
  return response;
end
$$;

create function public.complete_media_scan_artifact_cleanup(
  p_artifact_id uuid,p_cleanup_token uuid,p_worker_id text,p_operation_id uuid
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare at_time timestamptz; artifact private.media_scan_artifacts%rowtype;
  upload public.file_uploads%rowtype;
  fingerprint text; replay jsonb; response jsonb;
begin
  if current_setting('role',true) is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  perform private.media_scan_operation_lock(p_operation_id);
  fingerprint:=private.media_scan_fingerprint(jsonb_build_array('complete_cleanup',p_artifact_id,p_cleanup_token,p_worker_id));
  replay:=private.media_scan_replay(p_operation_id,'complete_cleanup',fingerprint);
  if replay is not null then return replay->'response'; end if;
  select * into artifact from private.media_scan_artifacts where id=p_artifact_id for update;
  if artifact.id is null or artifact.state<>'cleanup_claimed'
     or artifact.cleanup_token_hash is distinct from private.media_scan_token_hash(p_cleanup_token)
     or artifact.cleanup_worker_id is distinct from p_worker_id then raise exception 'ARTIFACT_CLEANUP_NOT_CLAIMED'; end if;
  at_time:=clock_timestamp();
  if artifact.cleanup_lease_expires_at<=at_time then raise exception 'ARTIFACT_CLEANUP_LEASE_EXPIRED'; end if;
  update private.media_scan_artifacts set
    state='deleted',cleanup_token_hash=null,cleanup_worker_id=null,cleanup_lease_expires_at=null,
    cleanup_retry_at=null,
    updated_at=at_time,deleted_at=at_time
  where id=artifact.id;
  if artifact.kind='quarantine' then
    select f.* into upload
    from public.file_uploads f
    join private.media_scan_jobs j on j.upload_id=f.id
    where j.id=artifact.job_id
    for update of f;
    update public.file_uploads set
      quarantine_cleaned_at=at_time,quarantine_cleanup_claimed_at=null,
      quarantine_cleanup_worker_id=null
    where id=upload.id;
    update public.scheduled_jobs set
      status='completed',completed_at=at_time,locked_at=null,error_category=null
    where job_type='upload_quarantine_cleanup'
      and payload->>'uploadId'=upload.id::text
      and status in ('pending','processing');
    insert into public.upload_security_events(upload_id,user_id,event_type,metadata)
    values(upload.id,upload.user_id,'quarantine_cleaned','{}'::jsonb);
  end if;
  response:=jsonb_build_object('artifactId',artifact.id,'status','deleted');
  insert into private.media_scan_events(job_id,attempt_id,operation_id,action,fingerprint,response)
  values(artifact.job_id,artifact.attempt_id,p_operation_id,'complete_cleanup',fingerprint,response);
  return response;
end
$$;

create function public.fail_media_scan_artifact_cleanup(
  p_artifact_id uuid,p_cleanup_token uuid,p_worker_id text,p_operation_id uuid,p_failure_category text
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare at_time timestamptz; artifact private.media_scan_artifacts%rowtype;
  fingerprint text; replay jsonb; response jsonb;
begin
  if current_setting('role',true) is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if coalesce(p_failure_category,'') !~ '^[a-z][a-z0-9_]{0,63}$' then raise exception 'INVALID_FAILURE_CATEGORY'; end if;
  perform private.media_scan_operation_lock(p_operation_id);
  fingerprint:=private.media_scan_fingerprint(jsonb_build_array('fail_cleanup',p_artifact_id,p_cleanup_token,p_worker_id,p_failure_category));
  replay:=private.media_scan_replay(p_operation_id,'fail_cleanup',fingerprint);
  if replay is not null then return replay->'response'; end if;
  select * into artifact from private.media_scan_artifacts where id=p_artifact_id for update;
  at_time:=clock_timestamp();
  if artifact.id is null or artifact.state<>'cleanup_claimed'
     or artifact.cleanup_token_hash is distinct from private.media_scan_token_hash(p_cleanup_token)
     or artifact.cleanup_worker_id is distinct from p_worker_id then raise exception 'ARTIFACT_CLEANUP_NOT_CLAIMED'; end if;
  if artifact.cleanup_lease_expires_at<=at_time then raise exception 'ARTIFACT_CLEANUP_LEASE_EXPIRED'; end if;
  update private.media_scan_artifacts set
    state=case when cleanup_attempts>=20 then 'cleanup_dead_letter' else 'cleanup_failed' end,
    cleanup_token_hash=null,cleanup_worker_id=null,
    cleanup_lease_expires_at=null,
    cleanup_retry_at=case when cleanup_attempts>=20 then null else at_time+interval '15 minutes' end,
    updated_at=at_time
  where id=artifact.id returning * into artifact;
  response:=jsonb_build_object(
    'artifactId',artifact.id,'status',artifact.state,'category',p_failure_category
  );
  insert into private.media_scan_events(job_id,attempt_id,operation_id,action,fingerprint,response)
  values(artifact.job_id,artifact.attempt_id,p_operation_id,'fail_cleanup',fingerprint,response);
  return response;
end
$$;

-- Provider-document clients submit only the upload ticket identity. The
-- authoritative onboarding body remains intact but is no longer a public
-- trust boundary; this wrapper resolves every sensitive Storage field from a
-- locked, actor-owned clean upload.
alter function public.upsert_provider_onboarding(jsonb)
  rename to upsert_provider_onboarding_trusted_legacy;
alter function public.upsert_provider_onboarding_trusted_legacy(jsonb)
  set schema private;

revoke all on function private.upsert_provider_onboarding_trusted_legacy(jsonb)
  from public,anon,authenticated,service_role;

create function public.upsert_provider_onboarding(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=(select auth.uid());
  documents jsonb;
  document jsonb;
  trusted_documents jsonb:='[]'::jsonb;
  trusted_payload jsonb:=payload;
  upload public.file_uploads%rowtype;
  upload_id uuid;
  seen_upload_ids uuid[]:='{}'::uuid[];
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if payload is null or jsonb_typeof(payload)<>'object' then
    raise exception 'INVALID_PROVIDER_ONBOARDING_PAYLOAD';
  end if;
  if payload ? 'documents' and jsonb_typeof(payload->'documents')<>'array' then
    raise exception 'INVALID_PROVIDER_DOCUMENT_CONTRACT';
  end if;

  documents:=coalesce(payload->'documents','[]'::jsonb);
  for document in select value from jsonb_array_elements(documents) loop
    if jsonb_typeof(document)<>'object'
       or (select count(*) from jsonb_object_keys(document))<>2
       or not (document ?& array['uploadId','documentType'])
       or coalesce(document->>'documentType','') !~ '^[a-z][a-z0-9_]{0,63}$' then
      raise exception 'INVALID_PROVIDER_DOCUMENT_CONTRACT';
    end if;
    begin
      upload_id:=(document->>'uploadId')::uuid;
    exception when invalid_text_representation then
      raise exception 'INVALID_PROVIDER_DOCUMENT_CONTRACT';
    end;
    if upload_id is null then raise exception 'INVALID_PROVIDER_DOCUMENT_CONTRACT'; end if;
    if upload_id=any(seen_upload_ids) then raise exception 'DUPLICATE_PROVIDER_DOCUMENT'; end if;
    seen_upload_ids:=array_append(seen_upload_ids,upload_id);

    select * into upload from public.file_uploads where id=upload_id for update;
    if upload.id is null
       or upload.user_id is distinct from actor
       or upload.purpose<>'provider_document'
       or upload.status<>'clean'
       or upload.final_path is null
       or coalesce(upload.content_sha256,'') !~ '^[0-9a-f]{64}$'
       or upload.detected_mime_type is null
       or upload.size_bytes not between 1 and 20971520 then
      raise exception 'CLEAN_PROVIDER_DOCUMENT_REQUIRED';
    end if;
    trusted_documents:=trusted_documents||jsonb_build_array(jsonb_build_object(
      'documentType',document->>'documentType',
      'storagePath',upload.final_path,
      'contentHash',upload.content_sha256,
      'mimeType',upload.detected_mime_type,
      'sizeBytes',upload.size_bytes
    ));
  end loop;

  if payload ? 'documents' then
    trusted_payload:=jsonb_set(payload,'{documents}',trusted_documents,false);
  end if;
  return private.upsert_provider_onboarding_trusted_legacy(trusted_payload);
end
$$;

revoke all on function public.upsert_provider_onboarding(jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.upsert_provider_onboarding(jsonb) to authenticated;

-- The provider may inspect safe review metadata, never the final Storage path
-- or content fingerprint used internally by verification workflows.
revoke select on public.provider_documents from authenticated;
revoke insert on public.provider_documents from authenticated;
grant select(
  id,provider_id,document_type,mime_type,size_bytes,status,expires_at,created_at,deleted_at
) on public.provider_documents to authenticated;

-- Retire every synchronous scanner and whole-upload cleanup entry point.
revoke all on function public.claim_file_upload(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.complete_file_upload(uuid,uuid,text,bigint,text,text,text,boolean) from public,anon,authenticated,service_role;
revoke all on function public.reject_file_upload(uuid,uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.fail_file_upload(uuid,uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.claim_upload_quarantine_cleanup(text) from public,anon,authenticated,service_role;
revoke all on function public.complete_upload_quarantine_cleanup(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.fail_upload_quarantine_cleanup(uuid,text,text) from public,anon,authenticated,service_role;

do $$
begin
  if to_regprocedure('public.complete_file_upload_v2(uuid,uuid,uuid,text,text,bigint,text,text,text,boolean,text,text,text,text)') is not null then
    execute 'revoke all on function public.complete_file_upload_v2(uuid,uuid,uuid,text,text,bigint,text,text,text,boolean,text,text,text,text) from public,anon,authenticated,service_role';
  end if;
  if to_regprocedure('public.reject_file_upload_v2(uuid,uuid,uuid,text,text,text,text,text)') is not null then
    execute 'revoke all on function public.reject_file_upload_v2(uuid,uuid,uuid,text,text,text,text,text) from public,anon,authenticated,service_role';
  end if;
  if to_regprocedure('public.fail_file_upload_v2(uuid,uuid,uuid,text,text,text,text,text)') is not null then
    execute 'revoke all on function public.fail_file_upload_v2(uuid,uuid,uuid,text,text,text,text,text) from public,anon,authenticated,service_role';
  end if;
end
$$;

revoke all on function public.claim_media_scan_job(text,uuid,text,timestamptz,integer) from public,anon,authenticated,service_role;
revoke all on function public.heartbeat_media_scan_attempt(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.prepare_media_scan_output(uuid,uuid,uuid,text,text,text,bigint,bigint,text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.authorize_media_scan_readback(uuid,uuid,uuid,bigint,text) from public,anon,authenticated,service_role;
revoke all on function public.record_media_scan_attestation(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.finalize_media_scan_job(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.reject_media_scan_job(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.fail_media_scan_attempt(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.get_media_scan_attempt_status(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.consume_media_scanner_nonce(text,text,uuid,bigint,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.claim_media_scan_artifact_cleanup(text,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.complete_media_scan_artifact_cleanup(uuid,uuid,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.fail_media_scan_artifact_cleanup(uuid,uuid,text,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.cleanup_expired_media_scanner_nonces(uuid)
from public,anon,authenticated,service_role;

grant execute on function public.claim_media_scan_job(text,uuid,text,timestamptz,integer) to service_role;
grant execute on function public.heartbeat_media_scan_attempt(uuid,uuid,uuid) to service_role;
grant execute on function public.prepare_media_scan_output(uuid,uuid,uuid,text,text,text,bigint,bigint,text,text,text,text) to service_role;
grant execute on function public.authorize_media_scan_readback(uuid,uuid,uuid,bigint,text) to service_role;
grant execute on function public.record_media_scan_attestation(uuid,uuid,uuid,text,jsonb) to service_role;
grant execute on function public.finalize_media_scan_job(uuid,uuid,uuid,text) to service_role;
grant execute on function public.reject_media_scan_job(uuid,uuid,uuid,text) to service_role;
grant execute on function public.fail_media_scan_attempt(uuid,uuid,uuid,text) to service_role;
grant execute on function public.get_media_scan_attempt_status(uuid,uuid) to service_role;
grant execute on function public.consume_media_scanner_nonce(text,text,uuid,bigint,text,uuid) to service_role;
grant execute on function public.claim_media_scan_artifact_cleanup(text,uuid,text) to service_role;
grant execute on function public.complete_media_scan_artifact_cleanup(uuid,uuid,text,uuid) to service_role;
grant execute on function public.fail_media_scan_artifact_cleanup(uuid,uuid,text,uuid,text) to service_role;
grant execute on function public.cleanup_expired_media_scanner_nonces(uuid) to service_role;

comment on function public.start_or_get_media_scan(uuid,uuid) is 'Owner-safe asynchronous scan start/status/replay with exact caller operation receipt; metadata only.';
comment on function public.claim_media_scan_job(text,uuid,text,timestamptz,integer) is 'Service-only one-winner attempt claim with immutable 120-second deadline and opaque paths.';
comment on table private.media_scan_attestations is 'Private bounded scanner manifests; never exposed to upload owners.';

commit;
