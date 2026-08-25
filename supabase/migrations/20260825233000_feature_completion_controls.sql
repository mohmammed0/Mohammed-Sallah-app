begin;

create or replace function public.open_support_case(
  p_subject text,
  p_body text,
  p_topic text,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid:=auth.uid();
  normalized_subject text:=pg_catalog.btrim(coalesce(p_subject,''));
  normalized_body text:=pg_catalog.btrim(coalesce(p_body,''));
  normalized_topic text:=pg_catalog.btrim(coalesce(p_topic,''));
  request_hash text;
  replay jsonb;
  case_id uuid;
  result_payload jsonb;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(
    select 1 from public.profiles p where p.id=actor and p.status='active'
  ) then
    raise exception 'ACCOUNT_NOT_ACTIVE';
  end if;
  if pg_catalog.length(normalized_subject) not between 5 and 200
    or pg_catalog.length(normalized_body) not between 10 and 4000
    or normalized_topic<>'general'
    or coalesce(p_idempotency_key,'') !~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
  then
    raise exception 'INVALID_SUPPORT_CASE';
  end if;

  request_hash:=private.canonical_request_hash(pg_catalog.jsonb_build_object(
    'subject',normalized_subject,
    'body',normalized_body,
    'topic',normalized_topic
  ));
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor::text||':open_support_case:'||p_idempotency_key,0)
  );
  replay:=private.idempotency_replay(
    actor,'open_support_case_v1',p_idempotency_key,request_hash
  );
  if replay is not null then return replay; end if;
  if not private.consume_actor_rate_limit(
    actor,
    'support_case_open',
    pg_catalog.date_trunc('hour',pg_catalog.clock_timestamp(),'UTC'),
    5
  ) then
    raise exception 'RATE_LIMITED';
  end if;

  insert into public.idempotency_keys(user_id,command,key,request_hash)
  values(actor,'open_support_case_v1',p_idempotency_key,request_hash);

  insert into public.support_cases(opened_by,topic,subject)
  values(actor,normalized_topic,normalized_subject)
  returning id into case_id;

  insert into public.support_case_messages(case_id,sender_id,body,visible_to_user)
  values(case_id,actor,normalized_body,true);

  result_payload:=pg_catalog.jsonb_build_object('caseId',case_id,'status','open');
  perform private.complete_idempotent_command(
    actor,'open_support_case_v1',p_idempotency_key,result_payload
  );
  return result_payload;
end $$;

revoke insert on public.support_cases,public.support_case_messages
  from public,anon,authenticated;
revoke all on function public.open_support_case(text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.open_support_case(text,text,text,text)
  to authenticated;

create or replace function public.send_support_case_message(
  p_case_id uuid,
  p_body text,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid:=auth.uid();
  normalized_body text:=pg_catalog.btrim(coalesce(p_body,''));
  case_item public.support_cases%rowtype;
  request_hash text;
  replay jsonb;
  message_id uuid;
  next_status public.case_status;
  result_payload jsonb;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(
    select 1 from public.profiles p where p.id=actor and p.status='active'
  ) then
    raise exception 'ACCOUNT_NOT_ACTIVE';
  end if;
  if p_case_id is null
    or pg_catalog.length(normalized_body) not between 1 and 4000
    or coalesce(p_idempotency_key,'') !~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
  then
    raise exception 'INVALID_SUPPORT_MESSAGE';
  end if;

  select * into case_item
  from public.support_cases c
  where c.id=p_case_id
  for update;
  if case_item.id is null then raise exception 'SUPPORT_CASE_NOT_FOUND'; end if;
  if actor<>case_item.opened_by
    and not private.has_support_case_access(p_case_id,'read')
    and not private.has_admin_permission('operations.marketplace.read')
  then
    raise exception 'SUPPORT_CASE_ACCESS_DENIED';
  end if;

  request_hash:=private.canonical_request_hash(pg_catalog.jsonb_build_object(
    'caseId',p_case_id,
    'body',normalized_body
  ));
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor::text||':send_support_case_message:'||p_idempotency_key,0)
  );
  replay:=private.idempotency_replay(
    actor,'send_support_case_message_v1',p_idempotency_key,request_hash
  );
  if replay is not null then return replay; end if;
  if case_item.status in ('resolved','closed') then raise exception 'SUPPORT_CASE_CLOSED'; end if;
  if not private.consume_actor_rate_limit(
    actor,
    'support_case_message',
    pg_catalog.date_trunc('minute',pg_catalog.clock_timestamp(),'UTC'),
    30
  ) then
    raise exception 'RATE_LIMITED';
  end if;
  insert into public.idempotency_keys(user_id,command,key,request_hash)
  values(actor,'send_support_case_message_v1',p_idempotency_key,request_hash);

  insert into public.support_case_messages(case_id,sender_id,body,visible_to_user)
  values(p_case_id,actor,normalized_body,true)
  returning id into message_id;
  next_status:=case when actor=case_item.opened_by
    then 'waiting_operations'::public.case_status
    else 'waiting_customer'::public.case_status end;
  update public.support_cases
  set status=next_status,updated_at=pg_catalog.now()
  where id=p_case_id;

  if actor<>case_item.opened_by then
    insert into public.admin_audit_logs(
      actor_id,action,target_type,target_id,reason,correlation_id,after_snapshot
    ) values(
      actor,'support.case.message.sent','support_case',p_case_id,
      'authorized support response',extensions.gen_random_uuid(),
      pg_catalog.jsonb_build_object('messageId',message_id,'status',next_status)
    );
  end if;

  result_payload:=pg_catalog.jsonb_build_object(
    'caseId',p_case_id,'messageId',message_id,'status',next_status
  );
  perform private.complete_idempotent_command(
    actor,'send_support_case_message_v1',p_idempotency_key,result_payload
  );
  return result_payload;
