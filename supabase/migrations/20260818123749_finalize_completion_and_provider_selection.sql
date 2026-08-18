begin;

-- Completion is an append-only sequence of attempts. A job may have many
-- historical attempts, but only one submitted (active) attempt.
create table public.completion_attempts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id),
  provider_id uuid not null references public.provider_profiles(user_id),
  attempt_number integer not null check (attempt_number > 0),
  status text not null default 'submitted'
    check (status in ('submitted','accepted','rejected','superseded')),
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,
  corrected_from_attempt_id uuid references public.completion_attempts(id),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (job_id,attempt_number),
  unique (provider_id,idempotency_key),
  check ((status='submitted' and decided_at is null) or status<>'submitted')
);
create unique index completion_attempts_one_active_per_job
  on public.completion_attempts(job_id) where status='submitted';
alter table public.completion_attempts enable row level security;
create policy completion_attempts_participants_read
  on public.completion_attempts for select to authenticated
  using (private.can_access_job(job_id));
grant select on public.completion_attempts to authenticated;

alter table public.completion_proofs
  add column completion_attempt_id uuid references public.completion_attempts(id);
alter table public.customer_acceptances
  add column completion_attempt_id uuid references public.completion_attempts(id);
alter table public.disputes
  add column completion_attempt_id uuid references public.completion_attempts(id),
  add column completion_decision_id uuid references public.customer_acceptances(id),
  add constraint dispute_completion_reference_pair check (
    (completion_attempt_id is null)=(completion_decision_id is null)
  );
alter table public.support_cases
  add column dispute_id uuid unique references public.disputes(id);

-- Migrate pre-versioning evidence and decisions into authoritative attempt 1.
insert into public.completion_attempts(
  job_id,provider_id,attempt_number,status,submitted_at,decided_at,idempotency_key
)
select j.id,j.provider_id,1,
  case when a.accepted then 'accepted'
       when a.id is not null then 'rejected'
       when j.status='completion_submitted' then 'submitted'
       else 'superseded' end,
  coalesce((select min(p.created_at) from public.completion_proofs p where p.job_id=j.id),j.updated_at,j.created_at),
  case when a.id is not null then a.created_at else null end,
  'legacy-attempt:'||j.id::text
from public.jobs j
left join public.customer_acceptances a on a.job_id=j.id
where a.id is not null or exists(select 1 from public.completion_proofs p where p.job_id=j.id)
on conflict (job_id,attempt_number) do nothing;

update public.completion_proofs p
set completion_attempt_id=a.id
from public.completion_attempts a
where a.job_id=p.job_id and a.attempt_number=1 and p.completion_attempt_id is null;
update public.customer_acceptances d
set completion_attempt_id=a.id
from public.completion_attempts a
where a.job_id=d.job_id and a.attempt_number=1 and d.completion_attempt_id is null;
update public.disputes d
set completion_attempt_id=a.completion_attempt_id,
    completion_decision_id=a.id
from public.customer_acceptances a
where a.job_id=d.job_id and not a.accepted
  and d.completion_attempt_id is null
  and d.created_at>=a.created_at;

alter table public.completion_proofs
  alter column completion_attempt_id set not null;
alter table public.customer_acceptances
  alter column completion_attempt_id set not null;
alter table public.customer_acceptances
  drop constraint customer_acceptances_job_id_key;
alter table public.customer_acceptances
  add constraint customer_acceptances_attempt_unique unique(completion_attempt_id);

-- Service-role imports and historical fixtures that use the table interface
-- are normalized into the same lifecycle. Authenticated clients still cannot
-- insert these rows directly because the existing RLS/grants deny that path.
create function private.bind_completion_proof_attempt() returns trigger
language plpgsql security definer set search_path='' as $$
declare bound_id uuid; next_attempt integer;
begin
  if new.completion_attempt_id is not null then return new; end if;
  select id into bound_id from public.completion_attempts
  where job_id=new.job_id and status='submitted' order by attempt_number desc limit 1;
  if bound_id is null then
    select coalesce(max(attempt_number),0)+1 into next_attempt
    from public.completion_attempts where job_id=new.job_id;
    insert into public.completion_attempts(
      job_id,provider_id,attempt_number,idempotency_key
    ) values(
      new.job_id,new.provider_id,next_attempt,
      'legacy-direct-proof:'||new.job_id::text||':'||next_attempt::text
    ) returning id into bound_id;
  end if;
  new.completion_attempt_id:=bound_id;
  return new;
