begin;

alter table public.idempotency_keys
  add column attempt_count integer not null default 1 check (attempt_count between 1 and 3),
  add column updated_at timestamptz not null default now(),
  add column completed_at timestamptz,
  add column last_failure_category text;

alter table public.customer_acceptances
  add column evidence_references jsonb not null default '[]'::jsonb
    check (jsonb_typeof(evidence_references)='array');

create table public.customer_acceptance_evidence (
  acceptance_id uuid not null references public.customer_acceptances(id) on delete cascade,
  file_upload_id uuid not null references public.file_uploads(id),
  created_at timestamptz not null default now(),
  primary key (acceptance_id,file_upload_id)
);
alter table public.customer_acceptance_evidence enable row level security;
create policy customer_acceptance_evidence_participants_read
  on public.customer_acceptance_evidence for select to authenticated
  using (
    exists (
      select 1
      from public.customer_acceptances a
      join public.jobs j on j.id=a.job_id
      where a.id=customer_acceptance_evidence.acceptance_id
        and auth.uid() in (j.customer_id,j.provider_id)
    )
  );
grant select on public.customer_acceptance_evidence to authenticated;

create or replace function private.canonical_request_hash(p_payload jsonb) returns text
language sql
immutable
security definer
set search_path=''
as $$
  select encode(extensions.digest(coalesce(p_payload,'null'::jsonb)::text,'sha256'),'hex')
$$;

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
declare item public.idempotency_keys%rowtype;
begin
  if p_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if length(trim(coalesce(p_key,''))) not between 8 and 128 then
    raise exception 'INVALID_IDEMPOTENCY_KEY';
  end if;
  select * into item
  from public.idempotency_keys
  where user_id=p_actor and command=p_command and key=p_key
  for update;
  if item.id is null then return null; end if;
  if item.request_hash is distinct from p_request_hash then
    raise exception 'IDEMPOTENCY_KEY_CONFLICT';
  end if;
  if item.status='completed' and item.response is not null then
    return item.response;
  end if;
  if item.status='failed' then
    if item.attempt_count>=3 then raise exception 'IDEMPOTENCY_RETRY_EXHAUSTED'; end if;
    if item.updated_at>now()-interval '5 seconds' then
      raise exception 'IDEMPOTENCY_RETRY_NOT_READY';
    end if;
    update public.idempotency_keys
    set status='processing',attempt_count=attempt_count+1,
        response=null,last_failure_category=null,updated_at=now()
    where id=item.id;
    return null;
  end if;
  raise exception 'IDEMPOTENCY_COMMAND_IN_PROGRESS';
end $$;

create or replace function private.complete_idempotent_command(
  p_actor uuid,p_command text,p_key text,p_response jsonb
) returns void
language sql
security definer
set search_path=''
as $$
  update public.idempotency_keys
  set status='completed',response=p_response,completed_at=now(),updated_at=now()
  where user_id=p_actor and command=p_command and key=p_key and status='processing'
$$;

