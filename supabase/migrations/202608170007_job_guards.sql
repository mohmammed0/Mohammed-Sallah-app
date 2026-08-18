begin;

create function private.require_completion_proof() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.status='completion_submitted' and old.status is distinct from new.status and not exists(select 1 from completion_proofs where job_id=new.id) then
    raise exception 'COMPLETION_PROOF_REQUIRED';
  end if;
  return new;
end $$;
create trigger jobs_completion_proof_guard before update on public.jobs for each row execute function private.require_completion_proof();

create function private.initialize_job_execution() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  insert into job_assignments(job_id,provider_id,reason) values(new.id,new.provider_id,'offer_selected');
  update provider_profiles set active_workload=active_workload+1 where user_id=new.provider_id;
  return new;
end $$;
create trigger jobs_initialize_execution after insert on public.jobs for each row execute function private.initialize_job_execution();

create function public.record_job_location(p_job_id uuid,p_latitude double precision,p_longitude double precision,p_accuracy_m numeric,p_consent boolean) returns uuid
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare actor uuid:=auth.uid(); result uuid;
begin
  if p_consent is not true then raise exception 'LOCATION_SHARING_CONSENT_REQUIRED'; end if;
  if p_latitude not between 16 and 33 or p_longitude not between 34 and 56 then raise exception 'LOCATION_OUTSIDE_SAUDI_ARABIA'; end if;
  if not exists(select 1 from jobs where id=p_job_id and provider_id=actor and status in ('en_route','arrived')) then raise exception 'ACTIVE_PROVIDER_JOB_REQUIRED'; end if;
  insert into job_location_updates(job_id,provider_id,location,accuracy_m,captured_at,expires_at,sharing_consent_at)
  values(p_job_id,actor,st_setsrid(st_makepoint(p_longitude,p_latitude),4326)::geography,p_accuracy_m,now(),now()+interval '4 hours',now()) returning id into result;
  return result;
end $$;
revoke all on function public.record_job_location(uuid,double precision,double precision,numeric,boolean) from public,anon,authenticated;
grant execute on function public.record_job_location(uuid,double precision,double precision,numeric,boolean) to authenticated;

commit;
