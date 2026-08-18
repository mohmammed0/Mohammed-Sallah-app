begin;

create table public.file_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  purpose text not null check (purpose in (
    'request_media','request_audio','provider_document','completion_proof',
    'support_evidence','message_attachment'
  )),
  resource_id uuid,
  original_filename text not null,
  extension text not null,
  declared_mime_type text not null,
  detected_mime_type text,
  size_bytes bigint not null check (size_bytes>0),
  max_size_bytes bigint not null check (max_size_bytes between 1 and 20971520),
  quarantine_bucket text not null default 'quarantine' check (quarantine_bucket='quarantine'),
  quarantine_path text not null unique,
  target_bucket text not null,
  target_path text not null unique,
  final_path text,
  content_sha256 text,
  status text not null default 'created' check (status in (
    'created','scanning','clean','rejected','failed','expired'
  )),
  scanner text,
  sanitized boolean not null default false,
  attempts integer not null default 0 check (attempts between 0 and 3),
  locked_at timestamptz,
  failure_category text,
  created_at timestamptz not null default now(),
  scanned_at timestamptz,
  expires_at timestamptz not null default (now()+interval '24 hours'),
  check (size_bytes<=max_size_bytes),
  check (final_path is null or final_path=target_path)
);
create index file_upload_owner_idx on public.file_uploads(user_id,created_at desc);
create index file_upload_scan_queue_idx on public.file_uploads(status,created_at)
  where status in ('created','failed');
create index file_upload_expiry_idx on public.file_uploads(expires_at)
  where status not in ('clean','expired');

