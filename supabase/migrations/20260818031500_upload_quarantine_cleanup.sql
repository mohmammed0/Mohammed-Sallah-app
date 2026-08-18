begin;

alter table public.file_uploads
  add column quarantine_cleanup_claimed_at timestamptz,
  add column quarantine_cleanup_worker_id text,
  add column quarantine_cleanup_attempts integer not null default 0 check (quarantine_cleanup_attempts between 0 and 20),
  add column quarantine_cleaned_at timestamptz;

create index file_upload_quarantine_cleanup_idx
  on public.file_uploads(quarantine_cleaned_at,expires_at)
  where quarantine_cleaned_at is null;

create function public.claim_upload_quarantine_cleanup(p_worker_id text) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare item public.file_uploads%rowtype;
begin
  if auth.role()<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if char_length(trim(coalesce(p_worker_id,''))) not between 3 and 120 then
    raise exception 'INVALID_WORKER_ID';
  end if;

  select * into item
  from public.file_uploads
  where quarantine_cleaned_at is null
    and quarantine_cleanup_attempts<20
    and (quarantine_cleanup_claimed_at is null or quarantine_cleanup_claimed_at<now()-interval '5 minutes')
    and (expires_at<=now() or status in ('clean','rejected','expired'))
  order by
    case when status in ('clean','rejected') then 0 else 1 end,
    expires_at,id
  limit 1
  for update skip locked;
  if item.id is null then return null; end if;

  update public.file_uploads
  set status=case when status in ('clean','rejected') then status else 'expired' end,
      failure_category=case
        when status in ('clean','rejected') then failure_category
        else coalesce(failure_category,'quarantine_expired')
      end,
      quarantine_cleanup_claimed_at=now(),
      quarantine_cleanup_worker_id=p_worker_id,
      quarantine_cleanup_attempts=quarantine_cleanup_attempts+1
  where id=item.id;

  insert into public.upload_security_events(upload_id,user_id,event_type,metadata)
  values(item.id,item.user_id,'quarantine_cleanup_claimed',jsonb_build_object(
    'workerId',p_worker_id,'attempt',item.quarantine_cleanup_attempts+1
  ));

  return jsonb_build_object(
    'uploadId',item.id,
    'userId',item.user_id,
    'bucket',item.quarantine_bucket,
    'path',item.quarantine_path
  );
end $$;

create function public.complete_upload_quarantine_cleanup(
  p_upload_id uuid,p_worker_id text
) returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare item public.file_uploads%rowtype;
begin
  if auth.role()<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select * into item from public.file_uploads where id=p_upload_id for update;
  if item.id is null or item.quarantine_cleanup_worker_id<>p_worker_id then
    raise exception 'UPLOAD_CLEANUP_NOT_CLAIMED';
  end if;
  if item.quarantine_cleaned_at is not null then return; end if;

  update public.file_uploads
  set quarantine_cleaned_at=now(),quarantine_cleanup_claimed_at=null,
      quarantine_cleanup_worker_id=null
  where id=item.id;
  update public.scheduled_jobs
  set status='completed',completed_at=now(),locked_at=null,error_category=null
  where job_type='upload_quarantine_cleanup'
    and payload->>'uploadId'=item.id::text
    and status in ('pending','processing');
  insert into public.upload_security_events(upload_id,user_id,event_type,metadata)
  values(item.id,item.user_id,'quarantine_cleaned','{}'::jsonb);
end $$;

create function public.fail_upload_quarantine_cleanup(
  p_upload_id uuid,p_worker_id text,p_error_category text
) returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare item public.file_uploads%rowtype;
begin
  if auth.role()<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select * into item from public.file_uploads where id=p_upload_id for update;
  if item.id is null or item.quarantine_cleanup_worker_id<>p_worker_id then
    raise exception 'UPLOAD_CLEANUP_NOT_CLAIMED';
  end if;
  update public.file_uploads
  set quarantine_cleanup_worker_id=null,quarantine_cleanup_claimed_at=now(),
      failure_category=coalesce(failure_category,left(coalesce(p_error_category,'quarantine_delete_failed'),160))
  where id=item.id;
  update public.scheduled_jobs
  set attempts=attempts+1,error_category=left(coalesce(p_error_category,'quarantine_delete_failed'),160)
  where job_type='upload_quarantine_cleanup'
    and payload->>'uploadId'=item.id::text
    and status='pending';
  insert into public.upload_security_events(upload_id,user_id,event_type,metadata)
  values(item.id,item.user_id,'quarantine_cleanup_failed',jsonb_build_object(
    'errorCategory',left(coalesce(p_error_category,'quarantine_delete_failed'),160)
  ));
end $$;

revoke all on function public.claim_upload_quarantine_cleanup(text) from public,anon,authenticated;
revoke all on function public.complete_upload_quarantine_cleanup(uuid,text) from public,anon,authenticated;
revoke all on function public.fail_upload_quarantine_cleanup(uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_upload_quarantine_cleanup(text) to service_role;
grant execute on function public.complete_upload_quarantine_cleanup(uuid,text) to service_role;
grant execute on function public.fail_upload_quarantine_cleanup(uuid,text,text) to service_role;

commit;
