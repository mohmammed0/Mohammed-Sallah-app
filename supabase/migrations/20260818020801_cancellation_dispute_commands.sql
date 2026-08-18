begin;

alter table public.cancellation_requests
  add column expected_job_version integer,
  add column idempotency_key text,
  add column updated_at timestamptz not null default now(),
  add column resolved_at timestamptz;
alter table public.cancellation_requests
  add constraint cancellation_status_check
  check (status in ('pending','approved','rejected','financial_pending'));
create unique index cancellation_request_idempotency_idx
  on public.cancellation_requests(requester_id,idempotency_key)
  where idempotency_key is not null;
create unique index one_open_cancellation_per_job_idx
  on public.cancellation_requests(job_id)
  where job_id is not null and status in ('pending','financial_pending');

alter table public.disputes
  add column version integer not null default 1,
  add column expected_job_version integer,
  add column idempotency_key text,
  add column updated_at timestamptz not null default now();
create unique index dispute_idempotency_idx
  on public.disputes(opened_by,idempotency_key)
  where idempotency_key is not null;
create unique index one_open_dispute_per_job_idx
  on public.disputes(job_id)
  where status not in ('resolved','closed');

alter table public.resolution_actions
  add column status text not null default 'pending',
  add column completed_at timestamptz,
  add constraint resolution_action_type_check
    check (action_type in ('no_financial_action','release_to_provider','refund_customer','split')),
  add constraint resolution_action_status_check
    check (status in ('pending','confirmed','failed')),
  add constraint resolution_action_amount_check
    check (amount_minor is null or amount_minor >= 0);

create table public.financial_action_intents (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('cancellation','dispute')),
  source_id uuid not null,
  payment_id uuid not null references public.payments(id),
  refund_id uuid references public.refunds(id),
  action_type text not null check (action_type in ('void_authorization','refund','manual_refund')),
  amount_minor bigint not null default 0 check (amount_minor >= 0),
  status text not null default 'pending' check (status in ('pending','confirmed','failed')),
  idempotency_key text not null unique,
  provider_reference text,
  created_by uuid not null references public.profiles(id),
  confirmed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  failure_category text
);
create index financial_action_pending_idx
  on public.financial_action_intents(status,created_at)
  where status='pending';
create unique index one_pending_financial_action_per_source_idx
  on public.financial_action_intents(source_type,source_id)
  where status='pending';

alter table public.financial_holds
  add column cancellation_request_id uuid references public.cancellation_requests(id),
  add column dispute_id uuid references public.disputes(id);
create unique index one_held_cancellation_idx
  on public.financial_holds(cancellation_request_id)
  where cancellation_request_id is not null and status='held';
create unique index one_held_dispute_idx
  on public.financial_holds(dispute_id)
  where dispute_id is not null and status='held';

alter table public.financial_action_intents enable row level security;
create policy financial_action_participants_read
  on public.financial_action_intents for select to authenticated
  using (
    private.has_role(array['finance_reviewer','super_admin']::public.user_role[])
    or (
      source_type='cancellation'
      and exists (
        select 1 from public.cancellation_requests c
        where c.id=source_id
          and (c.requester_id=auth.uid() or (c.job_id is not null and private.can_access_job(c.job_id)))
      )
    )
    or (
      source_type='dispute'
      and exists (
        select 1 from public.disputes d
        where d.id=source_id and private.can_access_job(d.job_id)
      )
    )
  );
create policy cancellation_decisions_participants_read
  on public.cancellation_decisions for select to authenticated
  using (
    exists (
      select 1 from public.cancellation_requests c
      where c.id=cancellation_request_id
        and (c.requester_id=auth.uid() or private.is_admin()
          or (c.job_id is not null and private.can_access_job(c.job_id)))
    )
  );
create policy resolution_actions_participants_read
  on public.resolution_actions for select to authenticated
  using (
    exists (
      select 1 from public.disputes d
      where d.id=dispute_id and private.can_access_job(d.job_id)
    )
  );
grant select on public.financial_action_intents to authenticated;

create trigger cancellation_decisions_immutable
  before update or delete on public.cancellation_decisions
  for each row execute function private.reject_event_mutation();
create trigger dispute_events_immutable
  before update or delete on public.dispute_events
  for each row execute function private.reject_event_mutation();

