begin;

alter table public.push_tokens
  add column token_hash text,
  add column token_key_version smallint,
  add column registered_at timestamptz not null default now(),
  add column revoked_at timestamptz;

update public.push_tokens
set enabled=false,
    revoked_at=coalesce(revoked_at,now()),
    last_result='legacy_token_revoked'
where token_hash is null;

create unique index push_tokens_hash_unique
  on public.push_tokens(token_hash)
  where token_hash is not null;

alter table public.notification_outbox
  add column delivery_stage text not null default 'send'
    check(delivery_stage in ('send','receipt')),
  add column worker_id text,
  add column lease_token_hash text,
  add column lease_expires_at timestamptz,
  add column receipt_checks integer not null default 0 check(receipt_checks between 0 and 4);

create index notification_push_worker_idx
  on public.notification_outbox(status,delivery_stage,available_at,lease_expires_at)
  where channel='push' and status in ('pending','processing','failed');

create table public.push_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null references public.notification_outbox(id) on delete cascade,
  push_token_id uuid not null references public.push_tokens(id) on delete cascade,
  attempt_number integer not null check(attempt_number between 1 and 5),
  expo_ticket_id text,
  status text not null check(status in (
    'receipt_pending','delivered','retryable_failure','terminal_failure'
  )),
  error_category text,
  created_at timestamptz not null default now(),
  receipt_checked_at timestamptz,
  unique(outbox_id,push_token_id,attempt_number)
);
create unique index push_delivery_ticket_unique
  on public.push_delivery_attempts(expo_ticket_id)
  where expo_ticket_id is not null;
create index push_delivery_receipt_idx
  on public.push_delivery_attempts(status,created_at)
  where status='receipt_pending';
alter table public.push_delivery_attempts enable row level security;

drop policy if exists push_owner_all on public.push_tokens;
drop policy if exists devices_owner_all on public.user_devices;
revoke all privileges on table public.push_tokens from public,anon,authenticated;
revoke all privileges on table public.user_devices from public,anon,authenticated;
revoke all privileges on table public.push_delivery_attempts from public,anon,authenticated;
grant select,insert,update,delete on table public.push_tokens to service_role;
grant select,insert,update,delete on table public.user_devices to service_role;
grant select,insert,update,delete on table public.push_delivery_attempts to service_role;

drop policy if exists notification_owner on public.notification_outbox;
create policy notification_owner on public.notification_outbox
  for select to authenticated
  using(
    (channel='in_app' and user_id=(select auth.uid()))
    or private.has_admin_permission('operations.notifications.read')
  );

create or replace function private.push_destination(p_event_type text)
returns text language sql immutable strict set search_path=''
as $$
  select case
    when p_event_type='new_offer' then 'offers'
    when p_event_type in ('provider_matched','request_matched') then 'provider_feed'
    when p_event_type='message_created' then 'messages'
    when p_event_type like 'job\_%' escape '\'
      or p_event_type like 'change\_order\_%' escape '\'
      or p_event_type in (
        'cancellation_decided','dispute_opened','dispute_resolution_updated',
        'completion_rejected_dispute_opened','financial_action_confirmed','job_cancelled'
      ) then 'jobs'
    when p_event_type like 'support\_%' escape '\' then 'support'
    when p_event_type like 'account\_%' escape '\'
      or p_event_type='moderation_action' then 'account'
    else null
  end
$$;

create or replace function private.enqueue_push_copy()
returns trigger language plpgsql security definer set search_path=''
as $$
declare destination text;
begin
  if new.channel<>'in_app' then return new; end if;
  destination:=private.push_destination(new.event_type);
  if destination is null then return new; end if;
  insert into public.notification_outbox(
    user_id,event_type,channel,payload,deduplication_key
  ) values(
    new.user_id,new.event_type,'push',
    jsonb_build_object('schema','sallah.push.v1','destination',destination),
    new.deduplication_key||':push'
  ) on conflict(channel,deduplication_key) do nothing;
  return new;
end
$$;
revoke all on function private.enqueue_push_copy() from public,anon,authenticated;
create trigger notification_push_fanout
after insert on public.notification_outbox
for each row when (new.channel='in_app')
execute function private.enqueue_push_copy();

