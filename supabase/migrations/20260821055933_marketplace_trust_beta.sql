-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

begin;

SET check_function_bodies = false;

DROP POLICY addresses_authorized_read ON public.addresses;

DROP POLICY addresses_owner_write ON public.addresses;

DROP POLICY blocks_owner_all ON public.blocked_users;

DROP POLICY location_sessions_participants_read ON public.job_location_sharing_sessions;

DROP POLICY job_location_participants ON public.job_location_updates;

DROP POLICY message_attachments_members ON public.message_attachments;

DROP POLICY message_receipts_members ON public.message_read_receipts;

DROP POLICY messages_members_insert ON public.messages;

DROP POLICY storage_clean_owner_read ON storage.objects;

-- Message attachments are never delivered by direct Storage reads. Their
-- current block, suspension, relationship, and case scope is established by
-- authorize_protected_media and the media-access service on every request.
CREATE POLICY storage_clean_owner_read
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id NOT IN ('quarantine','message-attachments')
  AND (
    owner_id=(SELECT auth.uid())::text
    OR (SELECT private.is_admin())
  )
  AND (
    bucket_id IN ('exports','invoices')
    OR EXISTS (
      SELECT 1
      FROM public.file_uploads upload
      WHERE upload.target_bucket=storage.objects.bucket_id
        AND upload.final_path=storage.objects.name
        AND upload.status='clean'
    )
  )
);

CREATE FUNCTION private.accept_completion_pre_active_gate (
  p_job_id              uuid,
  p_accept              boolean,
  p_reason              text,
  p_score               integer,
  p_review              text,
  p_idempotency_key     text,
  p_evidence_upload_ids uuid[]
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions', 'pg_temp'
  AS $function$
declare actor uuid:=auth.uid(); item_job jobs%rowtype; attempt completion_attempts%rowtype;
  payment payments%rowtype; acceptance_id uuid; dispute_id uuid; support_case_id uuid;
  upload_id uuid; evidence jsonb; hold_amount bigint; request_hash text; replay jsonb;
  result_payload jsonb; final_version integer;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if not p_accept and length(trim(coalesce(p_reason,''))) not between 5 and 2000 then
    raise exception 'COMPLETION_REJECTION_REASON_REQUIRED';
  end if;
  if p_accept and p_score not between 1 and 5 then raise exception 'RATING_REQUIRED'; end if;
  evidence:=coalesce(to_jsonb(p_evidence_upload_ids),'[]'::jsonb);
  request_hash:=private.canonical_request_hash(jsonb_build_object(
    'jobId',p_job_id,'accept',p_accept,'reason',trim(coalesce(p_reason,'')),
    'score',p_score,'review',nullif(trim(coalesce(p_review,'')),''),
    'evidenceUploadIds',evidence
  ));
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':accept_completion:'||p_idempotency_key,0));
  replay:=private.idempotency_replay(actor,'accept_completion_v3',p_idempotency_key,request_hash);
  if replay is not null then return replay; end if;
  select * into item_job from jobs where id=p_job_id and customer_id=actor for update;
  if item_job.id is null or item_job.status<>'completion_submitted' then
    raise exception 'CUSTOMER_COMPLETION_REQUIRED';
  end if;
  select * into attempt from completion_attempts
  where job_id=item_job.id and status='submitted' for update;
  if attempt.id is null then raise exception 'ACTIVE_COMPLETION_ATTEMPT_REQUIRED'; end if;
  foreach upload_id in array coalesce(p_evidence_upload_ids,'{}'::uuid[]) loop
    if not exists(select 1 from file_uploads f where f.id=upload_id and f.user_id=actor
      and f.status='clean' and f.final_path is not null
      and f.purpose in ('request_media','support_evidence')) then
      raise exception 'CLEAN_REJECTION_EVIDENCE_REQUIRED';
    end if;
  end loop;
  insert into idempotency_keys(user_id,command,key,request_hash)
  values(actor,'accept_completion_v3',p_idempotency_key,request_hash);
  insert into customer_acceptances(
    job_id,customer_id,accepted,reason,accepted_total_minor,evidence_references,completion_attempt_id
  ) values(
    item_job.id,actor,p_accept,nullif(trim(coalesce(p_reason,'')),''),
    item_job.approved_total_minor,evidence,attempt.id
  ) returning id into acceptance_id;
  foreach upload_id in array coalesce(p_evidence_upload_ids,'{}'::uuid[]) loop
    insert into customer_acceptance_evidence(acceptance_id,file_upload_id)
    values(acceptance_id,upload_id);
  end loop;
  update completion_attempts
  set status=case when p_accept then 'accepted' else 'rejected' end,decided_at=now()
  where id=attempt.id;

  if p_accept then
    final_version:=private.apply_job_terminal_outcome(
      item_job.id,actor,'completed','completion_acceptance',acceptance_id,
      'customer_accepted_completion','completion-acceptance:'||acceptance_id::text,
      jsonb_build_object('acceptanceId',acceptance_id,'completionAttemptId',attempt.id)
    );
    insert into ratings(job_id,customer_id,provider_id,score,review)
    values(item_job.id,actor,item_job.provider_id,p_score,nullif(trim(p_review),''));
    update provider_profiles
    set rating_average=((rating_average*rating_count)+p_score)/(rating_count+1),
      rating_count=rating_count+1
    where user_id=item_job.provider_id;
    result_payload:=jsonb_build_object(
      'jobId',item_job.id,'status','completed','jobVersion',final_version,
      'acceptanceId',acceptance_id,'completionAttemptId',attempt.id,
      'attemptNumber',attempt.attempt_number
    );
  else
    insert into disputes(
      job_id,opened_by,reason,expected_job_version,idempotency_key,pre_dispute_job_status,
      completion_attempt_id,completion_decision_id
    ) values(
      item_job.id,actor,trim(p_reason),item_job.version,p_idempotency_key,item_job.status,
      attempt.id,acceptance_id
    ) returning id into dispute_id;
    insert into support_cases(
      opened_by,request_id,job_id,dispute_id,topic,priority,subject
    ) values(
      actor,item_job.request_id,item_job.id,dispute_id,'completion_dispute','high',
      'Rejected completion requires operations triage'
    ) returning id into support_case_id;
    select * into payment from payments where job_id=item_job.id
      order by created_at desc limit 1 for update;
    hold_amount:=greatest(0,coalesce(
      payment.amount_minor-payment.refunded_minor,item_job.approved_total_minor
    ));
    if hold_amount>0 or payment.id is not null then
      insert into financial_holds(job_id,payment_id,amount_minor,reason,created_by,dispute_id)
      values(item_job.id,payment.id,hold_amount,'completion_rejection_dispute',actor,dispute_id);
    end if;
    update jobs set status='disputed',version=version+1,updated_at=now() where id=item_job.id;
    insert into job_status_history(
      job_id,actor_id,previous_status,new_status,reason,idempotency_key,metadata
    ) values(
      item_job.id,actor,item_job.status,'disputed',trim(p_reason),
      'completion-rejection:'||dispute_id::text,
      jsonb_build_object(
        'disputeId',dispute_id,'supportCaseId',support_case_id,
        'acceptanceId',acceptance_id,'completionAttemptId',attempt.id,
        'attemptNumber',attempt.attempt_number,'preDisputeStatus',item_job.status,
        'evidenceUploadIds',evidence
      )
    );
    insert into job_events(job_id,event_type,actor_id,payload)
    values(item_job.id,'completion_rejected_dispute_opened',actor,jsonb_build_object(
      'disputeId',dispute_id,'supportCaseId',support_case_id,
      'acceptanceId',acceptance_id,'completionAttemptId',attempt.id,
      'attemptNumber',attempt.attempt_number,'evidenceUploadIds',evidence
    ));
    insert into dispute_events(dispute_id,actor_id,event_type,reason,payload)
    values(dispute_id,actor,'opened_from_completion_rejection',trim(p_reason),jsonb_build_object(
      'jobVersion',item_job.version+1,'supportCaseId',support_case_id,
      'acceptanceId',acceptance_id,'completionAttemptId',attempt.id,
      'attemptNumber',attempt.attempt_number,'preDisputeStatus',item_job.status,
      'evidenceUploadIds',evidence
    ));
    insert into notification_outbox(user_id,event_type,channel,payload,deduplication_key)
    values(item_job.provider_id,'completion_rejected_dispute_opened','in_app',
      jsonb_build_object('jobId',item_job.id,'disputeId',dispute_id),
      'completion-rejected:'||dispute_id::text||':'||item_job.provider_id::text)
    on conflict(channel,deduplication_key) do nothing;
    insert into notification_outbox(user_id,event_type,channel,payload,deduplication_key)
    select ur.user_id,'operations_dispute_queue','in_app',jsonb_build_object(
      'jobId',item_job.id,'disputeId',dispute_id,'supportCaseId',support_case_id,
      'source','completion_rejection'
    ),'operations-dispute-queue:'||dispute_id::text||':'||ur.user_id::text
    from user_roles ur join profiles p on p.id=ur.user_id and p.status='active'
    where ur.role in ('operations_admin','super_admin') and ur.revoked_at is null
    on conflict(channel,deduplication_key) do nothing;
    result_payload:=jsonb_build_object(
      'jobId',item_job.id,'status','disputed','jobVersion',item_job.version+1,
      'acceptanceId',acceptance_id,'completionAttemptId',attempt.id,
      'attemptNumber',attempt.attempt_number,'disputeId',dispute_id,
      'supportCaseId',support_case_id,'preDisputeStatus',item_job.status,
      'financialHold',hold_amount>0 or payment.id is not null
    );
  end if;
  perform private.complete_idempotent_command(
    actor,'accept_completion_v3',p_idempotency_key,result_payload
  );
  return result_payload;
end $function$;

REVOKE ALL ON FUNCTION private.accept_completion_pre_active_gate(uuid, boolean, text, integer, text, text, uuid[]) FROM PUBLIC;

