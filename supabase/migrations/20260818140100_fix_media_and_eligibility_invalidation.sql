begin;

create or replace function private.require_clean_file_reference() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare expected_user uuid; expected_path text; expected_purpose text; expected_resource uuid;
begin
  case tg_table_name
    when 'provider_documents' then
      expected_user:=new.provider_id; expected_path:=new.storage_path; expected_purpose:='provider_document';
    when 'completion_proofs' then
      expected_user:=new.provider_id; expected_path:=new.storage_path; expected_purpose:='completion_proof'; expected_resource:=new.job_id;
    when 'request_media' then
      expected_user:=new.uploader_id; expected_path:=new.storage_path;
      expected_purpose:=case when new.media_kind='voice' then 'request_audio' else 'request_media' end;
    when 'support_case_evidence' then
      expected_user:=new.uploader_id; expected_path:=new.private_storage_path; expected_purpose:='support_evidence'; expected_resource:=new.case_id;
    else raise exception 'UNSUPPORTED_FILE_REFERENCE_TABLE';
  end case;
  if not exists(
    select 1 from public.file_uploads f
    where f.user_id=expected_user and f.purpose=expected_purpose
      and f.final_path=expected_path and f.status='clean'
      and (expected_resource is null or f.resource_id=expected_resource)
  ) then raise exception 'CLEAN_UPLOAD_REQUIRED'; end if;
  if tg_table_name='request_media' then new.upload_status:='clean'; end if;
  return new;
end $$;

create or replace function private.invalidate_provider_marketplace_eligibility()
returns trigger language plpgsql security definer set search_path='' as $$
declare provider uuid; invalid_reason text; affected record;
begin
  provider:=case tg_table_name
    when 'profiles' then coalesce(
      nullif(to_jsonb(new)->>'id',''),nullif(to_jsonb(old)->>'id',''))::uuid
    when 'provider_profiles' then coalesce(
      nullif(to_jsonb(new)->>'user_id',''),nullif(to_jsonb(old)->>'user_id',''))::uuid
    else coalesce(
      nullif(to_jsonb(new)->>'provider_id',''),nullif(to_jsonb(old)->>'provider_id',''))::uuid
  end;
  invalid_reason:=case tg_table_name
    when 'profiles' then 'provider_account_inactive'
    when 'provider_profiles' then case
      when to_jsonb(new)->>'verification_status'<>'verified' then 'provider_not_verified'
      else 'provider_not_accepting_requests' end
    when 'provider_services' then 'provider_service_changed'
    else 'restricted_qualification_revoked' end;
  update public.request_provider_matches set status='closed'
  where provider_id=provider and status in ('invited','viewed','offered');
  for affected in
    update public.offers set status='withdrawn',version=version+1,updated_at=now()
    where provider_id=provider and status='active'
    returning id,request_id
  loop
    insert into public.offer_status_history(
      offer_id,actor_id,previous_status,new_status,reason
    ) values(affected.id,auth.uid(),'active','withdrawn',invalid_reason);
    insert into public.notification_outbox(
      user_id,event_type,channel,payload,deduplication_key
    )
    select r.customer_id,'provider_offer_invalidated','in_app',
      jsonb_build_object('requestId',affected.request_id,'offerId',affected.id,'reason',invalid_reason),
      'provider-offer-invalidated:'||affected.id::text
    from public.service_requests r where r.id=affected.request_id
    on conflict(channel,deduplication_key) do nothing;
  end loop;
  insert into public.provider_job_eligibility_reviews(job_id,provider_id,reason)
  select j.id,j.provider_id,invalid_reason from public.jobs j
  where j.provider_id=provider and j.status not in ('completed','cancelled')
  on conflict (job_id) where status='open' do nothing;
  insert into public.notification_outbox(
    user_id,event_type,channel,payload,deduplication_key
  )
  select ur.user_id,'provider_job_eligibility_review','in_app',
    jsonb_build_object('providerId',provider,'reason',invalid_reason),
    'provider-job-eligibility:'||provider::text||':'||ur.user_id::text||':'||invalid_reason
  from public.user_roles ur join public.profiles p on p.id=ur.user_id and p.status='active'
  where ur.role in ('operations_admin','super_admin') and ur.revoked_at is null
  on conflict(channel,deduplication_key) do nothing;
  return case when tg_op='DELETE' then old else new end;
end $$;

commit;