end $$;
create trigger completion_proof_attempt_binding
before insert on public.completion_proofs for each row
execute function private.bind_completion_proof_attempt();

create function private.bind_completion_decision_attempt() returns trigger
language plpgsql security definer set search_path='' as $$
declare bound_id uuid; provider uuid; next_attempt integer;
begin
  if new.completion_attempt_id is null then
    select id into bound_id from public.completion_attempts
    where job_id=new.job_id and status='submitted'
    order by attempt_number desc limit 1;
    if bound_id is null then
      select provider_id into provider from public.jobs where id=new.job_id;
      select coalesce(max(attempt_number),0)+1 into next_attempt
      from public.completion_attempts where job_id=new.job_id;
      insert into public.completion_attempts(
        job_id,provider_id,attempt_number,idempotency_key
      ) values(
        new.job_id,provider,next_attempt,
        'legacy-direct-decision:'||new.job_id::text||':'||next_attempt::text
      ) returning id into bound_id;
    end if;
    new.completion_attempt_id:=bound_id;
  end if;
  return new;
end $$;
create trigger completion_decision_attempt_binding
before insert on public.customer_acceptances for each row
execute function private.bind_completion_decision_attempt();

create function private.finalize_completion_decision_attempt() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  update public.completion_attempts
  set status=case when new.accepted then 'accepted' else 'rejected' end,
    decided_at=coalesce(decided_at,new.created_at)
  where id=new.completion_attempt_id and status='submitted';
  return new;
end $$;
create trigger completion_decision_attempt_finalized
after insert on public.customer_acceptances for each row
execute function private.finalize_completion_decision_attempt();

