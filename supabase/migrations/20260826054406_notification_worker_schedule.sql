begin;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function private.invoke_notification_worker_schedule() returns void
language plpgsql security definer set search_path='' as $$
declare
  worker_url text;
  worker_secret text;
  media_cleanup_secret text;
begin
  select decrypted_secret into worker_url
  from vault.decrypted_secrets
  where name='sallah_preview_notification_worker_url';

  select decrypted_secret into worker_secret
  from vault.decrypted_secrets
  where name='sallah_preview_notification_worker_secret';

  select decrypted_secret into media_cleanup_secret
  from vault.decrypted_secrets
  where name='sallah_media_scan_privacy_worker_secret';

  if worker_url is null or worker_secret is null then
    raise exception 'NOTIFICATION_WORKER_CONFIGURATION_MISSING';
  end if;

  if worker_url !~ '^https://[a-z0-9]{20}\.supabase\.co/functions/v1/notification-worker$'
     or octet_length(convert_to(worker_secret,'UTF8')) not between 32 and 256
     or worker_secret is not distinct from media_cleanup_secret then
    raise exception 'NOTIFICATION_WORKER_CONFIGURATION_INVALID';
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

revoke all on function private.invoke_notification_worker_schedule()
from public,anon,authenticated,service_role;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname='sallah-notification-worker';

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;

  perform cron.schedule(
    'sallah-notification-worker',
    '* * * * *',
    'select private.invoke_notification_worker_schedule();'
  );
end
$$;

commit;
