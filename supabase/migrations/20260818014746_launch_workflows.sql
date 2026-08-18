begin;

alter table public.account_deletion_requests
  add column attempts integer not null default 0 check (attempts between 0 and 20),
  add column scheduled_at timestamptz not null default now(),
  add column locked_at timestamptz,
  add column last_attempt_at timestamptz,
  add column last_error_at timestamptz;

alter table public.account_deletion_requests
  add constraint account_deletion_status_check
  check (status in ('requested','verified','blocked_retention','processing','completed','failed'));

drop index public.one_open_deletion_per_user;
create unique index one_open_deletion_per_user
  on public.account_deletion_requests(user_id)
  where status in ('requested','verified','blocked_retention','processing');

alter table public.data_export_requests
  add column signed_download_url text,
  add column attempts integer not null default 0 check (attempts between 0 and 20),
  add column scheduled_at timestamptz not null default now(),
  add column locked_at timestamptz,
  add column last_attempt_at timestamptz,
  add column last_error_at timestamptz,
  add column version integer not null default 1;

alter table public.data_export_requests
  add constraint data_export_status_check
  check (status in ('requested','processing','completed','expired','failed'));

create unique index one_open_export_per_user
  on public.data_export_requests(user_id)
  where status in ('requested','processing','completed');

alter table public.scheduled_jobs
  add column worker_id text,
  add column last_error_at timestamptz;

