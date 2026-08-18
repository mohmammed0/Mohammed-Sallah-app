begin;

create function public.consume_rate_limit(p_key_hash text,p_operation text,p_window_start timestamptz,p_limit integer) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare observed integer;
begin
  if p_limit not between 1 and 10000 then raise exception 'INVALID_RATE_LIMIT'; end if;
  insert into rate_limit_buckets(key_hash,operation,window_start,count,limit_value)
  values(p_key_hash,p_operation,p_window_start,1,p_limit)
  on conflict(key_hash,operation,window_start) do update set count=rate_limit_buckets.count+1,limit_value=excluded.limit_value,updated_at=now()
  returning count into observed;
  return observed<=p_limit;
end $$;
revoke all on function public.consume_rate_limit(text,text,timestamptz,integer) from public,anon,authenticated;
grant execute on function public.consume_rate_limit(text,text,timestamptz,integer) to service_role;

create function private.reject_event_mutation() returns trigger language plpgsql as $$ begin raise exception 'APPEND_ONLY_RECORD'; end $$;
create trigger payment_events_immutable before update or delete on public.payment_events for each row execute function private.reject_event_mutation();
create trigger settlement_events_immutable before update or delete on public.settlement_events for each row execute function private.reject_event_mutation();
create trigger admin_audit_immutable before update or delete on public.admin_audit_logs for each row execute function private.reject_event_mutation();
create trigger job_status_history_immutable before update or delete on public.job_status_history for each row execute function private.reject_event_mutation();
create trigger job_events_immutable before update or delete on public.job_events for each row execute function private.reject_event_mutation();
create trigger request_publication_immutable before update or delete on public.request_publication_events for each row execute function private.reject_event_mutation();

create function private.match_new_request() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin perform public.run_matching(new.id,20); return new; end $$;
create trigger request_auto_match after insert on public.service_requests for each row when(new.status='published') execute function private.match_new_request();

create function public.submit_completion(p_job_id uuid,p_proofs jsonb,p_idempotency_key text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); job jobs%rowtype; proof jsonb;
begin
  select * into job from jobs where id=p_job_id and provider_id=actor and status='in_progress' for update;
  if job.id is null then raise exception 'ACTIVE_PROVIDER_JOB_REQUIRED'; end if;
  if jsonb_array_length(coalesce(p_proofs,'[]'))<1 then raise exception 'COMPLETION_PROOF_REQUIRED'; end if;
  for proof in select value from jsonb_array_elements(p_proofs) loop
    insert into completion_proofs(job_id,provider_id,storage_path,mime_type,size_bytes,description)
    values(job.id,actor,proof->>'storagePath',proof->>'mimeType',(proof->>'sizeBytes')::bigint,proof->>'description');
  end loop;
  return public.transition_job(job.id,'completion_submitted','completion_evidence_submitted',p_idempotency_key);
end $$;

create function public.accept_completion(p_job_id uuid,p_accept boolean,p_reason text,p_score integer,p_review text,p_idempotency_key text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); job jobs%rowtype;
begin
  select * into job from jobs where id=p_job_id and customer_id=actor and status='completion_submitted' for update;
  if job.id is null then raise exception 'CUSTOMER_COMPLETION_REQUIRED'; end if;
  insert into customer_acceptances(job_id,customer_id,accepted,reason,accepted_total_minor) values(job.id,actor,p_accept,p_reason,job.approved_total_minor);
  if not p_accept then return public.transition_job(job.id,'disputed',coalesce(p_reason,'completion_rejected'),p_idempotency_key); end if;
  if p_score not between 1 and 5 then raise exception 'RATING_REQUIRED'; end if;
  insert into ratings(job_id,customer_id,provider_id,score,review) values(job.id,actor,job.provider_id,p_score,nullif(trim(p_review),''));
  update provider_profiles set rating_average=((rating_average*rating_count)+p_score)/(rating_count+1),rating_count=rating_count+1,completed_jobs=completed_jobs+1,active_workload=greatest(0,active_workload-1) where user_id=job.provider_id;
  return public.transition_job(job.id,'completed','customer_accepted_completion',p_idempotency_key);
end $$;