-- One marker owns terminal accounting. It is backfilled before any new command
-- runs, so an old completed/cancelled job is never counted twice.
create table public.job_terminal_effects (
  job_id uuid primary key references public.jobs(id),
  outcome text not null check (outcome in ('completed','cancelled')),
  source_type text not null,
  source_id uuid,
  actor_id uuid references public.profiles(id),
  applied_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
insert into public.job_terminal_effects(job_id,outcome,source_type,source_id,applied_at,metadata)
select id,status::text,'legacy_migration',id,coalesce(completed_at,updated_at),
  jsonb_build_object('backfilled',true)
from public.jobs where status in ('completed','cancelled')
on conflict (job_id) do nothing;
alter table public.job_terminal_effects enable row level security;
create policy job_terminal_effects_participants_read
  on public.job_terminal_effects for select to authenticated
  using (private.can_access_job(job_id));
grant select on public.job_terminal_effects to authenticated;

create or replace function private.apply_job_terminal_outcome(
  p_job_id uuid,p_actor uuid,p_outcome text,p_source_type text,p_source_id uuid,
  p_reason text,p_idempotency_key text,p_metadata jsonb default '{}'::jsonb
) returns integer
language plpgsql security definer set search_path='' as $$
declare item public.jobs%rowtype; marker public.job_terminal_effects%rowtype; inserted boolean:=false;
begin
  if p_outcome not in ('completed','cancelled') then raise exception 'INVALID_TERMINAL_OUTCOME'; end if;
  select * into item from public.jobs where id=p_job_id for update;
  if item.id is null then raise exception 'JOB_NOT_FOUND'; end if;
  select * into marker from public.job_terminal_effects where job_id=item.id for update;
  if marker.job_id is not null and marker.outcome<>p_outcome then
    raise exception 'JOB_TERMINAL_OUTCOME_CONFLICT';
  end if;
  if marker.job_id is null then
    insert into public.job_terminal_effects(job_id,outcome,source_type,source_id,actor_id,metadata)
    values(item.id,p_outcome,p_source_type,p_source_id,p_actor,coalesce(p_metadata,'{}'::jsonb));
    inserted:=true;
  end if;
  if not inserted then return item.version; end if;

  update public.jobs set status=p_outcome::public.job_status,
    version=version+1,updated_at=now(),
    completed_at=case when p_outcome='completed' then coalesce(completed_at,now()) else completed_at end
  where id=item.id;
  if p_outcome='cancelled' then
    update public.service_requests set status='cancelled',version=version+1,updated_at=now()
    where id=item.request_id and status<>'cancelled';
  end if;
  update public.provider_profiles set
    active_workload=greatest(0,active_workload-1),
    completed_jobs=completed_jobs+case when p_outcome='completed' then 1 else 0 end
  where user_id=item.provider_id;
  insert into public.job_status_history(
    job_id,actor_id,previous_status,new_status,reason,idempotency_key,metadata
  ) values(item.id,p_actor,item.status,p_outcome::public.job_status,p_reason,p_idempotency_key,
    coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('terminalEffect',true,'sourceType',p_source_type,'sourceId',p_source_id));
  insert into public.job_events(job_id,event_type,actor_id,payload)
  values(item.id,'terminal_outcome_applied',p_actor,
    coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('outcome',p_outcome,'sourceType',p_source_type,'sourceId',p_source_id));
  return item.version+1;
end $$;

-- Eligibility uses the requested service window. One availability interval
-- must fully cover [start,end), and any blackout overlap excludes a provider.
-- Null start is ASAP (p_at); null end is a one-hour service window.
create or replace function private.provider_request_eligibility(
  p_provider_id uuid,p_request_id uuid,p_at timestamptz,p_accepting_new_work boolean
) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare req public.service_requests%rowtype; provider public.provider_profiles%rowtype;
  profile_status text; category_restricted boolean; subcategory_restricted boolean:=false;
  service public.provider_services%rowtype; window_start timestamptz; window_end timestamptz;
  local_start timestamp; local_end timestamp; local_day smallint;
  distance_ratio numeric; distance_m numeric; reason text;
begin
  select * into req from public.service_requests where id=p_request_id;
  if req.id is null then return jsonb_build_object('eligible',false,'reason','request_not_found'); end if;
  window_start:=coalesce(req.requested_start,p_at);
  window_end:=coalesce(req.requested_end,window_start+interval '1 hour');
  if window_end<=window_start then
    return jsonb_build_object('eligible',false,'reason','invalid_request_window');
  end if;
  local_start:=window_start at time zone 'Asia/Riyadh';
  local_end:=window_end at time zone 'Asia/Riyadh';
  local_day:=extract(dow from local_start)::smallint;
  select * into provider from public.provider_profiles where user_id=p_provider_id;
  select status::text into profile_status from public.profiles where id=p_provider_id;
  if provider.user_id is null then reason:='provider_profile_missing';
  elsif profile_status<>'active' then reason:='provider_account_inactive';
  elsif provider.verification_status<>'verified' then reason:='provider_not_verified';
  elsif p_accepting_new_work and not provider.accepting_requests then
    reason:='provider_not_accepting_requests';
  end if;
  select * into service from public.provider_services
  where provider_id=p_provider_id and category_id=req.category_id and enabled;
  if reason is null and service.provider_id is null then reason:='category_not_supported'; end if;
  if reason is null and req.subcategory_id is not null
    and (service.subcategory_id is null or service.subcategory_id<>req.subcategory_id) then
    reason:='subcategory_not_supported';
  end if;
  select restricted into category_restricted
  from public.service_categories where id=req.category_id;
  if req.subcategory_id is not null then
    select restricted into subcategory_restricted
    from public.service_subcategories where id=req.subcategory_id;
  end if;
  if reason is null and category_restricted and not exists(
    select 1 from public.provider_restricted_qualifications q
    where q.provider_id=p_provider_id and q.category_id=req.category_id
      and q.subcategory_id is null and q.qualified
  ) then reason:='restricted_category_unqualified'; end if;
  if reason is null and subcategory_restricted and not exists(
    select 1 from public.provider_restricted_qualifications q
    where q.provider_id=p_provider_id and q.category_id=req.category_id
      and q.subcategory_id=req.subcategory_id and q.qualified
  ) then reason:='restricted_subcategory_unqualified'; end if;
  if reason is null and p_accepting_new_work and (
    local_start::date<>local_end::date or not exists(
      select 1 from public.provider_availability a
      where a.provider_id=p_provider_id and a.weekday=local_day
        and local_start::time>=a.start_time and local_end::time<=a.end_time
    )
  ) then reason:='outside_availability'; end if;
  if reason is null and p_accepting_new_work and exists(
    select 1 from public.provider_blackout_periods b
    where b.provider_id=p_provider_id and b.starts_at<window_end and b.ends_at>window_start
  ) then reason:='blackout_overlap'; end if;
  if reason is null and p_accepting_new_work
    and provider.active_workload>=provider.max_active_jobs then reason:='capacity_reached';
  end if;
  if reason is null and exists(
    select 1 from public.blocked_users b where
      (b.blocker_id=req.customer_id and b.blocked_id=p_provider_id)
      or (b.blocker_id=p_provider_id and b.blocked_id=req.customer_id)
  ) then reason:='customer_provider_blocked'; end if;
  select best.ratio,best.meters into distance_ratio,distance_m from (
    select case when a.center is null then 0::numeric
      else extensions.st_distance(a.center,req.approximate_location)::numeric/nullif(a.radius_m,0) end ratio,
      case when a.center is null then 0::numeric
      else extensions.st_distance(a.center,req.approximate_location)::numeric end meters
    from public.provider_service_areas a
    where a.provider_id=p_provider_id and a.enabled and a.city_id=req.city_id
      and (a.district_id is null or a.district_id=req.district_id)
    order by 1 asc limit 1
  ) best;
  if reason is null and (distance_ratio is null or distance_ratio>1) then
    reason:='outside_service_area';
  end if;
  return jsonb_build_object(
    'eligible',reason is null,'reason',reason,'windowStart',window_start,'windowEnd',window_end,
    'distanceMeters',round(coalesce(distance_m,0),2),
    'distanceScore',round(greatest(0::numeric,1-coalesce(distance_ratio,1)),6),
    'activeWorkload',coalesce(provider.active_workload,0),
    'capacity',coalesce(provider.max_active_jobs,0),
    'categoryRestricted',coalesce(category_restricted,false),
    'subcategoryRestricted',coalesce(subcategory_restricted,false)
  );
end $$;

create or replace function private.provider_request_eligibility(
  p_provider_id uuid,p_request_id uuid,p_at timestamptz default now()
) returns jsonb language sql stable security definer set search_path='' as $$
  select private.provider_request_eligibility(
    p_provider_id,p_request_id,p_at,
    not exists(
      select 1 from public.offers o
      where o.provider_id=p_provider_id and o.request_id=p_request_id
        and o.status in ('active','selected')
    )
  )
$$;

create table public.provider_job_eligibility_reviews (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id),
  provider_id uuid not null references public.provider_profiles(user_id),
  reason text not null,
  status text not null default 'open' check(status in ('open','resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index provider_job_eligibility_one_open
  on public.provider_job_eligibility_reviews(job_id) where status='open';
alter table public.provider_job_eligibility_reviews enable row level security;
create policy provider_job_reviews_operations_read
  on public.provider_job_eligibility_reviews for select to authenticated
  using(private.has_admin_permission('operations.marketplace.read'));
grant select on public.provider_job_eligibility_reviews to authenticated;

create function private.invalidate_provider_marketplace_eligibility()
returns trigger language plpgsql security definer set search_path='' as $$
declare provider uuid; invalid_reason text; affected record;
begin
  provider:=coalesce(
    nullif(to_jsonb(new)->>'id',''),
    nullif(to_jsonb(old)->>'id',''),
    nullif(to_jsonb(new)->>'user_id',''),
    nullif(to_jsonb(old)->>'user_id',''),
    nullif(to_jsonb(new)->>'provider_id',''),
    nullif(to_jsonb(old)->>'provider_id','')
  )::uuid;
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

create trigger profile_status_invalidates_provider
after update of status on public.profiles for each row
when (new.status is distinct from old.status and new.status<>'active')
execute function private.invalidate_provider_marketplace_eligibility();
create trigger provider_state_invalidates_marketplace
after update of verification_status,accepting_requests on public.provider_profiles
for each row when (
  new.verification_status is distinct from old.verification_status
  or (new.accepting_requests is distinct from old.accepting_requests and not new.accepting_requests)
) execute function private.invalidate_provider_marketplace_eligibility();
create trigger provider_service_invalidates_marketplace
after update of category_id,subcategory_id,enabled or delete
on public.provider_services for each row
execute function private.invalidate_provider_marketplace_eligibility();
create trigger provider_qualification_update_invalidates_marketplace
after update of qualified on public.provider_restricted_qualifications
for each row when (old.qualified and not new.qualified)
execute function private.invalidate_provider_marketplace_eligibility();
create trigger provider_qualification_delete_invalidates_marketplace
after delete on public.provider_restricted_qualifications
for each row
execute function private.invalidate_provider_marketplace_eligibility();

create or replace function public.submit_completion(
  p_job_id uuid,p_proofs jsonb,p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
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
end $$;

create or replace function public.select_offer(
  p_offer_id uuid,p_idempotency_key text
) returns uuid
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare actor uuid:=auth.uid(); selected offers%rowtype; req service_requests%rowtype;
  provider_lock provider_profiles%rowtype; account_lock profiles%rowtype; eligibility jsonb;
  job_id uuid; conversation_id uuid; request_hash text; replay jsonb; result_payload jsonb;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  request_hash:=private.canonical_request_hash(jsonb_build_object('offerId',p_offer_id));
  perform pg_advisory_xact_lock(hashtextextended(
    actor::text||':select_offer:'||p_idempotency_key,0
  ));
  replay:=private.idempotency_replay(
    actor,'select_offer_v3',p_idempotency_key,request_hash
  );
  if replay is not null then return (replay->>'id')::uuid; end if;
  select * into selected from offers where id=p_offer_id for update;
  if selected.id is null or selected.status<>'active' or selected.expires_at<=now() then
    raise exception 'OFFER_NOT_SELECTABLE';
  end if;
  select * into req from service_requests where id=selected.request_id for update;
  if req.id is null or req.customer_id<>actor or req.status<>'receiving_offers'
    or req.exact_address_id is null then raise exception 'OFFER_NOT_SELECTABLE';
  end if;
  select * into provider_lock from provider_profiles
  where user_id=selected.provider_id for update;
  select * into account_lock from profiles
  where id=selected.provider_id for update;
  eligibility:=private.provider_request_eligibility(
    selected.provider_id,req.id,now(),true
  );
  if not (eligibility->>'eligible')::boolean then
    raise exception 'OFFER_PROVIDER_INELIGIBLE:%',eligibility->>'reason';
  end if;
  insert into idempotency_keys(user_id,command,key,request_hash)
  values(actor,'select_offer_v3',p_idempotency_key,request_hash);
  update offers set status=case
    when id=p_offer_id then 'selected'::offer_status else 'rejected'::offer_status end,
    updated_at=now()
  where request_id=req.id and status='active';
  update service_requests
  set status='provider_selected',version=version+1,updated_at=now()
  where id=req.id;
  insert into jobs(
    request_id,selected_offer_id,customer_id,provider_id,exact_address_id,
    approved_total_minor,scheduled_start,scheduled_end
  ) values(
    req.id,p_offer_id,actor,selected.provider_id,req.exact_address_id,
    selected.total_amount_minor,req.requested_start,req.requested_end
  ) returning id into job_id;
  insert into job_status_history(
    job_id,actor_id,new_status,reason,idempotency_key
  ) values(job_id,actor,'provider_selected','customer_selected_offer',p_idempotency_key);
  insert into job_events(job_id,event_type,actor_id,payload)
  values(job_id,'offer_selected',actor,jsonb_build_object(
    'offerId',p_offer_id,'requestId',req.id,'eligibility',eligibility
  ));
  insert into conversations(job_id) values(job_id) returning id into conversation_id;
  insert into conversation_members(conversation_id,user_id,member_role)
  values(conversation_id,actor,'customer'),
    (conversation_id,selected.provider_id,'provider');
  insert into payments(
    job_id,customer_id,provider_id,provider_name,amount_minor,status,
    payment_mode,idempotency_key
  ) values(
    job_id,actor,selected.provider_id,'offline',selected.total_amount_minor,
    'offline','offline','offline:'||job_id::text
  );
  update provider_profiles set active_workload=active_workload+1
  where user_id=selected.provider_id;
  update request_provider_matches
  set status=case when provider_id=selected.provider_id then 'selected' else 'closed' end
  where request_id=req.id;
  result_payload:=jsonb_build_object('id',job_id);
  perform private.complete_idempotent_command(
    actor,'select_offer_v3',p_idempotency_key,result_payload
  );
  return job_id;
end $$;

create or replace function public.get_customer_offers(p_request_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); result jsonb;
begin
  if not exists(
    select 1 from public.service_requests
    where id=p_request_id and customer_id=actor
  ) then raise exception 'REQUEST_ACCESS_DENIED'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',o.id,'providerId',o.provider_id,
    'providerName',coalesce(nullif(p.business_name,''),'مقدم خدمة موثّق'),
    'rating',p.rating_average,'ratingCount',p.rating_count,
    'completedJobs',p.completed_jobs,'totalAmountMinor',o.total_amount_minor,
    'visitFeeMinor',o.visit_fee_minor,'materialsIncluded',o.materials_included,
    'materialsEstimateMinor',o.materials_estimate_minor,
    'estimatedArrivalMinutes',o.estimated_arrival_minutes,
    'estimatedDurationMinutes',o.estimated_duration_minutes,
    'warrantyDays',o.warranty_days,'note',o.provider_note,
    'expiresAt',o.expires_at,'status',o.status,
    'selectable',o.status='active' and o.expires_at>now()
      and (eligibility.value->>'eligible')::boolean,
    'ineligibleReason',case
      when o.expires_at<=now() then 'offer_expired'
      when o.status<>'active' then 'offer_'||o.status::text
      else eligibility.value->>'reason' end
  ) order by o.total_amount_minor,o.estimated_arrival_minutes),'[]'::jsonb)
  into result
  from public.offers o
  join public.provider_profiles p on p.user_id=o.provider_id
  cross join lateral (
    select private.provider_request_eligibility(
      o.provider_id,o.request_id,now(),true
    ) value
  ) eligibility
  where o.request_id=p_request_id
    and o.status in ('active','withdrawn')
    and o.expires_at>now()-interval '30 days';
  return result;
end $$;

revoke all on function private.apply_job_terminal_outcome(
  uuid,uuid,text,text,uuid,text,text,jsonb
) from public,anon,authenticated;
revoke all on function private.invalidate_provider_marketplace_eligibility()
  from public,anon,authenticated;
revoke all on function private.provider_request_eligibility(
  uuid,uuid,timestamptz,boolean
) from public,anon,authenticated;
revoke all on function public.accept_completion(
  uuid,boolean,text,integer,text,text,uuid[]
) from public,anon,authenticated;
grant execute on function public.accept_completion(
  uuid,boolean,text,integer,text,text,uuid[]
) to authenticated;

create or replace function public.accept_completion(
  p_job_id uuid,p_accept boolean,p_reason text,p_score integer,p_review text,
  p_idempotency_key text,p_evidence_upload_ids uuid[]
) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
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
end $$;

create or replace function public.accept_completion(
  p_job_id uuid,p_accept boolean,p_reason text,p_score integer,p_review text,
  p_idempotency_key text
) returns jsonb language sql security definer set search_path='' as $$
  select public.accept_completion(
    p_job_id,p_accept,p_reason,p_score,p_review,p_idempotency_key,'{}'::uuid[]
  )
$$;

create or replace function public.get_completion_proof_manifest(p_job_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; current_attempt public.completion_attempts%rowtype;
begin
  if not private.can_access_job(p_job_id) then raise exception 'JOB_ACCESS_DENIED'; end if;
  select * into current_attempt
  from public.completion_attempts
  where job_id=p_job_id and status='submitted'
  order by attempt_number desc limit 1;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'uploadId',p.file_upload_id,'mimeType',p.mime_type,
    'sizeBytes',p.size_bytes,'description',p.description,'createdAt',p.created_at,
    'completionAttemptId',a.id,'attemptNumber',a.attempt_number
  ) order by p.created_at,p.id),'[]'::jsonb)
  into result
  from public.completion_attempts a
  join public.completion_proofs p on p.completion_attempt_id=a.id
  where a.id=current_attempt.id;
  return jsonb_build_object(
    'completionAttemptId',current_attempt.id,
    'attemptNumber',current_attempt.attempt_number,
    'proofs',result
  );
