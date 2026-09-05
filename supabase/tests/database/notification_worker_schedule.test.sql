begin;
select no_plan();

select has_extension('pg_cron','the notification worker uses the hosted cron scheduler');
select has_extension('pg_net','the notification worker uses the bounded asynchronous HTTP client');
select has_function(
  'private',
  'invoke_notification_worker_schedule',
  array[]::text[],
  'the scheduler invokes a private no-argument notification dispatcher'
);
select function_privs_are(
  'private',
  'invoke_notification_worker_schedule',
  array[]::text[],
  'authenticated',
  array[]::text[],
  'signed-in users cannot invoke the notification dispatcher'
);
select function_privs_are(
  'private',
  'invoke_notification_worker_schedule',
  array[]::text[],
  'service_role',
  array[]::text[],
  'the broad service role cannot invoke the notification dispatcher'
);

select is(
  (select count(*) from cron.job where jobname='sallah-notification-worker'),
  1::bigint,
  'exactly one notification worker schedule is installed'
);
select is(
  (select schedule from cron.job where jobname='sallah-notification-worker'),
  '* * * * *',
  'notification delivery runs at a bounded one-minute cadence'
);
select is(
  (select command from cron.job where jobname='sallah-notification-worker'),
  'select private.invoke_notification_worker_schedule();',
  'the cron command contains no URL or secret material'
);
select ok(
  (select command !~* 'https?://|authorization|x-worker-secret|vault|secret'
   from cron.job where jobname='sallah-notification-worker'),
  'the persisted schedule does not expose endpoint or credential material'
);

do $$
declare
  item record;
begin
  for item in
    select id,name
    from vault.decrypted_secrets
    where name in (
      'sallah_preview_notification_worker_url',
      'sallah_preview_notification_worker_secret',
      'sallah_media_scan_privacy_worker_secret'
    )
  loop
    perform vault.update_secret(
      item.id,
      new_name:=item.name||'_test_backup_'||item.id::text
    );
  end loop;
end
$$;

select throws_ok(
  $$select private.invoke_notification_worker_schedule()$$,
  'NOTIFICATION_WORKER_CONFIGURATION_MISSING',
  'missing Preview scheduler configuration fails closed'
);

select vault.create_secret(
  'http://abcdefghijklmnopqrst.supabase.co/functions/v1/notification-worker',
  'sallah_preview_notification_worker_url'
);
select vault.create_secret(
  repeat('n',32),
  'sallah_preview_notification_worker_secret'
);
select throws_ok(
  $$select private.invoke_notification_worker_schedule()$$,
  'NOTIFICATION_WORKER_CONFIGURATION_INVALID',
  'a non-HTTPS notification worker origin fails closed'
);

select vault.update_secret(
  (select id from vault.decrypted_secrets
   where name='sallah_preview_notification_worker_url'),
  'https://abcdefghijklmnopqrst.supabase.co/functions/v1/notification-worker?debug=1'
);
select throws_ok(
  $$select private.invoke_notification_worker_schedule()$$,
  'NOTIFICATION_WORKER_CONFIGURATION_INVALID',
  'query-bearing notification worker URLs fail closed'
);

select vault.update_secret(
  (select id from vault.decrypted_secrets
   where name='sallah_preview_notification_worker_url'),
  'https://abcdefghijklmnopqrst.supabase.co/functions/v1/notification-worker'
);
select vault.update_secret(
  (select id from vault.decrypted_secrets
   where name='sallah_preview_notification_worker_secret'),
  repeat('s',31)
);
select throws_ok(
  $$select private.invoke_notification_worker_schedule()$$,
  'NOTIFICATION_WORKER_CONFIGURATION_INVALID',
  'notification worker secrets shorter than 32 bytes fail closed'
);

select vault.update_secret(
  (select id from vault.decrypted_secrets
   where name='sallah_preview_notification_worker_secret'),
  repeat('s',257)
);
select throws_ok(
  $$select private.invoke_notification_worker_schedule()$$,
  'NOTIFICATION_WORKER_CONFIGURATION_INVALID',
  'notification worker secrets longer than 256 bytes fail closed'
);

select vault.update_secret(
  (select id from vault.decrypted_secrets
   where name='sallah_preview_notification_worker_secret'),
  repeat('d',32)
);
select vault.create_secret(
  repeat('d',32),
  'sallah_media_scan_privacy_worker_secret'
);
select throws_ok(
  $$select private.invoke_notification_worker_schedule()$$,
  'NOTIFICATION_WORKER_CONFIGURATION_INVALID',
  'notification and media-cleanup workers cannot share one credential'
);

select vault.update_secret(
  (select id from vault.decrypted_secrets
   where name='sallah_media_scan_privacy_worker_secret'),
  repeat('m',32)
);
select lives_ok(
  $$select private.invoke_notification_worker_schedule()$$,
  'an exact hosted Preview URL and distinct bounded secret enqueue the worker request'
);

select * from finish();
rollback;