create or replace function public.publish_service_request(payload jsonb) returns uuid
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  actor uuid:=auth.uid(); request_id uuid; address_id uuid; city_id uuid; category_id uuid;
  idem text:=payload->>'idempotency_key'; request_hash text; replay jsonb;
  lat double precision; lon double precision; item jsonb; diag jsonb;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from profiles where id=actor and status='active') then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  if coalesce((payload->>'customer_approved')::boolean,false) is not true then raise exception 'CUSTOMER_APPROVAL_REQUIRED'; end if;
  if length(coalesce(idem,''))<16 then raise exception 'INVALID_IDEMPOTENCY_KEY'; end if;
  request_hash:=private.canonical_request_hash(payload);
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':publish_service_request:'||idem,0));
  replay:=private.idempotency_replay(actor,'publish_service_request_v2',idem,request_hash);
  if replay is not null then return (replay->>'id')::uuid; end if;
  insert into idempotency_keys(user_id,command,key,request_hash)
  values(actor,'publish_service_request_v2',idem,request_hash) on conflict do nothing;
  select id into city_id from cities where code=coalesce(payload->>'city_code','riyadh') and enabled limit 1;
  diag:=payload->'ai_diagnostic';
  select id into category_id from service_categories
  where slug=coalesce(nullif(payload->>'category_slug',''),diag->>'suggestedCategorySlug','general-handyman') and enabled limit 1;
  if city_id is null or category_id is null then raise exception 'CATALOG_CONFIGURATION_REQUIRED'; end if;
  lat:=(payload->'exact_location'->>'latitude')::double precision;
  lon:=(payload->'exact_location'->>'longitude')::double precision;
  if lat not between 16 and 33 or lon not between 34 and 56 then raise exception 'LOCATION_OUTSIDE_SAUDI_ARABIA'; end if;
  insert into addresses(user_id,city_id,label,formatted_address,location)
  values(actor,city_id,'Service location','Private location selected in app',
    st_setsrid(st_makepoint(lon,lat),4326)::geography) returning id into address_id;
  insert into service_requests(
    customer_id,category_id,city_id,title,structured_description,original_text,original_locale,
    urgency,requested_start,approximate_location,exact_address_id,ai_provider,ai_model,
    ai_prompt_version,customer_approved_at,published_at,status
  ) values(
    actor,category_id,city_id,left(coalesce(nullif(payload->>'title',''),payload->>'structured_description'),120),
    payload->>'structured_description',payload->>'original_text',coalesce(payload->>'locale','ar'),
    coalesce((payload->>'urgency')::request_urgency,'normal'),(payload->>'requested_start')::timestamptz,
    st_setsrid(st_makepoint(round(lon::numeric,2),round(lat::numeric,2)),4326)::geography,address_id,
    diag->'metadata'->>'provider',diag->'metadata'->>'model',diag->'metadata'->>'promptVersion',
    now(),now(),'published'
  ) returning id into request_id;
  insert into request_visibility(request_id) values(request_id);
  insert into request_status_history(request_id,actor_id,new_status,reason,idempotency_key)
  values(request_id,actor,'published','customer_approved',idem);
  insert into request_publication_events(request_id,actor_id,request_version,approval_snapshot,idempotency_key)
  values(request_id,actor,1,payload,idem);
  for item in select value from jsonb_array_elements(coalesce(payload->'media','[]'::jsonb)) loop
    if item->>'storage_path' is not null then
      insert into request_media(request_id,uploader_id,storage_path,mime_type,size_bytes,media_kind,upload_status)
      values(request_id,actor,item->>'storage_path',item->>'mime_type',coalesce((item->>'size')::bigint,1),'request','uploaded');
    end if;
  end loop;
  for item in select to_jsonb(value) from jsonb_array_elements_text(coalesce(diag->'safetyFlags','[]'::jsonb)) loop
    insert into request_safety_flags(request_id,flag_type,source,severity,guidance_version)
    values(request_id,item#>>'{}','ai','high','safety-v1');
  end loop;
  perform private.complete_idempotent_command(actor,'publish_service_request_v2',idem,jsonb_build_object('id',request_id));
  return request_id;
end $$;

create or replace function public.select_offer(p_offer_id uuid,p_idempotency_key text) returns uuid
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  actor uuid:=auth.uid(); selected offers%rowtype; req service_requests%rowtype;
  job_id uuid; conversation_id uuid; request_hash text; replay jsonb; result_payload jsonb;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  request_hash:=private.canonical_request_hash(jsonb_build_object('offerId',p_offer_id));
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':select_offer:'||p_idempotency_key,0));
  replay:=private.idempotency_replay(actor,'select_offer_v2',p_idempotency_key,request_hash);
  if replay is not null then return (replay->>'id')::uuid; end if;
  select * into selected from offers where id=p_offer_id and status='active' and expires_at>now() for update;
  if selected.id is null then raise exception 'OFFER_NOT_SELECTABLE'; end if;
  select * into req from service_requests
  where id=selected.request_id and customer_id=actor and status='receiving_offers' for update;
  if req.id is null or req.exact_address_id is null then raise exception 'OFFER_NOT_SELECTABLE'; end if;
  insert into idempotency_keys(user_id,command,key,request_hash)
  values(actor,'select_offer_v2',p_idempotency_key,request_hash) on conflict do nothing;
  update offers set status=case when id=p_offer_id then 'selected'::offer_status else 'rejected'::offer_status end,
    updated_at=now() where request_id=req.id and status='active';
  update service_requests set status='provider_selected',version=version+1,updated_at=now() where id=req.id;
  insert into jobs(request_id,selected_offer_id,customer_id,provider_id,exact_address_id,approved_total_minor)
  values(req.id,p_offer_id,actor,selected.provider_id,req.exact_address_id,selected.total_amount_minor)
  returning id into job_id;
  insert into job_status_history(job_id,actor_id,new_status,reason,idempotency_key)
  values(job_id,actor,'provider_selected','customer_selected_offer',p_idempotency_key);
  insert into job_events(job_id,event_type,actor_id,payload)
  values(job_id,'offer_selected',actor,jsonb_build_object('offerId',p_offer_id,'requestId',req.id));
  insert into conversations(job_id) values(job_id) returning id into conversation_id;
  insert into conversation_members(conversation_id,user_id,member_role)
  values(conversation_id,actor,'customer'),(conversation_id,selected.provider_id,'provider');
  insert into payments(job_id,customer_id,provider_id,provider_name,amount_minor,status,payment_mode,idempotency_key)
  values(job_id,actor,selected.provider_id,'offline',selected.total_amount_minor,'offline','offline','offline:'||job_id::text);
  update provider_profiles set active_workload=active_workload+1 where user_id=selected.provider_id;
  update request_provider_matches set status=case when provider_id=selected.provider_id then 'selected' else 'closed' end
  where request_id=req.id;
  result_payload:=jsonb_build_object('id',job_id);
  perform private.complete_idempotent_command(actor,'select_offer_v2',p_idempotency_key,result_payload);
  return job_id;