create or replace function private.enqueue_message_activity()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  insert into public.notification_outbox(
    user_id,event_type,channel,payload,deduplication_key
  )
  select member.user_id,'message_created','in_app',
    jsonb_build_object('conversationId',new.conversation_id,'messageId',new.id),
    'message:'||new.id::text||':'||member.user_id::text
  from public.conversation_members member
  where member.conversation_id=new.conversation_id
    and member.user_id<>new.sender_id
    and member.left_at is null
  on conflict(channel,deduplication_key) do nothing;
  return new;
end
$$;
revoke all on function private.enqueue_message_activity() from public,anon,authenticated;
create trigger messages_notification_fanout
after insert on public.messages
for each row execute function private.enqueue_message_activity();

create or replace function private.enqueue_job_activity()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if new.event_type not in (
    'offer_selected','status_transitioned','completion_attempt_submitted',
    'completion_accepted','terminal_outcome_applied'
  ) then return new; end if;
  insert into public.notification_outbox(
    user_id,event_type,channel,payload,deduplication_key
  )
  select participant.user_id,'job_'||new.event_type,'in_app',
    jsonb_build_object('jobId',new.job_id,'eventId',new.id),
    'job-event:'||new.id::text||':'||participant.user_id::text
  from public.jobs job
  cross join lateral(values(job.customer_id),(job.provider_id)) participant(user_id)
  where job.id=new.job_id and (new.actor_id is null or participant.user_id<>new.actor_id)
  on conflict(channel,deduplication_key) do nothing;
  return new;
end
$$;
revoke all on function private.enqueue_job_activity() from public,anon,authenticated;
create trigger job_event_notification_fanout
after insert on public.job_events
for each row execute function private.enqueue_job_activity();

create or replace function private.enqueue_change_order_activity()
returns trigger language plpgsql security definer set search_path=''
as $$
declare recipient uuid; event_name text;
begin
  if tg_op='INSERT' then
    select customer_id into recipient from public.jobs where id=new.job_id;
    event_name:='change_order_created';
  elsif new.status is not distinct from old.status then
    return new;
  else
    recipient:=new.provider_id;
    event_name:='change_order_'||new.status::text;
  end if;
  insert into public.notification_outbox(
    user_id,event_type,channel,payload,deduplication_key
  ) values(
    recipient,event_name,'in_app',jsonb_build_object('jobId',new.job_id,'changeOrderId',new.id),
    'change-order:'||new.id::text||':'||new.status::text||':'||recipient::text
  ) on conflict(channel,deduplication_key) do nothing;
  return new;
end
$$;
revoke all on function private.enqueue_change_order_activity() from public,anon,authenticated;
create trigger change_order_notification_fanout
after insert or update of status on public.change_orders
for each row execute function private.enqueue_change_order_activity();

create or replace function private.enqueue_support_activity()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  insert into public.notification_outbox(
    user_id,event_type,channel,payload,deduplication_key
  )
  select recipient.user_id,'support_case_updated','in_app',
    jsonb_build_object('caseId',new.case_id,'messageId',new.id),
    'support-message:'||new.id::text||':'||recipient.user_id::text
  from (
    select support.opened_by as user_id
    from public.support_cases support
    where support.id=new.case_id and support.opened_by<>new.sender_id
    union
    select assignment.assignee_id
    from public.support_case_assignments assignment
    where assignment.case_id=new.case_id and assignment.ended_at is null
      and assignment.assignee_id<>new.sender_id
  ) recipient
  on conflict(channel,deduplication_key) do nothing;
  return new;
end
$$;
revoke all on function private.enqueue_support_activity() from public,anon,authenticated;
create trigger support_message_notification_fanout
after insert on public.support_case_messages
for each row execute function private.enqueue_support_activity();

create or replace function private.enqueue_moderation_activity()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  insert into public.notification_outbox(
    user_id,event_type,channel,payload,deduplication_key
  ) values(
    new.target_user_id,'moderation_action','in_app',
    jsonb_build_object('actionId',new.id),
    'moderation-action:'||new.id::text
  ) on conflict(channel,deduplication_key) do nothing;
  return new;
end
$$;
revoke all on function private.enqueue_moderation_activity() from public,anon,authenticated;
create trigger moderation_notification_fanout
after insert on public.moderation_actions
for each row execute function private.enqueue_moderation_activity();