create table public.upload_security_events (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references public.file_uploads(id),
  user_id uuid not null references public.profiles(id),
  event_type text not null,
  scanner text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index upload_security_timeline_idx on public.upload_security_events(upload_id,created_at);

alter table public.file_uploads enable row level security;
alter table public.upload_security_events enable row level security;
create policy file_upload_owner_read on public.file_uploads for select to authenticated
  using ((select auth.uid())=user_id or (select private.is_admin()));
create policy upload_events_owner_read on public.upload_security_events for select to authenticated
  using ((select auth.uid())=user_id or (select private.is_admin()));
grant select on public.file_uploads,public.upload_security_events to authenticated;

create trigger upload_security_events_immutable
  before update or delete on public.upload_security_events
  for each row execute function private.reject_event_mutation();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'quarantine','quarantine',false,20971520,
  array[
    'image/jpeg','image/png','image/webp','video/mp4','audio/mp4','audio/webm','application/pdf'
  ]
)
on conflict(id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists storage_owner_insert on storage.objects;
drop policy if exists storage_owner_read on storage.objects;
drop policy if exists storage_owner_delete on storage.objects;

create policy storage_quarantine_ticket_insert on storage.objects for insert to authenticated
with check (
  bucket_id='quarantine'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and exists (
    select 1 from public.file_uploads f
    where f.user_id=(select auth.uid())
      and f.quarantine_bucket=bucket_id
      and f.quarantine_path=name
      and f.status='created'
      and f.expires_at>now()
  )
);
create policy storage_clean_owner_read on storage.objects for select to authenticated
using (
  bucket_id<>'quarantine'
  and (
    owner_id=(select auth.uid())::text
    or (select private.is_admin())
  )
  and (
    bucket_id in ('exports','invoices')
    or exists (
      select 1 from public.file_uploads f
      where f.target_bucket=bucket_id and f.final_path=name and f.status='clean'
    )
  )
);
create policy storage_clean_owner_delete on storage.objects for delete to authenticated
using (
  bucket_id<>'quarantine'
  and owner_id=(select auth.uid())::text
  and exists (
    select 1 from public.file_uploads f
    where f.user_id=(select auth.uid()) and f.target_bucket=bucket_id
      and f.final_path=name and f.status='clean'
  )
);

create function public.create_file_upload(
  p_purpose text,
  p_resource_id uuid,
  p_filename text,
  p_declared_mime_type text,
  p_size_bytes bigint
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  actor uuid:=auth.uid();
  upload_id uuid:=gen_random_uuid();
  clean_name text:=regexp_replace(trim(coalesce(p_filename,'')),'[^A-Za-z0-9._-]','_','g');
  extension text:=lower(coalesce(substring(trim(coalesce(p_filename,'')) from '\.([^.]+)$'),''));
  max_bytes bigint;
  allowed boolean:=false;
  target_bucket text;
  quarantine_path text;
  target_path text;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.profiles where id=actor and status='active') then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  if length(clean_name) not between 3 and 160 or extension='' then raise exception 'INVALID_FILENAME'; end if;
  if p_size_bytes is null or p_size_bytes<1 then raise exception 'INVALID_FILE_SIZE'; end if;

  case p_purpose
    when 'request_media' then
      max_bytes:=10485760; target_bucket:='request-media';
      allowed:=(p_declared_mime_type,extension) in (
        ('image/jpeg','jpg'),('image/jpeg','jpeg'),('image/png','png'),('image/webp','webp')
      );
      if p_resource_id is not null then raise exception 'RESOURCE_NOT_ALLOWED'; end if;
    when 'request_audio' then
      max_bytes:=10485760; target_bucket:='request-media';
      allowed:=(p_declared_mime_type,extension) in (('audio/mp4','m4a'),('audio/mp4','mp4'));
      if p_resource_id is not null then raise exception 'RESOURCE_NOT_ALLOWED'; end if;
    when 'provider_document' then
      max_bytes:=20971520; target_bucket:='provider-documents';
      allowed:=(p_declared_mime_type,extension) in (
        ('image/jpeg','jpg'),('image/jpeg','jpeg'),('image/png','png'),('application/pdf','pdf')
      );
      if p_resource_id is not null then raise exception 'RESOURCE_NOT_ALLOWED'; end if;
    when 'completion_proof' then
      max_bytes:=20971520; target_bucket:='completion-proofs';
      allowed:=(p_declared_mime_type,extension) in (
        ('image/jpeg','jpg'),('image/jpeg','jpeg'),('image/png','png'),('image/webp','webp'),
        ('video/mp4','mp4')
      );
      if not exists(
        select 1 from public.jobs j
        where j.id=p_resource_id and j.provider_id=actor and j.status='in_progress'
      ) then raise exception 'ACTIVE_PROVIDER_JOB_REQUIRED'; end if;
    when 'support_evidence' then
      max_bytes:=20971520; target_bucket:='message-attachments';
      allowed:=(p_declared_mime_type,extension) in (
        ('image/jpeg','jpg'),('image/jpeg','jpeg'),('image/png','png'),('application/pdf','pdf')
      );
      if not exists(
        select 1 from public.support_cases c where c.id=p_resource_id and c.opened_by=actor
      ) then raise exception 'SUPPORT_CASE_ACCESS_DENIED'; end if;
    when 'message_attachment' then
      max_bytes:=20971520; target_bucket:='message-attachments';
      allowed:=(p_declared_mime_type,extension) in (
        ('image/jpeg','jpg'),('image/jpeg','jpeg'),('image/png','png'),('image/webp','webp'),
        ('application/pdf','pdf')
      );
      if not exists(
        select 1 from public.conversation_members m
        where m.conversation_id=p_resource_id and m.user_id=actor and m.left_at is null
      ) then raise exception 'CONVERSATION_ACCESS_DENIED'; end if;
    else raise exception 'INVALID_UPLOAD_PURPOSE';
  end case;
  if not allowed then raise exception 'FILE_TYPE_NOT_ALLOWED'; end if;
  if p_size_bytes>max_bytes then raise exception 'FILE_TOO_LARGE'; end if;

  quarantine_path:=actor::text||'/'||upload_id::text||'/'||clean_name;
  target_path:=actor::text||'/'||p_purpose||'/'||upload_id::text||'.'||extension;
  insert into public.file_uploads(
    id,user_id,purpose,resource_id,original_filename,extension,declared_mime_type,
    size_bytes,max_size_bytes,quarantine_path,target_bucket,target_path
  ) values(
    upload_id,actor,p_purpose,p_resource_id,clean_name,extension,p_declared_mime_type,
    p_size_bytes,max_bytes,quarantine_path,target_bucket,target_path
  );
  insert into public.upload_security_events(upload_id,user_id,event_type,metadata)
  values(upload_id,actor,'ticket_created',jsonb_build_object(
    'purpose',p_purpose,'declaredMimeType',p_declared_mime_type,'sizeBytes',p_size_bytes
  ));
  insert into public.scheduled_jobs(job_type,payload,scheduled_at)
  values('upload_quarantine_cleanup',jsonb_build_object('uploadId',upload_id,'userId',actor),now()+interval '24 hours');
  return jsonb_build_object(
    'uploadId',upload_id,'bucket','quarantine','path',quarantine_path,
    'contentType',p_declared_mime_type,'expiresAt',now()+interval '24 hours'
  );
end $$;

create function public.create_unbound_file_upload(
  p_purpose text,p_filename text,p_declared_mime_type text,p_size_bytes bigint
) returns jsonb
language sql security definer set search_path=public,pg_temp as $$
  select public.create_file_upload(
    p_purpose,null,p_filename,p_declared_mime_type,p_size_bytes
  )
$$;

create function public.create_resource_file_upload(
  p_purpose text,p_resource_id uuid,p_filename text,p_declared_mime_type text,p_size_bytes bigint
) returns jsonb
language sql security definer set search_path=public,pg_temp as $$
  select public.create_file_upload(
    p_purpose,p_resource_id,p_filename,p_declared_mime_type,p_size_bytes
  )
$$;

create function public.claim_file_upload(p_upload_id uuid,p_user_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.file_uploads%rowtype;
begin
  if auth.role()<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select * into item from public.file_uploads
  where id=p_upload_id and user_id=p_user_id and status in ('created','failed')
    and attempts<3 and expires_at>now()
  for update;
  if item.id is null then raise exception 'UPLOAD_NOT_CLAIMABLE'; end if;
  update public.file_uploads set status='scanning',attempts=attempts+1,locked_at=now(),failure_category=null
    where id=item.id;
  insert into public.upload_security_events(upload_id,user_id,event_type,metadata)
  values(item.id,item.user_id,'scan_started',jsonb_build_object('attempt',item.attempts+1));
  return jsonb_build_object(
    'uploadId',item.id,'userId',item.user_id,'purpose',item.purpose,
    'quarantineBucket',item.quarantine_bucket,'quarantinePath',item.quarantine_path,
    'targetBucket',item.target_bucket,'targetPath',item.target_path,
    'declaredMimeType',item.declared_mime_type,'extension',item.extension,
    'sizeBytes',item.size_bytes,'maxSizeBytes',item.max_size_bytes
  );
end $$;

create function public.complete_file_upload(
  p_upload_id uuid,
  p_user_id uuid,
  p_detected_mime_type text,
  p_size_bytes bigint,
  p_content_sha256 text,
  p_final_path text,
  p_scanner text,
  p_sanitized boolean
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.file_uploads%rowtype;
begin
  if auth.role()<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select * into item from public.file_uploads where id=p_upload_id and user_id=p_user_id for update;
  if item.id is null or item.status<>'scanning' then raise exception 'UPLOAD_NOT_SCANNING'; end if;
  if p_final_path<>item.target_path then raise exception 'INVALID_FINAL_PATH'; end if;
  if p_size_bytes<1 or p_size_bytes>item.max_size_bytes then raise exception 'INVALID_SANITIZED_SIZE'; end if;
  if p_content_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'INVALID_CONTENT_HASH'; end if;
  update public.file_uploads set
    status='clean',detected_mime_type=p_detected_mime_type,size_bytes=p_size_bytes,
    content_sha256=p_content_sha256,final_path=p_final_path,scanner=p_scanner,
    sanitized=p_sanitized,scanned_at=now(),locked_at=null,failure_category=null
  where id=item.id;
  insert into public.upload_security_events(upload_id,user_id,event_type,scanner,metadata)
  values(item.id,item.user_id,'scan_passed',p_scanner,jsonb_build_object(
    'detectedMimeType',p_detected_mime_type,'sizeBytes',p_size_bytes,
    'sanitized',p_sanitized,'contentHash',p_content_sha256
  ));
  return jsonb_build_object(
    'uploadId',item.id,'status','clean','storagePath',p_final_path,
    'mimeType',p_detected_mime_type,'sizeBytes',p_size_bytes,'contentHash',p_content_sha256
  );
end $$;

create function public.reject_file_upload(
  p_upload_id uuid,p_user_id uuid,p_failure_category text,p_scanner text
) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.file_uploads%rowtype;
begin
  if auth.role()<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select * into item from public.file_uploads where id=p_upload_id and user_id=p_user_id for update;
  if item.id is null or item.status<>'scanning' then raise exception 'UPLOAD_NOT_SCANNING'; end if;
  update public.file_uploads set status='rejected',scanner=p_scanner,scanned_at=now(),locked_at=null,
    failure_category=left(coalesce(p_failure_category,'unsafe_file'),160) where id=item.id;
  insert into public.upload_security_events(upload_id,user_id,event_type,scanner,metadata)
  values(item.id,item.user_id,'scan_rejected',p_scanner,jsonb_build_object(
    'failureCategory',left(coalesce(p_failure_category,'unsafe_file'),160)
  ));
end $$;

create function public.fail_file_upload(
  p_upload_id uuid,p_user_id uuid,p_failure_category text,p_scanner text
) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.file_uploads%rowtype; terminal boolean;
begin
  if auth.role()<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select * into item from public.file_uploads where id=p_upload_id and user_id=p_user_id for update;
  if item.id is null or item.status<>'scanning' then raise exception 'UPLOAD_NOT_SCANNING'; end if;
  terminal:=item.attempts>=3;
  update public.file_uploads set status=case when terminal then 'rejected' else 'failed' end,
    scanner=p_scanner,locked_at=null,failure_category=left(coalesce(p_failure_category,'scanner_unavailable'),160)
    where id=item.id;
  insert into public.upload_security_events(upload_id,user_id,event_type,scanner,metadata)
  values(item.id,item.user_id,case when terminal then 'scan_dead_lettered' else 'scan_failed' end,p_scanner,
    jsonb_build_object('failureCategory',left(coalesce(p_failure_category,'scanner_unavailable'),160),'attempt',item.attempts));
end $$;

create function private.require_clean_file_reference() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare expected_user uuid; expected_path text; expected_purpose text; expected_resource uuid;
begin
  case tg_table_name
    when 'provider_documents' then
      expected_user:=new.provider_id; expected_path:=new.storage_path; expected_purpose:='provider_document';
    when 'completion_proofs' then
      expected_user:=new.provider_id; expected_path:=new.storage_path; expected_purpose:='completion_proof'; expected_resource:=new.job_id;
    when 'request_media' then
      expected_user:=new.uploader_id; expected_path:=new.storage_path; expected_purpose:='request_media';
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
create trigger provider_documents_clean_upload
  before insert on public.provider_documents for each row execute function private.require_clean_file_reference();
create trigger completion_proofs_clean_upload
  before insert on public.completion_proofs for each row execute function private.require_clean_file_reference();
create trigger request_media_clean_upload
  before insert on public.request_media for each row execute function private.require_clean_file_reference();
create trigger support_evidence_clean_upload
  before insert on public.support_case_evidence for each row execute function private.require_clean_file_reference();

revoke all on function public.create_file_upload(text,uuid,text,text,bigint) from public,anon,authenticated;
revoke all on function public.create_unbound_file_upload(text,text,text,bigint) from public,anon,authenticated;
revoke all on function public.create_resource_file_upload(text,uuid,text,text,bigint) from public,anon,authenticated;
revoke all on function public.claim_file_upload(uuid,uuid) from public,anon,authenticated;
revoke all on function public.complete_file_upload(uuid,uuid,text,bigint,text,text,text,boolean) from public,anon,authenticated;
revoke all on function public.reject_file_upload(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.fail_file_upload(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.create_unbound_file_upload(text,text,text,bigint) to authenticated;
grant execute on function public.create_resource_file_upload(text,uuid,text,text,bigint) to authenticated;
grant execute on function public.claim_file_upload(uuid,uuid) to service_role;
grant execute on function public.complete_file_upload(uuid,uuid,text,bigint,text,text,text,boolean) to service_role;
grant execute on function public.reject_file_upload(uuid,uuid,text,text) to service_role;
grant execute on function public.fail_file_upload(uuid,uuid,text,text) to service_role;

commit;