end $$;

create or replace function public.transition_job(
  p_job_id uuid,p_to_status text,p_reason text,p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
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
end $$;

create or replace function public.create_change_order(payload jsonb) returns uuid
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
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
end $$;

create or replace function public.decide_change_order(
  p_change_order_id uuid,p_approve boolean,p_reason text,p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  actor uuid:=auth.uid(); item_change change_orders%rowtype; item_job jobs%rowtype;
  request_hash text; replay jsonb; result_payload jsonb;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  request_hash:=private.canonical_request_hash(jsonb_build_object(
    'changeOrderId',p_change_order_id,'approve',p_approve,'reason',trim(coalesce(p_reason,''))));
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':decide_change_order:'||p_idempotency_key,0));
  replay:=private.idempotency_replay(actor,'decide_change_order_v2',p_idempotency_key,request_hash);
  if replay is not null then return replay; end if;
  select c.* into item_change from change_orders c join jobs j on j.id=c.job_id
  where c.id=p_change_order_id and j.customer_id=actor and c.status='pending' and c.expires_at>now() for update;
  if item_change.id is null then raise exception 'CHANGE_ORDER_NOT_DECIDABLE'; end if;
  select * into item_job from jobs where id=item_change.job_id for update;
  insert into idempotency_keys(user_id,command,key,request_hash)
  values(actor,'decide_change_order_v2',p_idempotency_key,request_hash) on conflict do nothing;
  update change_orders set status=case when p_approve then 'approved'::change_order_status else 'rejected'::change_order_status end,
    customer_id=actor,customer_decision_at=now() where id=item_change.id;
  if p_approve then
    update jobs set approved_total_minor=item_change.revised_total_minor where id=item_job.id;
  end if;
  perform public.transition_job(item_job.id,case when p_approve then 'in_progress' else 'diagnosing' end,
    trim(p_reason),'change-order-decision:'||item_change.id::text||':'||p_idempotency_key);
  result_payload:=jsonb_build_object('approved',p_approve,'approvedTotalMinor',
    case when p_approve then item_change.revised_total_minor else item_job.approved_total_minor end);
  perform private.complete_idempotent_command(actor,'decide_change_order_v2',p_idempotency_key,result_payload);
  return result_payload;
end $$;