create or replace function private.is_safe_push_failure_category(p_category text)
returns boolean language sql immutable set search_path=''
as $$
  select coalesce(p_category=any(array[
    'device_not_registered','rate_limited','provider_credentials_invalid',
    'invalid_payload','provider_unavailable','token_decryption_failed'
  ]),false)
$$;

create or replace function private.is_safe_notification_result_category(p_category text)
returns boolean language sql immutable set search_path=''
as $$
  select coalesce(p_category=any(array[
    'no_eligible_device','receipt_pending','delivery_failed','delivered',
    'receipt_failed','provider_unavailable','delivery_processing_failed'
  ]),false)
$$;

create or replace function public.register_push_device(
  p_user_id uuid,
  p_installation_id uuid,
  p_platform text,
  p_app_version text,
  p_token_hash text,
  p_token_ciphertext text,
  p_token_key_version smallint
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_device_id uuid; existing_owner uuid; v_device_hash text;
begin
  if p_user_id is null or p_installation_id is null
    or p_platform not in ('ios','android')
    or char_length(trim(p_app_version)) not between 1 and 64
    or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_token_ciphertext !~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'
    or p_token_key_version<>1 then
    raise exception 'INVALID_PUSH_DEVICE';
  end if;
  perform 1 from public.profiles where id=p_user_id and status='active' for update;
  if not found then raise exception 'PUSH_ACCOUNT_UNAVAILABLE'; end if;

  v_device_hash:=encode(extensions.digest(p_installation_id::text,'sha256'),'hex');
  if not exists(
    select 1 from public.user_devices
    where user_id=p_user_id and device_hash=v_device_hash and revoked_at is null
  ) and (
    select count(*) from public.user_devices
    where user_id=p_user_id and revoked_at is null
  )>=10 then
    raise exception 'PUSH_DEVICE_LIMIT';
  end if;
  select user_id into existing_owner from public.push_tokens
  where token_hash=p_token_hash and enabled for update;
  if existing_owner is not null and existing_owner<>p_user_id then
    raise exception 'PUSH_TOKEN_ALREADY_ACTIVE';
  end if;
  delete from public.push_tokens where token_hash=p_token_hash and not enabled;

  insert into public.user_devices(user_id,platform,device_hash,app_version,last_seen_at,revoked_at)
  values(p_user_id,p_platform,v_device_hash,trim(p_app_version),now(),null)
  on conflict(user_id,device_hash) do update set
    platform=excluded.platform,app_version=excluded.app_version,last_seen_at=now(),revoked_at=null
  returning id into v_device_id;

  update public.push_tokens set
    enabled=false,revoked_at=now(),last_result='rotated',updated_at=now()
  where user_id=p_user_id and device_id=v_device_id
    and token_hash is distinct from p_token_hash and enabled;

  insert into public.push_tokens(
    user_id,device_id,token_ciphertext,token_hash,token_key_version,
    provider,enabled,last_result,registered_at,revoked_at,updated_at
  ) values(
    p_user_id,v_device_id,p_token_ciphertext,p_token_hash,p_token_key_version,
    'expo',true,null,now(),null,now()
  ) on conflict(token_hash) where token_hash is not null do update set
    user_id=excluded.user_id,device_id=excluded.device_id,
    token_ciphertext=excluded.token_ciphertext,token_key_version=excluded.token_key_version,
    enabled=true,last_result=null,registered_at=now(),revoked_at=null,updated_at=now();
  return jsonb_build_object('registered',true);
end
$$;

create or replace function public.revoke_push_devices(
  p_user_id uuid,p_installation_id uuid default null
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare affected integer; requested_hash text;
begin
  if p_user_id is null then raise exception 'INVALID_PUSH_DEVICE'; end if;
  requested_hash:=case when p_installation_id is null then null
    else encode(extensions.digest(p_installation_id::text,'sha256'),'hex') end;
  update public.user_devices set revoked_at=now(),last_seen_at=now()
  where user_id=p_user_id and (requested_hash is null or device_hash=requested_hash);
  update public.push_tokens token set
    enabled=false,revoked_at=now(),last_result='revoked',updated_at=now()
  where token.user_id=p_user_id and (
    requested_hash is null or exists(
      select 1 from public.user_devices device
      where device.id=token.device_id and device.user_id=p_user_id
        and device.device_hash=requested_hash
    )
  ) and token.enabled;
  get diagnostics affected=row_count;
  return jsonb_build_object('revoked',affected);
end
$$;

create or replace function public.claim_notification_delivery(
  p_worker_id text,p_lease_token_hash text
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare item public.notification_outbox%rowtype; targets jsonb; tickets jsonb; locale text;
begin
  if p_worker_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,119}$'
    or p_lease_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_NOTIFICATION_CLAIM';
  end if;
  select * into item from public.notification_outbox
  where channel='push' and (
    (delivery_stage='send' and attempts<5 and (
      (status in ('pending','failed') and available_at<=now())
      or (status='processing' and lease_expires_at<=now())
    ))
    or (delivery_stage='receipt' and receipt_checks<4 and status='processing'
      and available_at<=now() and (lease_expires_at is null or lease_expires_at<=now()))
  )
  order by available_at,id for update skip locked limit 1;
  if item.id is null then return null; end if;

  update public.notification_outbox set
    status='processing',worker_id=p_worker_id,lease_token_hash=p_lease_token_hash,
    lease_expires_at=now()+interval '60 seconds',
    attempts=case when item.delivery_stage='send' then attempts+1 else attempts end,
    receipt_checks=case when item.delivery_stage='receipt' then receipt_checks+1 else receipt_checks end
  where id=item.id
  returning * into item;

  select coalesce(profile.preferred_locale,'ar') into locale
  from public.profiles profile where profile.id=item.user_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'tokenId',token.id,'tokenCiphertext',token.token_ciphertext
  ) order by token.id),'[]'::jsonb) into targets
  from public.push_tokens token
  join public.user_devices device on device.id=token.device_id
  join public.notification_preferences preference on preference.user_id=item.user_id
  join public.profiles profile on profile.id=item.user_id
  where item.delivery_stage='send' and token.user_id=item.user_id
    and token.enabled and token.revoked_at is null and token.token_key_version=1
    and device.revoked_at is null and preference.push and profile.status='active';
  select coalesce(jsonb_agg(jsonb_build_object(
    'tokenId',attempt.push_token_id,'ticketId',attempt.expo_ticket_id
  ) order by attempt.id),'[]'::jsonb) into tickets
  from public.push_delivery_attempts attempt
  where item.delivery_stage='receipt' and attempt.outbox_id=item.id
    and attempt.status='receipt_pending';
  return jsonb_build_object(
    'outboxId',item.id,'stage',item.delivery_stage,'eventType',item.event_type,
    'locale',coalesce(locale,'ar'),'destination',item.payload->>'destination',
    'attempt',case when item.delivery_stage='send' then item.attempts else item.receipt_checks end,
    'targets',coalesce(targets,'[]'::jsonb),'tickets',coalesce(tickets,'[]'::jsonb)
  );
