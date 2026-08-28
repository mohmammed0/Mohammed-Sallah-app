begin;
select plan(66);

insert into auth.users(id,email) values
  ('fa800000-0000-4000-8000-000000000001','push-customer@example.test'),
  ('fa800000-0000-4000-8000-000000000002','push-provider@example.test');
update public.profiles set display_name='Push Customer',preferred_locale='ar'
where id='fa800000-0000-4000-8000-000000000001';
update public.profiles set display_name='Push Provider',preferred_locale='ur'
where id='fa800000-0000-4000-8000-000000000002';
insert into public.user_roles(user_id,role) values
  ('fa800000-0000-4000-8000-000000000002','provider')
on conflict do nothing;

update public.notification_outbox set status='disabled' where channel='push';

select is(private.push_destination('new_offer'),'offers','new offers route to customer offers');
select is(
  private.push_destination('provider_matched'),'provider_feed',
  'matching routes to the provider feed'
);
select is(
  private.push_destination('message_created'),'messages',
  'conversation activity routes to authorized messages'
);
select is(
  private.push_destination('job_status_transitioned'),'jobs',
  'job lifecycle activity routes to authorized jobs'
);
select is(
  private.push_destination('change_order_approved'),'jobs',
  'change-order decisions route to authorized jobs'
);
select is(
  private.push_destination('support_case_updated'),'support',
  'support updates route to the authorized support view'
);
select is(
  private.push_destination('moderation_action'),'account',
  'moderation actions route to the authenticated account view'
);
select is(
  private.push_destination('unknown_private_event'),null::text,
  'unknown events fail closed without a push route'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fa800000-0000-4000-8000-000000000001',true);
select throws_ok(
  $$insert into public.push_tokens(user_id,token_ciphertext) values(
    'fa800000-0000-4000-8000-000000000001','client-readable-token')$$,
  '42501',
  'permission denied for table push_tokens',
  'clients cannot write routing tokens directly'
);
select throws_ok(
  $$select token_ciphertext from public.push_tokens$$,
  '42501',
  'permission denied for table push_tokens',
  'clients cannot read routing tokens'
);
select throws_ok(
  $$select public.register_push_device(
    'fa800000-0000-4000-8000-000000000002'::uuid,
    '11111111-1111-4111-8111-111111111111'::uuid,'android','0.1.0',
    repeat('a',64),'v1.abcdefghijklmnop.ciphertext',1::smallint
  )$$,
  '42501',
  'permission denied for function register_push_device',
  'an authenticated client cannot impersonate another user during registration'
);
select throws_ok(
  $$select public.revoke_push_devices(
    'fa800000-0000-4000-8000-000000000002'::uuid,null
  )$$,
  '42501',
  'permission denied for function revoke_push_devices',
  'an authenticated client cannot revoke another user device'
);
reset role;

set local role service_role;
select lives_ok(
  $$select public.register_push_device(
    'fa800000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111','android','0.1.0',
    repeat('a',64),'v1.abcdefghijklmnop.ciphertextone',1::smallint
  )$$,
  'service registration command creates an owned device token atomically'
);
select is(
  (select count(*) from public.user_devices where user_id='fa800000-0000-4000-8000-000000000001'),
  1::bigint,
  'one installation creates one user device'
);
select is(
  (select count(*) from public.push_tokens where user_id='fa800000-0000-4000-8000-000000000001' and enabled),
  1::bigint,
  'one encrypted token is active'
);
select lives_ok(
  $$select public.register_push_device(
    'fa800000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111','android','0.1.1',
    repeat('b',64),'v1.abcdefghijklmnop.ciphertexttwo',1::smallint
  )$$,
  'token rotation is atomic'
);
select is(
  (select count(*) from public.push_tokens where user_id='fa800000-0000-4000-8000-000000000001' and enabled),
  1::bigint,
  'rotation leaves only the latest token active'
);
select is(
  (select count(*) from public.push_tokens where user_id='fa800000-0000-4000-8000-000000000001' and not enabled),
  1::bigint,
  'rotation revokes the previous token'
);
select lives_ok(
  $$select public.register_push_device(
      'fa800000-0000-4000-8000-000000000002',
      ('00000000-0000-4000-8000-'||lpad(sequence::text,12,'0'))::uuid,
      'android','0.1.0',lpad(to_hex(sequence+100),64,'0'),
      'v1.abcdefghijklmnop.token'||sequence::text,1::smallint
    )
    from generate_series(1,10) as series(sequence)$$,
  'one account can register up to ten active installations'
);
select throws_ok(
  $$select public.register_push_device(
    'fa800000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000011','android','0.1.0',
    lpad(to_hex(111),64,'0'),'v1.abcdefghijklmnop.token11',1::smallint
  )$$,
  'PUSH_DEVICE_LIMIT',
  'an eleventh active installation fails closed atomically'
);
reset role;

insert into public.notification_outbox(
  user_id,event_type,channel,payload,deduplication_key
) values(
  'fa800000-0000-4000-8000-000000000001','new_offer','in_app',
  jsonb_build_object('privateMessage','must-not-leave-database','exactAddress','private'),
  'push-test-offer'
);
select is(
  (select count(*) from public.notification_outbox where channel='push' and deduplication_key='push-test-offer:push'),
  1::bigint,
  'an eligible in-app event fans out once to push'
);
select is(
  (select payload from public.notification_outbox where channel='push' and deduplication_key='push-test-offer:push'),
  '{"schema":"sallah.push.v1","destination":"offers"}'::jsonb,
  'push payload contains only the fixed safe route envelope'
);
select is(
  (select logical_notification_id from public.notification_outbox
   where channel='push' and deduplication_key='push-test-offer:push'),
  (select id from public.notification_outbox
   where channel='in_app' and deduplication_key='push-test-offer'),
  'the push row is transport for the authoritative logical notification'
);
select is(
  (select count(*) from public.notification_outbox
   where logical_notification_id=(select id from public.notification_outbox
     where channel='in_app' and deduplication_key='push-test-offer')
     and logical_notification_id=id),
  1::bigint,
  'one logical event has exactly one authoritative notification row'
);
select ok(
  (select payload::text !~ 'must-not-leave-database'
   from public.notification_outbox where channel='push' and deduplication_key='push-test-offer:push'),
  'private event text is absent from push payload'
);

set local role service_role;
select ok(
  (public.claim_notification_delivery('worker-one',repeat('c',64))->>'outboxId') is not null,
  'one worker atomically claims the eligible push event'
);
select is(
  public.claim_notification_delivery('worker-two',repeat('d',64)),
  null::jsonb,
  'a concurrent worker cannot claim the leased event'
);
select throws_ok(
  $$select public.complete_notification_delivery(
    (select id from public.notification_outbox where deduplication_key='push-test-offer:push'),
    'worker-one','wrong-lease',
    '{"outcome":"disabled","category":"no_eligible_device","tickets":[]}'::jsonb
  )$$,
  'STALE_NOTIFICATION_LEASE',
  'a stale worker cannot finalize the event'
);

reset role;
update public.notification_outbox set
  status='disabled',worker_id=null,lease_token_hash=null,lease_expires_at=null
where deduplication_key='push-test-offer:push';

insert into public.notification_outbox(
  user_id,event_type,channel,payload,deduplication_key
) values(
  'fa800000-0000-4000-8000-000000000001','new_offer','push',
  '{"schema":"sallah.push.v1","destination":"offers"}',
  'push-test-retry'
);
set local role service_role;
select is(
  (public.claim_notification_delivery(
    'worker-retry',encode(extensions.digest('retry-lease','sha256'),'hex')
  )->>'outboxId'),
  (select id::text from public.notification_outbox where deduplication_key='push-test-retry'),
  'a temporary delivery obtains a bounded worker lease'
);
select lives_ok(
  $$select public.fail_notification_delivery(
    (select id from public.notification_outbox where deduplication_key='push-test-retry'),
    'worker-retry','retry-lease','provider_unavailable'
  )$$,
  'a temporary provider outage schedules a retry'
);
select ok(
  (select status='failed' and attempts=1 and available_at>now()
   from public.notification_outbox where deduplication_key='push-test-retry'),
  'temporary failure uses bounded exponential backoff'
);
update public.notification_outbox set status='pending',attempts=4,available_at=now()
where deduplication_key='push-test-retry';
select is(
  (public.claim_notification_delivery(
    'worker-retry-final',encode(extensions.digest('retry-final-lease','sha256'),'hex')
  )->>'outboxId'),
  (select id::text from public.notification_outbox where deduplication_key='push-test-retry'),
  'the fifth and final delivery attempt can be claimed once'
);
select is(
  (public.fail_notification_delivery(
    (select id from public.notification_outbox where deduplication_key='push-test-retry'),
    'worker-retry-final','retry-final-lease','provider_unavailable'
  )->>'status'),
  'dead_letter',
  'five temporary failures become a terminal dead letter'
);
reset role;
select is(
  (select count(*) from public.dead_letter_events
   where source_type='notification'
     and source_id=(select id from public.notification_outbox
                   where deduplication_key='push-test-retry')),
  1::bigint,
  'retry exhaustion produces one bounded operational dead-letter event'
);

insert into public.notification_outbox(
  user_id,event_type,channel,payload,deduplication_key
) values(
  'fa800000-0000-4000-8000-000000000001','new_offer','push',
  '{"schema":"sallah.push.v1","destination":"offers"}',
  'push-test-credentials'
);
set local role service_role;
select is(
  (public.claim_notification_delivery(
    'worker-credentials',encode(extensions.digest('credentials-lease','sha256'),'hex')
  )->>'outboxId'),
  (select id::text from public.notification_outbox where deduplication_key='push-test-credentials'),
  'a credential-failure delivery is leased once'
);
select throws_ok(
  $$select public.complete_notification_delivery(
    (select id from public.notification_outbox where deduplication_key='push-test-credentials'),
    'worker-credentials','credentials-lease',
    jsonb_build_object(
      'outcome','terminal','category','delivery_failed','tickets',
      jsonb_build_array(jsonb_build_object(
        'tokenId',(select id from public.push_tokens
                   where user_id='fa800000-0000-4000-8000-000000000001' and enabled limit 1),
        'status','terminal_failure','category','raw provider stack trace',
        'providerDetail','must-not-persist','disableToken',false
      ))
    )
  )$$,
  'INVALID_NOTIFICATION_RESULT',
  'raw provider ticket categories and details are rejected'
);
select is(
  (public.complete_notification_delivery(
    (select id from public.notification_outbox where deduplication_key='push-test-credentials'),
    'worker-credentials','credentials-lease',
    jsonb_build_object(
      'outcome','terminal','category','delivery_failed','tickets',
      jsonb_build_array(jsonb_build_object(
        'tokenId',(select id from public.push_tokens
                   where user_id='fa800000-0000-4000-8000-000000000001' and enabled limit 1),
        'status','terminal_failure','category','provider_credentials_invalid',
        'disableToken',false
      ))
    )
  )->>'status'),
  'dead_letter',
  'invalid Expo credentials fail terminally without retrying'
);
select is(
  (select error_category from public.push_delivery_attempts attempt
   join public.notification_outbox outbox on outbox.id=attempt.outbox_id
   where outbox.deduplication_key='push-test-credentials'),
  'provider_credentials_invalid',
  'terminal credential category is retained for safe operations'
);
select is(
  (select count(*) from public.push_tokens
   where user_id='fa800000-0000-4000-8000-000000000001' and enabled),
  1::bigint,
  'provider credential failure does not revoke a valid device token'
);

reset role;
insert into public.notification_outbox(
  user_id,event_type,channel,payload,deduplication_key
) values(
  'fa800000-0000-4000-8000-000000000001','new_offer','push',
  '{"schema":"sallah.push.v1","destination":"offers"}',
  'push-test-receipt-success'
);
set local role service_role;
select is(
  (public.claim_notification_delivery(
    'worker-ticket',encode(extensions.digest('ticket-lease','sha256'),'hex')
  )->>'stage'),
  'send',
  'a new delivery begins in the send stage'
);
select is(
  (public.complete_notification_delivery(
    (select id from public.notification_outbox
     where deduplication_key='push-test-receipt-success'),
    'worker-ticket','ticket-lease',
    jsonb_build_object(
      'outcome','deferred','category','receipt_pending','tickets',
      jsonb_build_array(jsonb_build_object(
        'tokenId',(select id from public.push_tokens
                   where user_id='fa800000-0000-4000-8000-000000000001' and enabled limit 1),
        'status','ticketed','ticketId','ticket-success'
      ))
    )
  )->>'status'),
  'processing',
  'an Expo ticket advances to receipt processing'
);
update public.notification_outbox set available_at=now()
where deduplication_key='push-test-receipt-success';
select is(
  (public.claim_notification_delivery(
    'worker-receipt',encode(extensions.digest('receipt-lease','sha256'),'hex')
  )->>'stage'),
  'receipt',
  'receipt processing is claimed independently of sending'
);
select is(
  (public.complete_notification_receipts(
    (select id from public.notification_outbox
     where deduplication_key='push-test-receipt-success'),
    'worker-receipt','receipt-lease',
    jsonb_build_object(
      'outcome','delivered','category','delivered','receipts',
      jsonb_build_array(jsonb_build_object(
        'tokenId',(select id from public.push_tokens
                   where user_id='fa800000-0000-4000-8000-000000000001' and enabled limit 1),
        'ticketId','ticket-success','status','delivered'
      ))
    )
  )->>'status'),
  'delivered',
  'a successful Expo receipt completes the outbox row'
);
select is(
  (select status from public.push_delivery_attempts
   where expo_ticket_id='ticket-success'),
  'delivered',
  'successful receipt state is retained exactly once'
);

reset role;
insert into public.notification_outbox(
  user_id,event_type,channel,payload,deduplication_key
) values(
  'fa800000-0000-4000-8000-000000000001','new_offer','push',
  '{"schema":"sallah.push.v1","destination":"offers"}',
  'push-test-receipt-unknown'
);
set local role service_role;
select is(
  (public.claim_notification_delivery(
    'worker-unknown-ticket',encode(extensions.digest('unknown-ticket-lease','sha256'),'hex')
  )->>'stage'),
  'send',
  'unknown-receipt scenario begins with a valid send lease'
);
select is(
  (public.complete_notification_delivery(
    (select id from public.notification_outbox
     where deduplication_key='push-test-receipt-unknown'),
    'worker-unknown-ticket','unknown-ticket-lease',
    jsonb_build_object(
      'outcome','deferred','category','receipt_pending','tickets',
      jsonb_build_array(jsonb_build_object(
        'tokenId',(select id from public.push_tokens
                   where user_id='fa800000-0000-4000-8000-000000000001' and enabled limit 1),
        'status','ticketed','ticketId','ticket-unknown'
      ))
    )
  )->>'status'),
  'processing',
  'unknown receipt is tracked without reporting false delivery'
);
update public.notification_outbox set available_at=now(),receipt_checks=3
where deduplication_key='push-test-receipt-unknown';
select is(
  (public.claim_notification_delivery(
    'worker-unknown-receipt',
    encode(extensions.digest('unknown-receipt-lease','sha256'),'hex')
  )->>'stage'),
  'receipt',
  'the fourth bounded receipt lookup can be claimed'
);
select is(
  (public.complete_notification_receipts(
    (select id from public.notification_outbox
     where deduplication_key='push-test-receipt-unknown'),
    'worker-unknown-receipt','unknown-receipt-lease',
    jsonb_build_object(
      'outcome','deferred','category','receipt_pending','receipts',
      jsonb_build_array(jsonb_build_object(
        'tokenId',(select id from public.push_tokens
                   where user_id='fa800000-0000-4000-8000-000000000001' and enabled limit 1),
        'ticketId','ticket-unknown','status','pending'
      ))
    )
  )->>'status'),
  'dead_letter',
  'four unknown receipt checks stop without false delivery'
);
reset role;
select is(
  (select count(*) from public.dead_letter_events
   where source_id=(select id from public.notification_outbox
                   where deduplication_key='push-test-receipt-unknown')),
  1::bigint,
  'receipt-check exhaustion emits one bounded dead-letter event'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fa800000-0000-4000-8000-000000000001',true);
select is(
  (select count(*) from public.notification_outbox where user_id=auth.uid() and channel='push'),
  0::bigint,
  'owners cannot read internal push delivery rows'
);
reset role;

set local role service_role;
select lives_ok(
  $$select public.register_push_device(
    'fa800000-0000-4000-8000-000000000001',
    '22222222-2222-4222-8222-222222222222','ios','0.1.1',
    repeat('e',64),'v1.abcdefghijklmnop.seconddevice',1::smallint
  )$$,
  'a second installation can register independently'
);
reset role;
insert into public.notification_outbox(
  user_id,event_type,channel,payload,deduplication_key
) values(
  'fa800000-0000-4000-8000-000000000001','new_offer','push',
  '{"schema":"sallah.push.v1","destination":"offers"}',
  'push-test-multiple-devices'
);
set local role service_role;
select is(
  (public.claim_notification_delivery(
    'worker-multi-send',encode(extensions.digest('multi-send-lease','sha256'),'hex')
  )->>'stage'),
  'send',
  'a multi-device event begins with one atomic send claim'
);
select is(
  (public.complete_notification_delivery(
    (select id from public.notification_outbox
     where deduplication_key='push-test-multiple-devices'),
    'worker-multi-send','multi-send-lease',
    jsonb_build_object(
      'outcome','deferred','category','receipt_pending','tickets',
      (select jsonb_agg(jsonb_build_object(
        'tokenId',numbered.id,'status','ticketed',
        'ticketId','multi-ticket-'||numbered.ordinal::text
      ) order by numbered.ordinal)
       from (
         select id,row_number() over(order by id) as ordinal
         from public.push_tokens
         where user_id='fa800000-0000-4000-8000-000000000001' and enabled
       ) numbered)
    )
  )->>'status'),
  'processing',
  'both device tickets advance to receipt processing'
);
update public.notification_outbox set available_at=now()
where deduplication_key='push-test-multiple-devices';
select is(
  (public.claim_notification_delivery(
    'worker-multi-receipt-one',
    encode(extensions.digest('multi-receipt-one-lease','sha256'),'hex')
  )->>'stage'),
  'receipt',
  'the first multi-device receipt check is claimed'
);
select throws_ok(
  $$select public.complete_notification_receipts(
    (select id from public.notification_outbox
     where deduplication_key='push-test-multiple-devices'),
    'worker-multi-receipt-one','multi-receipt-one-lease',
    jsonb_build_object(
      'outcome','deferred','category','receipt_pending','receipts',
      jsonb_build_array(
        jsonb_build_object(
          'tokenId',(select id from public.push_tokens
                     where user_id='fa800000-0000-4000-8000-000000000001'
                       and enabled order by id limit 1),
          'ticketId','multi-ticket-1','status','retryable_failure',
          'category','raw provider stack trace','providerDetail','must-not-persist'
        ),
        jsonb_build_object(
          'tokenId',(select id from public.push_tokens
                     where user_id='fa800000-0000-4000-8000-000000000001'
                       and enabled order by id offset 1 limit 1),
          'ticketId','multi-ticket-2','status','pending'
        )
      )
    )
  )$$,
  'INVALID_NOTIFICATION_RESULT',
  'raw provider receipt categories and details are rejected'
);
select is(
  (public.complete_notification_receipts(
    (select id from public.notification_outbox
     where deduplication_key='push-test-multiple-devices'),
    'worker-multi-receipt-one','multi-receipt-one-lease',
    jsonb_build_object(
      'outcome','deferred','category','receipt_pending','receipts',
      jsonb_build_array(
        jsonb_build_object(
          'tokenId',(select id from public.push_tokens
                     where user_id='fa800000-0000-4000-8000-000000000001'
                       and enabled order by id limit 1),
          'ticketId','multi-ticket-1','status','delivered'
        ),
        jsonb_build_object(
          'tokenId',(select id from public.push_tokens
                     where user_id='fa800000-0000-4000-8000-000000000001'
                       and enabled order by id offset 1 limit 1),
          'ticketId','multi-ticket-2','status','pending'
        )
      )
    )
  )->>'status'),
  'processing',
  'one delivered device cannot discard another pending receipt'
);
select is(
  (select count(*) from public.push_delivery_attempts attempt
   join public.notification_outbox outbox on outbox.id=attempt.outbox_id
   where outbox.deduplication_key='push-test-multiple-devices'
     and attempt.status='delivered'),
  1::bigint,
  'the delivered device is not sent or checked again'
);
select is(
  (select count(*) from public.push_delivery_attempts attempt
   join public.notification_outbox outbox on outbox.id=attempt.outbox_id
   where outbox.deduplication_key='push-test-multiple-devices'
     and attempt.status='receipt_pending'),
  1::bigint,
  'the other device remains pending for a later bounded receipt check'
);
update public.notification_outbox set available_at=now()
where deduplication_key='push-test-multiple-devices';
select is(
  jsonb_array_length(public.claim_notification_delivery(
    'worker-multi-receipt-two',
    encode(extensions.digest('multi-receipt-two-lease','sha256'),'hex')
  )->'tickets'),
  1,
  'the next claim contains only the still-pending device ticket'
);
select is(
  (public.complete_notification_receipts(
    (select id from public.notification_outbox
     where deduplication_key='push-test-multiple-devices'),
    'worker-multi-receipt-two','multi-receipt-two-lease',
    jsonb_build_object(
      'outcome','delivered','category','delivered','receipts',
      jsonb_build_array(jsonb_build_object(
        'tokenId',(select id from public.push_tokens
                   where user_id='fa800000-0000-4000-8000-000000000001'
                     and enabled order by id offset 1 limit 1),
        'ticketId','multi-ticket-2','status','delivered'
      ))
    )
  )->>'status'),
  'delivered',
  'the pending device receipt completes without duplicating the first delivery'
);
select lives_ok(
  $$select public.revoke_push_devices(
    'fa800000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111'
  )$$,
  'current-installation logout revokes only that installation'
);
select is(
  (select count(*) from public.push_tokens
   where user_id='fa800000-0000-4000-8000-000000000001' and enabled),
  1::bigint,
  'current-installation logout preserves another owned installation'
);
select is(
  (select count(*) from public.user_devices
   where device_hash=encode(extensions.digest(
     '11111111-1111-4111-8111-111111111111','sha256'
   ),'hex') and revoked_at is not null),
  1::bigint,
  'the current installation is marked revoked'
);
select lives_ok(
  $$select public.revoke_push_devices('fa800000-0000-4000-8000-000000000001',null)$$,
  'global logout revokes every owned push device'
);
select is(
  (select count(*) from public.push_tokens where user_id='fa800000-0000-4000-8000-000000000001' and enabled),
  0::bigint,
  'logout leaves no active token'
);
select is(
  (select count(*) from public.user_devices where user_id='fa800000-0000-4000-8000-000000000001' and revoked_at is not null),
  2::bigint,
  'global logout marks every installation revoked'
);

select * from finish();
rollback;