create or replace function public.submit_completion(
  p_job_id uuid,p_proofs jsonb,p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  actor uuid:=auth.uid(); item_job jobs%rowtype; proof jsonb;
  request_hash text; replay jsonb; result_payload jsonb;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if jsonb_array_length(coalesce(p_proofs,'[]'::jsonb))<1 then raise exception 'COMPLETION_PROOF_REQUIRED'; end if;
  request_hash:=private.canonical_request_hash(jsonb_build_object('jobId',p_job_id,'proofs',p_proofs));
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':submit_completion:'||p_idempotency_key,0));
  replay:=private.idempotency_replay(actor,'submit_completion_v2',p_idempotency_key,request_hash);
  if replay is not null then return replay; end if;
  select * into item_job from jobs where id=p_job_id and provider_id=actor and status='in_progress' for update;
  if item_job.id is null then raise exception 'ACTIVE_PROVIDER_JOB_REQUIRED'; end if;
  insert into idempotency_keys(user_id,command,key,request_hash)
  values(actor,'submit_completion_v2',p_idempotency_key,request_hash) on conflict do nothing;
  for proof in select value from jsonb_array_elements(p_proofs) loop
    insert into completion_proofs(job_id,provider_id,storage_path,mime_type,size_bytes,description,file_upload_id)
    values(item_job.id,actor,proof->>'storagePath',proof->>'mimeType',(proof->>'sizeBytes')::bigint,
      proof->>'description',nullif(proof->>'uploadId','')::uuid);
  end loop;
  result_payload:=public.transition_job(item_job.id,'completion_submitted','completion_evidence_submitted',
    'completion-transition:'||p_idempotency_key);
  perform private.complete_idempotent_command(actor,'submit_completion_v2',p_idempotency_key,result_payload);
  return result_payload;
end $$;

