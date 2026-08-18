begin;

alter table public.payments
  add column refunded_minor bigint not null default 0
    check (refunded_minor between 0 and amount_minor);

alter table public.refunds
  add column updated_at timestamptz not null default now();

alter table public.cancellation_requests
  add column pending_job_status public.job_status,
  add column job_resolution_applied_at timestamptz;

alter table public.disputes
  add column pre_dispute_job_status public.job_status,
  add column resolution_outcome text,
  add column target_job_status public.job_status,
  add column job_resolution_applied_at timestamptz,
  add constraint dispute_resolution_outcome_check check (
    resolution_outcome is null
    or resolution_outcome in ('resume','complete','cancel','close_no_further_work')
  );

alter table public.financial_action_intents
  drop constraint financial_action_intents_action_type_check;
alter table public.financial_action_intents
  add constraint financial_action_intent_type_check
    check (action_type in ('void_authorization','refund','manual_refund','release'));

create or replace function private.idempotency_replay(
  p_actor uuid,
  p_command text,
  p_key text,
  p_request_hash text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  item public.idempotency_keys%rowtype;
begin
  select * into item
  from public.idempotency_keys
  where user_id=p_actor and command=p_command and key=p_key;
  if item.id is null then return null; end if;
  if item.request_hash is distinct from p_request_hash then
    raise exception 'IDEMPOTENCY_KEY_CONFLICT';
  end if;
  if item.status<>'completed' or item.response is null then
    raise exception 'IDEMPOTENCY_COMMAND_IN_PROGRESS';
  end if;
  return item.response;
end $$;

create or replace function private.apply_cancelled_job(
  p_job_id uuid,
  p_actor uuid,
  p_reason text,
  p_idempotency_key text,
  p_metadata jsonb
) returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  item public.jobs%rowtype;
begin
  select * into item from public.jobs where id=p_job_id for update;
  if item.id is null then raise exception 'JOB_NOT_FOUND'; end if;
  if item.status='cancelled' then return item.version; end if;
  update public.jobs
  set status='cancelled',version=version+1,updated_at=now()
  where id=item.id;
  update public.service_requests
  set status='cancelled',version=version+1,updated_at=now()
  where id=item.request_id and status<>'cancelled';
  if item.status not in ('completed','cancelled') then
    update public.provider_profiles
    set active_workload=greatest(0,active_workload-1)
    where user_id=item.provider_id;
  end if;
  insert into public.job_status_history(
    job_id,actor_id,previous_status,new_status,reason,idempotency_key,metadata
  ) values(
    item.id,p_actor,item.status,'cancelled',p_reason,p_idempotency_key,p_metadata
  );
  insert into public.job_events(job_id,event_type,actor_id,payload)
  values(item.id,'cancellation_applied',p_actor,p_metadata);
  return item.version+1;
end $$;

create or replace function private.apply_dispute_job_outcome(
  p_dispute_id uuid,
  p_actor uuid,
  p_reason text,
  p_idempotency_key text
) returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  dispute public.disputes%rowtype;
  item public.jobs%rowtype;
begin
  select * into dispute from public.disputes where id=p_dispute_id for update;
  if dispute.id is null then raise exception 'DISPUTE_NOT_FOUND'; end if;
  if dispute.target_job_status is null then raise exception 'DISPUTE_JOB_OUTCOME_REQUIRED'; end if;
  select * into item from public.jobs where id=dispute.job_id for update;
  if dispute.job_resolution_applied_at is not null then return item.version; end if;

  if item.status is distinct from dispute.target_job_status then
    update public.jobs
    set status=dispute.target_job_status,version=version+1,updated_at=now()
    where id=item.id;
    insert into public.job_status_history(
      job_id,actor_id,previous_status,new_status,reason,idempotency_key,metadata
    ) values(
      item.id,p_actor,item.status,dispute.target_job_status,p_reason,p_idempotency_key,
      jsonb_build_object(
        'disputeId',dispute.id,
        'resolutionOutcome',dispute.resolution_outcome,
        'preDisputeStatus',dispute.pre_dispute_job_status
      )
    );
    item.version:=item.version+1;
  end if;
  update public.disputes
  set job_resolution_applied_at=coalesce(job_resolution_applied_at,now())
  where id=dispute.id;
  insert into public.job_events(job_id,event_type,actor_id,payload)
  values(
    item.id,'dispute_job_outcome_applied',p_actor,
    jsonb_build_object('disputeId',dispute.id,'outcome',dispute.resolution_outcome)
  );
  return item.version;
end $$;

create or replace function public.request_cancellation(
  p_job_id uuid,
  p_request_id uuid,
  p_reason text,
  p_expected_version integer,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  actor uuid:=auth.uid();
  item public.jobs%rowtype;
  req public.service_requests%rowtype;
  payment public.payments%rowtype;
  cancellation_id uuid;
  refund_id uuid;
  action_required boolean:=false;
  auto_approve boolean:=false;
  request_hash text;
  replay jsonb;
  result_payload jsonb;
  final_version integer;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if (p_job_id is null)=(p_request_id is null) then raise exception 'ONE_CANCELLATION_TARGET_REQUIRED'; end if;
  if length(trim(coalesce(p_reason,''))) not between 5 and 1000 then raise exception 'CANCELLATION_REASON_REQUIRED'; end if;
  if length(trim(coalesce(p_idempotency_key,''))) not between 8 and 128 then raise exception 'INVALID_IDEMPOTENCY_KEY'; end if;
  if p_expected_version is null or p_expected_version<1 then raise exception 'EXPECTED_VERSION_REQUIRED'; end if;
  request_hash:=encode(digest(concat_ws('|',p_job_id::text,p_request_id::text,trim(p_reason),p_expected_version::text),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':request_cancellation:'||p_idempotency_key,0));
  replay:=private.idempotency_replay(actor,'request_cancellation_v3',p_idempotency_key,request_hash);
  if replay is not null then return replay; end if;
  insert into public.idempotency_keys(user_id,command,key,request_hash)
  values(actor,'request_cancellation_v3',p_idempotency_key,request_hash);

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
    ) values(req.id,actor,req.status::text,trim(p_reason),'approved',p_idempotency_key,now())
    returning id into cancellation_id;
    update public.service_requests set status='cancelled',version=version+1,updated_at=now() where id=req.id;
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
    select * into item from public.jobs
    where id=p_job_id and actor in (customer_id,provider_id) for update;
    if item.id is null then raise exception 'CANCELLATION_ACCESS_DENIED'; end if;
    if item.version<>p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
    if item.status in ('completed','cancelled','disputed') then raise exception 'JOB_NOT_CANCELLABLE'; end if;
    if exists(select 1 from public.cancellation_requests c where c.job_id=item.id and c.status in ('pending','financial_pending')) then
      raise exception 'CANCELLATION_ALREADY_OPEN';
    end if;
    auto_approve:=actor=item.customer_id and item.status in ('provider_selected','scheduled');
    insert into public.cancellation_requests(
      job_id,requester_id,lifecycle_state,reason,status,expected_job_version,
      idempotency_key,pending_job_status
    ) values(
      item.id,actor,item.status::text,trim(p_reason),
      case when auto_approve then 'approved' else 'pending' end,
      p_expected_version,p_idempotency_key,
      case when auto_approve then 'cancelled'::public.job_status else null end
    ) returning id into cancellation_id;

    if auto_approve then
      select * into payment from public.payments where job_id=item.id order by created_at desc limit 1 for update;
      if payment.id is not null and payment.payment_mode='gateway'
        and payment.status not in ('cancelled','refunded','failed') then
        action_required:=true;
        if payment.status in ('captured','partially_refunded') then
          insert into public.refunds(payment_id,amount_minor,reason,status,idempotency_key,created_by)
          values(
            payment.id,payment.amount_minor-payment.refunded_minor,trim(p_reason),'pending',
            'cancel-refund:'||cancellation_id::text,actor
          ) returning id into refund_id;
          insert into public.financial_action_intents(
            source_type,source_id,payment_id,refund_id,action_type,amount_minor,idempotency_key,created_by
          ) values(
            'cancellation',cancellation_id,payment.id,refund_id,'refund',
            payment.amount_minor-payment.refunded_minor,'cancel-action:'||cancellation_id::text,actor
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
          item.id,payment.id,greatest(0,payment.amount_minor-payment.refunded_minor),
          'cancellation_financial_confirmation_required',actor,cancellation_id
        );
        update public.cancellation_requests
        set status='financial_pending',updated_at=now() where id=cancellation_id;
      else
        final_version:=private.apply_cancelled_job(
          item.id,actor,trim(p_reason),'cancel:'||cancellation_id::text,
          jsonb_build_object('cancellationId',cancellation_id,'automatic',true)
        );
        update public.cancellation_requests
        set status='approved',resolved_at=now(),job_resolution_applied_at=now(),updated_at=now()
        where id=cancellation_id;
      end if;
      insert into public.cancellation_decisions(
        cancellation_request_id,actor_id,decision,reason,refund_implication,impact_snapshot
      ) values(
        cancellation_id,actor,'auto_approved','early_customer_cancellation',
        case when action_required then 'external_confirmation_required' else 'none' end,
        jsonb_build_object(
          'jobVersion',coalesce(final_version,item.version),
          'financialActionRequired',action_required,
          'jobTransitionDeferred',action_required
        )
      );
    end if;
    result_payload:=jsonb_build_object(
      'cancellationId',cancellation_id,
      'status',case when action_required then 'financial_pending' when auto_approve then 'approved' else 'pending' end,
      'targetType','job','jobVersion',coalesce(final_version,item.version),
      'financialActionRequired',action_required,'jobTransitionDeferred',action_required
    );
  end if;
  update public.idempotency_keys set status='completed',response=result_payload
  where user_id=actor and command='request_cancellation_v3' and key=p_idempotency_key;
  return result_payload;
end $$;

create or replace function public.decide_cancellation(
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
  item public.jobs%rowtype;
  payment public.payments%rowtype;
  refund_id uuid;
  refund_amount bigint:=0;
  action_required boolean:=false;
  request_hash text;
  replay jsonb;
  result_payload jsonb;
  final_version integer;
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
  request_hash:=encode(digest(concat_ws('|',p_cancellation_id::text,p_approve::text,coalesce(p_fee_minor,0)::text,trim(p_reason),p_expected_job_version::text),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':decide_cancellation:'||p_idempotency_key,0));
  replay:=private.idempotency_replay(actor,'decide_cancellation_v2',p_idempotency_key,request_hash);
  if replay is not null then return replay; end if;
  select * into cancellation from public.cancellation_requests
    where id=p_cancellation_id and status='pending' for update;
  if cancellation.id is null or cancellation.job_id is null then raise exception 'CANCELLATION_NOT_DECIDABLE'; end if;
  select * into item from public.jobs where id=cancellation.job_id for update;
  if item.version<>p_expected_job_version then raise exception 'VERSION_CONFLICT'; end if;
  if p_approve and item.status in ('completed','cancelled','disputed') then raise exception 'JOB_NOT_CANCELLABLE'; end if;
  if coalesce(p_fee_minor,0)>item.approved_total_minor then raise exception 'FEE_EXCEEDS_JOB_TOTAL'; end if;
  insert into public.idempotency_keys(user_id,command,key,request_hash)
  values(actor,'decide_cancellation_v2',p_idempotency_key,request_hash);

  if p_approve then
    update public.cancellation_requests set pending_job_status='cancelled' where id=cancellation.id;
    select * into payment from public.payments where job_id=item.id order by created_at desc limit 1 for update;
    if payment.id is not null and payment.payment_mode='gateway'
      and payment.status not in ('cancelled','refunded','failed') then
      if payment.status not in ('captured','partially_refunded') and coalesce(p_fee_minor,0)>0 then
        raise exception 'FEE_REQUIRES_CAPTURED_PAYMENT';
      end if;
      refund_amount:=case when payment.status in ('captured','partially_refunded')
        then greatest(0,payment.amount_minor-payment.refunded_minor-coalesce(p_fee_minor,0)) else 0 end;
      action_required:=true;
      if refund_amount>0 then
        insert into public.refunds(payment_id,amount_minor,reason,status,idempotency_key,created_by)
        values(payment.id,refund_amount,trim(p_reason),'pending','cancel-refund:'||cancellation.id::text,actor)
        returning id into refund_id;
        insert into public.financial_action_intents(
          source_type,source_id,payment_id,refund_id,action_type,amount_minor,idempotency_key,created_by
        ) values(
          'cancellation',cancellation.id,payment.id,refund_id,'refund',refund_amount,
          'cancel-action:'||cancellation.id::text,actor
        );
      elsif payment.status not in ('captured','partially_refunded') then
        insert into public.financial_action_intents(
          source_type,source_id,payment_id,action_type,amount_minor,idempotency_key,created_by
        ) values(
          'cancellation',cancellation.id,payment.id,'void_authorization',0,
          'cancel-action:'||cancellation.id::text,actor
        );
      else
        action_required:=false;
      end if;
      if action_required then
        insert into public.financial_holds(
          job_id,payment_id,amount_minor,reason,created_by,cancellation_request_id
        ) values(
          item.id,payment.id,greatest(0,payment.amount_minor-payment.refunded_minor),
          'cancellation_financial_confirmation_required',actor,cancellation.id
        );
      end if;
    end if;
    if not action_required then
      final_version:=private.apply_cancelled_job(
        item.id,actor,trim(p_reason),'cancel-decision:'||cancellation.id::text,
        jsonb_build_object('cancellationId',cancellation.id,'feeMinor',coalesce(p_fee_minor,0))
      );
    end if;
  end if;
  update public.cancellation_requests
  set status=case when not p_approve then 'rejected' when action_required then 'financial_pending' else 'approved' end,
      resolved_at=case when action_required then null else now() end,
      job_resolution_applied_at=case when p_approve and not action_required then now() else job_resolution_applied_at end,
      updated_at=now()
  where id=cancellation.id;
  insert into public.cancellation_decisions(
    cancellation_request_id,actor_id,decision,reason,fee_minor,refund_implication,impact_snapshot
  ) values(
    cancellation.id,actor,case when p_approve then 'approved' else 'rejected' end,trim(p_reason),coalesce(p_fee_minor,0),
    case when action_required then 'external_confirmation_required' when p_approve then 'none' else null end,
    jsonb_build_object(
      'jobVersion',coalesce(final_version,item.version),
      'financialActionRequired',action_required,'jobTransitionDeferred',action_required
    )
  );
  insert into public.admin_audit_logs(
    id,actor_id,action,target_type,target_id,reason,correlation_id,before_snapshot,after_snapshot
  ) values(
    audit_id,actor,'cancellation.decide','cancellation',cancellation.id,trim(p_reason),audit_id,
    jsonb_build_object('status',cancellation.status,'jobVersion',item.version),
    jsonb_build_object(
      'approved',p_approve,'feeMinor',coalesce(p_fee_minor,0),
      'financialActionRequired',action_required,'jobTransitionDeferred',action_required
    )
  );
  insert into public.notification_outbox(user_id,event_type,channel,payload,deduplication_key)
  select participant_id,'cancellation_decided','in_app',
    jsonb_build_object(
      'jobId',item.id,'cancellationId',cancellation.id,'approved',p_approve,
      'financialActionRequired',action_required,'jobTransitionDeferred',action_required
    ),
    'cancellation-decided:'||cancellation.id::text||':'||participant_id::text
  from (values(item.customer_id),(item.provider_id)) participant(participant_id)
  on conflict(channel,deduplication_key) do nothing;
  result_payload:=jsonb_build_object(
    'cancellationId',cancellation.id,
    'status',case when not p_approve then 'rejected' when action_required then 'financial_pending' else 'approved' end,
    'jobVersion',coalesce(final_version,item.version),
    'financialActionRequired',action_required,'jobTransitionDeferred',action_required
  );
  update public.idempotency_keys set status='completed',response=result_payload
  where user_id=actor and command='decide_cancellation_v2' and key=p_idempotency_key;
  return result_payload;
end $$;

create or replace function public.open_dispute(
  p_job_id uuid,
  p_reason text,
  p_expected_version integer,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  actor uuid:=auth.uid();
  item public.jobs%rowtype;
  payment public.payments%rowtype;
  dispute_id uuid;
  request_hash text;
  replay jsonb;
  result_payload jsonb;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if length(trim(coalesce(p_reason,''))) not between 5 and 2000 then raise exception 'DISPUTE_REASON_REQUIRED'; end if;
  if length(trim(coalesce(p_idempotency_key,''))) not between 8 and 128 then raise exception 'INVALID_IDEMPOTENCY_KEY'; end if;
  if p_expected_version is null or p_expected_version<1 then raise exception 'EXPECTED_VERSION_REQUIRED'; end if;
  request_hash:=encode(digest(concat_ws('|',p_job_id::text,trim(p_reason),p_expected_version::text),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':open_dispute:'||p_idempotency_key,0));
  replay:=private.idempotency_replay(actor,'open_dispute_v3',p_idempotency_key,request_hash);
  if replay is not null then return replay; end if;
  select * into item from public.jobs where id=p_job_id and actor in (customer_id,provider_id) for update;
  if item.id is null then raise exception 'DISPUTE_ACCESS_DENIED'; end if;
  if item.version<>p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  if item.status in ('cancelled') then raise exception 'JOB_NOT_DISPUTABLE'; end if;
  if exists(select 1 from public.disputes d where d.job_id=item.id and d.status not in ('resolved','closed')) then
    raise exception 'DISPUTE_ALREADY_OPEN';
  end if;
  insert into public.idempotency_keys(user_id,command,key,request_hash)
  values(actor,'open_dispute_v3',p_idempotency_key,request_hash);
  insert into public.disputes(
    job_id,opened_by,reason,expected_job_version,idempotency_key,pre_dispute_job_status
  ) values(item.id,actor,trim(p_reason),p_expected_version,p_idempotency_key,item.status)
  returning id into dispute_id;
  select * into payment from public.payments where job_id=item.id order by created_at desc limit 1 for update;
  insert into public.financial_holds(job_id,payment_id,amount_minor,reason,created_by,dispute_id)
  values(
    item.id,payment.id,coalesce(payment.amount_minor-payment.refunded_minor,item.approved_total_minor),
    'dispute_opened',actor,dispute_id
  );
  update public.jobs set status='disputed',version=version+1,updated_at=now() where id=item.id;
  insert into public.job_status_history(
    job_id,actor_id,previous_status,new_status,reason,idempotency_key,metadata
  ) values(
    item.id,actor,item.status,'disputed',trim(p_reason),'dispute:'||dispute_id::text,
    jsonb_build_object('disputeId',dispute_id,'preDisputeStatus',item.status)
  );
  insert into public.dispute_events(dispute_id,actor_id,event_type,reason,payload)
  values(
    dispute_id,actor,'opened',trim(p_reason),
    jsonb_build_object('jobVersion',item.version+1,'preDisputeStatus',item.status)
  );
  insert into public.notification_outbox(user_id,event_type,channel,payload,deduplication_key)
  select participant,'dispute_opened','in_app',jsonb_build_object('jobId',item.id,'disputeId',dispute_id),
    'dispute-opened:'||dispute_id::text||':'||participant::text
  from (values(item.customer_id),(item.provider_id)) p(participant)
  on conflict(channel,deduplication_key) do nothing;
  result_payload:=jsonb_build_object(
    'disputeId',dispute_id,'status','open','jobVersion',item.version+1,
    'preDisputeStatus',item.status,'financialHold',true
  );
  update public.idempotency_keys set status='completed',response=result_payload
  where user_id=actor and command='open_dispute_v3' and key=p_idempotency_key;
  return result_payload;
end $$;

drop function if exists public.resolve_dispute(uuid,text,bigint,text,integer,text);
create function public.resolve_dispute(
  p_dispute_id uuid,
  p_action text,
  p_amount_minor bigint,
  p_job_outcome text,
  p_reason text,
  p_expected_job_version integer,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  actor uuid:=auth.uid();
  dispute public.disputes%rowtype;
  item public.jobs%rowtype;
  payment public.payments%rowtype;
  action_id uuid;
  refund_id uuid;
  target_status public.job_status;
  action_required boolean:=false;
  committed_or_pending bigint:=0;
  request_hash text;
  replay jsonb;
  result_payload jsonb;
  final_version integer;
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
  if p_job_outcome not in ('resume','complete','cancel','close_no_further_work') then
    raise exception 'DISPUTE_JOB_OUTCOME_REQUIRED';
  end if;
  if length(trim(coalesce(p_reason,''))) not between 5 and 2000 then raise exception 'RESOLUTION_REASON_REQUIRED'; end if;
  if length(trim(coalesce(p_idempotency_key,''))) not between 8 and 128 then raise exception 'INVALID_IDEMPOTENCY_KEY'; end if;
  request_hash:=encode(digest(concat_ws('|',p_dispute_id::text,p_action,coalesce(p_amount_minor,0)::text,p_job_outcome,trim(p_reason),p_expected_job_version::text),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':resolve_dispute:'||p_idempotency_key,0));
  replay:=private.idempotency_replay(actor,'resolve_dispute_v2',p_idempotency_key,request_hash);
  if replay is not null then return replay; end if;
  select * into dispute from public.disputes
    where id=p_dispute_id and status not in ('resolved','closed') for update;
  if dispute.id is null then raise exception 'DISPUTE_NOT_RESOLVABLE'; end if;
  select * into item from public.jobs where id=dispute.job_id for update;
  if item.version<>p_expected_job_version then raise exception 'VERSION_CONFLICT'; end if;
  target_status:=case p_job_outcome
    when 'resume' then dispute.pre_dispute_job_status
    when 'complete' then 'completed'::public.job_status
    else 'cancelled'::public.job_status
  end;
  if target_status is null or target_status='disputed' then raise exception 'INVALID_DISPUTE_RESUME_STATE'; end if;
  select * into payment from public.payments where job_id=item.id order by created_at desc limit 1 for update;
  if p_action in ('refund_customer','split') then
    if payment.id is null then raise exception 'PAYMENT_REQUIRED_FOR_REFUND'; end if;
    select coalesce(sum(r.amount_minor),0) into committed_or_pending
    from public.refunds r where r.payment_id=payment.id and r.status in ('pending','refunded');
    if coalesce(p_amount_minor,0)<=0 or committed_or_pending+p_amount_minor>payment.amount_minor then
      raise exception 'INVALID_REFUND_AMOUNT';
    end if;
    if p_action='split' and committed_or_pending+p_amount_minor>=payment.amount_minor then
      raise exception 'SPLIT_REQUIRES_PARTIAL_AMOUNT';
    end if;
  elsif coalesce(p_amount_minor,0)<>0 then
    raise exception 'AMOUNT_NOT_ALLOWED_FOR_ACTION';
  end if;
  insert into public.idempotency_keys(user_id,command,key,request_hash)
  values(actor,'resolve_dispute_v2',p_idempotency_key,request_hash);
  insert into public.resolution_actions(
    dispute_id,actor_id,action_type,amount_minor,reason,idempotency_key,status
  ) values(
    dispute.id,actor,p_action,p_amount_minor,trim(p_reason),p_idempotency_key,
    case when p_action='no_financial_action' then 'confirmed' else 'pending' end
  ) returning id into action_id;
  update public.disputes
  set resolution_outcome=p_job_outcome,target_job_status=target_status,
      status=case
        when p_action='no_financial_action' then 'resolved'::public.case_status
        else 'waiting_operations'::public.case_status
      end,
      resolved_at=case when p_action='no_financial_action' then now() else null end,
      version=version+1,updated_at=now()
  where id=dispute.id;

  if p_action in ('refund_customer','split') then
    action_required:=true;
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
  elsif p_action='release_to_provider' then
    if payment.id is null then raise exception 'PAYMENT_REQUIRED_FOR_RELEASE'; end if;
    action_required:=true;
    insert into public.financial_action_intents(
      source_type,source_id,payment_id,action_type,amount_minor,idempotency_key,created_by
    ) values(
      'dispute',dispute.id,payment.id,'release',0,'dispute-action:'||action_id::text,actor
    );
  else
    update public.financial_holds set status='released',released_by=actor,released_at=now()
    where dispute_id=dispute.id and status='held';
    update public.resolution_actions set completed_at=now() where id=action_id;
    final_version:=private.apply_dispute_job_outcome(
      dispute.id,actor,trim(p_reason),'dispute-resolution:'||action_id::text
    );
  end if;
  insert into public.dispute_events(dispute_id,actor_id,event_type,reason,payload)
  values(
    dispute.id,actor,case when action_required then 'resolution_pending_finance' else 'resolved' end,
    trim(p_reason),jsonb_build_object(
      'actionId',action_id,'action',p_action,'amountMinor',coalesce(p_amount_minor,0),
      'jobOutcome',p_job_outcome,'targetJobStatus',target_status,'jobTransitionDeferred',action_required
    )
  );
  insert into public.admin_audit_logs(
    id,actor_id,action,target_type,target_id,reason,correlation_id,before_snapshot,after_snapshot
  ) values(
    audit_id,actor,'dispute.resolve','dispute',dispute.id,trim(p_reason),audit_id,
    jsonb_build_object('status',dispute.status,'version',dispute.version),
    jsonb_build_object(
      'action',p_action,'amountMinor',coalesce(p_amount_minor,0),
      'jobOutcome',p_job_outcome,'targetJobStatus',target_status,
      'financialActionRequired',action_required
    )
  );
  insert into public.notification_outbox(user_id,event_type,channel,payload,deduplication_key)
  select participant_id,'dispute_resolution_updated','in_app',
    jsonb_build_object(
      'jobId',item.id,'disputeId',dispute.id,'jobOutcome',p_job_outcome,
      'financialActionRequired',action_required,'jobTransitionDeferred',action_required
    ),
    'dispute-resolution:'||action_id::text||':'||participant_id::text
  from (values(item.customer_id),(item.provider_id)) participant(participant_id)
  on conflict(channel,deduplication_key) do nothing;
  result_payload:=jsonb_build_object(
    'disputeId',dispute.id,'actionId',action_id,
    'status',case when action_required then 'waiting_operations' else 'resolved' end,
    'disputeVersion',dispute.version+1,'jobVersion',coalesce(final_version,item.version),
    'jobOutcome',p_job_outcome,'targetJobStatus',target_status,
    'financialActionRequired',action_required,'jobTransitionDeferred',action_required
  );
  update public.idempotency_keys set status='completed',response=result_payload
  where user_id=actor and command='resolve_dispute_v2' and key=p_idempotency_key;
  return result_payload;
end $$;

create or replace function public.confirm_financial_action(
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
  refunded_total bigint;
  final_version integer;
  request_hash text;
  replay jsonb;
  result_payload jsonb;
  audit_id uuid:=gen_random_uuid();
begin
  if not private.has_role(array['finance_reviewer','super_admin']::public.user_role[]) then raise exception 'FINANCE_PERMISSION_REQUIRED'; end if;
  if length(trim(coalesce(p_provider_reference,''))) not between 3 and 200 then raise exception 'PROVIDER_REFERENCE_REQUIRED'; end if;
  if length(trim(coalesce(p_reason,''))) not between 5 and 1000 then raise exception 'CONFIRMATION_REASON_REQUIRED'; end if;
  if length(trim(coalesce(p_idempotency_key,''))) not between 8 and 128 then raise exception 'INVALID_IDEMPOTENCY_KEY'; end if;
  request_hash:=encode(digest(concat_ws('|',p_intent_id::text,trim(p_provider_reference),trim(p_reason)),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':confirm_financial_action:'||p_idempotency_key,0));
  replay:=private.idempotency_replay(actor,'confirm_financial_action_v2',p_idempotency_key,request_hash);
  if replay is not null then return replay; end if;
  select * into intent from public.financial_action_intents where id=p_intent_id for update;
  if intent.id is null or intent.status<>'pending' then raise exception 'FINANCIAL_ACTION_NOT_CONFIRMABLE'; end if;
  select * into payment from public.payments where id=intent.payment_id for update;
  insert into public.idempotency_keys(user_id,command,key,request_hash)
  values(actor,'confirm_financial_action_v2',p_idempotency_key,request_hash);
  update public.financial_action_intents
  set status='confirmed',provider_reference=trim(p_provider_reference),confirmed_by=actor,completed_at=now()
  where id=intent.id;

  if intent.action_type='void_authorization' then
    update public.payments
    set status='cancelled',provider_reference=trim(p_provider_reference),version=version+1,updated_at=now()
    where id=payment.id;
  elsif intent.action_type in ('refund','manual_refund') then
    update public.refunds set status='refunded',provider_reference=trim(p_provider_reference),updated_at=now()
    where id=intent.refund_id and status='pending';
    select coalesce(sum(amount_minor),0) into refunded_total
    from public.refunds where payment_id=payment.id and status='refunded';
    if refunded_total>payment.amount_minor then raise exception 'REFUND_ACCOUNTING_EXCEEDED_PAYMENT'; end if;
    update public.payments
    set refunded_minor=refunded_total,
        status=case
          when refunded_total=0 then status
          when refunded_total<amount_minor then 'partially_refunded'::public.financial_status
          else 'refunded'::public.financial_status
        end,
        version=version+1,updated_at=now()
    where id=payment.id;
  elsif intent.action_type='release' then
    update public.payments
    set provider_reference=trim(p_provider_reference),version=version+1,updated_at=now()
    where id=payment.id;
  end if;
  insert into public.payment_events(payment_id,event_type,amount_minor,provider_event_id,payload_hash)
  values(
    payment.id,
    case intent.action_type when 'void_authorization' then 'authorization_cancelled'
      when 'release' then 'funds_released' else 'refunded' end,
    intent.amount_minor,'financial-action:'||intent.id::text,
    encode(digest(trim(p_provider_reference),'sha256'),'hex')
  );

  if intent.source_type='cancellation' then
    select * into cancellation from public.cancellation_requests where id=intent.source_id for update;
    final_version:=private.apply_cancelled_job(
      cancellation.job_id,actor,trim(p_reason),'financial-cancel:'||intent.id::text,
      jsonb_build_object('cancellationId',cancellation.id,'financialIntentId',intent.id)
    );
    update public.financial_holds set status='released',released_by=actor,released_at=now()
    where cancellation_request_id=cancellation.id and status='held';
    update public.cancellation_requests
    set status='approved',resolved_at=now(),job_resolution_applied_at=now(),updated_at=now()
    where id=cancellation.id;
  else
    select * into dispute from public.disputes where id=intent.source_id for update;
    final_version:=private.apply_dispute_job_outcome(
      dispute.id,actor,trim(p_reason),'financial-dispute:'||intent.id::text
    );
    update public.financial_holds set status='released',released_by=actor,released_at=now()
    where dispute_id=dispute.id and status='held';
    update public.disputes set status='resolved',resolved_at=now(),version=version+1,updated_at=now()
    where id=dispute.id;
    update public.resolution_actions set status='confirmed',completed_at=now()
    where dispute_id=dispute.id and status='pending';
    insert into public.dispute_events(dispute_id,actor_id,event_type,reason,payload)
    values(
      dispute.id,actor,'financial_action_confirmed',trim(p_reason),
      jsonb_build_object('intentId',intent.id,'jobVersion',final_version)
    );
  end if;
  insert into public.admin_audit_logs(
    id,actor_id,action,target_type,target_id,reason,correlation_id,before_snapshot,after_snapshot
  ) values(
    audit_id,actor,'financial_action.confirm','financial_action',intent.id,trim(p_reason),audit_id,
    jsonb_build_object('status',intent.status,'sourceType',intent.source_type),
    jsonb_build_object(
      'status','confirmed',
      'providerReferenceHash',encode(digest(trim(p_provider_reference),'sha256'),'hex'),
      'jobVersion',final_version
    )
  );
  insert into public.notification_outbox(user_id,event_type,channel,payload,deduplication_key)
  select participant_id,'financial_action_confirmed','in_app',
    jsonb_build_object(
      'intentId',intent.id,'sourceType',intent.source_type,'sourceId',intent.source_id,
      'jobVersion',final_version
    ),
    'financial-action-confirmed:'||intent.id::text||':'||participant_id::text
  from (values(payment.customer_id),(payment.provider_id)) participant(participant_id)
  on conflict(channel,deduplication_key) do nothing;
  result_payload:=jsonb_build_object(
    'intentId',intent.id,'status','confirmed','sourceType',intent.source_type,
    'sourceId',intent.source_id,'jobVersion',final_version,
    'paymentStatus',(select status from public.payments where id=payment.id),
    'refundedMinor',(select refunded_minor from public.payments where id=payment.id)
  );
  update public.idempotency_keys set status='completed',response=result_payload
  where user_id=actor and command='confirm_financial_action_v2' and key=p_idempotency_key;
  return result_payload;
end $$;

create or replace view public.payment_accounting
with (security_invoker=true)
as
select
  p.id,p.job_id,p.customer_id,p.provider_id,p.amount_minor,p.refunded_minor,
  greatest(0,p.amount_minor-p.refunded_minor) as net_paid_minor,
  p.currency,p.status,p.payment_mode,p.version,p.created_at,p.updated_at
from public.payments p;

revoke all on function private.idempotency_replay(uuid,text,text,text) from public,anon,authenticated;
revoke all on function private.apply_cancelled_job(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
revoke all on function private.apply_dispute_job_outcome(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.resolve_dispute(uuid,text,bigint,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.resolve_dispute(uuid,text,bigint,text,text,integer,text) to authenticated;
grant select on public.payment_accounting to authenticated;

commit;