end
$$;

create or replace function private.assert_notification_lease(
  p_outbox_id uuid,p_worker_id text,p_lease_token text,p_stage text
) returns public.notification_outbox language plpgsql security definer set search_path=''
as $$
declare item public.notification_outbox%rowtype;
begin
  select * into item from public.notification_outbox where id=p_outbox_id for update;
  if item.id is null or item.status<>'processing' or item.delivery_stage<>p_stage
    or item.worker_id is distinct from p_worker_id
    or item.lease_expires_at is null or item.lease_expires_at<=now()
    or item.lease_token_hash is distinct from
      encode(extensions.digest(p_lease_token,'sha256'),'hex') then
    raise exception 'STALE_NOTIFICATION_LEASE';
  end if;
  return item;
end
$$;

create or replace function private.notification_dead_letter(
  p_outbox_id uuid,p_category text,p_attempts integer
) returns void language plpgsql security definer set search_path=''
as $$
begin
  insert into public.dead_letter_events(
    source_type,source_id,error_category,payload,attempts
  ) values(
    'notification',p_outbox_id,p_category,
    jsonb_build_object('outboxId',p_outbox_id),p_attempts
  );
end
$$;

create or replace function public.complete_notification_delivery(
  p_outbox_id uuid,p_worker_id text,p_lease_token text,p_result jsonb
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare item public.notification_outbox%rowtype; entry jsonb; outcome text;
  token_id uuid; ticket_status text; ticket_id text; category text; final_status text;
begin
  item:=private.assert_notification_lease(p_outbox_id,p_worker_id,p_lease_token,'send');
  if jsonb_typeof(p_result)<>'object' then
    raise exception 'INVALID_NOTIFICATION_RESULT';
  end if;
  outcome:=p_result->>'outcome'; category:=p_result->>'category';
  if outcome is null or outcome not in ('deferred','disabled','failed','terminal')
    or not private.is_safe_notification_result_category(category)
    or jsonb_typeof(p_result->'tickets')<>'array'
    or jsonb_array_length(p_result->'tickets')>20
    or exists(
      select 1 from jsonb_object_keys(p_result) key
      where key not in ('outcome','category','tickets')
    ) then
    raise exception 'INVALID_NOTIFICATION_RESULT';
  end if;
  for entry in select value from jsonb_array_elements(p_result->'tickets') loop
    if jsonb_typeof(entry)<>'object' or exists(
      select 1 from jsonb_object_keys(entry) key
      where key not in ('tokenId','status','ticketId','category','disableToken')
    ) then raise exception 'INVALID_NOTIFICATION_RESULT'; end if;
    begin token_id:=(entry->>'tokenId')::uuid;
    exception when others then raise exception 'INVALID_NOTIFICATION_RESULT'; end;
    if not exists(
      select 1 from public.push_tokens where id=token_id and user_id=item.user_id
    ) then raise exception 'INVALID_NOTIFICATION_RESULT'; end if;
    ticket_status:=entry->>'status'; ticket_id:=entry->>'ticketId';
    if ticket_status='ticketed' and ticket_id ~ '^[A-Za-z0-9_-]{1,200}$'
      and entry->>'category' is null and entry->>'disableToken' is null then
      insert into public.push_delivery_attempts(
        outbox_id,push_token_id,attempt_number,expo_ticket_id,status
      ) values(item.id,token_id,item.attempts,ticket_id,'receipt_pending')
      on conflict(outbox_id,push_token_id,attempt_number) do update set
        expo_ticket_id=excluded.expo_ticket_id,status='receipt_pending',error_category=null;
    elsif ticket_status in ('retryable_failure','terminal_failure')
      and private.is_safe_push_failure_category(entry->>'category')
      and (entry->'disableToken' is null
        or jsonb_typeof(entry->'disableToken')='boolean') then
      insert into public.push_delivery_attempts(
        outbox_id,push_token_id,attempt_number,status,error_category
      ) values(item.id,token_id,item.attempts,ticket_status,entry->>'category')
      on conflict(outbox_id,push_token_id,attempt_number) do update set
        status=excluded.status,error_category=excluded.error_category;
      if coalesce((entry->>'disableToken')::boolean,false) then
        update public.push_tokens set enabled=false,revoked_at=now(),
          last_result=entry->>'category',updated_at=now() where id=token_id;
      end if;
    else raise exception 'INVALID_NOTIFICATION_RESULT'; end if;
  end loop;

  if outcome='deferred' and not exists(
    select 1 from public.push_delivery_attempts
    where outbox_id=item.id and attempt_number=item.attempts
      and status='receipt_pending'
  ) then raise exception 'INVALID_NOTIFICATION_RESULT'; end if;
  if outcome='terminal' and not exists(
    select 1 from public.push_delivery_attempts
    where outbox_id=item.id and attempt_number=item.attempts
      and status='terminal_failure'
  ) then raise exception 'INVALID_NOTIFICATION_RESULT'; end if;

  if outcome='deferred' then
    final_status:='processing';
    update public.notification_outbox set status='processing',delivery_stage='receipt',
      available_at=now()+interval '15 minutes',last_error_category=category,
      worker_id=null,lease_token_hash=null,lease_expires_at=null where id=item.id;
  elsif outcome='disabled' then
    final_status:='disabled';
    update public.notification_outbox set status='disabled',last_error_category=category,
      worker_id=null,lease_token_hash=null,lease_expires_at=null where id=item.id;
  elsif outcome='terminal' or item.attempts>=5 then
    final_status:='dead_letter';
    update public.notification_outbox set status='dead_letter',last_error_category=category,
      worker_id=null,lease_token_hash=null,lease_expires_at=null where id=item.id;
    perform private.notification_dead_letter(item.id,category,item.attempts);
  else
    final_status:='failed';
    update public.notification_outbox set status='failed',last_error_category=category,
      available_at=now()+make_interval(secs=>least(3600,60*(2^(item.attempts-1)))),
      worker_id=null,lease_token_hash=null,lease_expires_at=null where id=item.id;
  end if;
  return jsonb_build_object('status',final_status);
end
$$;

create or replace function public.complete_notification_receipts(
  p_outbox_id uuid,p_worker_id text,p_lease_token text,p_result jsonb
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare item public.notification_outbox%rowtype; entry jsonb; outcome text;
  token_id uuid; ticket_id text; receipt_status text; category text; final_status text;
begin
  item:=private.assert_notification_lease(p_outbox_id,p_worker_id,p_lease_token,'receipt');
  if jsonb_typeof(p_result)<>'object' then
    raise exception 'INVALID_NOTIFICATION_RESULT';
  end if;
  outcome:=p_result->>'outcome'; category:=p_result->>'category';
  if outcome is null or outcome not in ('delivered','deferred','disabled','failed')
    or not private.is_safe_notification_result_category(category)
    or jsonb_typeof(p_result->'receipts')<>'array'
    or jsonb_array_length(p_result->'receipts')>20
    or exists(
      select 1 from jsonb_object_keys(p_result) key
      where key not in ('outcome','category','receipts')
    ) then
    raise exception 'INVALID_NOTIFICATION_RESULT';
  end if;
  for entry in select value from jsonb_array_elements(p_result->'receipts') loop
    if jsonb_typeof(entry)<>'object' or exists(
      select 1 from jsonb_object_keys(entry) key
      where key not in ('tokenId','ticketId','status','category','disableToken')
    ) then raise exception 'INVALID_NOTIFICATION_RESULT'; end if;
    begin token_id:=(entry->>'tokenId')::uuid;
    exception when others then raise exception 'INVALID_NOTIFICATION_RESULT'; end;
    ticket_id:=entry->>'ticketId'; receipt_status:=entry->>'status';
    if receipt_status is null
      or receipt_status not in ('pending','delivered','retryable_failure','terminal_failure')
      or ticket_id is null or ticket_id !~ '^[A-Za-z0-9_-]{1,200}$'
      or (receipt_status in ('pending','delivered') and entry->>'category' is not null)
      or (receipt_status in ('retryable_failure','terminal_failure')
        and not private.is_safe_push_failure_category(entry->>'category'))
      or (entry->'disableToken' is not null
        and jsonb_typeof(entry->'disableToken')<>'boolean') then
      raise exception 'INVALID_NOTIFICATION_RESULT';
    end if;
    update public.push_delivery_attempts set
      status=case when receipt_status in ('pending','retryable_failure')
        then 'receipt_pending' else receipt_status end,
      error_category=entry->>'category',receipt_checked_at=now()
    where outbox_id=item.id and push_token_id=token_id and expo_ticket_id=ticket_id;
    if not found then raise exception 'INVALID_NOTIFICATION_RESULT'; end if;
    if coalesce((entry->>'disableToken')::boolean,false) then
      update public.push_tokens set enabled=false,revoked_at=now(),
        last_result=entry->>'category',updated_at=now() where id=token_id;
    end if;
  end loop;

  if outcome='delivered' and exists(
    select 1 from public.push_delivery_attempts
    where outbox_id=item.id and status='receipt_pending'
  ) then raise exception 'INVALID_NOTIFICATION_RESULT'; end if;
  if outcome='deferred' and not exists(
    select 1 from public.push_delivery_attempts
    where outbox_id=item.id and status='receipt_pending'
  ) then raise exception 'INVALID_NOTIFICATION_RESULT'; end if;

  if outcome='delivered' then
    final_status:='delivered';
    update public.notification_outbox set status='delivered',delivered_at=now(),
      last_error_category=null,worker_id=null,lease_token_hash=null,lease_expires_at=null
    where id=item.id;
  elsif outcome='deferred' and item.receipt_checks<4 then
    final_status:='processing';
    update public.notification_outbox set status='processing',available_at=now()+interval '15 minutes',
      last_error_category=category,worker_id=null,lease_token_hash=null,lease_expires_at=null
    where id=item.id;
  elsif outcome='disabled' then
    final_status:='disabled';
    update public.notification_outbox set status='disabled',last_error_category=category,
      worker_id=null,lease_token_hash=null,lease_expires_at=null where id=item.id;
  else
    final_status:='dead_letter';
    update public.notification_outbox set status='dead_letter',last_error_category=category,
      worker_id=null,lease_token_hash=null,lease_expires_at=null where id=item.id;
    perform private.notification_dead_letter(item.id,category,item.attempts);
  end if;
  return jsonb_build_object('status',final_status);
end
$$;

create or replace function public.fail_notification_delivery(
  p_outbox_id uuid,p_worker_id text,p_lease_token text,p_error_category text
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare item public.notification_outbox%rowtype; terminal boolean;
begin
  if p_error_category is null
    or p_error_category not in ('provider_unavailable','delivery_processing_failed') then
    raise exception 'INVALID_NOTIFICATION_RESULT';
  end if;
  select * into item from public.notification_outbox where id=p_outbox_id for update;
  item:=private.assert_notification_lease(
    p_outbox_id,p_worker_id,p_lease_token,item.delivery_stage
  );
  terminal:=(item.delivery_stage='send' and item.attempts>=5)
    or (item.delivery_stage='receipt' and item.receipt_checks>=4);
  if terminal then
    update public.notification_outbox set status='dead_letter',
      last_error_category=p_error_category,worker_id=null,
      lease_token_hash=null,lease_expires_at=null where id=item.id;
    perform private.notification_dead_letter(item.id,p_error_category,item.attempts);
  elsif item.delivery_stage='send' then
    update public.notification_outbox set status='failed',
      last_error_category=p_error_category,
      available_at=now()+make_interval(secs=>least(3600,60*(2^(item.attempts-1)))),
      worker_id=null,lease_token_hash=null,lease_expires_at=null where id=item.id;
  else
    update public.notification_outbox set status='processing',
      last_error_category=p_error_category,available_at=now()+interval '15 minutes',
      worker_id=null,lease_token_hash=null,lease_expires_at=null where id=item.id;
  end if;
  return jsonb_build_object('status',case when terminal then 'dead_letter' else 'retry_scheduled' end);
end
$$;

revoke all on function public.register_push_device(uuid,uuid,text,text,text,text,smallint)
  from public,anon,authenticated;
revoke all on function public.revoke_push_devices(uuid,uuid)
  from public,anon,authenticated;
revoke all on function public.claim_notification_delivery(text,text)
  from public,anon,authenticated;
revoke all on function public.complete_notification_delivery(uuid,text,text,jsonb)
  from public,anon,authenticated;
revoke all on function public.complete_notification_receipts(uuid,text,text,jsonb)
  from public,anon,authenticated;
revoke all on function public.fail_notification_delivery(uuid,text,text,text)
  from public,anon,authenticated;
grant execute on function public.register_push_device(uuid,uuid,text,text,text,text,smallint)
  to service_role;
grant execute on function public.revoke_push_devices(uuid,uuid) to service_role;
grant execute on function public.claim_notification_delivery(text,text) to service_role;
grant execute on function public.complete_notification_delivery(uuid,text,text,jsonb)
  to service_role;
grant execute on function public.complete_notification_receipts(uuid,text,text,jsonb)
  to service_role;
grant execute on function public.fail_notification_delivery(uuid,text,text,text)
  to service_role;

revoke all on function private.assert_notification_lease(uuid,text,text,text)
  from public,anon,authenticated;
revoke all on function private.notification_dead_letter(uuid,text,integer)
  from public,anon,authenticated;
revoke all on function private.is_safe_push_failure_category(text)
  from public,anon,authenticated;
revoke all on function private.is_safe_notification_result_category(text)
  from public,anon,authenticated;

insert into public.data_export_table_classifications(
  table_name,classification,reason,manifest_categories,query_anchors
) values(
  'push_delivery_attempts','internal_security_only',
  'Push ticket and receipt routing metadata is security-sensitive operational delivery state.',
  '{}','{}'
) on conflict(table_name) do update set
  classification=excluded.classification,reason=excluded.reason,
  manifest_categories=excluded.manifest_categories,query_anchors=excluded.query_anchors;

commit;