create function public.request_cancellation(p_job_id uuid,p_request_id uuid,p_reason text) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); result uuid; state text;
begin
  if p_job_id is not null then select status::text into state from jobs where id=p_job_id and actor in(customer_id,provider_id); else select status::text into state from service_requests where id=p_request_id and customer_id=actor; end if;
  if state is null then raise exception 'CANCELLATION_ACCESS_DENIED'; end if;
  insert into cancellation_requests(job_id,request_id,requester_id,lifecycle_state,reason) values(p_job_id,p_request_id,actor,state,p_reason) returning id into result;
  return result;
end $$;

create function public.open_dispute(p_job_id uuid,p_reason text,p_idempotency_key text) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); result uuid; job jobs%rowtype;
begin
  select * into job from jobs where id=p_job_id and actor in(customer_id,provider_id) for update;
  if job.id is null then raise exception 'DISPUTE_ACCESS_DENIED'; end if;
  if exists(select 1 from idempotency_keys where user_id=actor and command='open_dispute' and key=p_idempotency_key and response is not null) then return (select (response->>'id')::uuid from idempotency_keys where user_id=actor and command='open_dispute' and key=p_idempotency_key); end if;
  insert into idempotency_keys(user_id,command,key) values(actor,'open_dispute',p_idempotency_key);
  insert into disputes(job_id,opened_by,reason) values(job.id,actor,p_reason) returning id into result;
  insert into dispute_events(dispute_id,actor_id,event_type,reason) values(result,actor,'opened',p_reason);
  insert into financial_holds(job_id,amount_minor,reason,created_by) values(job.id,job.approved_total_minor,'dispute_opened',actor);
  if job.status not in ('disputed','completed','cancelled') then perform public.transition_job(job.id,'disputed',p_reason,'dispute:'||result::text); end if;
  update idempotency_keys set status='completed',response=jsonb_build_object('id',result) where user_id=actor and command='open_dispute' and key=p_idempotency_key;
  return result;
end $$;

create function public.review_provider(p_provider_id uuid,p_decision verification_status,p_reason text,p_idempotency_key text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); previous verification_status; audit_id uuid:=gen_random_uuid();
begin
  if not private.has_role(array['verification_reviewer','super_admin']::user_role[]) then raise exception 'VERIFICATION_PERMISSION_REQUIRED'; end if;
  if p_decision not in ('verified','rejected','more_information_required','suspended') then raise exception 'INVALID_VERIFICATION_DECISION'; end if;
  if length(trim(p_reason))<5 then raise exception 'REASON_REQUIRED'; end if;
  select verification_status into previous from provider_profiles where user_id=p_provider_id for update;
  if previous is null then raise exception 'PROVIDER_NOT_FOUND'; end if;
  insert into idempotency_keys(user_id,command,key) values(actor,'review_provider',p_idempotency_key) on conflict do nothing;
  update provider_profiles set verification_status=p_decision,accepting_requests=case when p_decision='verified' then accepting_requests else false end,updated_at=now() where user_id=p_provider_id;
  insert into provider_status_history(provider_id,previous_status,new_status,actor_id,reason) values(p_provider_id,previous,p_decision,actor,p_reason);
  insert into admin_audit_logs(id,actor_id,action,target_type,target_id,reason,correlation_id,before_snapshot,after_snapshot)
  values(audit_id,actor,'provider.review','provider',p_provider_id,p_reason,audit_id,jsonb_build_object('status',previous),jsonb_build_object('status',p_decision));
end $$;

create function private.enforce_settlement_amount() returns trigger language plpgsql as $$
declare captured bigint;
begin
  select coalesce(sum(case when event_type='captured' then amount_minor when event_type='refunded' then -amount_minor else 0 end),0) into captured from payment_events where payment_id=new.payment_id;
  if new.gross_minor>captured then raise exception 'SETTLEMENT_EXCEEDS_CAPTURED_AMOUNT'; end if;
  return new;
end $$;
create trigger settlement_amount_guard before insert or update on public.provider_settlements for each row execute function private.enforce_settlement_amount();

grant execute on function public.submit_completion(uuid,jsonb,text),public.accept_completion(uuid,boolean,text,integer,text,text),
  public.request_cancellation(uuid,uuid,text),public.open_dispute(uuid,text,text),public.review_provider(uuid,verification_status,text,text) to authenticated;

commit;