revoke all on function public.request_cancellation(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.open_dispute(uuid,text,text) from public,anon,authenticated;

create function public.request_cancellation(
  p_job_id uuid,
  p_request_id uuid,
  p_reason text,
  p_expected_version integer,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  actor uuid:=auth.uid();
  existing jsonb;
  cancellation_id uuid;
  job public.jobs%rowtype;
  req public.service_requests%rowtype;
  payment public.payments%rowtype;
  refund_id uuid;
  financial_pending boolean:=false;
  auto_approve boolean:=false;
  result_payload jsonb;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if (p_job_id is null)=(p_request_id is null) then raise exception 'ONE_CANCELLATION_TARGET_REQUIRED'; end if;
  if length(trim(coalesce(p_reason,''))) not between 5 and 1000 then raise exception 'CANCELLATION_REASON_REQUIRED'; end if;
  if length(trim(coalesce(p_idempotency_key,''))) not between 8 and 128 then raise exception 'INVALID_IDEMPOTENCY_KEY'; end if;
  if p_expected_version is null or p_expected_version<1 then raise exception 'EXPECTED_VERSION_REQUIRED'; end if;

  perform pg_advisory_xact_lock(hashtextextended(actor::text||':request_cancellation:'||p_idempotency_key,0));
  select response into existing from public.idempotency_keys
    where user_id=actor and command='request_cancellation_v2' and key=p_idempotency_key;
  if existing is not null then return existing; end if;

  insert into public.idempotency_keys(user_id,command,key,request_hash)
  values(
    actor,'request_cancellation_v2',p_idempotency_key,
    encode(digest(concat_ws('|',p_job_id::text,p_request_id::text,p_reason,p_expected_version::text),'sha256'),'hex')
  );

  if p_request_id is not null then
    select * into req from public.service_requests
      where id=p_request_id and customer_id=actor for update;
    if req.id is null then raise exception 'CANCELLATION_ACCESS_DENIED'; end if;
    if req.version<>p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
    if req.status not in ('draft','approved','published','matching','receiving_offers') then
      raise exception 'REQUEST_NOT_CANCELLABLE';
    end if;

    insert into public.cancellation_requests(
      request_id,requester_id,lifecycle_state,reason,status,idempotency_key,resolved_at
    ) values(
      req.id,actor,req.status::text,trim(p_reason),'approved',p_idempotency_key,now()
    ) returning id into cancellation_id;
    update public.service_requests
      set status='cancelled',version=version+1,updated_at=now()
      where id=req.id;
    update public.offers set status='rejected',updated_at=now()
      where request_id=req.id and status='active';
    update public.request_provider_matches set status='closed'
      where request_id=req.id and status not in ('closed','selected');
    insert into public.cancellation_decisions(
      cancellation_request_id,actor_id,decision,reason,impact_snapshot
    ) values(
      cancellation_id,actor,'auto_approved','request_cancelled_before_assignment',
      jsonb_build_object('requestVersion',req.version+1,'financialActionRequired',false)
    );
    result_payload:=jsonb_build_object(
      'cancellationId',cancellation_id,'status','approved','targetType','request',
      'requestVersion',req.version+1,'financialActionRequired',false
    );
  else
    select * into job from public.jobs
      where id=p_job_id and actor in (customer_id,provider_id) for update;
    if job.id is null then raise exception 'CANCELLATION_ACCESS_DENIED'; end if;
    if job.version<>p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
    if job.status in ('completed','cancelled','disputed') then raise exception 'JOB_NOT_CANCELLABLE'; end if;
    if exists (
      select 1 from public.cancellation_requests c
      where c.job_id=job.id and c.status in ('pending','financial_pending')
    ) then raise exception 'CANCELLATION_ALREADY_OPEN'; end if;

    auto_approve:=actor=job.customer_id and job.status in ('provider_selected','scheduled');
    insert into public.cancellation_requests(
      job_id,requester_id,lifecycle_state,reason,status,expected_job_version,idempotency_key
    ) values(
      job.id,actor,job.status::text,trim(p_reason),case when auto_approve then 'approved' else 'pending' end,
      p_expected_version,p_idempotency_key
    ) returning id into cancellation_id;

    if auto_approve then
      select * into payment from public.payments where job_id=job.id order by created_at desc limit 1 for update;
      if payment.id is not null and payment.payment_mode='gateway'
        and payment.status not in ('cancelled','refunded','failed') then
        financial_pending:=true;
        if payment.status='captured' then
          insert into public.refunds(payment_id,amount_minor,reason,status,idempotency_key,created_by)
          values(payment.id,payment.amount_minor,trim(p_reason),'pending','cancel-refund:'||cancellation_id::text,actor)
          returning id into refund_id;
          insert into public.financial_action_intents(
            source_type,source_id,payment_id,refund_id,action_type,amount_minor,idempotency_key,created_by
          ) values(
            'cancellation',cancellation_id,payment.id,refund_id,'refund',payment.amount_minor,
            'cancel-action:'||cancellation_id::text,actor
          );
        else
          insert into public.financial_action_intents(
            source_type,source_id,payment_id,action_type,amount_minor,idempotency_key,created_by
          ) values(
            'cancellation',cancellation_id,payment.id,'void_authorization',0,
            'cancel-action:'||cancellation_id::text,actor
          );
        end if;
        insert into public.financial_holds(
          job_id,payment_id,amount_minor,reason,created_by,cancellation_request_id
        ) values(
          job.id,payment.id,payment.amount_minor,'cancellation_financial_confirmation_required',actor,cancellation_id
        );
      end if;

      update public.jobs set status='cancelled',version=version+1,updated_at=now()
        where id=job.id;
      update public.service_requests set status='cancelled',version=version+1,updated_at=now()
        where id=job.request_id and status<>'cancelled';
      update public.provider_profiles set active_workload=greatest(0,active_workload-1)
        where user_id=job.provider_id;
      insert into public.job_status_history(
        job_id,actor_id,previous_status,new_status,reason,idempotency_key,metadata
      ) values(
        job.id,actor,job.status,'cancelled',trim(p_reason),'cancel:'||cancellation_id::text,
        jsonb_build_object('cancellationId',cancellation_id,'automatic',true)
      );
      insert into public.job_events(job_id,event_type,actor_id,payload)
      values(job.id,'cancellation_approved',actor,jsonb_build_object('cancellationId',cancellation_id));
      update public.cancellation_requests
        set status=case when financial_pending then 'financial_pending' else 'approved' end,
            resolved_at=case when financial_pending then null else now() end,updated_at=now()
        where id=cancellation_id;
      insert into public.cancellation_decisions(
        cancellation_request_id,actor_id,decision,reason,refund_implication,impact_snapshot
      ) values(
        cancellation_id,actor,'auto_approved','early_customer_cancellation',
        case when financial_pending then 'external_confirmation_required' else 'none' end,
        jsonb_build_object('jobVersion',job.version+1,'financialActionRequired',financial_pending)
      );
      insert into public.notification_outbox(user_id,event_type,channel,payload,deduplication_key)
      values(
        job.provider_id,'job_cancelled','in_app',jsonb_build_object('jobId',job.id,'cancellationId',cancellation_id),
        'job-cancelled:'||cancellation_id::text||':'||job.provider_id::text
      ) on conflict(channel,deduplication_key) do nothing;
    else
      insert into public.notification_outbox(user_id,event_type,channel,payload,deduplication_key)
      select ur.user_id,'cancellation_review_required','in_app',
        jsonb_build_object('jobId',job.id,'cancellationId',cancellation_id),
        'cancellation-review:'||cancellation_id::text||':'||ur.user_id::text
      from public.user_roles ur
      where ur.role in ('operations_admin','support_agent','super_admin') and ur.revoked_at is null
      on conflict(channel,deduplication_key) do nothing;
    end if;

    result_payload:=jsonb_build_object(
      'cancellationId',cancellation_id,
      'status',case when auto_approve then case when financial_pending then 'financial_pending' else 'approved' end else 'pending' end,
      'targetType','job','jobVersion',case when auto_approve then job.version+1 else job.version end,
      'financialActionRequired',financial_pending
    );
  end if;

  update public.idempotency_keys set status='completed',response=result_payload
    where user_id=actor and command='request_cancellation_v2' and key=p_idempotency_key;
  return result_payload;
end $$;

create function public.request_job_cancellation(
  p_job_id uuid,
  p_reason text,
  p_expected_version integer,
  p_idempotency_key text
) returns jsonb
language sql security definer set search_path=public,pg_temp as $$
  select public.request_cancellation(
    p_job_id,null,p_reason,p_expected_version,p_idempotency_key
  )
$$;

create function public.request_service_request_cancellation(
  p_request_id uuid,
  p_reason text,
  p_expected_version integer,
  p_idempotency_key text
) returns jsonb
language sql security definer set search_path=public,pg_temp as $$
  select public.request_cancellation(
    null,p_request_id,p_reason,p_expected_version,p_idempotency_key
  )
$$;

create function public.decide_cancellation(
  p_cancellation_id uuid,
  p_approve boolean,
  p_fee_minor bigint,
  p_reason text,
  p_expected_job_version integer,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  actor uuid:=auth.uid();
  cancellation public.cancellation_requests%rowtype;
  job public.jobs%rowtype;
  payment public.payments%rowtype;
  existing jsonb;
  result_payload jsonb;
  refund_amount bigint:=0;
  refund_id uuid;
  financial_pending boolean:=false;
  audit_id uuid:=gen_random_uuid();
begin
  if not private.has_role(array['operations_admin','support_agent','finance_reviewer','super_admin']::public.user_role[]) then
    raise exception 'CANCELLATION_REVIEW_PERMISSION_REQUIRED';
  end if;
  if length(trim(coalesce(p_reason,''))) not between 5 and 1000 then raise exception 'DECISION_REASON_REQUIRED'; end if;
  if length(trim(coalesce(p_idempotency_key,''))) not between 8 and 128 then raise exception 'INVALID_IDEMPOTENCY_KEY'; end if;
  if coalesce(p_fee_minor,0)<0 then raise exception 'INVALID_CANCELLATION_FEE'; end if;
  if coalesce(p_fee_minor,0)>0 and not private.has_role(array['finance_reviewer','super_admin']::public.user_role[]) then
    raise exception 'FINANCE_PERMISSION_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(actor::text||':decide_cancellation:'||p_idempotency_key,0));
  select response into existing from public.idempotency_keys
    where user_id=actor and command='decide_cancellation' and key=p_idempotency_key;
  if existing is not null then return existing; end if;

  select * into cancellation from public.cancellation_requests
    where id=p_cancellation_id and status='pending' for update;
  if cancellation.id is null or cancellation.job_id is null then raise exception 'CANCELLATION_NOT_DECIDABLE'; end if;
  select * into job from public.jobs where id=cancellation.job_id for update;
  if job.id is null or job.version<>p_expected_job_version then raise exception 'VERSION_CONFLICT'; end if;
  if p_approve and job.status in ('completed','cancelled','disputed') then raise exception 'JOB_NOT_CANCELLABLE'; end if;
  if coalesce(p_fee_minor,0)>job.approved_total_minor then raise exception 'FEE_EXCEEDS_JOB_TOTAL'; end if;

  insert into public.idempotency_keys(user_id,command,key,request_hash)
  values(actor,'decide_cancellation',p_idempotency_key,
    encode(digest(concat_ws('|',p_cancellation_id::text,p_approve::text,p_fee_minor::text,p_expected_job_version::text),'sha256'),'hex'));

  if p_approve then
    select * into payment from public.payments where job_id=job.id order by created_at desc limit 1 for update;
    if payment.id is not null and payment.payment_mode='gateway'
      and payment.status not in ('cancelled','refunded','failed') then
      if payment.status<>'captured' and coalesce(p_fee_minor,0)>0 then raise exception 'FEE_REQUIRES_CAPTURED_PAYMENT'; end if;
      refund_amount:=case when payment.status='captured' then greatest(0,payment.amount_minor-coalesce(p_fee_minor,0)) else 0 end;
      if payment.status='captured' and refund_amount>0 then
        financial_pending:=true;
        insert into public.refunds(payment_id,amount_minor,reason,status,idempotency_key,created_by)
        values(payment.id,refund_amount,trim(p_reason),'pending','cancel-refund:'||cancellation.id::text,actor)
        returning id into refund_id;
        insert into public.financial_action_intents(
          source_type,source_id,payment_id,refund_id,action_type,amount_minor,idempotency_key,created_by
        ) values(
          'cancellation',cancellation.id,payment.id,refund_id,'refund',refund_amount,
          'cancel-action:'||cancellation.id::text,actor
        );
      elsif payment.status<>'captured' then
        financial_pending:=true;
        insert into public.financial_action_intents(
          source_type,source_id,payment_id,action_type,amount_minor,idempotency_key,created_by
        ) values(
          'cancellation',cancellation.id,payment.id,'void_authorization',0,
          'cancel-action:'||cancellation.id::text,actor
        );
      end if;
      if financial_pending then
        insert into public.financial_holds(
          job_id,payment_id,amount_minor,reason,created_by,cancellation_request_id
        ) values(
          job.id,payment.id,payment.amount_minor,'cancellation_financial_confirmation_required',actor,cancellation.id
        );
      end if;
    end if;

    update public.jobs set status='cancelled',version=version+1,updated_at=now() where id=job.id;
    update public.service_requests set status='cancelled',version=version+1,updated_at=now()
      where id=job.request_id and status<>'cancelled';
    update public.provider_profiles set active_workload=greatest(0,active_workload-1) where user_id=job.provider_id;
    insert into public.job_status_history(
      job_id,actor_id,previous_status,new_status,reason,idempotency_key,metadata
    ) values(
      job.id,actor,job.status,'cancelled',trim(p_reason),'cancel-decision:'||cancellation.id::text,
      jsonb_build_object('cancellationId',cancellation.id,'feeMinor',coalesce(p_fee_minor,0))
    );
    insert into public.job_events(job_id,event_type,actor_id,payload)
    values(job.id,'cancellation_approved',actor,jsonb_build_object('cancellationId',cancellation.id,'feeMinor',coalesce(p_fee_minor,0)));
  end if;

  update public.cancellation_requests
    set status=case when not p_approve then 'rejected' when financial_pending then 'financial_pending' else 'approved' end,
        resolved_at=case when financial_pending then null else now() end,updated_at=now()
    where id=cancellation.id;
  insert into public.cancellation_decisions(
    cancellation_request_id,actor_id,decision,reason,fee_minor,refund_implication,impact_snapshot
  ) values(
    cancellation.id,actor,case when p_approve then 'approved' else 'rejected' end,trim(p_reason),coalesce(p_fee_minor,0),
    case when financial_pending then 'external_confirmation_required' when p_approve then 'none' else null end,
    jsonb_build_object('jobVersion',case when p_approve then job.version+1 else job.version end,'financialActionRequired',financial_pending)
  );
  insert into public.admin_audit_logs(
    id,actor_id,action,target_type,target_id,reason,correlation_id,before_snapshot,after_snapshot
  ) values(
    audit_id,actor,'cancellation.decide','cancellation',cancellation.id,trim(p_reason),audit_id,
    jsonb_build_object('status',cancellation.status,'jobVersion',job.version),
    jsonb_build_object('approved',p_approve,'feeMinor',coalesce(p_fee_minor,0),'financialPending',financial_pending)
  );
  insert into public.notification_outbox(user_id,event_type,channel,payload,deduplication_key)
  select participant_id,'cancellation_decided','in_app',
    jsonb_build_object('jobId',job.id,'cancellationId',cancellation.id,'approved',p_approve,'financialPending',financial_pending),
    'cancellation-decided:'||cancellation.id::text||':'||participant_id::text
  from (values(job.customer_id),(job.provider_id)) participant(participant_id)
  on conflict(channel,deduplication_key) do nothing;

  result_payload:=jsonb_build_object(
    'cancellationId',cancellation.id,
    'status',case when not p_approve then 'rejected' when financial_pending then 'financial_pending' else 'approved' end,
    'jobVersion',case when p_approve then job.version+1 else job.version end,
    'financialActionRequired',financial_pending
  );
  update public.idempotency_keys set status='completed',response=result_payload
    where user_id=actor and command='decide_cancellation' and key=p_idempotency_key;
  return result_payload;
end $$;

create function public.open_dispute(
  p_job_id uuid,
  p_reason text,
  p_expected_version integer,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  actor uuid:=auth.uid();
  job public.jobs%rowtype;
  payment public.payments%rowtype;
  dispute_id uuid;
  existing jsonb;
  result_payload jsonb;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if length(trim(coalesce(p_reason,''))) not between 5 and 2000 then raise exception 'DISPUTE_REASON_REQUIRED'; end if;
  if length(trim(coalesce(p_idempotency_key,''))) not between 8 and 128 then raise exception 'INVALID_IDEMPOTENCY_KEY'; end if;
  if p_expected_version is null or p_expected_version<1 then raise exception 'EXPECTED_VERSION_REQUIRED'; end if;

  perform pg_advisory_xact_lock(hashtextextended(actor::text||':open_dispute:'||p_idempotency_key,0));
  select response into existing from public.idempotency_keys
    where user_id=actor and command='open_dispute_v2' and key=p_idempotency_key;
  if existing is not null then return existing; end if;

  select * into job from public.jobs where id=p_job_id and actor in (customer_id,provider_id) for update;
  if job.id is null then raise exception 'DISPUTE_ACCESS_DENIED'; end if;
  if job.version<>p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  if exists(select 1 from public.disputes d where d.job_id=job.id and d.status not in ('resolved','closed')) then
    raise exception 'DISPUTE_ALREADY_OPEN';
  end if;

  insert into public.idempotency_keys(user_id,command,key,request_hash)
  values(actor,'open_dispute_v2',p_idempotency_key,
    encode(digest(concat_ws('|',p_job_id::text,p_reason,p_expected_version::text),'sha256'),'hex'));
  insert into public.disputes(job_id,opened_by,reason,expected_job_version,idempotency_key)
  values(job.id,actor,trim(p_reason),p_expected_version,p_idempotency_key)
  returning id into dispute_id;
  insert into public.dispute_events(dispute_id,actor_id,event_type,reason,payload)
  values(dispute_id,actor,'opened',trim(p_reason),jsonb_build_object('jobVersion',job.version));

  select * into payment from public.payments where job_id=job.id order by created_at desc limit 1 for update;
  insert into public.financial_holds(job_id,payment_id,amount_minor,reason,created_by,dispute_id)
  values(job.id,payment.id,coalesce(payment.amount_minor,job.approved_total_minor),'dispute_opened',actor,dispute_id);
  if job.status<>'disputed' then
    update public.jobs set status='disputed',version=version+1,updated_at=now() where id=job.id;
    insert into public.job_status_history(
      job_id,actor_id,previous_status,new_status,reason,idempotency_key,metadata
    ) values(
      job.id,actor,job.status,'disputed',trim(p_reason),'dispute:'||dispute_id::text,
      jsonb_build_object('disputeId',dispute_id)
    );
  end if;
  insert into public.job_events(job_id,event_type,actor_id,payload)
  values(job.id,'dispute_opened',actor,jsonb_build_object('disputeId',dispute_id));
  insert into public.notification_outbox(user_id,event_type,channel,payload,deduplication_key)
  values(
    case when actor=job.customer_id then job.provider_id else job.customer_id end,
    'dispute_opened','in_app',jsonb_build_object('jobId',job.id,'disputeId',dispute_id),
    'dispute-opened:'||dispute_id::text
  ) on conflict(channel,deduplication_key) do nothing;

  result_payload:=jsonb_build_object(
    'disputeId',dispute_id,'status','open',
    'jobVersion',case when job.status='disputed' then job.version else job.version+1 end,
    'financialHold',true
  );
  update public.idempotency_keys set status='completed',response=result_payload
    where user_id=actor and command='open_dispute_v2' and key=p_idempotency_key;
  return result_payload;
end $$;

create function public.resolve_dispute(
  p_dispute_id uuid,
  p_action text,
  p_amount_minor bigint,
  p_reason text,
  p_expected_job_version integer,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  actor uuid:=auth.uid();
  dispute public.disputes%rowtype;
  job public.jobs%rowtype;
  payment public.payments%rowtype;
  existing jsonb;
  result_payload jsonb;
  action_id uuid;
  refund_id uuid;
  financial_pending boolean:=false;
  audit_id uuid:=gen_random_uuid();
begin
  if not private.has_role(array['operations_admin','support_agent','finance_reviewer','super_admin']::public.user_role[]) then
    raise exception 'DISPUTE_RESOLUTION_PERMISSION_REQUIRED';
  end if;
  if p_action not in ('no_financial_action','release_to_provider','refund_customer','split') then raise exception 'INVALID_RESOLUTION_ACTION'; end if;
  if p_action in ('release_to_provider','refund_customer','split')
    and not private.has_role(array['finance_reviewer','super_admin']::public.user_role[]) then
    raise exception 'FINANCE_PERMISSION_REQUIRED';
  end if;
  if length(trim(coalesce(p_reason,''))) not between 5 and 2000 then raise exception 'RESOLUTION_REASON_REQUIRED'; end if;
  if length(trim(coalesce(p_idempotency_key,''))) not between 8 and 128 then raise exception 'INVALID_IDEMPOTENCY_KEY'; end if;

  perform pg_advisory_xact_lock(hashtextextended(actor::text||':resolve_dispute:'||p_idempotency_key,0));
  select response into existing from public.idempotency_keys
    where user_id=actor and command='resolve_dispute' and key=p_idempotency_key;
  if existing is not null then return existing; end if;

  select * into dispute from public.disputes
    where id=p_dispute_id and status not in ('resolved','closed') for update;
  if dispute.id is null then raise exception 'DISPUTE_NOT_RESOLVABLE'; end if;
  select * into job from public.jobs where id=dispute.job_id for update;
  if job.version<>p_expected_job_version then raise exception 'VERSION_CONFLICT'; end if;
  select * into payment from public.payments where job_id=job.id order by created_at desc limit 1 for update;

  if p_action in ('refund_customer','split') then
    if payment.id is null then raise exception 'PAYMENT_REQUIRED_FOR_REFUND'; end if;
    if coalesce(p_amount_minor,0)<=0 or p_amount_minor>payment.amount_minor then raise exception 'INVALID_REFUND_AMOUNT'; end if;
    if p_action='split' and p_amount_minor>=payment.amount_minor then raise exception 'SPLIT_REQUIRES_PARTIAL_AMOUNT'; end if;
  elsif coalesce(p_amount_minor,0)<>0 then
    raise exception 'AMOUNT_NOT_ALLOWED_FOR_ACTION';
  end if;

  insert into public.idempotency_keys(user_id,command,key,request_hash)
  values(actor,'resolve_dispute',p_idempotency_key,
    encode(digest(concat_ws('|',p_dispute_id::text,p_action,p_amount_minor::text,p_expected_job_version::text),'sha256'),'hex'));
  insert into public.resolution_actions(
    dispute_id,actor_id,action_type,amount_minor,reason,idempotency_key,status
  ) values(
    dispute.id,actor,p_action,p_amount_minor,trim(p_reason),p_idempotency_key,
    case when p_action in ('refund_customer','split') then 'pending' else 'confirmed' end
  ) returning id into action_id;

  if p_action in ('refund_customer','split') then
    financial_pending:=true;
    insert into public.refunds(payment_id,amount_minor,reason,status,idempotency_key,created_by)
    values(payment.id,p_amount_minor,trim(p_reason),'pending','dispute-refund:'||action_id::text,actor)
    returning id into refund_id;
    insert into public.financial_action_intents(
      source_type,source_id,payment_id,refund_id,action_type,amount_minor,idempotency_key,created_by
    ) values(
      'dispute',dispute.id,payment.id,refund_id,
      case when payment.payment_mode='gateway' then 'refund' else 'manual_refund' end,
      p_amount_minor,'dispute-action:'||action_id::text,actor
    );
    update public.disputes set status='waiting_operations',version=version+1,updated_at=now() where id=dispute.id;
  else
    update public.financial_holds set status='released',released_by=actor,released_at=now()
      where dispute_id=dispute.id and status='held';
    update public.disputes set status='resolved',resolved_at=now(),version=version+1,updated_at=now() where id=dispute.id;
    update public.resolution_actions set completed_at=now() where id=action_id;
  end if;

  insert into public.dispute_events(dispute_id,actor_id,event_type,reason,payload)
  values(
    dispute.id,actor,case when financial_pending then 'resolution_pending_finance' else 'resolved' end,trim(p_reason),
    jsonb_build_object('actionId',action_id,'action',p_action,'amountMinor',coalesce(p_amount_minor,0))
  );
  insert into public.admin_audit_logs(
    id,actor_id,action,target_type,target_id,reason,correlation_id,before_snapshot,after_snapshot
  ) values(
    audit_id,actor,'dispute.resolve','dispute',dispute.id,trim(p_reason),audit_id,
    jsonb_build_object('status',dispute.status,'version',dispute.version),
    jsonb_build_object('action',p_action,'amountMinor',coalesce(p_amount_minor,0),'financialPending',financial_pending)
  );
  insert into public.notification_outbox(user_id,event_type,channel,payload,deduplication_key)
  select participant_id,'dispute_resolution_updated','in_app',
    jsonb_build_object('jobId',job.id,'disputeId',dispute.id,'financialPending',financial_pending),
    'dispute-resolution:'||action_id::text||':'||participant_id::text
  from (values(job.customer_id),(job.provider_id)) participant(participant_id)
  on conflict(channel,deduplication_key) do nothing;

  result_payload:=jsonb_build_object(
    'disputeId',dispute.id,'actionId',action_id,
    'status',case when financial_pending then 'waiting_operations' else 'resolved' end,
    'disputeVersion',dispute.version+1,'financialActionRequired',financial_pending
  );
  update public.idempotency_keys set status='completed',response=result_payload
    where user_id=actor and command='resolve_dispute' and key=p_idempotency_key;
  return result_payload;
end $$;

create function public.confirm_financial_action(
  p_intent_id uuid,
  p_provider_reference text,
  p_reason text,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  actor uuid:=auth.uid();
  intent public.financial_action_intents%rowtype;
  payment public.payments%rowtype;
  cancellation public.cancellation_requests%rowtype;
  dispute public.disputes%rowtype;
  existing jsonb;
  result_payload jsonb;
  refunded_total bigint;
  audit_id uuid:=gen_random_uuid();
begin
  if not private.has_role(array['finance_reviewer','super_admin']::public.user_role[]) then raise exception 'FINANCE_PERMISSION_REQUIRED'; end if;
  if length(trim(coalesce(p_provider_reference,''))) not between 3 and 200 then raise exception 'PROVIDER_REFERENCE_REQUIRED'; end if;
  if length(trim(coalesce(p_reason,''))) not between 5 and 1000 then raise exception 'CONFIRMATION_REASON_REQUIRED'; end if;
  if length(trim(coalesce(p_idempotency_key,''))) not between 8 and 128 then raise exception 'INVALID_IDEMPOTENCY_KEY'; end if;

  perform pg_advisory_xact_lock(hashtextextended(actor::text||':confirm_financial_action:'||p_idempotency_key,0));
  select response into existing from public.idempotency_keys
    where user_id=actor and command='confirm_financial_action' and key=p_idempotency_key;
  if existing is not null then return existing; end if;
  select * into intent from public.financial_action_intents where id=p_intent_id for update;
  if intent.id is null or intent.status<>'pending' then raise exception 'FINANCIAL_ACTION_NOT_CONFIRMABLE'; end if;
  select * into payment from public.payments where id=intent.payment_id for update;

  insert into public.idempotency_keys(user_id,command,key,request_hash)
  values(actor,'confirm_financial_action',p_idempotency_key,
    encode(digest(concat_ws('|',p_intent_id::text,p_provider_reference),'sha256'),'hex'));
  update public.financial_action_intents
    set status='confirmed',provider_reference=trim(p_provider_reference),confirmed_by=actor,completed_at=now()
    where id=intent.id;

  if intent.action_type='void_authorization' then
    update public.payments
      set status='cancelled',provider_reference=trim(p_provider_reference),version=version+1,updated_at=now()
      where id=payment.id;
    insert into public.payment_events(payment_id,event_type,amount_minor,provider_event_id,payload_hash)
    values(payment.id,'authorization_cancelled',0,'financial-action:'||intent.id::text,
      encode(digest(trim(p_provider_reference),'sha256'),'hex'));
  else
    update public.refunds
      set status='refunded',provider_reference=trim(p_provider_reference)
      where id=intent.refund_id and status='pending';
    insert into public.payment_events(payment_id,event_type,amount_minor,provider_event_id,payload_hash)
    values(payment.id,'refunded',intent.amount_minor,'financial-action:'||intent.id::text,
      encode(digest(trim(p_provider_reference),'sha256'),'hex'));
    select coalesce(sum(amount_minor),0) into refunded_total from public.refunds
      where payment_id=payment.id and status='refunded';
    update public.payments
      set status=case when refunded_total>=amount_minor then 'refunded'::public.financial_status else status end,
          version=version+1,updated_at=now()
      where id=payment.id;
  end if;

  if intent.source_type='cancellation' then
    select * into cancellation from public.cancellation_requests where id=intent.source_id for update;
    update public.financial_holds set status='released',released_by=actor,released_at=now()
      where cancellation_request_id=cancellation.id and status='held';
    update public.cancellation_requests set status='approved',resolved_at=now(),updated_at=now()
      where id=cancellation.id;
  else
    select * into dispute from public.disputes where id=intent.source_id for update;
    update public.financial_holds set status='released',released_by=actor,released_at=now()
      where dispute_id=dispute.id and status='held';
    update public.disputes set status='resolved',resolved_at=now(),version=version+1,updated_at=now()
      where id=dispute.id;
    update public.resolution_actions set status='confirmed',completed_at=now()
      where dispute_id=dispute.id and status='pending';
    insert into public.dispute_events(dispute_id,actor_id,event_type,reason,payload)
    values(dispute.id,actor,'financial_action_confirmed',trim(p_reason),jsonb_build_object('intentId',intent.id));
  end if;

  insert into public.admin_audit_logs(
    id,actor_id,action,target_type,target_id,reason,correlation_id,before_snapshot,after_snapshot
  ) values(
    audit_id,actor,'financial_action.confirm','financial_action',intent.id,trim(p_reason),audit_id,
    jsonb_build_object('status',intent.status,'sourceType',intent.source_type),
    jsonb_build_object('status','confirmed','providerReferenceHash',encode(digest(trim(p_provider_reference),'sha256'),'hex'))
  );
  result_payload:=jsonb_build_object(
    'intentId',intent.id,'status','confirmed','sourceType',intent.source_type,'sourceId',intent.source_id
  );
  update public.idempotency_keys set status='completed',response=result_payload
    where user_id=actor and command='confirm_financial_action' and key=p_idempotency_key;
  return result_payload;
end $$;

revoke all on function public.request_cancellation(uuid,uuid,text,integer,text) from public,anon,authenticated;
revoke all on function public.request_job_cancellation(uuid,text,integer,text) from public,anon,authenticated;
revoke all on function public.request_service_request_cancellation(uuid,text,integer,text) from public,anon,authenticated;
revoke all on function public.decide_cancellation(uuid,boolean,bigint,text,integer,text) from public,anon,authenticated;
revoke all on function public.open_dispute(uuid,text,integer,text) from public,anon,authenticated;
revoke all on function public.resolve_dispute(uuid,text,bigint,text,integer,text) from public,anon,authenticated;
revoke all on function public.confirm_financial_action(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.request_job_cancellation(uuid,text,integer,text) to authenticated;
grant execute on function public.request_service_request_cancellation(uuid,text,integer,text) to authenticated;
grant execute on function public.decide_cancellation(uuid,boolean,bigint,text,integer,text) to authenticated;
grant execute on function public.open_dispute(uuid,text,integer,text) to authenticated;
grant execute on function public.resolve_dispute(uuid,text,bigint,text,integer,text) to authenticated;
grant execute on function public.confirm_financial_action(uuid,text,text,text) to authenticated;

commit;