create function public.accept_completion(
  p_job_id uuid,p_accept boolean,p_reason text,p_score integer,p_review text,
  p_idempotency_key text,p_evidence_upload_ids uuid[]
) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  actor uuid:=auth.uid(); item_job jobs%rowtype; payment payments%rowtype;
  acceptance_id uuid; dispute_id uuid; upload_id uuid; evidence jsonb; hold_amount bigint;
  request_hash text; replay jsonb; result_payload jsonb;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if not p_accept and length(trim(coalesce(p_reason,''))) not between 5 and 2000 then
    raise exception 'COMPLETION_REJECTION_REASON_REQUIRED';
  end if;
  evidence:=coalesce(to_jsonb(p_evidence_upload_ids),'[]'::jsonb);
  request_hash:=private.canonical_request_hash(jsonb_build_object(
    'jobId',p_job_id,'accept',p_accept,'reason',trim(coalesce(p_reason,'')),
    'score',p_score,'review',nullif(trim(coalesce(p_review,'')),''),'evidenceUploadIds',evidence));
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':accept_completion:'||p_idempotency_key,0));
  replay:=private.idempotency_replay(actor,'accept_completion_v2',p_idempotency_key,request_hash);
  if replay is not null then return replay; end if;
  select * into item_job from jobs
  where id=p_job_id and customer_id=actor and status='completion_submitted' for update;
  if item_job.id is null then raise exception 'CUSTOMER_COMPLETION_REQUIRED'; end if;
  foreach upload_id in array coalesce(p_evidence_upload_ids,'{}'::uuid[]) loop
    if not exists (
      select 1 from file_uploads f
      where f.id=upload_id and f.status='clean' and f.final_path is not null
        and (
          (f.purpose='completion_proof' and f.resource_id=item_job.id)
          or (f.user_id=actor and f.purpose in ('request_media','support_evidence'))
        )
    ) then raise exception 'CLEAN_REJECTION_EVIDENCE_REQUIRED'; end if;
  end loop;
  insert into idempotency_keys(user_id,command,key,request_hash)
  values(actor,'accept_completion_v2',p_idempotency_key,request_hash) on conflict do nothing;
  insert into customer_acceptances(
    job_id,customer_id,accepted,reason,accepted_total_minor,evidence_references
  ) values(
    item_job.id,actor,p_accept,nullif(trim(coalesce(p_reason,'')),''),item_job.approved_total_minor,evidence
  ) returning id into acceptance_id;
  foreach upload_id in array coalesce(p_evidence_upload_ids,'{}'::uuid[]) loop
    insert into customer_acceptance_evidence(acceptance_id,file_upload_id)
    values(acceptance_id,upload_id);
  end loop;
  if not p_accept then
    insert into disputes(
      job_id,opened_by,reason,expected_job_version,idempotency_key,pre_dispute_job_status
    ) values(
      item_job.id,actor,trim(p_reason),item_job.version,p_idempotency_key,item_job.status
    ) returning id into dispute_id;
    select * into payment from payments where job_id=item_job.id order by created_at desc limit 1 for update;
    hold_amount:=greatest(0,coalesce(payment.amount_minor-payment.refunded_minor,item_job.approved_total_minor));
    if hold_amount>0 or payment.id is not null then
      insert into financial_holds(job_id,payment_id,amount_minor,reason,created_by,dispute_id)
      values(item_job.id,payment.id,hold_amount,'completion_rejection_dispute',actor,dispute_id);
    end if;
    update jobs set status='disputed',version=version+1,updated_at=now() where id=item_job.id;
    insert into job_status_history(
      job_id,actor_id,previous_status,new_status,reason,idempotency_key,metadata
    ) values(
      item_job.id,actor,item_job.status,'disputed',trim(p_reason),'completion-rejection:'||dispute_id::text,
      jsonb_build_object('disputeId',dispute_id,'acceptanceId',acceptance_id,
        'preDisputeStatus',item_job.status,'evidenceUploadIds',evidence)
    );
    insert into job_events(job_id,event_type,actor_id,payload)
    values(item_job.id,'completion_rejected_dispute_opened',actor,jsonb_build_object(
      'disputeId',dispute_id,'acceptanceId',acceptance_id,'preDisputeStatus',item_job.status,
      'evidenceUploadIds',evidence));
    insert into dispute_events(dispute_id,actor_id,event_type,reason,payload)
    values(dispute_id,actor,'opened_from_completion_rejection',trim(p_reason),jsonb_build_object(
      'jobVersion',item_job.version+1,'acceptanceId',acceptance_id,
      'preDisputeStatus',item_job.status,'evidenceUploadIds',evidence));
    insert into notification_outbox(user_id,event_type,channel,payload,deduplication_key)
    values(item_job.provider_id,'completion_rejected_dispute_opened','in_app',jsonb_build_object(
      'jobId',item_job.id,'disputeId',dispute_id),'completion-rejected:'||dispute_id::text||':'||item_job.provider_id::text)
    on conflict(channel,deduplication_key) do nothing;
    insert into notification_outbox(user_id,event_type,channel,payload,deduplication_key)
    select ur.user_id,'operations_dispute_queue','in_app',jsonb_build_object(
      'jobId',item_job.id,'disputeId',dispute_id,'source','completion_rejection'),
      'operations-dispute-queue:'||dispute_id::text||':'||ur.user_id::text
    from user_roles ur join profiles p on p.id=ur.user_id and p.status='active'
    where ur.role in ('support_agent','operations_admin','super_admin') and ur.revoked_at is null
    on conflict(channel,deduplication_key) do nothing;
    result_payload:=jsonb_build_object(
      'jobId',item_job.id,'status','disputed','jobVersion',item_job.version+1,
      'acceptanceId',acceptance_id,'disputeId',dispute_id,
      'preDisputeStatus',item_job.status,'financialHold',hold_amount>0 or payment.id is not null
    );
  else
    if p_score not between 1 and 5 then raise exception 'RATING_REQUIRED'; end if;
    insert into ratings(job_id,customer_id,provider_id,score,review)
    values(item_job.id,actor,item_job.provider_id,p_score,nullif(trim(p_review),''));
    update provider_profiles set
      rating_average=((rating_average*rating_count)+p_score)/(rating_count+1),
      rating_count=rating_count+1,completed_jobs=completed_jobs+1,
      active_workload=greatest(0,active_workload-1)
    where user_id=item_job.provider_id;
    update jobs set status='completed',version=version+1,updated_at=now(),completed_at=now()
    where id=item_job.id;
    insert into job_status_history(job_id,actor_id,previous_status,new_status,reason,idempotency_key,metadata)
    values(item_job.id,actor,item_job.status,'completed','customer_accepted_completion',
      'completion-acceptance:'||acceptance_id::text,jsonb_build_object('acceptanceId',acceptance_id));
    insert into job_events(job_id,event_type,actor_id,payload)
    values(item_job.id,'completion_accepted',actor,jsonb_build_object('acceptanceId',acceptance_id));
    result_payload:=jsonb_build_object('jobId',item_job.id,'status','completed',
      'jobVersion',item_job.version+1,'acceptanceId',acceptance_id);
  end if;
  perform private.complete_idempotent_command(actor,'accept_completion_v2',p_idempotency_key,result_payload);
  return result_payload;
end $$;

create or replace function public.accept_completion(
  p_job_id uuid,p_accept boolean,p_reason text,p_score integer,p_review text,p_idempotency_key text
) returns jsonb
language sql security definer set search_path='' as $$
  select public.accept_completion(
    p_job_id,p_accept,p_reason,p_score,p_review,p_idempotency_key,
    coalesce((select array_agg(cp.file_upload_id order by cp.created_at)
      from public.completion_proofs cp where cp.job_id=p_job_id and cp.file_upload_id is not null),'{}'::uuid[])
  )
