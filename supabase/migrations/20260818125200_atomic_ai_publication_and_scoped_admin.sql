begin;

alter table public.service_requests
  add column suggested_category_id uuid references public.service_categories(id),
  add column category_selection_source text
    check(category_selection_source in ('ai_suggestion','customer_correction','manual')),
  add column category_confirmed_at timestamptz;
alter table public.request_media
  add column file_upload_id uuid unique references public.file_uploads(id);
update public.request_media m set file_upload_id=f.id
from public.file_uploads f
where m.file_upload_id is null and f.final_path=m.storage_path and f.status='clean';

-- A transaction failure rolls back both the mutation and its processing row.
-- Therefore retries after a failed transaction are safe; persisted rows can
-- only be processing (concurrent caller) or completed (authoritative replay).
create or replace function private.idempotency_replay(
  p_actor uuid,p_command text,p_key text,p_request_hash text
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item public.idempotency_keys%rowtype;
begin
  if p_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if length(trim(coalesce(p_key,''))) not between 8 and 128 then
    raise exception 'INVALID_IDEMPOTENCY_KEY';
  end if;
  select * into item from public.idempotency_keys
  where user_id=p_actor and command=p_command and key=p_key for update;
  if item.id is null then return null; end if;
  if item.request_hash is distinct from p_request_hash then
    raise exception 'IDEMPOTENCY_KEY_CONFLICT';
  end if;
  if item.status='completed' and item.response is not null then return item.response; end if;
  raise exception 'IDEMPOTENCY_COMMAND_IN_PROGRESS'
    using detail=jsonb_build_object(
      'code','IDEMPOTENCY_COMMAND_IN_PROGRESS','command',p_command,'retryable',true
    )::text;
end $$;

create function public.assign_support_case(
  p_case_id uuid,p_assignee_id uuid,p_permissions text[],p_reason text,
  p_expires_at timestamptz,p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare actor uuid:=auth.uid(); assignment_id uuid; request_hash text; replay jsonb;
  result_payload jsonb; prior record;
begin
  if not private.has_role(array['operations_admin','super_admin']::user_role[]) then
    raise exception 'OPERATIONS_PERMISSION_REQUIRED';
  end if;
  if length(trim(coalesce(p_reason,'')))<5 then raise exception 'REASON_REQUIRED'; end if;
  if p_expires_at is not null and (
    p_expires_at<=now() or p_expires_at>now()+interval '30 days'
  ) then raise exception 'INVALID_ASSIGNMENT_EXPIRY'; end if;
  if not ('read'=any(p_permissions)) or not (
    p_permissions<@array['read','internal_note','evidence','exact_location']::text[]
  ) then raise exception 'INVALID_CASE_PERMISSIONS'; end if;
  if not exists(select 1 from support_cases where id=p_case_id) then
    raise exception 'SUPPORT_CASE_NOT_FOUND';
  end if;
  if not exists(
    select 1 from user_roles ur join profiles p on p.id=ur.user_id
    where ur.user_id=p_assignee_id and ur.role='support_agent'
      and ur.revoked_at is null and p.status='active'
  ) then raise exception 'ACTIVE_SUPPORT_AGENT_REQUIRED'; end if;
  request_hash:=private.canonical_request_hash(jsonb_build_object(
    'caseId',p_case_id,'assigneeId',p_assignee_id,'permissions',p_permissions,
    'reason',trim(p_reason),'expiresAt',p_expires_at
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    actor::text||':support_case_assign:'||p_idempotency_key,0
  ));
  replay:=private.idempotency_replay(
    actor,'support_case_assign_v1',p_idempotency_key,request_hash
  );
  if replay is not null then return replay; end if;
  insert into idempotency_keys(user_id,command,key,request_hash)
  values(actor,'support_case_assign_v1',p_idempotency_key,request_hash);
  for prior in select * from support_case_assignments
    where case_id=p_case_id and ended_at is null for update
  loop
    update support_case_assignments set ended_at=now(),
      ended_reason='reassigned: '||trim(p_reason) where id=prior.id;
  end loop;
  insert into support_case_assignments(
    case_id,assignee_id,assigned_by,expires_at,permissions
  ) values(p_case_id,p_assignee_id,actor,p_expires_at,p_permissions)
  returning id into assignment_id;
  insert into notification_outbox(
    user_id,event_type,channel,payload,deduplication_key
  ) values(
    p_assignee_id,'support_case_assigned','in_app',
    jsonb_build_object('caseId',p_case_id,'assignmentId',assignment_id,
      'permissions',p_permissions,'expiresAt',p_expires_at),
    'support-case-assigned:'||assignment_id::text
  ) on conflict(channel,deduplication_key) do nothing;
  insert into admin_audit_logs(
    actor_id,action,target_type,target_id,reason,correlation_id,after_snapshot
  ) values(
    actor,'support.case.assign','support_case',p_case_id,trim(p_reason),assignment_id,
    jsonb_build_object('assignmentId',assignment_id,'assigneeId',p_assignee_id,
      'permissions',p_permissions,'expiresAt',p_expires_at)
  );
  result_payload:=jsonb_build_object(
    'assignmentId',assignment_id,'caseId',p_case_id,'assigneeId',p_assignee_id
  );
  perform private.complete_idempotent_command(
    actor,'support_case_assign_v1',p_idempotency_key,result_payload
  );
  return result_payload;
end $$;

create function public.end_support_case_assignment(
  p_assignment_id uuid,p_reason text,p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare actor uuid:=auth.uid(); item support_case_assignments%rowtype;
  request_hash text; replay jsonb; result_payload jsonb;
begin
  if not private.has_role(array['operations_admin','super_admin']::user_role[]) then
    raise exception 'OPERATIONS_PERMISSION_REQUIRED';
  end if;
  if length(trim(coalesce(p_reason,'')))<5 then raise exception 'REASON_REQUIRED'; end if;
  request_hash:=private.canonical_request_hash(jsonb_build_object(
    'assignmentId',p_assignment_id,'reason',trim(p_reason)
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    actor::text||':support_case_assignment_end:'||p_idempotency_key,0
  ));
  replay:=private.idempotency_replay(
    actor,'support_case_assignment_end_v1',p_idempotency_key,request_hash
  );
  if replay is not null then return replay; end if;
  select * into item from support_case_assignments
  where id=p_assignment_id and ended_at is null for update;
  if item.id is null then raise exception 'ACTIVE_SUPPORT_ASSIGNMENT_REQUIRED'; end if;
  insert into idempotency_keys(user_id,command,key,request_hash)
  values(actor,'support_case_assignment_end_v1',p_idempotency_key,request_hash);
  update support_case_assignments
  set ended_at=now(),ended_reason=trim(p_reason) where id=item.id;
  insert into admin_audit_logs(
    actor_id,action,target_type,target_id,reason,correlation_id,before_snapshot,after_snapshot
  ) values(
    actor,'support.case.assignment.end','support_case',item.case_id,
    trim(p_reason),item.id,
    jsonb_build_object('assignmentId',item.id,'assigneeId',item.assignee_id),
    jsonb_build_object('ended',true)
  );
  result_payload:=jsonb_build_object('assignmentId',item.id,'ended',true);
  perform private.complete_idempotent_command(
    actor,'support_case_assignment_end_v1',p_idempotency_key,result_payload
  );
  return result_payload;
end $$;

create function public.get_finance_review_queue()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not private.has_role(array['finance_reviewer','super_admin']::public.user_role[]) then
    raise exception 'FINANCE_PERMISSION_REQUIRED';
  end if;
  select jsonb_build_object(
    'disputes',coalesce((
      select jsonb_agg(jsonb_build_object(
        'disputeId',d.id,'jobId',d.job_id,'status',d.status,
        'jobVersion',j.version,'approvedTotalMinor',j.approved_total_minor,
        'paymentId',p.id,'paymentMode',p.payment_mode,
        'capturedAmountMinor',p.amount_minor,'refundedMinor',p.refunded_minor,
        'heldAmountMinor',coalesce(h.held_amount,0),'createdAt',d.created_at
      ) order by d.created_at)
      from public.disputes d join public.jobs j on j.id=d.job_id
      left join lateral (
        select x.* from public.payments x where x.job_id=j.id
        order by x.created_at desc limit 1
      ) p on true
      left join lateral (
        select sum(x.amount_minor) held_amount from public.financial_holds x
        where x.dispute_id=d.id and x.status='held'
      ) h on true
      where d.status not in ('resolved','closed')
    ),'[]'::jsonb),
    'cancellations',coalesce((
      select jsonb_agg(jsonb_build_object(
        'cancellationId',c.id,'jobId',c.job_id,'requestId',c.request_id,
        'status',c.status,'jobVersion',j.version,
        'approvedTotalMinor',j.approved_total_minor,'paymentId',p.id,
        'paymentMode',p.payment_mode,'capturedAmountMinor',p.amount_minor,
        'refundedMinor',p.refunded_minor,'createdAt',c.created_at
      ) order by c.created_at)
      from public.cancellation_requests c
      left join public.jobs j on j.id=c.job_id
      left join lateral (
        select x.* from public.payments x where x.job_id=j.id
        order by x.created_at desc limit 1
      ) p on true
      where c.status in ('pending','waiting_finance')
    ),'[]'::jsonb),
    'intents',coalesce((
      select jsonb_agg(jsonb_build_object(
        'intentId',i.id,'sourceType',i.source_type,'sourceId',i.source_id,
        'actionType',i.action_type,'amountMinor',i.amount_minor,
        'status',i.status,'createdAt',i.created_at
      ) order by i.created_at)
      from public.financial_action_intents i where i.status='pending'
    ),'[]'::jsonb)
  ) into result;
  return result;
end $$;

drop policy payments_participants on public.payments;
create policy payments_participants on public.payments for select to authenticated
using(
  customer_id=auth.uid() or provider_id=auth.uid()
  or private.has_role(array['super_admin']::public.user_role[])
);
drop policy refunds_customer_finance on public.refunds;
create policy refunds_customer_finance on public.refunds for select to authenticated
using(
  exists(select 1 from public.payments p where p.id=refunds.payment_id
    and auth.uid() in (p.customer_id,p.provider_id))
  or private.has_role(array['super_admin']::public.user_role[])
);
drop policy settlements_provider_finance on public.provider_settlements;
create policy settlements_provider_finance on public.provider_settlements for select to authenticated
using(
  provider_id=auth.uid()
  or private.has_role(array['super_admin']::public.user_role[])
);
drop policy receipts_participants on public.receipts;
create policy receipts_participants on public.receipts for select to authenticated
using(
  exists(select 1 from public.payments p where p.id=receipts.payment_id
    and auth.uid() in (p.customer_id,p.provider_id))
  or private.has_role(array['super_admin']::public.user_role[])
);
drop policy holds_participants on public.financial_holds;
create policy holds_participants on public.financial_holds for select to authenticated
using(
  private.can_access_job(job_id)
  or private.has_role(array['super_admin']::public.user_role[])
);

create or replace function public.publish_service_request(payload jsonb) returns uuid
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare actor uuid:=auth.uid(); v_request_id uuid; v_address_id uuid; v_city_id uuid;
  v_category_id uuid; v_suggested_category_id uuid; session ai_sessions%rowtype;
  idem text:=payload->>'idempotency_key'; request_hash text; replay jsonb;
  lat double precision; lon double precision; item jsonb; diag jsonb;
  selected_slug text; suggested_slug text; selection_source text; upload file_uploads%rowtype;
  v_session_id uuid; media_count integer; image_count integer:=0; media_bytes bigint:=0;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from profiles where id=actor and status='active') then
    raise exception 'ACCOUNT_NOT_ACTIVE';
  end if;
  if coalesce((payload->>'customer_approved')::boolean,false) is not true then
    raise exception 'CUSTOMER_APPROVAL_REQUIRED';
  end if;
  if coalesce((payload->>'category_confirmed_by_user')::boolean,false) is not true then
    raise exception 'CATEGORY_CONFIRMATION_REQUIRED';
  end if;
  selected_slug:=nullif(trim(coalesce(
    payload->>'selected_category_slug',payload->>'category_slug',''
  )),'');
  suggested_slug:=nullif(trim(coalesce(
    payload->>'suggested_category_slug',payload->'ai_diagnostic'->>'suggestedCategorySlug',''
  )),'');
  selection_source:=payload->>'category_selection_source';
  if selected_slug is null or selection_source not in (
    'ai_suggestion','customer_correction','manual'
  ) then raise exception 'CATEGORY_SELECTION_REQUIRED'; end if;
  if selection_source='ai_suggestion' and selected_slug is distinct from suggested_slug then
    raise exception 'AI_CATEGORY_SELECTION_MISMATCH';
  end if;
  request_hash:=private.canonical_request_hash(payload);
  perform pg_advisory_xact_lock(hashtextextended(
    actor::text||':publish_service_request:'||idem,0
  ));
  replay:=private.idempotency_replay(
    actor,'publish_service_request_v3',idem,request_hash
  );
  if replay is not null then return (replay->>'id')::uuid; end if;

  v_session_id:=nullif(payload->>'ai_session_id','')::uuid;
  if v_session_id is not null then
    select * into session from ai_sessions
    where id=v_session_id and user_id=actor and status='active' for update;
    if session.id is null then raise exception 'ACTIVE_AI_SESSION_REQUIRED'; end if;
  end if;
  media_count:=jsonb_array_length(coalesce(payload->'media','[]'::jsonb));
  if media_count>8 then raise exception 'TOO_MANY_REQUEST_MEDIA'; end if;
  insert into idempotency_keys(user_id,command,key,request_hash)
  values(actor,'publish_service_request_v3',idem,request_hash);
  select id into v_city_id from cities
  where code=coalesce(payload->>'city_code','riyadh') and enabled limit 1;
  select id into v_category_id from service_categories
  where slug=selected_slug and enabled limit 1;
  if suggested_slug is not null then
    select id into v_suggested_category_id from service_categories
    where slug=suggested_slug and enabled limit 1;
  end if;
  if v_city_id is null or v_category_id is null then
    raise exception 'CATALOG_CONFIGURATION_REQUIRED';
  end if;
  diag:=payload->'ai_diagnostic';
  lat:=(payload->'exact_location'->>'latitude')::double precision;
  lon:=(payload->'exact_location'->>'longitude')::double precision;
  if lat not between 16 and 33 or lon not between 34 and 56 then
    raise exception 'LOCATION_OUTSIDE_SAUDI_ARABIA';
  end if;
  insert into addresses(user_id,city_id,label,formatted_address,location)
  values(actor,v_city_id,'Service location','Private location selected in app',
    st_setsrid(st_makepoint(lon,lat),4326)::geography)
  returning id into v_address_id;
  insert into service_requests(
    customer_id,category_id,suggested_category_id,category_selection_source,
    category_confirmed_at,city_id,title,structured_description,original_text,
    original_locale,urgency,requested_start,requested_end,approximate_location,
    exact_address_id,ai_provider,ai_model,ai_prompt_version,customer_approved_at,
    published_at,status
  ) values(
    actor,v_category_id,v_suggested_category_id,selection_source,now(),v_city_id,
    left(coalesce(nullif(payload->>'title',''),payload->>'structured_description'),120),
    payload->>'structured_description',payload->>'original_text',
    coalesce(payload->>'locale','ar'),
    coalesce((payload->>'urgency')::request_urgency,'normal'),
    nullif(payload->>'requested_start','')::timestamptz,
    nullif(payload->>'requested_end','')::timestamptz,
    st_setsrid(st_makepoint(round(lon::numeric,2),round(lat::numeric,2)),4326)::geography,
    v_address_id,diag->'metadata'->>'provider',diag->'metadata'->>'model',
    diag->'metadata'->>'promptVersion',now(),now(),'published'
  ) returning id into v_request_id;
  insert into request_visibility(request_id) values(v_request_id);
  insert into request_status_history(
    request_id,actor_id,new_status,reason,idempotency_key,metadata
  ) values(
    v_request_id,actor,'published','customer_approved',idem,
    jsonb_build_object('categorySelectionSource',selection_source,
      'selectedCategorySlug',selected_slug,'suggestedCategorySlug',suggested_slug,
      'aiSessionId',v_session_id)
  );
  insert into request_publication_events(
    request_id,actor_id,request_version,approval_snapshot,idempotency_key
  ) values(v_request_id,actor,1,payload,idem);

  for item in select value from jsonb_array_elements(coalesce(payload->'media','[]'::jsonb)) loop
    select * into upload from file_uploads
    where id=coalesce(
      nullif(item->>'upload_id','')::uuid,nullif(item->>'uploadId','')::uuid
    ) for update;
    if upload.id is null or upload.user_id<>actor
      or upload.purpose not in ('request_media','request_audio')
      or upload.status<>'clean' or upload.final_path is null
      or (upload.resource_id is not null and upload.resource_id<>v_request_id) then
      raise exception 'CLEAN_REQUEST_MEDIA_REQUIRED';
    end if;
    media_bytes:=media_bytes+upload.size_bytes;
    if coalesce(upload.detected_mime_type,upload.declared_mime_type)
      like 'image/%' then image_count:=image_count+1; end if;
    if image_count>4 or media_bytes>41943040 then
      raise exception 'REQUEST_MEDIA_LIMIT_EXCEEDED';
    end if;
    update file_uploads set resource_id=v_request_id where id=upload.id;
    insert into request_media(
      request_id,uploader_id,storage_path,mime_type,size_bytes,content_hash,
      media_kind,upload_status,file_upload_id
    ) values(
      v_request_id,actor,upload.final_path,
      coalesce(upload.detected_mime_type,upload.declared_mime_type),
      upload.size_bytes,upload.content_sha256,
      case when upload.purpose='request_audio' then 'voice' else 'request' end,
      'uploaded',upload.id
    );
  end loop;
  for item in select to_jsonb(value)
    from jsonb_array_elements_text(coalesce(diag->'safetyFlags','[]'::jsonb))
  loop
    insert into request_safety_flags(
      request_id,flag_type,source,severity,guidance_version
    ) values(v_request_id,item#>>'{}','ai','high','safety-v1');
  end loop;
  if v_session_id is not null then
    update ai_sessions set request_id=v_request_id,status='published',
      confirmed_category_slug=selected_slug,ended_at=now(),updated_at=now(),
      version=version+1 where id=v_session_id;
    update ai_diagnostics d set request_id=v_request_id
    where d.session_id=v_session_id;
    update transcription_jobs t set request_id=v_request_id
    where t.user_id=actor and t.request_id is null and exists(
      select 1 from file_uploads f
      where f.user_id=actor and f.purpose='request_audio'
        and f.resource_id=v_request_id and f.final_path=t.private_audio_path
    );
  end if;
  perform private.complete_idempotent_command(
    actor,'publish_service_request_v3',idem,jsonb_build_object(
      'id',v_request_id,'aiSessionId',v_session_id,'categorySelectionSource',selection_source,
      'mediaCount',media_count
    )
  );
  return v_request_id;
end $$;

-- Raw profile rows are owner-only. Case staff and operations use the safe,
-- audited projections below; customer PII and provider verification identities
-- remain separate permissions.
drop policy profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles for select to authenticated
using(id=auth.uid());

create function public.get_marketplace_safe_identity(
  p_user_id uuid,p_case_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item public.profiles%rowtype;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if not private.has_admin_permission('operations.marketplace.read')
    and not (p_case_id is not null
      and private.has_support_case_access(p_case_id,'read')
      and exists(
        select 1 from public.support_cases c
        left join public.jobs j on j.id=c.job_id
        left join public.service_requests r on r.id=coalesce(c.request_id,j.request_id)
        where c.id=p_case_id
          and p_user_id in (c.opened_by,j.customer_id,j.provider_id,r.customer_id)
      )) then raise exception 'SAFE_IDENTITY_ACCESS_DENIED';
  end if;
  select * into item from public.profiles where id=p_user_id;
  if item.id is null then raise exception 'PROFILE_NOT_FOUND'; end if;
  return jsonb_build_object(
    'id',item.id,'displayName',item.display_name,
    'preferredLocale',item.preferred_locale,'status',item.status
  );
end $$;

create function public.get_customer_pii(
  p_customer_id uuid,p_reason text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item public.profiles%rowtype; audit_id uuid:=gen_random_uuid();
begin
  if not private.has_admin_permission('customer.pii.read') then
    raise exception 'CUSTOMER_PII_PERMISSION_REQUIRED';
  end if;
  if length(trim(coalesce(p_reason,'')))<5 then raise exception 'REASON_REQUIRED'; end if;
  if not exists(select 1 from public.user_roles
    where user_id=p_customer_id and role='customer' and revoked_at is null) then
    raise exception 'CUSTOMER_NOT_FOUND';
  end if;
  select * into item from public.profiles where id=p_customer_id;
  insert into public.admin_audit_logs(
    id,actor_id,action,target_type,target_id,reason,correlation_id,after_snapshot
  ) values(
    audit_id,actor,'customer.pii.read','profile',item.id,trim(p_reason),audit_id,
    jsonb_build_object('fields',jsonb_build_array('display_name','phone'))
  );
  return jsonb_build_object('id',item.id,'displayName',item.display_name,'phone',item.phone);
end $$;

create function public.get_provider_verification_identity(
  p_provider_id uuid,p_reason text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item public.profiles%rowtype; provider public.provider_profiles%rowtype;
  audit_id uuid:=gen_random_uuid();
begin
  if not private.has_admin_permission('provider.document.read') then
    raise exception 'PROVIDER_DOCUMENT_PERMISSION_REQUIRED';
  end if;
  if length(trim(coalesce(p_reason,'')))<5 then raise exception 'REASON_REQUIRED'; end if;
  select * into provider from public.provider_profiles where user_id=p_provider_id
    and verification_status in ('submitted','under_review','more_information_required');
  if provider.user_id is null or not exists(
    select 1 from public.provider_documents
    where provider_id=p_provider_id and deleted_at is null
  ) then raise exception 'PROVIDER_VERIFICATION_WORKFLOW_REQUIRED'; end if;
  select * into item from public.profiles where id=p_provider_id;
  insert into public.admin_audit_logs(
    id,actor_id,action,target_type,target_id,reason,correlation_id,after_snapshot
  ) values(
    audit_id,actor,'provider.identity.read','provider',p_provider_id,trim(p_reason),
    audit_id,jsonb_build_object('verificationStatus',provider.verification_status)
  );
  return jsonb_build_object(
    'id',item.id,'displayName',item.display_name,'phone',item.phone,
    'kind',provider.kind,'businessName',provider.business_name,
    'commercialRegistrationReference',provider.commercial_registration_reference,
    'verificationStatus',provider.verification_status
  );
end $$;

revoke all on function private.idempotency_replay(uuid,text,text,text)
  from public,anon,authenticated;
revoke all on function public.get_marketplace_safe_identity(uuid,uuid)
  from public,anon,authenticated;
revoke all on function public.get_customer_pii(uuid,text)
  from public,anon,authenticated;
revoke all on function public.get_provider_verification_identity(uuid,text)
  from public,anon,authenticated;
revoke all on function public.assign_support_case(
  uuid,uuid,text[],text,timestamptz,text
) from public,anon,authenticated;
revoke all on function public.end_support_case_assignment(uuid,text,text)
  from public,anon,authenticated;
revoke all on function public.get_finance_review_queue()
  from public,anon,authenticated;
grant execute on function public.get_marketplace_safe_identity(uuid,uuid)
  to authenticated;
grant execute on function public.get_customer_pii(uuid,text) to authenticated;
grant execute on function public.get_provider_verification_identity(uuid,text)
  to authenticated;
grant execute on function public.assign_support_case(
  uuid,uuid,text[],text,timestamptz,text
) to authenticated;
grant execute on function public.end_support_case_assignment(uuid,text,text)
  to authenticated;
grant execute on function public.get_finance_review_queue() to authenticated;

commit;