create table public.privacy_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  request_id uuid not null,
  request_type text not null check (request_type in ('account_deletion','data_export')),
  event_type text not null,
  actor_id uuid references public.profiles(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index privacy_events_user_idx
  on public.privacy_events(user_id,created_at desc);

alter table public.privacy_events enable row level security;
revoke all on public.privacy_events from public,anon,authenticated;
grant select on public.privacy_events to authenticated;
create policy privacy_events_owner_read
  on public.privacy_events
  for select
  to authenticated
  using ((select auth.uid())=user_id or (select private.is_admin()));

create trigger privacy_events_immutable
  before update or delete on public.privacy_events
  for each row execute function private.reject_event_mutation();

insert into public.system_settings(key,value,sensitive)
values (
  'privacy.retention',
  '{"policyVersion":"sa-conservative-v1","legalYears":10,"financialYears":10,"exportLinkSeconds":3600,"exportCleanupHours":24,"maxWorkerAttempts":5}'::jsonb,
  false
)
on conflict(key) do update
set value=excluded.value,version=public.system_settings.version+1,updated_at=now();

create or replace function public.request_account_deletion(
  p_reauthentication_token text default null
) returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  actor uuid:=auth.uid();
  request_id uuid;
  issued bigint;
  active_jobs integer;
  open_disputes integer;
  pending_financial integer;
  snapshot jsonb;
  blocked boolean;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  issued:=coalesce((auth.jwt()->>'iat')::bigint,0);
  if extract(epoch from now())::bigint-issued>600 then
    raise exception 'RECENT_REAUTHENTICATION_REQUIRED';
  end if;

  select id into request_id
  from account_deletion_requests
  where user_id=actor and status in ('requested','verified','blocked_retention','processing')
  order by requested_at desc
  limit 1;
  if request_id is not null then return request_id; end if;

  select count(*) into active_jobs
  from jobs
  where actor in (customer_id,provider_id)
    and status not in ('completed','cancelled');
  select count(*) into open_disputes
  from disputes d
  join jobs j on j.id=d.job_id
  where actor in (j.customer_id,j.provider_id)
    and d.status not in ('resolved','closed');
  select
    (select count(*) from payments where actor in (customer_id,provider_id) and status in ('pending','authorized'))+
    (select count(*) from refunds r join payments p on p.id=r.payment_id where actor in (p.customer_id,p.provider_id) and r.status='pending')+
    (select count(*) from financial_holds h join jobs j on j.id=h.job_id where actor in (j.customer_id,j.provider_id) and h.status='held')
  into pending_financial;

  snapshot:=jsonb_build_object(
    'policyVersion','sa-conservative-v1',
    'activeJobs',active_jobs,
    'openDisputes',open_disputes,
    'pendingFinancialActions',pending_financial,
    'ledgerRetentionYears',10
  );
  blocked:=active_jobs>0 or open_disputes>0 or pending_financial>0;

  insert into account_deletion_requests(user_id,status,verified_at,retention_snapshot,scheduled_at)
  values(
    actor,
    case when blocked then 'blocked_retention' else 'verified' end,
    now(),
    snapshot,
    now()
  )
  returning id into request_id;

  update profiles set status='deletion_pending' where id=actor;
  delete from push_tokens where user_id=actor;

  insert into privacy_events(user_id,request_id,request_type,event_type,actor_id,metadata)
  values(
    actor,
    request_id,
    'account_deletion',
    case when blocked then 'blocked_retention' else 'requested' end,
    actor,
    snapshot
  );

  if not blocked then
    insert into scheduled_jobs(job_type,payload,scheduled_at)
    values(
      'account_deletion',
      jsonb_build_object('requestId',request_id,'userId',actor,'schemaVersion','1'),
      now()
    );
  end if;
  return request_id;
end $$;

create or replace function public.request_data_export(
  p_reauthentication_token text default null
) returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  actor uuid:=auth.uid();
  result uuid;
  issued bigint;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  issued:=coalesce((auth.jwt()->>'iat')::bigint,0);
  if extract(epoch from now())::bigint-issued>600 then
    raise exception 'RECENT_REAUTHENTICATION_REQUIRED';
  end if;

  select id into result
  from data_export_requests
  where user_id=actor and status in ('requested','processing','completed')
  order by requested_at desc
  limit 1;
  if result is not null then return result; end if;

  insert into data_export_requests(user_id,status,scheduled_at)
  values(actor,'requested',now())
  returning id into result;
  insert into scheduled_jobs(job_type,payload,scheduled_at)
  values(
    'data_export',
    jsonb_build_object('requestId',result,'userId',actor,'schemaVersion','1'),
    now()
  );
  insert into privacy_events(user_id,request_id,request_type,event_type,actor_id)
  values(actor,result,'data_export','requested',actor);
  return result;
end $$;

create or replace function public.claim_privacy_job(
  p_worker_id text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  item public.scheduled_jobs%rowtype;
  v_request_id uuid;
  v_user_id uuid;
begin
  if char_length(trim(coalesce(p_worker_id,''))) not between 3 and 120 then
    raise exception 'INVALID_WORKER_ID';
  end if;

  select * into item
  from public.scheduled_jobs
  where job_type in ('account_deletion','data_export')
    and scheduled_at<=now()
    and (
      status='pending'
      or (status='processing' and locked_at<now()-interval '15 minutes')
    )
  order by scheduled_at,id
  limit 1
  for update skip locked;
  if item.id is null then return null; end if;

  v_request_id:=(item.payload->>'requestId')::uuid;
  v_user_id:=(item.payload->>'userId')::uuid;
  update public.scheduled_jobs
  set status='processing',attempts=attempts+1,locked_at=now(),worker_id=p_worker_id,
      error_category=null,last_error_at=null
  where id=item.id;

  if item.job_type='account_deletion' then
    update public.account_deletion_requests
    set status='processing',attempts=attempts+1,locked_at=now(),last_attempt_at=now(),
        failure_category=null,last_error_at=null,version=version+1
    where id=v_request_id and user_id=v_user_id
      and status in ('verified','processing');
  else
    update public.data_export_requests
    set status='processing',attempts=attempts+1,locked_at=now(),last_attempt_at=now(),
        failure_category=null,last_error_at=null,version=version+1
    where id=v_request_id and user_id=v_user_id
      and status in ('requested','processing');
  end if;

  if not found then
    update public.scheduled_jobs
    set status='failed',error_category='request_not_claimable',last_error_at=now()
    where id=item.id;
    return null;
  end if;

  insert into public.privacy_events(
    user_id,request_id,request_type,event_type,metadata
  ) values(
    v_user_id,v_request_id,item.job_type,'worker_claimed',
    jsonb_build_object('jobId',item.id,'attempt',item.attempts+1,'workerId',p_worker_id)
  );
  return jsonb_build_object(
    'jobId',item.id,
    'jobType',item.job_type,
    'requestId',v_request_id,
    'userId',v_user_id,
    'attempt',item.attempts+1
  );
end $$;

create or replace function public.fail_privacy_job(
  p_job_id uuid,
  p_request_id uuid,
  p_error_category text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  item public.scheduled_jobs%rowtype;
  v_user_id uuid;
  terminal boolean;
  retry_seconds integer;
begin
  if p_error_category !~ '^[a-z0-9_]{3,80}$' then
    raise exception 'INVALID_ERROR_CATEGORY';
  end if;
  select * into item from public.scheduled_jobs where id=p_job_id for update;
  if item.id is null or item.status<>'processing' then
    raise exception 'JOB_NOT_PROCESSING';
  end if;
  if (item.payload->>'requestId')::uuid<>p_request_id then
    raise exception 'REQUEST_JOB_MISMATCH';
  end if;
  v_user_id:=(item.payload->>'userId')::uuid;
  terminal:=item.attempts>=5;
  retry_seconds:=least(3600,30*(2^greatest(0,item.attempts-1)))::integer;

  update public.scheduled_jobs
  set status=case when terminal then 'dead_letter' else 'pending' end,
      scheduled_at=case when terminal then scheduled_at else now()+make_interval(secs=>retry_seconds) end,
      locked_at=null,worker_id=null,error_category=p_error_category,last_error_at=now()
  where id=item.id;

  if item.job_type='account_deletion' then
    update public.account_deletion_requests
    set status=case when terminal then 'failed' else 'verified' end,
        locked_at=null,failure_category=p_error_category,last_error_at=now(),version=version+1
    where id=p_request_id and user_id=v_user_id;
  else
    update public.data_export_requests
    set status=case when terminal then 'failed' else 'requested' end,
        locked_at=null,failure_category=p_error_category,last_error_at=now(),version=version+1
    where id=p_request_id and user_id=v_user_id;
  end if;

  insert into public.privacy_events(user_id,request_id,request_type,event_type,metadata)
  values(
    v_user_id,p_request_id,item.job_type,
    case when terminal then 'worker_dead_lettered' else 'worker_retry_scheduled' end,
    jsonb_build_object('jobId',item.id,'attempt',item.attempts,'category',p_error_category,'retrySeconds',retry_seconds)
  );
  if terminal then
    insert into public.dead_letter_events(source_type,source_id,error_category,payload,attempts)
    values(item.job_type,item.id,p_error_category,item.payload,item.attempts);
  end if;
  return jsonb_build_object('terminal',terminal,'retrySeconds',case when terminal then null else retry_seconds end);
end $$;

create or replace function public.build_data_export(
  p_request_id uuid,
  p_user_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  valid_request boolean;
begin
  select exists(
    select 1 from public.data_export_requests
    where id=p_request_id and user_id=p_user_id and status='processing'
  ) into valid_request;
  if not valid_request then raise exception 'EXPORT_REQUEST_NOT_PROCESSING'; end if;

  return jsonb_build_object(
    'schemaVersion','1',
    'generatedAt',now(),
    'requestId',p_request_id,
    'profile',coalesce((
      select to_jsonb(p)-'phone'
      from public.profiles p where p.id=p_user_id
    ),'{}'::jsonb),
    'contact',coalesce((
      select jsonb_build_object('phone',p.phone)
      from public.profiles p where p.id=p_user_id
    ),'{}'::jsonb),
    'roles',coalesce((
      select jsonb_agg(to_jsonb(r) order by r.granted_at)
      from public.user_roles r where r.user_id=p_user_id
    ),'[]'::jsonb),
    'preferences',coalesce((
      select to_jsonb(p) from public.user_preferences p where p.user_id=p_user_id
    ),'{}'::jsonb),
    'addresses',coalesce((
      select jsonb_agg(to_jsonb(a)-'location' order by a.created_at)
      from public.addresses a where a.user_id=p_user_id
    ),'[]'::jsonb),
    'serviceRequests',coalesce((
      select jsonb_agg(to_jsonb(r)-'approximate_location' order by r.created_at)
      from public.service_requests r where r.customer_id=p_user_id
    ),'[]'::jsonb),
    'offers',coalesce((
      select jsonb_agg(to_jsonb(o) order by o.created_at)
      from public.offers o where o.provider_id=p_user_id
    ),'[]'::jsonb),
    'jobs',coalesce((
      select jsonb_agg(to_jsonb(j) order by j.created_at)
      from public.jobs j where p_user_id in (j.customer_id,j.provider_id)
    ),'[]'::jsonb),
    'messages',coalesce((
      select jsonb_agg(to_jsonb(m) order by m.created_at)
      from public.messages m where m.sender_id=p_user_id
    ),'[]'::jsonb),
    'supportCases',coalesce((
      select jsonb_agg(to_jsonb(c) order by c.created_at)
      from public.support_cases c where c.opened_by=p_user_id
    ),'[]'::jsonb),
    'cancellations',coalesce((
      select jsonb_agg(to_jsonb(c) order by c.created_at)
      from public.cancellation_requests c where c.requester_id=p_user_id
    ),'[]'::jsonb),
    'disputes',coalesce((
      select jsonb_agg(to_jsonb(d) order by d.created_at)
      from public.disputes d where d.opened_by=p_user_id
    ),'[]'::jsonb),
    'payments',coalesce((
      select jsonb_agg(to_jsonb(p)-'provider_reference' order by p.created_at)
      from public.payments p where p_user_id in (p.customer_id,p.provider_id)
    ),'[]'::jsonb),
    'legalAcceptances',coalesce((
      select jsonb_agg(to_jsonb(a)-'ip_hash'-'user_agent_hash' order by a.accepted_at)
      from public.legal_acceptances a where a.user_id=p_user_id
    ),'[]'::jsonb),
    'privacyRequests',jsonb_build_object(
      'deletion',coalesce((
        select jsonb_agg(to_jsonb(d) order by d.requested_at)
        from public.account_deletion_requests d where d.user_id=p_user_id
      ),'[]'::jsonb),
      'exports',coalesce((
        select jsonb_agg(to_jsonb(e)-'signed_download_url' order by e.requested_at)
        from public.data_export_requests e where e.user_id=p_user_id
      ),'[]'::jsonb)
    )
  );
end $$;

create or replace function public.complete_data_export(
  p_job_id uuid,
  p_request_id uuid,
  p_private_storage_path text,
  p_signed_download_url text,
  p_expires_at timestamptz
) returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  item public.data_export_requests%rowtype;
begin
  select * into item
  from public.data_export_requests
  where id=p_request_id
  for update;
  if item.id is null then raise exception 'EXPORT_REQUEST_NOT_FOUND'; end if;
  if item.status='completed' then return; end if;
  if item.status<>'processing' then raise exception 'EXPORT_REQUEST_NOT_PROCESSING'; end if;
  if p_private_storage_path not like item.user_id::text||'/%' then
    raise exception 'INVALID_EXPORT_PATH';
  end if;
  if p_expires_at<=now() or p_expires_at>now()+interval '2 hours' then
    raise exception 'INVALID_EXPORT_EXPIRY';
  end if;
  if char_length(coalesce(p_signed_download_url,''))<40 then
    raise exception 'INVALID_SIGNED_URL';
  end if;

  update public.data_export_requests
  set status='completed',completed_at=now(),private_storage_path=p_private_storage_path,
      signed_download_url=p_signed_download_url,expires_at=p_expires_at,locked_at=null,
      failure_category=null,version=version+1
  where id=item.id;
  update public.scheduled_jobs
  set status='completed',completed_at=now(),locked_at=null
  where id=p_job_id
    and job_type='data_export'
    and (payload->>'requestId')::uuid=item.id;
  if not found then raise exception 'EXPORT_JOB_MISMATCH'; end if;
  insert into public.privacy_events(user_id,request_id,request_type,event_type,metadata)
  values(
    item.user_id,item.id,'data_export','completed',
    jsonb_build_object('jobId',p_job_id,'expiresAt',p_expires_at,'path',p_private_storage_path)
  );
end $$;

create or replace function public.expire_data_export(
  p_request_id uuid
) returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  item public.data_export_requests%rowtype;
begin
  select * into item from public.data_export_requests where id=p_request_id for update;
  if item.id is null then return; end if;
  if item.status='expired' then return; end if;
  if item.status<>'completed' or item.expires_at>now() then
    raise exception 'EXPORT_NOT_EXPIRED';
  end if;
  update public.data_export_requests
  set status='expired',private_storage_path=null,signed_download_url=null,version=version+1
  where id=item.id;
  insert into public.privacy_events(user_id,request_id,request_type,event_type)
  values(item.user_id,item.id,'data_export','expired_and_removed');
end $$;

create or replace function public.complete_account_deletion(
  p_job_id uuid,
  p_request_id uuid
) returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  item public.account_deletion_requests%rowtype;
  v_user_id uuid;
begin
  select * into item
  from public.account_deletion_requests
  where id=p_request_id
  for update;
  if item.id is null then raise exception 'DELETION_REQUEST_NOT_FOUND'; end if;
  if item.status='completed' then return; end if;
  if item.status<>'processing' then raise exception 'DELETION_REQUEST_NOT_PROCESSING'; end if;
  v_user_id:=item.user_id;

  update public.addresses
  set label='anonymized',formatted_address='anonymized',building=null,unit=null,access_notes=null,
      location=extensions.st_setsrid(extensions.st_makepoint(0,0),4326)::extensions.geography,
      is_default=false,deleted_at=now(),updated_at=now()
  where addresses.user_id=v_user_id;
  update public.legal_acceptances set ip_hash=null,user_agent_hash=null where legal_acceptances.user_id=v_user_id;
  delete from public.push_tokens where push_tokens.user_id=v_user_id;
  delete from public.user_devices where user_devices.user_id=v_user_id;
  delete from public.blocked_users where blocker_id=v_user_id or blocked_id=v_user_id;
  delete from public.user_preferences where user_preferences.user_id=v_user_id;
  delete from public.notification_preferences where notification_preferences.user_id=v_user_id;
  delete from public.provider_payout_accounts where provider_id=v_user_id;

  update public.provider_profiles
  set business_name=null,commercial_registration_reference=null,bio=null,accepting_requests=false,
      verification_status='suspended',updated_at=now()
  where provider_profiles.user_id=v_user_id;
  update public.provider_documents
  set storage_path='deleted/'||id::text,content_hash=encode(extensions.digest(gen_random_uuid()::text,'sha256'),'hex'),
      deleted_at=now(),status='rejected'
  where provider_id=v_user_id;
  update public.provider_portfolio_items
  set title='anonymized',description=null,storage_path='deleted/'||id::text
  where provider_id=v_user_id;

  update public.service_requests
  set title='anonymized',structured_description='anonymized',original_text='anonymized',
      approximate_location=null,ai_provider=null,ai_model=null,deleted_at=coalesce(deleted_at,now()),updated_at=now()
  where customer_id=v_user_id;
  update public.request_translations
  set original_content='{}'::jsonb,translated_content=null,status='expired',updated_at=now()
  where request_id in (
    select id from public.service_requests where customer_id=v_user_id
  );
  update public.transcription_jobs
  set private_audio_path='deleted/'||id::text,transcript=null,customer_edited_transcript=null,
      status='expired',completed_at=coalesce(completed_at,now())
  where transcription_jobs.user_id=v_user_id;
  update public.ai_messages
  set original_content='anonymized',redacted_content='anonymized'
  where session_id in (
    select id from public.ai_sessions where ai_sessions.user_id=v_user_id
  );
  update public.ai_diagnostics
  set structured_output='{}'::jsonb,customer_edited_output=null
  where session_id in (
    select id from public.ai_sessions where ai_sessions.user_id=v_user_id
  );
  update public.ai_sessions
  set status='anonymized',ended_at=coalesce(ended_at,now())
  where ai_sessions.user_id=v_user_id;
  update public.ai_rate_limit_events
  set ip_hash=null where ai_rate_limit_events.user_id=v_user_id;

  update public.messages
  set body='anonymized',deleted_at=coalesce(deleted_at,now())
  where sender_id=v_user_id;
  update public.message_attachments
  set storage_path='deleted/'||id::text
  where uploader_id=v_user_id;
  update public.job_notes
  set body='anonymized',deleted_at=coalesce(deleted_at,now())
  where author_id=v_user_id;
  update public.support_case_messages
  set body='anonymized',visible_to_user=false
  where sender_id=v_user_id;
  update public.support_case_evidence
  set private_storage_path='deleted/'||id::text,content_hash=null
  where uploader_id=v_user_id;
  delete from public.notification_outbox where notification_outbox.user_id=v_user_id;
  delete from public.user_roles where user_roles.user_id=v_user_id;

  update public.profiles
  set display_name='Deleted user',phone=null,preferred_locale='ar',avatar_path=null,
      status='anonymized',anonymized_at=now(),updated_at=now()
  where id=v_user_id;
  update public.data_export_requests
  set status=case when status='completed' then 'expired' else 'failed' end,
      private_storage_path=null,signed_download_url=null,expires_at=now(),
      failure_category=case when status='completed' then failure_category else 'account_deleted' end,
      version=version+1
  where data_export_requests.user_id=v_user_id
    and status<>'expired';

  update public.account_deletion_requests
  set status='completed',completed_at=now(),locked_at=null,failure_category=null,
      retention_snapshot=retention_snapshot||jsonb_build_object(
        'anonymizedAt',now(),'authDeletionMode','soft','storageRemoved',true
      ),
      version=version+1
  where id=item.id;
  update public.scheduled_jobs
  set status='completed',completed_at=now(),locked_at=null
  where id=p_job_id
    and job_type='account_deletion'
    and (payload->>'requestId')::uuid=item.id;
  if not found then raise exception 'DELETION_JOB_MISMATCH'; end if;
  insert into public.privacy_events(user_id,request_id,request_type,event_type,metadata)
  values(
    v_user_id,item.id,'account_deletion','completed',
    jsonb_build_object('jobId',p_job_id,'authDeletionMode','soft','storageRemoved',true)
  );
end $$;

revoke all on function public.claim_privacy_job(text) from public,anon,authenticated;
revoke all on function public.fail_privacy_job(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.build_data_export(uuid,uuid) from public,anon,authenticated;
revoke all on function public.complete_data_export(uuid,uuid,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.expire_data_export(uuid) from public,anon,authenticated;
revoke all on function public.complete_account_deletion(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_privacy_job(text) to service_role;
grant execute on function public.fail_privacy_job(uuid,uuid,text) to service_role;
grant execute on function public.build_data_export(uuid,uuid) to service_role;
grant execute on function public.complete_data_export(uuid,uuid,text,text,timestamptz) to service_role;
grant execute on function public.expire_data_export(uuid) to service_role;
grant execute on function public.complete_account_deletion(uuid,uuid) to service_role;

commit;