CREATE FUNCTION private.assert_active_job_command_actor (
  p_actor          uuid,
  p_job_id         uuid,
  p_required_party text,
  p_denied_error   text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  item public.jobs%rowtype;
  account_status public.account_status;
  provider_status text;
  provider_role_current boolean:=false;
begin
  if p_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into item from public.jobs job where job.id=p_job_id;
  if item.id is null
    or (p_required_party='provider' and item.provider_id<>p_actor)
    or (p_required_party='customer' and item.customer_id<>p_actor)
    or (p_required_party='participant' and p_actor not in (item.customer_id,item.provider_id)) then
    raise exception '%',p_denied_error;
  end if;
  select profile.status into account_status
  from public.profiles profile where profile.id=p_actor for share;
  if account_status is distinct from 'active'::public.account_status then
    raise exception 'ACCOUNT_NOT_ACTIVE';
  end if;

  perform 1 from public.user_roles role_row
  where role_row.user_id=p_actor and role_row.role='provider'
    and role_row.revoked_at is null
  for share;
  provider_role_current:=found;
  select profile.verification_status::text into provider_status
  from public.provider_profiles profile where profile.user_id=p_actor for share;

  -- Lock the exact job only after actor/provider state. Provider suspension
  -- workflows take those state locks before inserting job-review rows, so this
  -- order avoids a provider-state/job foreign-key deadlock.
  select * into item from public.jobs job where job.id=p_job_id for update;
  if item.id is null
    or (p_required_party='provider' and item.provider_id<>p_actor)
    or (p_required_party='customer' and item.customer_id<>p_actor)
    or (p_required_party='participant' and p_actor not in (item.customer_id,item.provider_id)) then
    raise exception '%',p_denied_error;
  end if;
  if p_actor=item.provider_id then
    if not provider_role_current or provider_status is distinct from 'verified' then
      raise exception 'PROVIDER_JOB_INELIGIBLE';
    end if;
    perform 1 from public.provider_job_eligibility_reviews review
    where review.job_id=item.id and review.provider_id=p_actor
    for share;
    if exists(
      select 1 from public.provider_job_eligibility_reviews review
      where review.job_id=item.id and review.provider_id=p_actor and review.status='open'
    ) then raise exception 'PROVIDER_JOB_REVIEW_REQUIRED'; end if;
  end if;
end
$function$;

COMMENT ON FUNCTION private.assert_active_job_command_actor(uuid,uuid,text,text) IS 'Locks and proves the current active account, exact job role, provider verification, and absence of an open exact-job eligibility review before replay.';

REVOKE ALL ON FUNCTION private.assert_active_job_command_actor(uuid, uuid, text, text) FROM PUBLIC;

CREATE FUNCTION private.can_communicate_in_conversation_as (
  p_user_id         uuid,
  p_conversation_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select exists(
    select 1
    from public.conversations c
    join public.jobs j on j.id=c.job_id
    join public.conversation_members member
      on member.conversation_id=c.id and member.user_id=p_user_id
    join public.profiles customer on customer.id=j.customer_id
    join public.profiles provider on provider.id=j.provider_id
    join public.provider_profiles provider_profile on provider_profile.user_id=j.provider_id
    where c.id=p_conversation_id
      and c.status='active'
      and member.left_at is null
      and p_user_id in (j.customer_id,j.provider_id)
      and customer.status='active'
      and provider.status='active'
      and provider_profile.verification_status='verified'
      and not exists(
        select 1
        from public.blocked_users b
        where (b.blocker_id=j.customer_id and b.blocked_id=j.provider_id)
           or (b.blocker_id=j.provider_id and b.blocked_id=j.customer_id)
      )
  )
$function$;

REVOKE ALL ON FUNCTION private.can_communicate_in_conversation_as(uuid, uuid) FROM PUBLIC;

CREATE FUNCTION private.can_communicate_in_conversation (
  p_conversation_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select private.can_communicate_in_conversation_as(auth.uid(),p_conversation_id)
$function$;

REVOKE ALL ON FUNCTION private.can_communicate_in_conversation(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION private.can_communicate_in_conversation(uuid) TO authenticated;

CREATE FUNCTION private.can_read_current_job_exact_location (
  p_job_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select exists(
    select 1
    from public.jobs job
    join public.profiles actor
      on actor.id=auth.uid() and actor.status='active'
    where job.id=p_job_id
      and (
        job.customer_id=auth.uid()
        or (
          job.provider_id=auth.uid()
          and exists(
            select 1
            from public.user_roles role_row
            where role_row.user_id=auth.uid()
              and role_row.role='provider'
              and role_row.revoked_at is null
          )
          and exists(
            select 1
            from public.provider_profiles provider
            where provider.user_id=auth.uid()
              and provider.verification_status='verified'
          )
          and not exists(
            select 1
            from public.provider_job_eligibility_reviews review
            where review.job_id=job.id
              and review.provider_id=auth.uid()
              and review.status='open'
          )
        )
      )
  )
$function$;

COMMENT ON FUNCTION private.can_read_current_job_exact_location(uuid) IS 'RLS-only current participant gate for exact addresses, live coordinates, and sharing-session identifiers.';

REVOKE ALL ON FUNCTION private.can_read_current_job_exact_location(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION private.can_read_current_job_exact_location(uuid) TO authenticated;

CREATE FUNCTION private.consume_actor_rate_limit (
  p_actor        uuid,
  p_operation    text,
  p_window_start timestamp with time zone,
  p_limit        integer
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if p_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if char_length(trim(coalesce(p_operation,''))) not between 1 and 80 then
    raise exception 'INVALID_RATE_LIMIT_OPERATION';
  end if;
  return public.consume_rate_limit(
    encode(
      extensions.digest('marketplace:'||p_operation||':'||p_actor::text,'sha256'),
      'hex'
    ),
    p_operation,
    p_window_start,
    p_limit
  );
end
$function$;

REVOKE ALL ON FUNCTION private.consume_actor_rate_limit(uuid, text, timestamp WITH time zone, integer) FROM PUBLIC;

CREATE FUNCTION private.create_change_order_pre_active_gate (
  payload jsonb
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions', 'pg_temp'
  AS $function$
declare
  actor uuid:=auth.uid(); item_job jobs%rowtype; order_id uuid; added bigint; item jsonb;
  idem text:=payload->>'idempotencyKey'; request_hash text; replay jsonb;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  request_hash:=private.canonical_request_hash(payload);
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':create_change_order:'||idem,0));
  replay:=private.idempotency_replay(actor,'create_change_order_v2',idem,request_hash);
  if replay is not null then return (replay->>'id')::uuid; end if;
  select * into item_job from jobs
  where id=(payload->>'jobId')::uuid and provider_id=actor and status in ('diagnosing','in_progress') for update;
  if item_job.id is null then raise exception 'PROVIDER_JOB_REQUIRED'; end if;
  if jsonb_array_length(coalesce(payload->'lineItems','[]'::jsonb))<1 then raise exception 'CHANGE_ORDER_ITEMS_REQUIRED'; end if;
  select coalesce(sum(((value->>'quantity')::numeric*(value->>'amountMinor')::bigint)::bigint),0)
  into added from jsonb_array_elements(payload->'lineItems');
  insert into idempotency_keys(user_id,command,key,request_hash)
  values(actor,'create_change_order_v2',idem,request_hash) on conflict do nothing;
  insert into change_orders(job_id,provider_id,reason,description,added_amount_minor,revised_total_minor,expires_at,idempotency_key)
  values(item_job.id,actor,payload->>'reason',payload->>'description',added,item_job.approved_total_minor+added,
    (payload->>'expiresAt')::timestamptz,idem) returning id into order_id;
  for item in select value from jsonb_array_elements(payload->'lineItems') loop
    insert into change_order_items(change_order_id,description,quantity,unit_amount_minor)
    values(order_id,item->>'description',(item->>'quantity')::numeric,(item->>'amountMinor')::bigint);
  end loop;
  if item_job.status='diagnosing' then
    perform public.transition_job(item_job.id,'awaiting_change_order_approval','change_order_submitted','co-transition:'||order_id::text);
  end if;
  perform private.complete_idempotent_command(actor,'create_change_order_v2',idem,jsonb_build_object('id',order_id));
  return order_id;
end $function$;

REVOKE ALL ON FUNCTION private.create_change_order_pre_active_gate(jsonb) FROM PUBLIC;

CREATE FUNCTION private.create_marketplace_report_pre_context (
  p_target_type     text,
  p_target_id       uuid,
  p_reason_category text,
  p_explanation     text,
  p_idempotency_key text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  actor uuid:=auth.uid();
  reported_user uuid;
  conversation uuid;
  message uuid;
  rating uuid;
  job uuid;
  request uuid;
  body_snapshot text;
  attachments jsonb:='[]'::jsonb;
  support_case uuid:=gen_random_uuid();
  report_id uuid:=gen_random_uuid();
  request_hash text;
  replay jsonb;
  result_payload jsonb;
  existing_report public.marketplace_reports%rowtype;
  created timestamptz;
  normalized_explanation text:=nullif(trim(coalesce(p_explanation,'')),'');
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.profiles p where p.id=actor and p.status='active') then
    raise exception 'ACCOUNT_NOT_ACTIVE';
  end if;
  if p_target_type not in ('user','message','rating') or p_target_id is null then
    raise exception 'REPORT_TARGET_NOT_AVAILABLE';
  end if;
  if p_reason_category not in (
    'harassment','spam','scam','safety','inappropriate_content','rating_abuse','other'
  ) then raise exception 'REPORT_REASON_INVALID'; end if;
  if normalized_explanation is not null
    and char_length(normalized_explanation) not between 1 and 1000 then
    raise exception 'REPORT_EXPLANATION_INVALID';
  end if;
  request_hash:=private.canonical_request_hash(jsonb_build_object(
    'targetType',p_target_type,
    'targetId',p_target_id,
    'reasonCategory',p_reason_category,
    'explanation',normalized_explanation
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    actor::text||':marketplace_report:'||p_target_type||':'||p_target_id::text,0
  ));
  replay:=private.idempotency_replay(
    actor,'create_marketplace_report_v1',p_idempotency_key,request_hash
  );
  if replay is not null then return replay; end if;
  if not private.consume_actor_rate_limit(
    actor,'marketplace_report',date_trunc('hour',clock_timestamp(),'UTC'),10
  ) then raise exception 'RATE_LIMITED'; end if;

  if p_target_type='user' then
    reported_user:=p_target_id;
    if reported_user=actor
      or not exists(select 1 from public.profiles p where p.id=reported_user and p.status<>'anonymized')
      or not private.has_marketplace_relationship(actor,reported_user) then
      raise exception 'REPORT_TARGET_NOT_AVAILABLE';
    end if;
    select j.id,j.request_id into job,request
    from public.jobs j
    where (j.customer_id=actor and j.provider_id=reported_user)
       or (j.customer_id=reported_user and j.provider_id=actor)
    order by j.created_at desc,j.id desc limit 1;
  elsif p_target_type='message' then
    select m.sender_id,m.conversation_id,m.id,c.job_id,j.request_id,
      left(m.body,2000)
    into reported_user,conversation,message,job,request,body_snapshot
    from public.messages m
    join public.conversations c on c.id=m.conversation_id
    join public.jobs j on j.id=c.job_id
    join public.conversation_members member
      on member.conversation_id=c.id and member.user_id=actor
    where m.id=p_target_id and member.left_at is null and m.sender_id<>actor
      and actor in (j.customer_id,j.provider_id);
    if reported_user is null then raise exception 'REPORT_TARGET_NOT_AVAILABLE'; end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'attachmentId',a.id,
      'uploadId',a.file_upload_id,
      'mimeType',a.mime_type,
      'sizeBytes',a.size_bytes,
      'contentSha256',f.content_sha256
    ) order by a.created_at,a.id),'[]'::jsonb)
    into attachments
    from public.message_attachments a
    left join public.file_uploads f on f.id=a.file_upload_id
    where a.message_id=message;
  else
    select r.customer_id,r.id,r.job_id,j.request_id,left(r.review,2000)
    into reported_user,rating,job,request,body_snapshot
    from public.ratings r
    join public.jobs j on j.id=r.job_id
    where r.id=p_target_id and r.provider_id=actor and r.customer_id<>actor;
    if reported_user is null then raise exception 'REPORT_TARGET_NOT_AVAILABLE'; end if;
  end if;

  insert into public.idempotency_keys(user_id,command,key,request_hash)
  values(actor,'create_marketplace_report_v1',p_idempotency_key,request_hash);
  select * into existing_report
  from public.marketplace_reports r
  where r.reporter_id=actor and r.target_type=p_target_type and r.target_id=p_target_id
    and r.status in ('submitted','triaged','escalated')
  order by r.created_at desc limit 1;
  if existing_report.id is not null then
    result_payload:=jsonb_build_object(
      'reportId',existing_report.id,
      'status',existing_report.status,
      'createdAt',existing_report.created_at,
      'deduplicated',true
    );
    perform private.complete_idempotent_command(
      actor,'create_marketplace_report_v1',p_idempotency_key,result_payload
    );
    return result_payload;
  end if;

  insert into public.support_cases(
    id,opened_by,request_id,job_id,topic,priority,status,subject
  ) values(
    support_case,actor,request,job,'marketplace_abuse',
    case when p_reason_category='safety' then 'high' else 'normal' end,
    'open','Marketplace trust and safety report'
  );
  insert into public.marketplace_reports(
    id,reporter_id,reported_user_id,target_type,target_id,conversation_id,message_id,
    rating_id,job_id,request_id,support_case_id,reason_category,explanation,
    text_snapshot,attachment_evidence,priority
  ) values(
    report_id,actor,reported_user,p_target_type,p_target_id,conversation,message,
    rating,job,request,support_case,p_reason_category,normalized_explanation,
    nullif(body_snapshot,''),attachments,
    case when p_reason_category='safety' then 'high' else 'normal' end
  ) returning created_at into created;
  insert into public.marketplace_report_events(
    report_id,actor_id,event_type,from_status,to_status,reason,payload,idempotency_key
  ) values(
    report_id,actor,'submitted',null,'submitted',p_reason_category,
    jsonb_build_object('targetType',p_target_type,'priority',
      case when p_reason_category='safety' then 'high' else 'normal' end),
    p_idempotency_key
  );
  result_payload:=jsonb_build_object(
    'reportId',report_id,
    'status','submitted',
    'createdAt',created,
    'deduplicated',false
  );
  perform private.complete_idempotent_command(
    actor,'create_marketplace_report_v1',p_idempotency_key,result_payload
  );
  return result_payload;
end
$function$;

REVOKE ALL ON FUNCTION private.create_marketplace_report_pre_context(text, uuid, text, text, text) FROM PUBLIC;

CREATE FUNCTION private.decide_change_order_pre_active_gate (
  p_change_order_id uuid,
  p_approve         boolean,
  p_reason          text,
  p_idempotency_key text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  actor uuid:=auth.uid();
  item_change public.change_orders%rowtype;
  item_job public.jobs%rowtype;
  target public.job_status;
  transition_key text;
  request_hash text;
  transition_hash text;
  replay jsonb;
  result_payload jsonb;
  transition_payload jsonb;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if length(trim(coalesce(p_reason,'')))<2 then raise exception 'REASON_REQUIRED'; end if;
  request_hash:=private.canonical_request_hash(jsonb_build_object(
    'changeOrderId',p_change_order_id,'approve',p_approve,
    'reason',trim(coalesce(p_reason,''))
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    actor::text||':decide_change_order:'||p_idempotency_key,0
  ));
  replay:=private.idempotency_replay(
    actor,'decide_change_order_v2',p_idempotency_key,request_hash
  );
  if replay is not null then return replay; end if;
  select item.* into item_change
  from public.change_orders item
  join public.jobs job on job.id=item.job_id
  where item.id=p_change_order_id and job.customer_id=actor
    and item.status='pending' and item.expires_at>now()
  for update of item;
  if item_change.id is null then raise exception 'CHANGE_ORDER_NOT_DECIDABLE'; end if;
  select * into item_job from public.jobs where id=item_change.job_id for update;
  if item_job.status<>'awaiting_change_order_approval' then
    raise exception 'CHANGE_ORDER_NOT_DECIDABLE';
  end if;

  insert into public.idempotency_keys(user_id,command,key,request_hash)
  values(actor,'decide_change_order_v2',p_idempotency_key,request_hash);
  update public.change_orders
  set status=case when p_approve then 'approved'::public.change_order_status
                  else 'rejected'::public.change_order_status end,
      customer_id=actor,customer_decision_at=now()
  where id=item_change.id;

  target:=case when p_approve then 'in_progress'::public.job_status
               else 'diagnosing'::public.job_status end;
  transition_key:='change-order-decision:'||item_change.id::text||':'||p_idempotency_key;
  transition_hash:=private.canonical_request_hash(jsonb_build_object(
    'jobId',item_job.id,'target',target,'reason',trim(p_reason)
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    actor::text||':transition_job:'||transition_key,0
  ));
  insert into public.idempotency_keys(user_id,command,key,request_hash)
  values(actor,'transition_job_v2',transition_key,transition_hash);
  update public.jobs
  set approved_total_minor=case when p_approve then item_change.revised_total_minor
                                else approved_total_minor end,
      status=target,version=version+1,updated_at=now()
  where id=item_job.id;
  insert into public.job_status_history(
    job_id,actor_id,previous_status,new_status,reason,idempotency_key
  ) values(
    item_job.id,actor,item_job.status,target,trim(p_reason),transition_key
  );
  insert into public.job_events(job_id,event_type,actor_id,payload)
  values(item_job.id,'status_transitioned',actor,jsonb_build_object(
    'previousStatus',item_job.status,'newStatus',target,'version',item_job.version+1
  ));
  transition_payload:=jsonb_build_object(
    'jobId',item_job.id,'status',target,'version',item_job.version+1
  );
  perform private.complete_idempotent_command(
    actor,'transition_job_v2',transition_key,transition_payload
  );
  result_payload:=jsonb_build_object(
    'approved',p_approve,
    'approvedTotalMinor',case when p_approve then item_change.revised_total_minor
                              else item_job.approved_total_minor end
  );
  perform private.complete_idempotent_command(
    actor,'decide_change_order_v2',p_idempotency_key,result_payload
  );
  return result_payload;
end
$function$;

REVOKE ALL ON FUNCTION private.decide_change_order_pre_active_gate(uuid, boolean, text, text) FROM PUBLIC;

CREATE FUNCTION private.get_authorized_job_location_pre_active_gate (
  p_job_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare actor uuid:=auth.uid(); item public.jobs%rowtype;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into item from public.jobs where id=p_job_id;
  if item.id is null then raise exception 'JOB_NOT_FOUND'; end if;
  if actor<>item.customer_id
    and not (actor=item.provider_id and item.status not in ('completed','cancelled')) then
    raise exception 'EXACT_LOCATION_ACCESS_DENIED';
  end if;
  return private.job_location_payload(p_job_id);
end $function$;

REVOKE ALL ON FUNCTION private.get_authorized_job_location_pre_active_gate(uuid) FROM PUBLIC;

CREATE FUNCTION private.has_marketplace_relationship (
  p_actor  uuid,
  p_target uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select p_actor is not null and p_target is not null and p_actor<>p_target and exists(
    select 1
    from public.jobs j
    where (j.customer_id=p_actor and j.provider_id=p_target)
       or (j.customer_id=p_target and j.provider_id=p_actor)
  )
$function$;

REVOKE ALL ON FUNCTION private.has_marketplace_relationship(uuid, uuid) FROM PUBLIC;

CREATE FUNCTION private.lock_marketplace_pair (
  p_user_a uuid,
  p_user_b uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  first_user text;
  second_user text;
begin
  if p_user_a is null or p_user_b is null or p_user_a=p_user_b then
    raise exception 'MARKETPLACE_PAIR_REQUIRED';
  end if;
  first_user:=least(p_user_a::text,p_user_b::text);
  second_user:=greatest(p_user_a::text,p_user_b::text);
  perform pg_advisory_xact_lock(hashtextextended(
    'marketplace_pair:'||first_user||':'||second_user,0
  ));
end
$function$;

REVOKE ALL ON FUNCTION private.lock_marketplace_pair(uuid, uuid) FROM PUBLIC;

CREATE FUNCTION private.marketplace_report_enforcement_target_for (
  p_report_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  report public.marketplace_reports%rowtype;
  job public.jobs%rowtype;
  target_role text;
  context_valid boolean:=false;
begin
  select * into report from public.marketplace_reports item where item.id=p_report_id;
  if report.id is null or report.job_id is null then
    raise exception 'REPORT_ENFORCEMENT_TARGET_NOT_AVAILABLE';
  end if;
  select * into job from public.jobs item where item.id=report.job_id;
  if job.id is null then raise exception 'REPORT_ENFORCEMENT_TARGET_NOT_AVAILABLE'; end if;
  if report.reported_user_id=job.customer_id
    and report.reported_user_id<>job.provider_id then target_role:='customer';
  elsif report.reported_user_id=job.provider_id
    and report.reported_user_id<>job.customer_id then target_role:='provider';
  else raise exception 'REPORT_ENFORCEMENT_TARGET_NOT_AVAILABLE';
  end if;

  if report.target_type='user' then
    select exists(
      select 1
      from public.conversations context
      join public.conversation_members reporter_member
        on reporter_member.conversation_id=context.id
       and reporter_member.user_id=report.reporter_id
      join public.conversation_members target_member
        on target_member.conversation_id=context.id
       and target_member.user_id=report.reported_user_id
      where context.id=report.conversation_id
        and context.job_id=job.id
        and report.target_id=report.reported_user_id
        and report.reporter_id in (job.customer_id,job.provider_id)
        and report.reporter_id<>report.reported_user_id
        and report.request_id=job.request_id
    ) into context_valid;
  elsif report.target_type='message' then
    select exists(
      select 1 from public.messages message
      join public.conversations context on context.id=message.conversation_id
      where message.id=report.message_id and report.target_id=message.id
        and report.conversation_id=context.id and context.job_id=job.id
        and message.sender_id=report.reported_user_id
        and report.reporter_id in (job.customer_id,job.provider_id)
        and report.reporter_id<>report.reported_user_id
        and report.request_id=job.request_id
    ) into context_valid;
  elsif report.target_type='rating' then
    select exists(
      select 1 from public.ratings rating
      where rating.id=report.rating_id and report.target_id=rating.id
        and rating.job_id=job.id and rating.customer_id=report.reported_user_id
        and rating.provider_id=report.reporter_id
        and job.customer_id=rating.customer_id and job.provider_id=rating.provider_id
        and report.request_id=job.request_id
    ) into context_valid;
  end if;
  if not context_valid then raise exception 'REPORT_ENFORCEMENT_TARGET_NOT_AVAILABLE'; end if;
  return jsonb_build_object(
    'reportId',report.id,'supportCaseId',report.support_case_id,
    'reportedUserId',report.reported_user_id,'targetRole',target_role
  );
end
$function$;

REVOKE ALL ON FUNCTION private.marketplace_report_enforcement_target_for(uuid) FROM PUBLIC;

CREATE FUNCTION private.record_job_location_pre_active_gate (
  p_job_id     uuid,
  p_session_id uuid,
  p_latitude   double precision,
  p_longitude  double precision,
  p_accuracy_m numeric
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions', 'pg_temp'
  AS $function$
declare actor uuid:=auth.uid(); result uuid; sharing job_location_sharing_sessions%rowtype;
begin
  if p_latitude not between 16 and 33 or p_longitude not between 34 and 56 then
    raise exception 'LOCATION_OUTSIDE_SAUDI_ARABIA';
  end if;
  if p_accuracy_m is null or p_accuracy_m<=0 or p_accuracy_m>5000 then raise exception 'INVALID_LOCATION_ACCURACY'; end if;
  select * into sharing from job_location_sharing_sessions
  where id=p_session_id and job_id=p_job_id and provider_id=actor
    and stopped_at is null and starts_at<=now() and expires_at>now() for update;
  if sharing.id is null then raise exception 'ACTIVE_LOCATION_SHARING_SESSION_REQUIRED'; end if;
  if not exists(select 1 from jobs where id=p_job_id and provider_id=actor and status in ('en_route','arrived')) then
    raise exception 'ACTIVE_PROVIDER_JOB_REQUIRED';
  end if;
  insert into job_location_updates(
    job_id,provider_id,location,accuracy_m,captured_at,expires_at,sharing_consent_at
  ) values(
    p_job_id,actor,st_setsrid(st_makepoint(p_longitude,p_latitude),4326)::geography,
    p_accuracy_m,now(),least(sharing.expires_at,now()+interval '15 minutes'),sharing.consented_at
  ) returning id into result;
  return result;
end $function$;

REVOKE ALL ON FUNCTION private.record_job_location_pre_active_gate(uuid, uuid, double precision, double precision, numeric) FROM PUBLIC;

CREATE FUNCTION private.select_offer_pre_block_gate (
  p_offer_id        uuid,
  p_idempotency_key text
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  actor uuid:=auth.uid();
  actor_account public.profiles%rowtype;
  selected public.offers%rowtype;
  req public.service_requests%rowtype;
  provider_lock public.provider_profiles%rowtype;
  account_lock public.profiles%rowtype;
  eligibility jsonb;
  job_id uuid;
  conversation_id uuid;
  request_hash text;
  replay jsonb;
  result_payload jsonb;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into actor_account
  from public.profiles
  where id=actor
  for update;
  if actor_account.id is null or actor_account.status<>'active' then
    raise exception 'ACCOUNT_NOT_ACTIVE';
  end if;
  request_hash:=private.canonical_request_hash(jsonb_build_object('offerId',p_offer_id));
  perform pg_advisory_xact_lock(hashtextextended(
    actor::text||':select_offer:'||p_idempotency_key,0
  ));
  replay:=private.idempotency_replay(
    actor,'select_offer_v3',p_idempotency_key,request_hash
  );
  if replay is not null then return (replay->>'id')::uuid; end if;
  select * into selected from public.offers where id=p_offer_id for update;
  if selected.id is null or selected.status<>'active' or selected.expires_at<=now() then
    raise exception 'OFFER_NOT_SELECTABLE';
  end if;
  select * into req from public.service_requests where id=selected.request_id for update;
  if req.id is null or req.customer_id<>actor or req.status<>'receiving_offers'
    or req.exact_address_id is null then raise exception 'OFFER_NOT_SELECTABLE';
  end if;
  select * into provider_lock from public.provider_profiles
  where user_id=selected.provider_id for update;
  select * into account_lock from public.profiles
  where id=selected.provider_id for update;
  eligibility:=private.provider_request_eligibility(
    selected.provider_id,req.id,now(),true
  );
  if not (eligibility->>'eligible')::boolean then
    raise exception 'OFFER_PROVIDER_INELIGIBLE:%',eligibility->>'reason';
  end if;
  insert into public.idempotency_keys(user_id,command,key,request_hash)
  values(actor,'select_offer_v3',p_idempotency_key,request_hash);
  update public.offers set status=case
    when id=p_offer_id then 'selected'::public.offer_status else 'rejected'::public.offer_status end,
    updated_at=now()
  where request_id=req.id and status='active';
  update public.service_requests
  set status='provider_selected',version=version+1,updated_at=now()
  where id=req.id;
  insert into public.jobs(
    request_id,selected_offer_id,customer_id,provider_id,exact_address_id,
    approved_total_minor,scheduled_start,scheduled_end
  ) values(
    req.id,p_offer_id,actor,selected.provider_id,req.exact_address_id,
    selected.total_amount_minor,req.requested_start,req.requested_end
  ) returning id into job_id;
  insert into public.job_status_history(
    job_id,actor_id,new_status,reason,idempotency_key
  ) values(job_id,actor,'provider_selected','customer_selected_offer',p_idempotency_key);
  insert into public.job_events(job_id,event_type,actor_id,payload)
  values(job_id,'offer_selected',actor,jsonb_build_object(
    'offerId',p_offer_id,'requestId',req.id,'eligibility',eligibility
  ));
  insert into public.conversations(job_id) values(job_id) returning id into conversation_id;
  insert into public.conversation_members(conversation_id,user_id,member_role)
  values(conversation_id,actor,'customer'),
    (conversation_id,selected.provider_id,'provider');
  insert into public.payments(
    job_id,customer_id,provider_id,provider_name,amount_minor,status,
    payment_mode,idempotency_key
  ) values(
    job_id,actor,selected.provider_id,'offline',selected.total_amount_minor,
    'offline','offline','offline:'||job_id::text
  );
  update public.provider_profiles set active_workload=active_workload+1
  where user_id=selected.provider_id;
  update public.request_provider_matches
  set status=case when provider_id=selected.provider_id then 'selected' else 'closed' end
  where request_id=req.id;
  result_payload:=jsonb_build_object('id',job_id);
  perform private.complete_idempotent_command(
    actor,'select_offer_v3',p_idempotency_key,result_payload
  );
  return job_id;
end
$function$;

REVOKE ALL ON FUNCTION private.select_offer_pre_block_gate(uuid, text) FROM PUBLIC;

CREATE FUNCTION private.set_user_block_pre_safe_projection (
  p_target_user_id  uuid,
  p_blocked         boolean,
  p_reason          text,
  p_idempotency_key text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  actor uuid:=auth.uid();
  request_hash text;
  replay jsonb;
  result_payload jsonb;
  changed_count integer;
  mutual_blocked boolean;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_target_user_id is null or p_target_user_id=actor then
    raise exception 'BLOCK_TARGET_NOT_AVAILABLE';
  end if;
  if char_length(trim(coalesce(p_reason,''))) not between 3 and 500 then
    raise exception 'BLOCK_REASON_REQUIRED';
  end if;
  if not exists(select 1 from public.profiles p where p.id=actor and p.status='active') then
    raise exception 'ACCOUNT_NOT_ACTIVE';
  end if;
  if not exists(
    select 1 from public.profiles p
    where p.id=p_target_user_id and p.status<>'anonymized'
  ) or not private.has_marketplace_relationship(actor,p_target_user_id) then
    raise exception 'BLOCK_TARGET_NOT_AVAILABLE';
  end if;
  perform private.lock_marketplace_pair(actor,p_target_user_id);
  request_hash:=private.canonical_request_hash(jsonb_build_object(
    'targetUserId',p_target_user_id,
    'blocked',p_blocked,
    'reason',trim(p_reason)
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    actor::text||':user_block:'||p_target_user_id::text,0
  ));
  replay:=private.idempotency_replay(
    actor,'set_user_block_v1',p_idempotency_key,request_hash
  );
  if replay is not null then return replay; end if;
  if not private.consume_actor_rate_limit(
    actor,'user_block_state',date_trunc('hour',clock_timestamp(),'UTC'),20
  ) then raise exception 'RATE_LIMITED'; end if;
  insert into public.idempotency_keys(user_id,command,key,request_hash)
  values(actor,'set_user_block_v1',p_idempotency_key,request_hash);
  if p_blocked then
    insert into public.blocked_users(blocker_id,blocked_id,reason)
    values(actor,p_target_user_id,trim(p_reason))
    on conflict(blocker_id,blocked_id) do nothing;
  else
    delete from public.blocked_users
    where blocker_id=actor and blocked_id=p_target_user_id;
  end if;
  get diagnostics changed_count=row_count;
  select exists(
    select 1 from public.blocked_users b
    where (b.blocker_id=actor and b.blocked_id=p_target_user_id)
       or (b.blocker_id=p_target_user_id and b.blocked_id=actor)
  ) into mutual_blocked;
  insert into public.user_block_events(
    actor_id,target_user_id,blocked,changed,reason,idempotency_key
  ) values(
    actor,p_target_user_id,p_blocked,changed_count=1,trim(p_reason),p_idempotency_key
  );
  result_payload:=jsonb_build_object(
    'targetUserId',p_target_user_id,
    'blocked',p_blocked,
    'mutualBlocked',mutual_blocked,
    'changed',changed_count=1
  );
  perform private.complete_idempotent_command(
    actor,'set_user_block_v1',p_idempotency_key,result_payload
  );
  return result_payload;
end
$function$;

REVOKE ALL ON FUNCTION private.set_user_block_pre_safe_projection(uuid, boolean, text, text) FROM PUBLIC;

CREATE FUNCTION private.start_job_location_sharing_pre_active_gate (
  p_job_id           uuid,
  p_duration_minutes integer,
  p_consent          boolean
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare actor uuid:=auth.uid(); item jobs%rowtype; result uuid; expiry timestamptz;
begin
  if p_consent is not true then raise exception 'LOCATION_SHARING_CONSENT_REQUIRED'; end if;
  if p_duration_minutes not between 5 and 240 then raise exception 'INVALID_LOCATION_SHARING_DURATION'; end if;
  select * into item from jobs where id=p_job_id and provider_id=actor for update;
  if item.id is null or item.status not in ('en_route','arrived') then raise exception 'ACTIVE_PROVIDER_JOB_REQUIRED'; end if;
  update job_location_sharing_sessions set stopped_at=now(),stop_reason='replaced'
  where job_id=item.id and stopped_at is null;
  expiry:=now()+make_interval(mins=>p_duration_minutes);
  insert into job_location_sharing_sessions(job_id,provider_id,expires_at)
  values(item.id,actor,expiry) returning id into result;
  return jsonb_build_object('sessionId',result,'state','sharing','expiresAt',expiry);
end $function$;

REVOKE ALL ON FUNCTION private.start_job_location_sharing_pre_active_gate(uuid, integer, boolean) FROM PUBLIC;

CREATE FUNCTION private.submit_completion_pre_active_gate (
  p_job_id          uuid,
  p_proofs          jsonb,
  p_idempotency_key text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions', 'pg_temp'
  AS $function$
declare actor uuid:=auth.uid(); item_job jobs%rowtype; proof jsonb; upload file_uploads%rowtype;
  attempt_id uuid; next_attempt integer; request_hash text; replay jsonb; result_payload jsonb;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if jsonb_array_length(coalesce(p_proofs,'[]'::jsonb)) not between 1 and 12 then
    raise exception 'COMPLETION_PROOF_REQUIRED';
  end if;
  request_hash:=private.canonical_request_hash(jsonb_build_object('jobId',p_job_id,'proofs',p_proofs));
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':submit_completion:'||p_idempotency_key,0));
  replay:=private.idempotency_replay(actor,'submit_completion_v3',p_idempotency_key,request_hash);
  if replay is not null then return replay; end if;
  select * into item_job from jobs where id=p_job_id and provider_id=actor for update;
  if item_job.id is null or item_job.status<>'in_progress' then raise exception 'ACTIVE_PROVIDER_JOB_REQUIRED'; end if;
  if exists(select 1 from completion_attempts where job_id=item_job.id and status='submitted') then
    raise exception 'ACTIVE_COMPLETION_ATTEMPT_EXISTS';
  end if;
  select coalesce(max(a.attempt_number),0)+1 into next_attempt
  from completion_attempts a where a.job_id=item_job.id;
  insert into idempotency_keys(user_id,command,key,request_hash)
  values(actor,'submit_completion_v3',p_idempotency_key,request_hash);
  insert into completion_attempts(job_id,provider_id,attempt_number,corrected_from_attempt_id,idempotency_key)
  values(item_job.id,actor,next_attempt,
    (select id from completion_attempts where job_id=item_job.id and status='rejected'
      order by attempt_number desc limit 1),p_idempotency_key)
  returning id into attempt_id;
  for proof in select value from jsonb_array_elements(p_proofs) loop
    select * into upload from file_uploads where id=nullif(proof->>'uploadId','')::uuid for update;
    if upload.id is null or upload.user_id<>actor or upload.purpose<>'completion_proof'
      or upload.status<>'clean' or upload.final_path is null
      or (upload.resource_id is not null and upload.resource_id<>item_job.id) then
      raise exception 'CLEAN_COMPLETION_PROOF_REQUIRED';
    end if;
    update file_uploads set resource_id=item_job.id where id=upload.id;
    insert into completion_proofs(
      job_id,provider_id,storage_path,mime_type,size_bytes,description,file_upload_id,completion_attempt_id
    ) values(
      item_job.id,actor,upload.final_path,coalesce(upload.detected_mime_type,upload.declared_mime_type),
      upload.size_bytes,nullif(trim(proof->>'description'),''),upload.id,attempt_id
    );
  end loop;
  update jobs set status='completion_submitted',version=version+1,updated_at=now() where id=item_job.id;
  insert into job_status_history(job_id,actor_id,previous_status,new_status,reason,idempotency_key,metadata)
  values(item_job.id,actor,item_job.status,'completion_submitted','completion_evidence_submitted',
    'completion-submit:'||attempt_id::text,
    jsonb_build_object('completionAttemptId',attempt_id,'attemptNumber',next_attempt));
  insert into job_events(job_id,event_type,actor_id,payload)
  values(item_job.id,'completion_attempt_submitted',actor,
    jsonb_build_object('completionAttemptId',attempt_id,'attemptNumber',next_attempt));
  result_payload:=jsonb_build_object('jobId',item_job.id,'status','completion_submitted',
    'jobVersion',item_job.version+1,'completionAttemptId',attempt_id,'attemptNumber',next_attempt);
  perform private.complete_idempotent_command(actor,'submit_completion_v3',p_idempotency_key,result_payload);
  return result_payload;
end $function$;

REVOKE ALL ON FUNCTION private.submit_completion_pre_active_gate(uuid, jsonb, text) FROM PUBLIC;

CREATE FUNCTION private.submit_offer_pre_block_gate (
  payload jsonb
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions', 'pg_temp'
  AS $function$
declare
  actor uuid:=auth.uid(); offer_id uuid; v_request_id uuid:=(payload->>'requestId')::uuid;
  req service_requests%rowtype; idem text:=payload->>'idempotencyKey'; request_hash text; replay jsonb;
  eligibility jsonb;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  request_hash:=private.canonical_request_hash(payload);
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':submit_offer:'||idem,0));
  replay:=private.idempotency_replay(actor,'submit_offer_v2',idem,request_hash);
  if replay is not null then return (replay->>'id')::uuid; end if;
  eligibility:=private.provider_request_eligibility(actor,v_request_id,now());
  if not (eligibility->>'eligible')::boolean then
    raise exception 'PROVIDER_NOT_ELIGIBLE:%',eligibility->>'reason';
  end if;
  if not exists(select 1 from request_provider_matches where request_id=v_request_id
    and provider_id=actor and status in ('invited','viewed','offered') and expires_at>now()) then
    raise exception 'MATCH_REQUIRED';
  end if;
  select * into req from service_requests where id=v_request_id and status='receiving_offers' for update;
  if req.id is null or req.version<>(payload->>'expectedRequestVersion')::integer then raise exception 'REQUEST_VERSION_CONFLICT'; end if;
  insert into idempotency_keys(user_id,command,key,request_hash)
  values(actor,'submit_offer_v2',idem,request_hash) on conflict do nothing;
  insert into offers(request_id,provider_id,total_amount_minor,visit_fee_minor,labor_amount_minor,
    materials_included,materials_estimate_minor,estimated_arrival_minutes,estimated_duration_minutes,
    warranty_days,provider_note,expires_at,idempotency_key)
  values(v_request_id,actor,(payload->>'totalAmountMinor')::bigint,coalesce((payload->>'visitFeeMinor')::bigint,0),
    (payload->>'laborAmountMinor')::bigint,(payload->>'materialsIncluded')::boolean,
    (payload->>'materialsEstimateMinor')::bigint,(payload->>'estimatedArrivalMinutes')::integer,
    (payload->>'estimatedDurationMinutes')::integer,(payload->>'warrantyDays')::integer,
    coalesce(payload->>'note',''),(payload->>'expiresAt')::timestamptz,idem)
  on conflict(provider_id,request_id) do update set
    total_amount_minor=excluded.total_amount_minor,visit_fee_minor=excluded.visit_fee_minor,
    labor_amount_minor=excluded.labor_amount_minor,materials_included=excluded.materials_included,
    materials_estimate_minor=excluded.materials_estimate_minor,
    estimated_arrival_minutes=excluded.estimated_arrival_minutes,
    estimated_duration_minutes=excluded.estimated_duration_minutes,warranty_days=excluded.warranty_days,
    provider_note=excluded.provider_note,expires_at=excluded.expires_at,status='active',
    version=offers.version+1,updated_at=now(),idempotency_key=excluded.idempotency_key
  returning id into offer_id;
  update request_provider_matches set status='offered' where request_id=v_request_id and provider_id=actor;
  insert into notification_outbox(user_id,event_type,channel,payload,deduplication_key)
  values(req.customer_id,'new_offer','in_app',jsonb_build_object('requestId',v_request_id,'offerId',offer_id),'offer:'||offer_id::text)
  on conflict do nothing;
  perform private.complete_idempotent_command(actor,'submit_offer_v2',idem,jsonb_build_object('id',offer_id));
  return offer_id;
end $function$;

REVOKE ALL ON FUNCTION private.submit_offer_pre_block_gate(jsonb) FROM PUBLIC;

CREATE FUNCTION private.transition_job_pre_active_gate (
  p_job_id          uuid,
  p_to_status       text,
  p_reason          text,
  p_idempotency_key text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions', 'pg_temp'
  AS $function$
declare
  actor uuid:=auth.uid(); item jobs%rowtype; target job_status; allowed boolean:=false;
  request_hash text; replay jsonb; result_payload jsonb;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if length(trim(coalesce(p_reason,'')))<2 then raise exception 'REASON_REQUIRED'; end if;
  target:=p_to_status::job_status;
  if target='disputed' then raise exception 'USE_OPEN_DISPUTE_COMMAND'; end if;
  request_hash:=private.canonical_request_hash(jsonb_build_object(
    'jobId',p_job_id,'target',target,'reason',trim(p_reason)));
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':transition_job:'||p_idempotency_key,0));
  replay:=private.idempotency_replay(actor,'transition_job_v2',p_idempotency_key,request_hash);
  if replay is not null then return replay; end if;
  select * into item from jobs where id=p_job_id and actor in (customer_id,provider_id) for update;
  if item.id is null then raise exception 'JOB_ACCESS_DENIED'; end if;
  allowed:=case item.status
    when 'provider_selected' then target in ('scheduled','cancelled')
    when 'scheduled' then target in ('en_route','cancelled')
    when 'en_route' then target in ('arrived','cancelled')
    when 'arrived' then target in ('diagnosing','cancelled')
    when 'diagnosing' then target in ('awaiting_change_order_approval','in_progress','cancelled')
    when 'awaiting_change_order_approval' then target in ('in_progress','diagnosing','cancelled')
    when 'in_progress' then target in ('completion_submitted','cancelled')
    when 'completion_submitted' then target in ('completed','in_progress')
    else false end;
  if not allowed then raise exception 'INVALID_JOB_TRANSITION:%:%',item.status,target; end if;
  if actor=item.provider_id and target='completed' then raise exception 'CUSTOMER_ACTION_REQUIRED'; end if;
  if actor=item.customer_id and target in ('en_route','arrived','diagnosing','in_progress','completion_submitted') then
    raise exception 'PROVIDER_ACTION_REQUIRED';
  end if;
  insert into idempotency_keys(user_id,command,key,request_hash)
  values(actor,'transition_job_v2',p_idempotency_key,request_hash) on conflict do nothing;
  update jobs set status=target,version=version+1,updated_at=now(),
    completed_at=case when target='completed' then now() else completed_at end where id=item.id;
  insert into job_status_history(job_id,actor_id,previous_status,new_status,reason,idempotency_key)
  values(item.id,actor,item.status,target,trim(p_reason),p_idempotency_key);
  insert into job_events(job_id,event_type,actor_id,payload)
  values(item.id,'status_transitioned',actor,jsonb_build_object(
    'previousStatus',item.status,'newStatus',target,'version',item.version+1));
  result_payload:=jsonb_build_object('jobId',item.id,'status',target,'version',item.version+1);
  perform private.complete_idempotent_command(actor,'transition_job_v2',p_idempotency_key,result_payload);
  return result_payload;
end $function$;

REVOKE ALL ON FUNCTION private.transition_job_pre_active_gate(uuid, text, text, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.accept_completion (
  p_job_id              uuid,
  p_accept              boolean,
  p_reason              text,
  p_score               integer,
  p_review              text,
  p_idempotency_key     text,
  p_evidence_upload_ids uuid[]
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare actor uuid:=auth.uid();
begin
  perform private.assert_active_job_command_actor(
    actor,p_job_id,'customer','CUSTOMER_COMPLETION_REQUIRED'
  );
  return private.accept_completion_pre_active_gate(
    p_job_id,p_accept,p_reason,p_score,p_review,p_idempotency_key,
    p_evidence_upload_ids
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_customer_status (
  p_customer_id     uuid,
  p_status          public.account_status,
  p_reason          text,
  p_idempotency_key text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  actor uuid:=auth.uid();
  previous public.account_status;
  audit_id uuid:=extensions.gen_random_uuid();
  request_hash text;
  replay jsonb;
begin
  if not private.has_role(
    array['operations_admin','super_admin']::public.user_role[]
  ) then
    raise exception 'OPERATIONS_PERMISSION_REQUIRED';
  end if;
  if p_status not in ('active','suspended') then
    raise exception 'INVALID_CUSTOMER_STATUS';
  end if;
  if length(trim(coalesce(p_reason,'')))<5 then
    raise exception 'REASON_REQUIRED';
  end if;

  request_hash:=private.canonical_request_hash(jsonb_build_object(
    'customerId',p_customer_id,
    'status',p_status::text,
    'reason',trim(p_reason)
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    actor::text||':admin_set_customer_status_v2:'||coalesce(p_idempotency_key,''),
    0
  ));
  replay:=private.idempotency_replay(
    actor,'admin_set_customer_status_v2',p_idempotency_key,request_hash
  );
  if replay is not null then
    return;
  end if;

  insert into public.idempotency_keys(user_id,command,key,request_hash)
  values(
    actor,'admin_set_customer_status_v2',p_idempotency_key,request_hash
  );

  if actor=p_customer_id then
    raise exception 'SELF_STATUS_CHANGE_DENIED';
  end if;
  if exists(
    select 1
    from public.user_roles
    where user_id=p_customer_id
      and role in (
        'operations_admin','verification_reviewer','support_agent',
        'finance_reviewer','analyst','super_admin'
      )
      and revoked_at is null
  ) then
    raise exception 'ADMIN_ACCOUNT_PROTECTED';
  end if;

  select status into previous
  from public.profiles
  where id=p_customer_id
  for update;
  if previous is null then
    raise exception 'CUSTOMER_NOT_FOUND';
  end if;
  if previous not in ('active','suspended') then
    raise exception 'CUSTOMER_STATUS_LOCKED';
  end if;
  if previous=p_status then
    raise exception 'STATUS_UNCHANGED';
  end if;

  update public.profiles
  set status=p_status,updated_at=now()
  where id=p_customer_id;

  insert into public.moderation_actions(
    target_user_id,actor_id,action_type,reason
  ) values(
    p_customer_id,
    actor,
    case
      when p_status='suspended' then 'customer.suspend'
      else 'customer.reactivate'
    end,
    p_reason
  );

  insert into public.admin_audit_logs(
    id,actor_id,action,target_type,target_id,reason,correlation_id,
    before_snapshot,after_snapshot
  ) values(
    audit_id,actor,'customer.status.change','customer',p_customer_id,p_reason,
    audit_id,jsonb_build_object('status',previous),
    jsonb_build_object('status',p_status)
  );

  if p_status='suspended' then
    update public.push_tokens
    set enabled=false,updated_at=now()
    where user_id=p_customer_id;
    delete from auth.sessions where user_id=p_customer_id;
  end if;

  perform private.complete_idempotent_command(
    actor,
    'admin_set_customer_status_v2',
    p_idempotency_key,
    jsonb_build_object('status',p_status)
  );
end
$function$;

COMMENT ON FUNCTION public.admin_set_customer_status(uuid,public.account_status,text,text) IS 'Operations-only customer status command with canonical payload replay and transactional enforcement side effects.';

REVOKE ALL ON FUNCTION public.authorize_clean_media(uuid, uuid) FROM service_role;

CREATE FUNCTION public.authorize_message_media (
  p_user_id   uuid,
  p_upload_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare item public.file_uploads%rowtype;
begin
  if current_setting('role',true) is distinct from 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED';
  end if;
  select * into item
  from public.file_uploads
  where id=p_upload_id and purpose='message_attachment' and status='clean';
  if item.id is null or item.final_path is null or item.resource_id is null then
    raise exception 'MEDIA_ACCESS_DENIED';
  end if;
  if not private.can_communicate_in_conversation_as(p_user_id,item.resource_id) then
    raise exception 'MEDIA_ACCESS_DENIED';
  end if;
  return jsonb_build_object(
    'bucket',item.target_bucket,
    'path',item.final_path,
    'mimeType',coalesce(item.detected_mime_type,item.declared_mime_type),
    'sizeBytes',item.size_bytes,
    'uploadId',item.id,
    'deliveryMode','authenticated_proxy'
  );
end
$function$;

COMMENT ON FUNCTION public.authorize_message_media(uuid,uuid) IS 'Authorizes clean message media only for the service-role broker after current communication checks.';

REVOKE ALL ON FUNCTION public.authorize_message_media(uuid, uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.authorize_message_media(uuid, uuid) TO service_role;

CREATE FUNCTION public.authorize_protected_media (
  p_user_id   uuid,
  p_upload_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare purpose text;
begin
  if current_setting('role',true) is distinct from 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED';
  end if;
  select f.purpose into purpose from public.file_uploads f where f.id=p_upload_id;
  if purpose='message_attachment' then
    return public.authorize_message_media(p_user_id,p_upload_id);
  end if;
  return public.authorize_clean_media(p_user_id,p_upload_id)
    || jsonb_build_object('deliveryMode','signed_url');
end
$function$;

COMMENT ON FUNCTION public.authorize_protected_media(uuid,uuid) IS 'Service-role dispatcher for brokered clean media; supports JWT and non-JWT Supabase server credentials.';

REVOKE ALL ON FUNCTION public.authorize_protected_media(uuid, uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.authorize_protected_media(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.create_change_order (
  payload jsonb
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare actor uuid:=auth.uid(); job_id uuid;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  begin job_id:=(payload->>'jobId')::uuid;
  exception when others then raise exception 'PROVIDER_JOB_REQUIRED'; end;
  perform private.assert_active_job_command_actor(
    actor,job_id,'provider','PROVIDER_JOB_REQUIRED'
  );
  return private.create_change_order_pre_active_gate(payload);
end
$function$;

CREATE FUNCTION public.create_marketplace_report_v2 (
  p_target_type             text,
  p_target_id               uuid,
  p_context_conversation_id uuid,
  p_reason_category         text,
  p_explanation             text,
  p_idempotency_key         text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  actor uuid:=auth.uid();
  conversation uuid;
  job uuid;
  request uuid;
  support_case uuid:=gen_random_uuid();
  report_id uuid:=gen_random_uuid();
  request_hash text;
  replay jsonb;
  result_payload jsonb;
  existing_report public.marketplace_reports%rowtype;
  created timestamptz;
  normalized_explanation text:=nullif(trim(coalesce(p_explanation,'')),'');
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  perform 1 from public.profiles profile
  where profile.id=actor and profile.status='active'
  for share;
  if not found then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;

  if p_target_type in ('message','rating') then
    if p_context_conversation_id is not null then
      raise exception 'REPORT_CONTEXT_NOT_ALLOWED';
    end if;
    return public.create_marketplace_report(
      p_target_type,p_target_id,p_reason_category,p_explanation,p_idempotency_key
    );
  end if;
  if p_target_type<>'user' or p_target_id is null then
    raise exception 'REPORT_TARGET_NOT_AVAILABLE';
  end if;
  if p_context_conversation_id is null then
    raise exception 'REPORT_CONTEXT_REQUIRED';
  end if;
  if p_reason_category not in (
    'harassment','spam','scam','safety','inappropriate_content','rating_abuse','other'
  ) then raise exception 'REPORT_REASON_INVALID'; end if;
  if normalized_explanation is not null
    and char_length(normalized_explanation) not between 1 and 1000 then
    raise exception 'REPORT_EXPLANATION_INVALID';
  end if;

  select context.id,item_job.id,item_job.request_id
  into conversation,job,request
  from public.conversations context
  join public.jobs item_job on item_job.id=context.job_id
  join public.conversation_members actor_member
    on actor_member.conversation_id=context.id
   and actor_member.user_id=actor and actor_member.left_at is null
  join public.conversation_members target_member
    on target_member.conversation_id=context.id
   and target_member.user_id=p_target_id and target_member.left_at is null
  join public.profiles target_profile
    on target_profile.id=p_target_id and target_profile.status<>'anonymized'
  where context.id=p_context_conversation_id
    and p_target_id<>actor
    and (
      (item_job.customer_id=actor and item_job.provider_id=p_target_id)
      or (item_job.provider_id=actor and item_job.customer_id=p_target_id)
    )
  for share of context,item_job,actor_member,target_member;
  if conversation is null then raise exception 'REPORT_TARGET_NOT_AVAILABLE'; end if;

  request_hash:=private.canonical_request_hash(jsonb_build_object(
    'targetType',p_target_type,
    'targetId',p_target_id,
    'contextConversationId',conversation,
    'reasonCategory',p_reason_category,
    'explanation',normalized_explanation
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    actor::text||':create_marketplace_report_v2:'||p_idempotency_key,0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    actor::text||':marketplace_report:user:'||p_target_id::text||':'||conversation::text,0
  ));
  replay:=private.idempotency_replay(
    actor,'create_marketplace_report_v2',p_idempotency_key,request_hash
  );
  if replay is not null then return replay; end if;
  if not private.consume_actor_rate_limit(
    actor,'marketplace_report',date_trunc('hour',clock_timestamp(),'UTC'),10
  ) then raise exception 'RATE_LIMITED'; end if;

  insert into public.idempotency_keys(user_id,command,key,request_hash)
  values(actor,'create_marketplace_report_v2',p_idempotency_key,request_hash);
  select * into existing_report
  from public.marketplace_reports item
  where item.reporter_id=actor
    and item.target_type='user'
    and item.target_id=p_target_id
    and item.conversation_id=conversation
    and item.status in ('submitted','triaged','escalated')
  order by item.created_at desc,item.id desc
  limit 1;
  if existing_report.id is not null then
    result_payload:=jsonb_build_object(
      'reportId',existing_report.id,
      'status',existing_report.status,
      'createdAt',existing_report.created_at,
      'deduplicated',true
    );
    perform private.complete_idempotent_command(
      actor,'create_marketplace_report_v2',p_idempotency_key,result_payload
    );
    return result_payload;
  end if;

  insert into public.support_cases(
    id,opened_by,request_id,job_id,topic,priority,status,subject
  ) values(
    support_case,actor,request,job,'marketplace_abuse',
    case when p_reason_category='safety' then 'high' else 'normal' end,
    'open','Marketplace trust and safety report'
  );
  insert into public.marketplace_reports(
    id,reporter_id,reported_user_id,target_type,target_id,conversation_id,
    job_id,request_id,support_case_id,reason_category,explanation,priority
  ) values(
    report_id,actor,p_target_id,'user',p_target_id,conversation,
    job,request,support_case,p_reason_category,normalized_explanation,
    case when p_reason_category='safety' then 'high' else 'normal' end
  ) returning created_at into created;
  insert into public.marketplace_report_events(
    report_id,actor_id,event_type,from_status,to_status,reason,payload,idempotency_key
  ) values(
    report_id,actor,'submitted',null,'submitted',p_reason_category,
    jsonb_build_object(
      'targetType','user',
      'priority',case when p_reason_category='safety' then 'high' else 'normal' end
    ),p_idempotency_key
  );
  result_payload:=jsonb_build_object(
    'reportId',report_id,'status','submitted','createdAt',created,'deduplicated',false
  );
  perform private.complete_idempotent_command(
    actor,'create_marketplace_report_v2',p_idempotency_key,result_payload
  );
  return result_payload;
end
$function$;

COMMENT ON FUNCTION public.create_marketplace_report_v2(text,uuid,uuid,text,text,text) IS 'Context-bound report intake. User reports require an active exact conversation; message and rating reports require null context and use server-derived target context.';

REVOKE ALL ON FUNCTION public.create_marketplace_report_v2(text, uuid, uuid, text, text, text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.create_marketplace_report_v2(text, uuid, uuid, text, text, text) TO authenticated;

CREATE FUNCTION public.create_marketplace_report (
  p_target_type     text,
  p_target_id       uuid,
  p_reason_category text,
  p_explanation     text,
  p_idempotency_key text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  actor uuid:=auth.uid();
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_target_type='user' then
    raise exception 'REPORT_CONTEXT_REQUIRED';
  end if;

  if not exists(
    select 1
    from public.profiles profile
    where profile.id=actor and profile.status='active'
  ) then
    raise exception 'ACCOUNT_NOT_ACTIVE';
  end if;

  if p_target_type='message' and not exists(
    select 1
    from public.messages message
    join public.conversations conversation
      on conversation.id=message.conversation_id
    join public.jobs job on job.id=conversation.job_id
    join public.conversation_members actor_member
      on actor_member.conversation_id=conversation.id
     and actor_member.user_id=actor
     and actor_member.left_at is null
    where message.id=p_target_id
      and (
        (job.customer_id=actor and message.sender_id=job.provider_id)
        or (job.provider_id=actor and message.sender_id=job.customer_id)
      )
  ) then
    raise exception 'REPORT_TARGET_NOT_AVAILABLE';
  end if;

  if p_target_type='rating' and not exists(
    select 1
    from public.ratings rating
    join public.jobs job on job.id=rating.job_id
    where rating.id=p_target_id
      and rating.provider_id=actor
      and rating.provider_id=job.provider_id
      and rating.customer_id=job.customer_id
      and rating.customer_id<>actor
  ) then
    raise exception 'REPORT_TARGET_NOT_AVAILABLE';
  end if;

  return private.create_marketplace_report_pre_context(
    p_target_type,p_target_id,p_reason_category,p_explanation,p_idempotency_key
  );
end
$function$;

COMMENT ON FUNCTION public.create_marketplace_report(text,uuid,text,text,text) IS 'Compatibility message/rating intake. Exact job-party relationships are validated before replay or mutation; user targets require context-bound v2 intake.';

REVOKE ALL ON FUNCTION public.create_marketplace_report(text, uuid, text, text, text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.create_marketplace_report(text, uuid, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.decide_change_order (
  p_change_order_id uuid,
  p_approve         boolean,
  p_reason          text,
  p_idempotency_key text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare actor uuid:=auth.uid(); job_id uuid;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  select item.job_id into job_id
  from public.change_orders item
  join public.jobs job on job.id=item.job_id
  where item.id=p_change_order_id and job.customer_id=actor;
  if job_id is null then raise exception 'CHANGE_ORDER_NOT_DECIDABLE'; end if;
  perform private.assert_active_job_command_actor(
    actor,job_id,'customer','CHANGE_ORDER_NOT_DECIDABLE'
  );
  return private.decide_change_order_pre_active_gate(
    p_change_order_id,p_approve,p_reason,p_idempotency_key
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.get_authorized_job_location (
  p_job_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare actor uuid:=auth.uid();
begin
  perform private.assert_active_job_command_actor(
    actor,p_job_id,'participant','EXACT_LOCATION_ACCESS_DENIED'
  );
  return private.get_authorized_job_location_pre_active_gate(p_job_id);
end
$function$;

COMMENT ON FUNCTION public.get_authorized_job_location(uuid) IS 'Returns participant exact-job location only after current account and contextual provider eligibility are revalidated.';

CREATE FUNCTION public.get_marketplace_report_enforcement_target (
  p_report_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  actor uuid:=auth.uid();
begin
  if actor is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if not private.has_admin_permission('operations.marketplace.read')
    or not private.has_admin_permission('operations.mutate') then
    raise exception 'MODERATION_PERMISSION_REQUIRED';
  end if;

  return private.marketplace_report_enforcement_target_for(p_report_id);
end
$function$;

COMMENT ON FUNCTION public.get_marketplace_report_enforcement_target(uuid) IS 'Least-privilege operations target derived from report-bound job context; final reports remain enforceable.';

REVOKE ALL ON FUNCTION public.get_marketplace_report_enforcement_target(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.get_marketplace_report_enforcement_target(uuid) TO authenticated;

CREATE FUNCTION public.get_marketplace_report_enforcement_targets (
  p_report_ids uuid[]
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  actor uuid:=auth.uid();
  report_count integer;
  duplicate_count bigint;
  invalid_count bigint;
  targets jsonb;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if not private.has_admin_permission('operations.marketplace.read')
    or not private.has_admin_permission('operations.mutate') then
    raise exception 'MODERATION_PERMISSION_REQUIRED';
  end if;
  report_count:=cardinality(p_report_ids);
  if report_count is null or report_count not between 1 and 100
    or array_ndims(p_report_ids)<>1
    or array_position(p_report_ids,null::uuid) is not null then
    raise exception 'INVALID_REPORT_TARGET_BATCH';
  end if;

  with input as materialized (
    select item.report_id,item.ordinality
    from unnest(p_report_ids) with ordinality as item(report_id,ordinality)
  ), context_rows as (
    select input.report_id requested_report_id,input.ordinality,
      report.id report_id,report.support_case_id,report.reported_user_id,
      report.reporter_id,report.target_type,report.target_id,
      report.message_id reported_message_id,
      report.conversation_id reported_conversation_id,
      report.rating_id reported_rating_id,report.request_id reported_request_id,
      job.id job_id,job.customer_id,job.provider_id,job.request_id job_request_id,
      message.id message_id,message.sender_id message_sender_id,
      message.conversation_id message_conversation_id,
      context.id conversation_id,context.job_id conversation_job_id,
      reporter_member.user_id reporter_member_id,
      target_member.user_id target_member_id,
      rating.id rating_id,rating.job_id rating_job_id,
      rating.customer_id rating_customer_id,rating.provider_id rating_provider_id
    from input
    left join public.marketplace_reports report on report.id=input.report_id
    left join public.jobs job on job.id=report.job_id
    left join public.messages message
      on report.target_type='message' and message.id=report.message_id
    left join public.conversations context on context.id=report.conversation_id
    left join public.conversation_members reporter_member
      on reporter_member.conversation_id=context.id
     and reporter_member.user_id=report.reporter_id
    left join public.conversation_members target_member
      on target_member.conversation_id=context.id
     and target_member.user_id=report.reported_user_id
    left join public.ratings rating
      on report.target_type='rating' and rating.id=report.rating_id
  ), classified as (
    select context_rows.*,
      case
        when reported_user_id=customer_id and reported_user_id<>provider_id then 'customer'
        when reported_user_id=provider_id and reported_user_id<>customer_id then 'provider'
        else null
      end target_role
    from context_rows
  ), validated as (
    select classified.*,
      target_role is not null and (
        (target_type='user' and target_id=reported_user_id
          and reported_conversation_id=conversation_id
          and conversation_job_id=job_id
          and reporter_member_id=reporter_id and target_member_id=reported_user_id
          and reporter_id in (customer_id,provider_id)
          and reporter_id<>reported_user_id
          and reported_request_id=job_request_id)
        or (target_type='message' and target_id=message_id
          and reported_message_id=message_id
          and message_conversation_id=reported_conversation_id
          and reported_conversation_id=conversation_id
          and conversation_job_id=job_id and message_sender_id=reported_user_id
          and reporter_id in (customer_id,provider_id)
          and reporter_id<>reported_user_id
          and reported_request_id=job_request_id)
        or (target_type='rating' and target_id=rating_id
          and reported_rating_id=rating_id and rating_job_id=job_id
          and rating_customer_id=reported_user_id and rating_provider_id=reporter_id
          and customer_id=rating_customer_id and provider_id=rating_provider_id
          and reported_request_id=job_request_id)
      ) context_valid
    from classified
  )
  select count(*)-count(distinct requested_report_id),
    count(*) filter(where context_valid is not true),
    coalesce(jsonb_agg(jsonb_build_object(
      'reportId',report_id,'supportCaseId',support_case_id,
      'reportedUserId',reported_user_id,'targetRole',target_role
    ) order by ordinality) filter(where context_valid is true),'[]'::jsonb)
  into duplicate_count,invalid_count,targets
  from validated;
  if duplicate_count>0 then raise exception 'DUPLICATE_REPORT_ID'; end if;
  if invalid_count>0 then raise exception 'REPORT_ENFORCEMENT_TARGET_NOT_AVAILABLE'; end if;
  return jsonb_build_object('targets',targets);
end
$function$;

COMMENT ON FUNCTION public.get_marketplace_report_enforcement_targets(uuid[]) IS 'Returns input-ordered contextual enforcement targets and fails the whole batch unless every stored user, message/conversation, or rating context matches the scalar contract.';

REVOKE ALL ON FUNCTION public.get_marketplace_report_enforcement_targets(uuid[]) FROM PUBLIC;

GRANT ALL ON FUNCTION public.get_marketplace_report_enforcement_targets(uuid[]) TO authenticated;

CREATE FUNCTION public.get_marketplace_trust_context (
  p_conversation_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  actor uuid:=auth.uid();
  counterparty uuid;
  blocked_by_me boolean;
  can_communicate boolean;
  restriction text;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  select case when actor=job.customer_id
    then job.provider_id else job.customer_id end
  into counterparty
  from public.conversations conversation
  join public.jobs job on job.id=conversation.job_id
  join public.conversation_members member
    on member.conversation_id=conversation.id and member.user_id=actor
  where conversation.id=p_conversation_id
    and member.left_at is null
    and actor in (job.customer_id,job.provider_id);
  if counterparty is null then raise exception 'CONVERSATION_ACCESS_DENIED'; end if;

  select exists(
    select 1
    from public.blocked_users blocked
    where blocked.blocker_id=actor and blocked.blocked_id=counterparty
  ) into blocked_by_me;
  can_communicate:=private.can_communicate_in_conversation_as(
    actor,p_conversation_id
  );
  restriction:=case
    when blocked_by_me then 'blocked'
    when can_communicate then null
    else 'communication_unavailable'
  end;

  return jsonb_build_object(
    'conversationId',p_conversation_id,
    'counterpartyUserId',counterparty,
    'blockedByMe',blocked_by_me,
    'canCommunicate',can_communicate,
    'restriction',restriction
  );
end
$function$;

COMMENT ON FUNCTION public.get_marketplace_trust_context(uuid) IS 'Returns the safe conversation trust projection: actor-owned block state, generic communication availability, and no counterparty enforcement direction.';

REVOKE ALL ON FUNCTION public.get_marketplace_trust_context(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.get_marketplace_trust_context(uuid) TO authenticated;

CREATE FUNCTION public.get_my_marketplace_reports (
  p_limit integer DEFAULT 50
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare actor uuid:=auth.uid(); result jsonb;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'INVALID_PAGE_LIMIT';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'reportId',r.id,
    'targetType',r.target_type,
    'status',r.status,
    'createdAt',r.created_at,
    'updatedAt',r.updated_at
  ) order by r.created_at desc,r.id desc),'[]'::jsonb)
  into result
  from (
    select * from public.marketplace_reports
    where reporter_id=actor
    order by created_at desc,id desc
    limit p_limit
  ) r;
  return jsonb_build_object('reports',result);
end
$function$;

REVOKE ALL ON FUNCTION public.get_my_marketplace_reports(integer) FROM PUBLIC;

GRANT ALL ON FUNCTION public.get_my_marketplace_reports(integer) TO authenticated;

CREATE FUNCTION public.list_marketplace_reports (
  p_status text    DEFAULT NULL::text,
  p_limit  integer DEFAULT 50
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare actor uuid:=auth.uid(); operations_access boolean; support_access boolean; result jsonb;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'INVALID_PAGE_LIMIT';
  end if;
  if p_status is not null and p_status not in (
    'submitted','triaged','escalated','resolved','dismissed'
  ) then raise exception 'INVALID_REPORT_STATUS'; end if;
  operations_access:=private.has_admin_permission('operations.marketplace.read');
  support_access:=private.has_role(array['support_agent']::public.user_role[]);
  if not operations_access and not support_access then
    raise exception 'MODERATION_PERMISSION_REQUIRED';
  end if;
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'reportId',r.id,
      'reporterId',r.reporter_id,
      'reportedUserId',r.reported_user_id,
      'targetType',r.target_type,
      'messageId',r.message_id,
      'ratingId',r.rating_id,
      'conversationId',r.conversation_id,
      'jobId',r.job_id,
      'requestId',r.request_id,
      'supportCaseId',r.support_case_id,
      'reasonCategory',r.reason_category,
      'explanation',r.explanation,
      'status',r.status,
      'priority',r.priority,
      'version',r.version,
      'createdAt',r.created_at,
      'updatedAt',r.updated_at,
      'history',r.history_items,
      'historyMeta',jsonb_build_object(
        'limit',50,
        'returned',jsonb_array_length(r.history_items),
        'total',r.history_total,
        'truncated',r.history_total>jsonb_array_length(r.history_items)
      )
    ) || case when r.can_read_evidence then jsonb_build_object(
      'textSnapshot',r.text_snapshot,
      'attachmentEvidence',r.attachment_evidence
    ) else '{}'::jsonb end
    order by r.created_at,r.id
  ),'[]'::jsonb)
  into result
  from (
    select report.*,
      operations_access or private.has_support_case_access_for(
        actor,report.support_case_id,'evidence'
      ) as can_read_evidence,
      history.items as history_items,
      history.total as history_total
    from public.marketplace_reports report
    cross join lateral (
      select
        coalesce((
          select jsonb_agg(jsonb_build_object(
            'eventId',event.id,
            'eventType',event.event_type,
            'fromStatus',event.from_status,
            'toStatus',event.to_status,
            'reason',event.reason,
            'payload',event.payload,
            'actorId',event.actor_id,
            'createdAt',event.created_at
          ) order by event.created_at,event.id)
          from (
            select event.*
            from public.marketplace_report_events event
            where event.report_id=report.id
            order by event.created_at desc,event.id desc
            limit 50
          ) event
        ),'[]'::jsonb) as items,
        (select count(*)
         from public.marketplace_report_events event
         where event.report_id=report.id) as total
    ) history
    where (p_status is null or report.status=p_status)
      and (
        operations_access
        or private.has_support_case_access_for(actor,report.support_case_id,'read')
      )
    order by report.created_at,report.id
    limit p_limit
  ) r;
  return jsonb_build_object('reports',result);
end
$function$;

REVOKE ALL ON FUNCTION public.list_marketplace_reports(text, integer) FROM PUBLIC;

GRANT ALL ON FUNCTION public.list_marketplace_reports(text, integer) TO authenticated;

CREATE FUNCTION public.list_open_marketplace_reports (
  p_limit            integer                  DEFAULT 50,
  p_after_created_at timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  p_after_report_id  uuid                     DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  actor uuid:=auth.uid();
  operations_access boolean;
  support_access boolean;
  reports jsonb;
  has_more boolean;
  last_report jsonb;
  next_cursor jsonb:='null'::jsonb;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'INVALID_PAGE_LIMIT';
  end if;
  if (p_after_created_at is null)<>(p_after_report_id is null) then
    raise exception 'INVALID_PAGE_CURSOR';
  end if;
  operations_access:=private.has_admin_permission('operations.marketplace.read');
  support_access:=private.has_role(array['support_agent']::public.user_role[]);
  if not operations_access and not support_access then
    raise exception 'MODERATION_PERMISSION_REQUIRED';
  end if;

  with candidates as materialized (
    select report.*,
      operations_access or private.has_support_case_access_for(
        actor,report.support_case_id,'evidence'
      ) as can_read_evidence
    from public.marketplace_reports report
    where report.status in ('submitted','triaged','escalated')
      and (
        p_after_created_at is null
        or (report.created_at,report.id)>(p_after_created_at,p_after_report_id)
      )
      and (
        operations_access
        or private.has_support_case_access_for(actor,report.support_case_id,'read')
      )
    order by report.created_at,report.id
    limit p_limit+1
  ), numbered as (
    select candidate.*,
      row_number() over(order by candidate.created_at,candidate.id) as page_number
    from candidates candidate
  ), projected as (
    select page.*,
      history.items as history_items,
      history.total as history_total
    from numbered page
    cross join lateral (
      select
        coalesce((
          select jsonb_agg(jsonb_build_object(
            'eventId',event.id,
            'eventType',event.event_type,
            'fromStatus',event.from_status,
            'toStatus',event.to_status,
            'reason',event.reason,
            'payload',event.payload,
            'actorId',event.actor_id,
            'createdAt',event.created_at
          ) order by event.created_at,event.id)
          from (
            select report_event.*
            from public.marketplace_report_events report_event
            where report_event.report_id=page.id
            order by report_event.created_at desc,report_event.id desc
            limit 50
          ) event
        ),'[]'::jsonb) as items,
        (select count(*)
         from public.marketplace_report_events report_event
         where report_event.report_id=page.id) as total
    ) history
  )
  select
    coalesce(jsonb_agg(
      jsonb_build_object(
        'reportId',report.id,
        'reporterId',report.reporter_id,
        'reportedUserId',report.reported_user_id,
        'targetType',report.target_type,
        'messageId',report.message_id,
        'ratingId',report.rating_id,
        'conversationId',report.conversation_id,
        'jobId',report.job_id,
        'requestId',report.request_id,
        'supportCaseId',report.support_case_id,
        'reasonCategory',report.reason_category,
        'explanation',report.explanation,
        'status',report.status,
        'priority',report.priority,
        'version',report.version,
        'createdAt',report.created_at,
        'updatedAt',report.updated_at,
        'history',report.history_items,
        'historyMeta',jsonb_build_object(
          'limit',50,
          'returned',jsonb_array_length(report.history_items),
          'total',report.history_total,
          'truncated',report.history_total>jsonb_array_length(report.history_items)
        )
      ) || case when report.can_read_evidence then jsonb_build_object(
        'textSnapshot',report.text_snapshot,
        'attachmentEvidence',report.attachment_evidence
      ) else '{}'::jsonb end
      order by report.created_at,report.id
    ) filter(where report.page_number<=p_limit),'[]'::jsonb),
    count(*)>p_limit
  into reports,has_more
  from projected report;

  if has_more and jsonb_array_length(reports)>0 then
    last_report:=reports->(jsonb_array_length(reports)-1);
    next_cursor:=jsonb_build_object(
      'createdAt',last_report->'createdAt',
      'reportId',last_report->'reportId'
    );
  end if;
  return jsonb_build_object(
    'reports',reports,
    'hasMore',has_more,
    'nextCursor',next_cursor
  );
end
$function$;

COMMENT ON FUNCTION public.list_open_marketplace_reports(integer,timestamp with time zone,uuid) IS 'Oldest-first open moderation queue with deterministic created_at/id keyset pagination.';

REVOKE ALL ON FUNCTION public.list_open_marketplace_reports(integer, timestamp WITH time zone, uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.list_open_marketplace_reports(integer, timestamp WITH time zone, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_job_location (
  p_job_id     uuid,
  p_session_id uuid,
  p_latitude   double precision,
  p_longitude  double precision,
  p_accuracy_m numeric
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare actor uuid:=auth.uid();
begin
  perform private.assert_active_job_command_actor(
    actor,p_job_id,'provider','ACTIVE_PROVIDER_JOB_REQUIRED'
  );
  return private.record_job_location_pre_active_gate(
    p_job_id,p_session_id,p_latitude,p_longitude,p_accuracy_m
  );
end
$function$;

COMMENT ON FUNCTION public.record_job_location(uuid,uuid,double precision,double precision,numeric) IS 'Records an exact-job location only after current provider eligibility and the settled sharing-token checks both pass.';

CREATE FUNCTION public.resolve_marketplace_report (
  p_report_id        uuid,
  p_resolution       text,
  p_reason           text,
  p_expected_version integer,
  p_idempotency_key  text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  actor uuid:=auth.uid();
  item public.marketplace_reports%rowtype;
  operations_access boolean;
  scoped_support_access boolean;
  request_hash text;
  replay jsonb;
  result_payload jsonb;
  event_id uuid:=gen_random_uuid();
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_resolution not in ('escalated','resolved','dismissed') then
    raise exception 'INVALID_REPORT_RESOLUTION';
  end if;
  if char_length(trim(coalesce(p_reason,''))) not between 5 and 2000 then
    raise exception 'REASON_REQUIRED';
  end if;
  if p_expected_version is null then raise exception 'EXPECTED_VERSION_REQUIRED'; end if;
  request_hash:=private.canonical_request_hash(jsonb_build_object(
    'reportId',p_report_id,'resolution',p_resolution,
    'reason',trim(p_reason),'expectedVersion',p_expected_version
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    actor::text||':marketplace_report_resolve:'||p_idempotency_key,0
  ));
  select * into item from public.marketplace_reports
  where id=p_report_id for update;
  if item.id is null then raise exception 'REPORT_NOT_FOUND'; end if;
  operations_access:=private.has_admin_permission('operations.marketplace.read')
    and private.has_admin_permission('operations.mutate');
  scoped_support_access:=private.has_support_case_access_for(
    actor,item.support_case_id,'internal_note'
  );
  if p_resolution='escalated' then
    if not operations_access and not scoped_support_access then
      raise exception 'MODERATION_PERMISSION_REQUIRED';
    end if;
  elsif not operations_access then
    raise exception 'MODERATION_PERMISSION_REQUIRED';
  end if;
  replay:=private.idempotency_replay(
    actor,'resolve_marketplace_report_v1',p_idempotency_key,request_hash
  );
  if replay is not null then return replay; end if;
  if item.version<>p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  if item.status=p_resolution then raise exception 'REPORT_NO_CHANGE'; end if;
  if item.status in ('resolved','dismissed') then raise exception 'REPORT_STATE_CONFLICT'; end if;
  insert into public.idempotency_keys(user_id,command,key,request_hash)
  values(actor,'resolve_marketplace_report_v1',p_idempotency_key,request_hash);
  update public.marketplace_reports
  set status=p_resolution,version=version+1,last_action_by=actor,
    resolved_at=case when p_resolution in ('resolved','dismissed') then now() else null end
  where id=item.id;
  if scoped_support_access and not operations_access then
    insert into public.support_internal_notes(case_id,author_id,body)
    values(item.support_case_id,actor,trim(p_reason));
  end if;
  insert into public.marketplace_report_events(
    id,report_id,actor_id,event_type,from_status,to_status,reason,payload,idempotency_key
  ) values(
    event_id,item.id,actor,p_resolution,item.status,p_resolution,trim(p_reason),
    jsonb_build_object('fromVersion',item.version,'toVersion',item.version+1),
    p_idempotency_key
  );
  insert into public.admin_audit_logs(
    actor_id,action,target_type,target_id,reason,correlation_id,before_snapshot,after_snapshot
  ) values(
    actor,'marketplace.report.'||p_resolution,'marketplace_report',item.id,
    trim(p_reason),event_id,
    jsonb_build_object('status',item.status,'version',item.version),
    jsonb_build_object('status',p_resolution,'version',item.version+1)
  );
  result_payload:=jsonb_build_object(
    'reportId',item.id,'status',p_resolution,'priority',item.priority,'version',item.version+1
  );
  perform private.complete_idempotent_command(
    actor,'resolve_marketplace_report_v1',p_idempotency_key,result_payload
  );
  return result_payload;
end
$function$;

REVOKE ALL ON FUNCTION public.resolve_marketplace_report(uuid, text, text, integer, text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.resolve_marketplace_report(uuid, text, text, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.select_offer (
  p_offer_id        uuid,
  p_idempotency_key text
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  actor uuid:=auth.uid();
  customer_id uuid;
  provider_id uuid;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  select request.customer_id,offer.provider_id
  into customer_id,provider_id
  from public.offers offer
  join public.service_requests request on request.id=offer.request_id
  where offer.id=p_offer_id;
  if customer_id is null or provider_id is null
    or customer_id<>actor or provider_id=actor then
    return private.select_offer_pre_block_gate(p_offer_id,p_idempotency_key);
  end if;
  perform private.lock_marketplace_pair(customer_id,provider_id);
  if exists(
    select 1 from public.blocked_users blocked
    where (blocked.blocker_id=customer_id and blocked.blocked_id=provider_id)
       or (blocked.blocker_id=provider_id and blocked.blocked_id=customer_id)
  ) then
    raise exception 'OFFER_PROVIDER_INELIGIBLE:customer_provider_blocked';
  end if;
  return private.select_offer_pre_block_gate(p_offer_id,p_idempotency_key);
end
$function$;

COMMENT ON FUNCTION public.select_offer(uuid,text) IS 'Selects or replays an offer only after the canonical customer/provider pair lock and current block check.';

CREATE OR REPLACE FUNCTION public.send_message_with_attachments (
  p_conversation_id   uuid,
  p_body              text,
  p_upload_ids        uuid[],
  p_client_message_id text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  actor uuid:=auth.uid();
  created_message_id uuid;
  upload_id uuid;
  upload public.file_uploads%rowtype;
  attachment_count integer:=coalesce(array_length(p_upload_ids,1),0);
  normalized_upload_ids uuid[];
  customer_id uuid;
  provider_id uuid;
  request_hash text;
  replay jsonb;
  result_payload jsonb;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if attachment_count>8 then raise exception 'TOO_MANY_ATTACHMENTS'; end if;
  if array_position(p_upload_ids,null) is not null then
    raise exception 'MESSAGE_ATTACHMENT_ID_REQUIRED';
  end if;
  select coalesce(array_agg(distinct item order by item),'{}'::uuid[])
  into normalized_upload_ids
  from unnest(coalesce(p_upload_ids,'{}'::uuid[])) as requested(item);
  if cardinality(normalized_upload_ids)<>attachment_count then
    raise exception 'DUPLICATE_MESSAGE_ATTACHMENT';
  end if;
  select j.customer_id,j.provider_id into customer_id,provider_id
  from public.conversations c
  join public.jobs j on j.id=c.job_id
  where c.id=p_conversation_id and actor in (j.customer_id,j.provider_id);
  if customer_id is null or provider_id is null then
    raise exception 'CONVERSATION_ACCESS_DENIED';
  end if;
  perform private.lock_marketplace_pair(customer_id,provider_id);
  request_hash:=private.canonical_request_hash(jsonb_build_object(
    'conversationId',p_conversation_id,
    'body',trim(coalesce(p_body,'')),
    'uploadIds',to_jsonb(normalized_upload_ids)
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    actor::text||':send_message:'||coalesce(p_client_message_id,''),0
  ));
  if not private.can_access_conversation(p_conversation_id) then
    raise exception 'CONVERSATION_ACCESS_DENIED';
  end if;
  if not private.can_communicate_in_conversation_as(actor,p_conversation_id) then
    raise exception 'COMMUNICATION_NOT_ALLOWED';
  end if;
  replay:=private.idempotency_replay(
    actor,'send_message_with_attachments_v2',p_client_message_id,request_hash
  );
  if replay is not null then return replay; end if;
  if length(trim(coalesce(p_body,'')))=0 and attachment_count=0 then
    raise exception 'MESSAGE_CONTENT_REQUIRED';
  end if;
  if length(trim(coalesce(p_body,'')))>4000 then raise exception 'MESSAGE_CONTENT_INVALID'; end if;
  foreach upload_id in array normalized_upload_ids loop
    select * into upload from public.file_uploads where id=upload_id for update;
    if upload.id is null or upload.user_id<>actor or upload.purpose<>'message_attachment'
      or upload.status<>'clean' or upload.final_path is null
      or (upload.resource_id is not null and upload.resource_id<>p_conversation_id) then
      raise exception 'CLEAN_MESSAGE_ATTACHMENT_REQUIRED';
    end if;
    if exists(
      select 1 from public.message_attachments attachment
      where attachment.file_upload_id=upload.id
    ) then
      raise exception 'MESSAGE_ATTACHMENT_ALREADY_USED';
    end if;
  end loop;
  if not private.consume_actor_rate_limit(
    actor,'message_send',date_trunc('minute',clock_timestamp(),'UTC'),60
  ) then raise exception 'RATE_LIMITED'; end if;
  insert into public.idempotency_keys(user_id,command,key,request_hash)
  values(actor,'send_message_with_attachments_v2',p_client_message_id,request_hash);
  insert into public.messages(conversation_id,sender_id,body,client_message_id)
  values(
    p_conversation_id,actor,
    case when length(trim(coalesce(p_body,'')))=0 then 'attachment' else trim(p_body) end,
    p_client_message_id
  ) returning id into created_message_id;
  foreach upload_id in array normalized_upload_ids loop
    update public.file_uploads set resource_id=p_conversation_id
    where id=upload_id returning * into upload;
    insert into public.message_attachments(
      message_id,uploader_id,storage_path,mime_type,size_bytes,file_upload_id
    ) values(
      created_message_id,actor,upload.final_path,
      coalesce(upload.detected_mime_type,upload.declared_mime_type),
      upload.size_bytes,upload.id
    );
  end loop;
  result_payload:=jsonb_build_object(
    'messageId',created_message_id,'attachmentCount',attachment_count
  );
  perform private.complete_idempotent_command(
    actor,'send_message_with_attachments_v2',p_client_message_id,result_payload
  );
  return result_payload;
end
$function$;

CREATE FUNCTION public.set_user_block (
  p_target_user_id  uuid,
  p_blocked         boolean,
  p_reason          text,
  p_idempotency_key text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  legacy_result jsonb;
begin
  legacy_result:=private.set_user_block_pre_safe_projection(
    p_target_user_id,p_blocked,p_reason,p_idempotency_key
  );
  return jsonb_build_object(
    'targetUserId',p_target_user_id,
    'blocked',p_blocked,
    'changed',coalesce((legacy_result->>'changed')::boolean,false),
    'canCommunicate',false
  );
end
$function$;

COMMENT ON FUNCTION public.set_user_block(uuid,boolean,text,text) IS 'Sets actor-owned block state through the preserved authoritative command and returns actor intent plus fail-closed communication availability pending conversation-context refresh.';

REVOKE ALL ON FUNCTION public.set_user_block(uuid, boolean, text, text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.set_user_block(uuid, boolean, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.start_job_location_sharing (
  p_job_id           uuid,
  p_duration_minutes integer,
  p_consent          boolean
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare actor uuid:=auth.uid();
begin
  perform private.assert_active_job_command_actor(
    actor,p_job_id,'provider','ACTIVE_PROVIDER_JOB_REQUIRED'
  );
  return private.start_job_location_sharing_pre_active_gate(
    p_job_id,p_duration_minutes,p_consent
  );
end
$function$;

COMMENT ON FUNCTION public.start_job_location_sharing(uuid,integer,boolean) IS 'Starts consented foreground sharing only after current exact-job provider eligibility is revalidated.';

CREATE OR REPLACE FUNCTION public.submit_completion (
  p_job_id          uuid,
  p_proofs          jsonb,
  p_idempotency_key text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare actor uuid:=auth.uid();
begin
  perform private.assert_active_job_command_actor(
    actor,p_job_id,'provider','ACTIVE_PROVIDER_JOB_REQUIRED'
  );
  return private.submit_completion_pre_active_gate(
    p_job_id,p_proofs,p_idempotency_key
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.submit_offer (
  payload jsonb
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  actor uuid:=auth.uid();
  request_id uuid:=(payload->>'requestId')::uuid;
  customer_id uuid;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  select request.customer_id into customer_id
  from public.service_requests request
  where request.id=request_id;
  if customer_id is null or customer_id=actor then
    return private.submit_offer_pre_block_gate(payload);
  end if;
  perform private.lock_marketplace_pair(customer_id,actor);
  if exists(
    select 1 from public.blocked_users blocked
    where (blocked.blocker_id=customer_id and blocked.blocked_id=actor)
       or (blocked.blocker_id=actor and blocked.blocked_id=customer_id)
  ) then
    raise exception 'PROVIDER_NOT_ELIGIBLE:customer_provider_blocked';
  end if;
  return private.submit_offer_pre_block_gate(payload);
end
$function$;

COMMENT ON FUNCTION public.submit_offer(jsonb) IS 'Submits or replays an offer only after the canonical customer/provider pair lock and current block check.';

CREATE OR REPLACE FUNCTION public.transition_job (
  p_job_id          uuid,
  p_to_status       text,
  p_reason          text,
  p_idempotency_key text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare actor uuid:=auth.uid();
begin
  perform private.assert_active_job_command_actor(
    actor,p_job_id,'participant','JOB_ACCESS_DENIED'
  );
  return private.transition_job_pre_active_gate(
    p_job_id,p_to_status,p_reason,p_idempotency_key
  );
end
$function$;

CREATE FUNCTION public.triage_marketplace_report (
  p_report_id        uuid,
  p_priority         text,
  p_reason           text,
  p_expected_version integer,
  p_idempotency_key  text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  actor uuid:=auth.uid();
  item public.marketplace_reports%rowtype;
  request_hash text;
  replay jsonb;
  result_payload jsonb;
  event_id uuid:=gen_random_uuid();
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if not private.has_admin_permission('operations.marketplace.read')
    or not private.has_admin_permission('operations.mutate') then
    raise exception 'MODERATION_PERMISSION_REQUIRED';
  end if;
  if p_priority not in ('low','normal','high','urgent') then
    raise exception 'INVALID_REPORT_PRIORITY';
  end if;
  if char_length(trim(coalesce(p_reason,''))) not between 5 and 2000 then
    raise exception 'REASON_REQUIRED';
  end if;
  if p_expected_version is null then raise exception 'EXPECTED_VERSION_REQUIRED'; end if;
  request_hash:=private.canonical_request_hash(jsonb_build_object(
    'reportId',p_report_id,'priority',p_priority,
    'reason',trim(p_reason),'expectedVersion',p_expected_version
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    actor::text||':marketplace_report_triage:'||p_idempotency_key,0
  ));
  replay:=private.idempotency_replay(
    actor,'triage_marketplace_report_v1',p_idempotency_key,request_hash
  );
  if replay is not null then return replay; end if;
  select * into item from public.marketplace_reports
  where id=p_report_id for update;
  if item.id is null then raise exception 'REPORT_NOT_FOUND'; end if;
  if item.version<>p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  if item.status not in ('submitted','triaged') then
    raise exception 'REPORT_STATE_CONFLICT';
  end if;
  if item.status='triaged' and item.priority=p_priority then
    raise exception 'REPORT_NO_CHANGE';
  end if;
  insert into public.idempotency_keys(user_id,command,key,request_hash)
  values(actor,'triage_marketplace_report_v1',p_idempotency_key,request_hash);
  update public.marketplace_reports
  set status='triaged',priority=p_priority,version=version+1,last_action_by=actor
  where id=item.id;
  insert into public.marketplace_report_events(
    id,report_id,actor_id,event_type,from_status,to_status,reason,payload,idempotency_key
  ) values(
    event_id,item.id,actor,'triaged',item.status,'triaged',trim(p_reason),
    jsonb_build_object('fromPriority',item.priority,'toPriority',p_priority,
      'fromVersion',item.version,'toVersion',item.version+1),
    p_idempotency_key
  );
  insert into public.admin_audit_logs(
    actor_id,action,target_type,target_id,reason,correlation_id,before_snapshot,after_snapshot
  ) values(
    actor,'marketplace.report.triage','marketplace_report',item.id,trim(p_reason),event_id,
    jsonb_build_object('status',item.status,'priority',item.priority,'version',item.version),
    jsonb_build_object('status','triaged','priority',p_priority,'version',item.version+1)
  );
  result_payload:=jsonb_build_object(
    'reportId',item.id,'status','triaged','priority',p_priority,'version',item.version+1
  );
  perform private.complete_idempotent_command(
    actor,'triage_marketplace_report_v1',p_idempotency_key,result_payload
  );
  return result_payload;
end
$function$;

REVOKE ALL ON FUNCTION public.triage_marketplace_report(uuid, text, text, integer, text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.triage_marketplace_report(uuid, text, text, integer, text) TO authenticated;

REVOKE DELETE, INSERT, UPDATE ON public.addresses FROM authenticated;

CREATE POLICY addresses_authorized_read ON public.addresses
  FOR SELECT
  TO authenticated
  USING (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.jobs job
  WHERE
    ((job.exact_address_id = addresses.id) AND (job.provider_id = ( SELECT auth.uid() AS uid)) AND (job.status <> ALL (ARRAY['completed'::public.job_status,
    'cancelled'::public.job_status])) AND private.can_read_current_job_exact_location(job.id))))));

REVOKE DELETE, INSERT, UPDATE ON public.blocked_users FROM authenticated;

CREATE POLICY blocks_owner_read ON public.blocked_users
  FOR SELECT
  TO authenticated
  USING ((blocker_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY location_sessions_participants_read ON public.job_location_sharing_sessions
  FOR SELECT
  TO authenticated
  USING ((private.can_read_current_job_exact_location(job_id) OR private.has_admin_permission('job.exact_location.read'::text)));

CREATE POLICY job_location_participants ON public.job_location_updates
  FOR SELECT
  TO authenticated
  USING (((expires_at > now()) AND private.can_read_current_job_exact_location(job_id)));

CREATE TABLE public.marketplace_report_events (
  id              uuid                     DEFAULT gen_random_uuid() NOT NULL,
  report_id       uuid                     NOT NULL,
  actor_id        uuid                     NOT NULL,
  event_type      text                     NOT NULL,
  from_status     text,
  to_status       text                     NOT NULL,
  reason          text                     NOT NULL,
  payload         jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  idempotency_key text                     NOT NULL,
  created_at      timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.marketplace_report_events
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.marketplace_report_events
  ADD CONSTRAINT marketplace_report_events_actor_id_event_type_idempotency_k_key UNIQUE (actor_id, event_type, idempotency_key);

ALTER TABLE public.marketplace_report_events
  ADD CONSTRAINT marketplace_report_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id);

ALTER TABLE public.marketplace_report_events
  ADD CONSTRAINT marketplace_report_events_event_type_check
    CHECK (event_type = ANY (ARRAY['submitted'::text, 'triaged'::text, 'escalated'::text, 'resolved'::text, 'dismissed'::text]));

ALTER TABLE public.marketplace_report_events
  ADD CONSTRAINT marketplace_report_events_payload_check CHECK (jsonb_typeof(payload) = 'object'::text AND pg_column_size(payload) <= 16384);

ALTER TABLE public.marketplace_report_events
  ADD CONSTRAINT marketplace_report_events_pkey PRIMARY KEY (id);

ALTER TABLE public.marketplace_report_events
  ADD CONSTRAINT marketplace_report_events_reason_check CHECK (char_length(reason) >= 1 AND char_length(reason) <= 2000);

REVOKE ALL ON TABLE public.marketplace_report_events FROM PUBLIC, anon, authenticated;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.marketplace_report_events TO service_role;

CREATE INDEX marketplace_report_events_report_idx ON public.marketplace_report_events (report_id, created_at, id);

CREATE TRIGGER marketplace_report_events_immutable
  BEFORE DELETE OR UPDATE ON public.marketplace_report_events
  FOR EACH ROW
  EXECUTE FUNCTION private.reject_event_mutation();

CREATE TABLE public.marketplace_reports (
  id                  uuid                     DEFAULT gen_random_uuid() NOT NULL,
  reporter_id         uuid                     NOT NULL,
  reported_user_id    uuid                     NOT NULL,
  target_type         text                     NOT NULL,
  target_id           uuid                     NOT NULL,
  conversation_id     uuid,
  message_id          uuid,
  rating_id           uuid,
  job_id              uuid,
  request_id          uuid,
  support_case_id     uuid                     NOT NULL,
  reason_category     text                     NOT NULL,
  explanation         text,
  text_snapshot       text,
  attachment_evidence jsonb                    DEFAULT '[]'::jsonb NOT NULL,
  status              text                     DEFAULT 'submitted'::text NOT NULL,
  priority            text                     DEFAULT 'normal'::text NOT NULL,
  version             integer                  DEFAULT 1 NOT NULL,
  last_action_by      uuid,
  correlation_id      uuid                     DEFAULT gen_random_uuid() NOT NULL,
  created_at          timestamp with time zone DEFAULT now() NOT NULL,
  updated_at          timestamp with time zone DEFAULT now() NOT NULL,
  resolved_at         timestamp with time zone
);

ALTER TABLE public.marketplace_reports
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.marketplace_reports
  ADD CONSTRAINT marketplace_reports_attachment_evidence_check CHECK (jsonb_typeof(attachment_evidence) = 'array'::text AND pg_column_size(attachment_evidence) <= 16384);

ALTER TABLE public.marketplace_reports
  ADD CONSTRAINT marketplace_reports_check CHECK (reported_user_id <> reporter_id);

ALTER TABLE public.marketplace_reports
  ADD CONSTRAINT marketplace_reports_check1
    CHECK
    (target_type = 'user'::text AND target_id = reported_user_id AND message_id IS NULL AND rating_id IS NULL OR target_type = 'message'::text AND target_id = message_id AND
    conversation_id IS NOT NULL OR target_type = 'rating'::text AND target_id = rating_id AND job_id IS NOT NULL);

ALTER TABLE public.marketplace_reports
  ADD CONSTRAINT marketplace_reports_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id);

ALTER TABLE public.marketplace_reports
  ADD CONSTRAINT marketplace_reports_correlation_id_key UNIQUE (correlation_id);

ALTER TABLE public.marketplace_reports
  ADD CONSTRAINT marketplace_reports_explanation_check CHECK (explanation IS NULL OR char_length(explanation) >= 1 AND char_length(explanation) <= 1000);

ALTER TABLE public.marketplace_reports
  ADD CONSTRAINT marketplace_reports_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id);

ALTER TABLE public.marketplace_reports
  ADD CONSTRAINT marketplace_reports_last_action_by_fkey FOREIGN KEY (last_action_by) REFERENCES public.profiles(id);

ALTER TABLE public.marketplace_reports
  ADD CONSTRAINT marketplace_reports_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id);

ALTER TABLE public.marketplace_reports
  ADD CONSTRAINT marketplace_reports_pkey PRIMARY KEY (id);

ALTER TABLE public.marketplace_report_events
  ADD CONSTRAINT marketplace_report_events_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.marketplace_reports(id);

ALTER TABLE public.marketplace_reports
  ADD CONSTRAINT marketplace_reports_priority_check CHECK (priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text]));

ALTER TABLE public.marketplace_reports
  ADD CONSTRAINT marketplace_reports_rating_id_fkey FOREIGN KEY (rating_id) REFERENCES public.ratings(id);

ALTER TABLE public.marketplace_reports
  ADD CONSTRAINT marketplace_reports_reason_category_check
    CHECK (reason_category = ANY (ARRAY['harassment'::text, 'spam'::text, 'scam'::text, 'safety'::text, 'inappropriate_content'::text, 'rating_abuse'::text, 'other'::text]));

ALTER TABLE public.marketplace_reports
  ADD CONSTRAINT marketplace_reports_reported_user_id_fkey FOREIGN KEY (reported_user_id) REFERENCES public.profiles(id);

ALTER TABLE public.marketplace_reports
  ADD CONSTRAINT marketplace_reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES public.profiles(id);

ALTER TABLE public.marketplace_reports
  ADD CONSTRAINT marketplace_reports_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.service_requests(id);

ALTER TABLE public.marketplace_reports
  ADD CONSTRAINT marketplace_reports_status_check CHECK (status = ANY (ARRAY['submitted'::text, 'triaged'::text, 'escalated'::text, 'resolved'::text, 'dismissed'::text]));

ALTER TABLE public.marketplace_reports
  ADD CONSTRAINT marketplace_reports_support_case_id_fkey FOREIGN KEY (support_case_id) REFERENCES public.support_cases(id);

ALTER TABLE public.marketplace_reports
  ADD CONSTRAINT marketplace_reports_support_case_id_key UNIQUE (support_case_id);

ALTER TABLE public.marketplace_reports
  ADD CONSTRAINT marketplace_reports_target_type_check CHECK (target_type = ANY (ARRAY['user'::text, 'message'::text, 'rating'::text]));

ALTER TABLE public.marketplace_reports
  ADD CONSTRAINT marketplace_reports_text_snapshot_check CHECK (text_snapshot IS NULL OR char_length(text_snapshot) >= 1 AND char_length(text_snapshot) <= 2000);

ALTER TABLE public.marketplace_reports
  ADD CONSTRAINT marketplace_reports_version_check CHECK (version > 0);

REVOKE ALL ON TABLE public.marketplace_reports FROM PUBLIC, anon, authenticated;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.marketplace_reports TO service_role;

CREATE UNIQUE INDEX marketplace_reports_one_active_non_user_target ON public.marketplace_reports (reporter_id, target_type, target_id)
  WHERE (target_type = ANY (ARRAY['message'::text, 'rating'::text])) AND (status = ANY (ARRAY['submitted'::text, 'triaged'::text, 'escalated'::text]));

CREATE INDEX marketplace_reports_queue_idx ON public.marketplace_reports (status, priority, created_at, id);

CREATE INDEX marketplace_reports_case_idx ON public.marketplace_reports (support_case_id);

CREATE UNIQUE INDEX marketplace_reports_one_active_user_context ON public.marketplace_reports (reporter_id, target_id, conversation_id)
  WHERE target_type = 'user'::text AND (status = ANY (ARRAY['submitted'::text, 'triaged'::text, 'escalated'::text]));

CREATE INDEX marketplace_reports_open_cursor_idx ON public.marketplace_reports (created_at, id)
  WHERE status = ANY (ARRAY['submitted'::text, 'triaged'::text, 'escalated'::text]);

CREATE TRIGGER marketplace_reports_updated
  BEFORE UPDATE ON public.marketplace_reports
  FOR EACH ROW
  EXECUTE FUNCTION private.set_updated_at();

CREATE POLICY message_attachments_live_communication_read ON public.message_attachments
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.messages m
  WHERE ((m.id = message_attachments.message_id) AND private.can_communicate_in_conversation(m.conversation_id)))));

REVOKE INSERT ON public.message_read_receipts FROM authenticated;

CREATE POLICY message_receipts_owner_read ON public.message_read_receipts
  FOR SELECT
  TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)));

REVOKE INSERT ON public.messages FROM authenticated;

CREATE POLICY messages_members_insert ON public.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE TABLE public.user_block_events (
  id              uuid                     DEFAULT gen_random_uuid() NOT NULL,
  actor_id        uuid                     NOT NULL,
  target_user_id  uuid                     NOT NULL,
  blocked         boolean                  NOT NULL,
  changed         boolean                  NOT NULL,
  reason          text                     NOT NULL,
  idempotency_key text                     NOT NULL,
  created_at      timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.user_block_events
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_block_events
  ADD CONSTRAINT user_block_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id);

ALTER TABLE public.user_block_events
  ADD CONSTRAINT user_block_events_actor_id_idempotency_key_key UNIQUE (actor_id, idempotency_key);

ALTER TABLE public.user_block_events
  ADD CONSTRAINT user_block_events_check CHECK (actor_id <> target_user_id);

ALTER TABLE public.user_block_events
  ADD CONSTRAINT user_block_events_pkey PRIMARY KEY (id);

ALTER TABLE public.user_block_events
  ADD CONSTRAINT user_block_events_reason_check CHECK (char_length(reason) >= 3 AND char_length(reason) <= 500);

ALTER TABLE public.user_block_events
  ADD CONSTRAINT user_block_events_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES public.profiles(id);

REVOKE ALL ON TABLE public.user_block_events FROM PUBLIC, anon, authenticated;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.user_block_events TO service_role;

CREATE INDEX user_block_events_actor_idx ON public.user_block_events (actor_id, created_at, id);

CREATE TRIGGER user_block_events_immutable
  BEFORE DELETE OR UPDATE ON public.user_block_events
  FOR EACH ROW
  EXECUTE FUNCTION private.reject_event_mutation();

insert into public.data_export_table_classifications(
  table_name,classification,reason,manifest_categories,query_anchors
) values
  ('marketplace_reports','operational_only',
   'Moderation reports contain third-party allegations; reporters receive a dedicated safe projection.',
   '{}','{}'),
  ('marketplace_report_events','internal_security_only',
   'Immutable moderation transitions contain privileged investigation and staff decision evidence.',
   '{}','{}'),
  ('user_block_events','internal_security_only',
   'Immutable block command history contains anti-abuse and idempotency control evidence.',
   '{}','{}')
on conflict(table_name) do update set
  classification=excluded.classification,
  reason=excluded.reason,
  manifest_categories=excluded.manifest_categories,
  query_anchors=excluded.query_anchors;

-- Publication controls delivery only. Existing member SELECT RLS and RPC-only
-- message writes remain the authoritative access boundary.
do $$
begin
  if not exists(
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public' and tablename='messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end
$$;

commit;