end $$;

create or replace function private.apply_cancelled_job(
  p_job_id uuid,p_actor uuid,p_reason text,p_idempotency_key text,p_metadata jsonb
) returns integer language sql security definer set search_path='' as $$
  select private.apply_job_terminal_outcome(
    p_job_id,p_actor,'cancelled','cancellation',
    nullif(p_metadata->>'cancellationId','')::uuid,p_reason,p_idempotency_key,p_metadata
  )
$$;

create or replace function private.apply_dispute_job_outcome(
  p_dispute_id uuid,p_actor uuid,p_reason text,p_idempotency_key text
) returns integer
language plpgsql security definer set search_path='' as $$
declare dispute public.disputes%rowtype; item public.jobs%rowtype; final_version integer;
begin
  select * into dispute from public.disputes where id=p_dispute_id for update;
  if dispute.id is null then raise exception 'DISPUTE_NOT_FOUND'; end if;
  if dispute.target_job_status is null then raise exception 'DISPUTE_JOB_OUTCOME_REQUIRED'; end if;
  select * into item from public.jobs where id=dispute.job_id for update;
  if dispute.job_resolution_applied_at is not null then return item.version; end if;

  if dispute.resolution_outcome='resume' then
    if item.status<>'disputed' then raise exception 'INVALID_DISPUTE_RESUME_STATE'; end if;
    update public.jobs set status='in_progress',version=version+1,updated_at=now() where id=item.id;
    insert into public.job_status_history(job_id,actor_id,previous_status,new_status,reason,idempotency_key,metadata)
    values(item.id,p_actor,item.status,'in_progress',p_reason,p_idempotency_key,
      jsonb_build_object('disputeId',dispute.id,'resolutionOutcome','resume',
        'preDisputeStatus',dispute.pre_dispute_job_status,'completionAttemptId',dispute.completion_attempt_id));
    insert into public.job_events(job_id,event_type,actor_id,payload)
    values(item.id,'dispute_work_resumed',p_actor,jsonb_build_object(
      'disputeId',dispute.id,'completionAttemptId',dispute.completion_attempt_id));
    final_version:=item.version+1;
  elsif dispute.resolution_outcome='complete' then
    final_version:=private.apply_job_terminal_outcome(item.id,p_actor,'completed','dispute',dispute.id,
      p_reason,p_idempotency_key,jsonb_build_object('disputeId',dispute.id,'adminResolved',true));
  else
    final_version:=private.apply_job_terminal_outcome(item.id,p_actor,'cancelled','dispute',dispute.id,
      p_reason,p_idempotency_key,jsonb_build_object('disputeId',dispute.id,'adminResolved',true));
  end if;
  update public.disputes set job_resolution_applied_at=coalesce(job_resolution_applied_at,now()) where id=dispute.id;
  insert into public.dispute_events(dispute_id,actor_id,event_type,reason,payload)
  values(dispute.id,p_actor,'job_outcome_applied',p_reason,jsonb_build_object(
    'outcome',dispute.resolution_outcome,'jobVersion',final_version));
  return final_version;
end $$;

-- Private helpers are never client entry points. The public command overloads
-- retain their prior authenticated grants.
revoke all on function private.apply_cancelled_job(
  uuid,uuid,text,text,jsonb
) from public,anon,authenticated;
revoke all on function private.apply_dispute_job_outcome(
  uuid,uuid,text,text
) from public,anon,authenticated;
revoke all on function private.bind_completion_proof_attempt()
  from public,anon,authenticated;
revoke all on function private.bind_completion_decision_attempt()
  from public,anon,authenticated;
revoke all on function private.finalize_completion_decision_attempt()
  from public,anon,authenticated;

commit;
