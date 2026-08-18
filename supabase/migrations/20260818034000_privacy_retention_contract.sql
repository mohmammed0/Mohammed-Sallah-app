begin;

insert into public.system_settings(key,value,sensitive)
values (
  'privacy.retention',
  '{"policyVersion":"sa-conservative-v1","legalYears":10,"financialYears":10,"exportLinkSeconds":3600,"maxWorkerAttempts":5}'::jsonb,
  false
)
on conflict(key) do update
set value=excluded.value,version=public.system_settings.version+1,updated_at=now();

create or replace function public.get_privacy_retention_config()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select value
  from public.system_settings
  where key='privacy.retention'
$$;

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
  max_attempts integer;
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
  select least(20,greatest(1,coalesce((value->>'maxWorkerAttempts')::integer,5)))
  into max_attempts
  from public.system_settings
  where key='privacy.retention';
  max_attempts:=coalesce(max_attempts,5);
  v_user_id:=(item.payload->>'userId')::uuid;
  terminal:=item.attempts>=max_attempts;
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
    jsonb_build_object(
      'jobId',item.id,
      'attempt',item.attempts,
      'maxAttempts',max_attempts,
      'category',p_error_category,
      'retrySeconds',retry_seconds
    )
  );
  if terminal then
    insert into public.dead_letter_events(source_type,source_id,error_category,payload,attempts)
    values(item.job_type,item.id,p_error_category,item.payload,item.attempts);
  end if;
  return jsonb_build_object(
    'terminal',terminal,
    'maxAttempts',max_attempts,
    'retrySeconds',case when terminal then null else retry_seconds end
  );
end $$;

revoke all on function public.get_privacy_retention_config() from public,anon,authenticated;
grant execute on function public.get_privacy_retention_config() to service_role;

commit;