$$;

create or replace function public.send_message_with_attachments(
  p_conversation_id uuid,p_body text,p_upload_ids uuid[],p_client_message_id text
) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  actor uuid:=auth.uid(); created_message_id uuid; upload_id uuid; upload file_uploads%rowtype;
  attachment_count integer:=coalesce(array_length(p_upload_ids,1),0);
  request_hash text; replay jsonb; result_payload jsonb;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  request_hash:=private.canonical_request_hash(jsonb_build_object(
    'conversationId',p_conversation_id,'body',trim(coalesce(p_body,'')),
    'uploadIds',coalesce(to_jsonb(p_upload_ids),'[]'::jsonb)));
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':send_message:'||p_client_message_id,0));
  replay:=private.idempotency_replay(actor,'send_message_with_attachments_v2',p_client_message_id,request_hash);
  if replay is not null then return replay; end if;
  if not private.can_access_conversation(p_conversation_id) then raise exception 'CONVERSATION_ACCESS_DENIED'; end if;
  if attachment_count>8 then raise exception 'TOO_MANY_ATTACHMENTS'; end if;
  if length(trim(coalesce(p_body,'')))=0 and attachment_count=0 then raise exception 'MESSAGE_CONTENT_REQUIRED'; end if;
  insert into idempotency_keys(user_id,command,key,request_hash)
  values(actor,'send_message_with_attachments_v2',p_client_message_id,request_hash) on conflict do nothing;
  insert into messages(conversation_id,sender_id,body,client_message_id)
  values(p_conversation_id,actor,case when length(trim(coalesce(p_body,'')))=0 then 'attachment' else trim(p_body) end,
    p_client_message_id) returning id into created_message_id;
  foreach upload_id in array coalesce(p_upload_ids,'{}'::uuid[]) loop
    select * into upload from file_uploads where id=upload_id for update;
    if upload.id is null or upload.user_id<>actor or upload.purpose<>'message_attachment'
      or upload.status<>'clean' or upload.final_path is null
      or (upload.resource_id is not null and upload.resource_id<>p_conversation_id) then
      raise exception 'CLEAN_MESSAGE_ATTACHMENT_REQUIRED';
    end if;
    update file_uploads set resource_id=p_conversation_id where id=upload.id;
    insert into message_attachments(message_id,uploader_id,storage_path,mime_type,size_bytes,file_upload_id)
    values(created_message_id,actor,upload.final_path,coalesce(upload.detected_mime_type,upload.declared_mime_type),
      upload.size_bytes,upload.id);
  end loop;
  result_payload:=jsonb_build_object('messageId',created_message_id,'attachmentCount',attachment_count);
  perform private.complete_idempotent_command(actor,'send_message_with_attachments_v2',p_client_message_id,result_payload);
  return result_payload;
end $$;

create function private.enforce_disputed_job_has_case() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status='disputed' and (tg_op='INSERT' or old.status is distinct from new.status)
    and not exists (
      select 1 from public.disputes d
      where d.job_id=new.id and d.status not in ('resolved','closed')
    ) then raise exception 'DISPUTED_JOB_REQUIRES_OPEN_DISPUTE'; end if;
  return new;
end $$;
create trigger disputed_job_requires_case
before insert or update of status on public.jobs
for each row execute function private.enforce_disputed_job_has_case();

do $$
begin
  if exists (
    select 1 from public.jobs j where j.status='disputed'
      and not exists(select 1 from public.disputes d where d.job_id=j.id and d.status not in ('resolved','closed'))
  ) then raise exception 'EXISTING_DISPUTED_JOB_WITHOUT_CASE'; end if;
end $$;

revoke all on function private.canonical_request_hash(jsonb) from public,anon,authenticated;
revoke all on function private.complete_idempotent_command(uuid,text,text,jsonb) from public,anon,authenticated;
revoke all on function private.enforce_disputed_job_has_case() from public,anon,authenticated;
revoke all on function public.accept_completion(uuid,boolean,text,integer,text,text,uuid[]) from public,anon,authenticated;
grant execute on function public.accept_completion(uuid,boolean,text,integer,text,text,uuid[]) to authenticated;

commit;