end $$;

revoke all on function public.send_support_case_message(uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.send_support_case_message(uuid,text,text)
  to authenticated;

create or replace function public.get_provider_document_manifest(
  p_provider_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid:=auth.uid();
  allowed boolean:=false;
  documents jsonb;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  allowed:=actor=p_provider_id or private.has_admin_permission('provider.document.read');
  if not allowed then raise exception 'PROVIDER_DOCUMENT_ACCESS_DENIED'; end if;

  select coalesce(pg_catalog.jsonb_agg(item.document order by item.created_at desc),'[]'::jsonb)
  into documents
  from (
    select
      d.created_at,
      pg_catalog.jsonb_build_object(
        'id',d.id,
        'uploadId',f.id,
        'documentType',d.document_type,
        'mimeType',d.mime_type,
        'sizeBytes',d.size_bytes,
        'status',d.status,
        'expiresAt',d.expires_at,
        'createdAt',d.created_at
      ) as document
    from public.provider_documents d
    join public.file_uploads f
      on f.user_id=d.provider_id
      and f.purpose='provider_document'
      and f.final_path=d.storage_path
      and f.content_sha256=d.content_hash
      and f.status='clean'
      and f.sanitized is true
    where d.provider_id=p_provider_id
      and d.deleted_at is null
    order by d.created_at desc,d.id
    limit 20
  ) item;

  if actor<>p_provider_id then
    insert into public.admin_audit_logs(
      actor_id,action,target_type,target_id,reason,correlation_id,after_snapshot
    ) values(
      actor,'provider.document.manifest.read','provider',p_provider_id,
      'authorized verification document review',extensions.gen_random_uuid(),
      pg_catalog.jsonb_build_object('documentCount',pg_catalog.jsonb_array_length(documents))
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'providerId',p_provider_id,
    'documents',documents
  );
end $$;

revoke all on function public.get_provider_document_manifest(uuid)
  from public,anon,authenticated;
grant execute on function public.get_provider_document_manifest(uuid)
  to authenticated;

create or replace function public.admin_marketplace_health() returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not private.has_admin_permission('dashboard.aggregate.read') then
    raise exception 'DASHBOARD_PERMISSION_REQUIRED';
  end if;
  return pg_catalog.jsonb_build_object(
    'new_requests',(select pg_catalog.count(*) from public.service_requests
      where created_at>pg_catalog.now()-interval '24 hours'),
    'active_jobs',(select pg_catalog.count(*) from public.jobs
      where status not in ('completed','cancelled','disputed')),
    'open_support_cases',(select pg_catalog.count(*) from public.support_cases
      where status not in ('resolved','closed')),
    'open_disputes',(select pg_catalog.count(*) from public.disputes
      where status not in ('resolved','closed')),
    'pending_verifications',(select pg_catalog.count(*) from public.provider_profiles
      where verification_status in ('submitted','under_review')),
    'notification_failures',(select pg_catalog.count(*) from public.notification_outbox
      where status in ('failed','dead_letter')),
    'financial_holds',(select pg_catalog.count(*) from public.financial_holds
      where status='held'),
    'ai_provider_failures',(select pg_catalog.count(*) from public.ai_usage_events
      where success is false and created_at>pg_catalog.now()-interval '24 hours'),
    'transcription_failures',(select pg_catalog.count(*) from public.transcription_jobs
      where error_category is not null and created_at>pg_catalog.now()-interval '24 hours'),
    'translation_failures',(select pg_catalog.count(*) from public.translation_jobs
      where error_category is not null and created_at>pg_catalog.now()-interval '24 hours'),
    'scanner_failures',(select pg_catalog.count(*) from public.file_uploads
      where status='failed' and created_at>pg_catalog.now()-interval '24 hours'),
    'scanner_cleanup_failures',(select pg_catalog.count(*) from private.media_scan_artifacts
      where state in ('cleanup_failed','cleanup_dead_letter')),
    'push_dead_letters',(select pg_catalog.count(*) from public.notification_outbox
      where channel='push' and status='dead_letter'),
    'scheduler_failures',(select pg_catalog.count(*) from public.scheduled_jobs
      where error_category is not null),
    'open_incidents',(select pg_catalog.count(*) from public.system_incidents
      where status<>'resolved')
  );
end $$;

commit;
