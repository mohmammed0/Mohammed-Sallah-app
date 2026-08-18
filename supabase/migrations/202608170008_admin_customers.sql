begin;

create function public.admin_set_customer_status(
  p_customer_id uuid,
  p_status public.account_status,
  p_reason text,
  p_idempotency_key text
) returns void
language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare
  actor uuid := auth.uid();
  previous public.account_status;
  audit_id uuid := gen_random_uuid();
  inserted boolean;
begin
  if not private.has_role(array['operations_admin','super_admin']::public.user_role[]) then
    raise exception 'OPERATIONS_PERMISSION_REQUIRED';
  end if;
  if p_status not in ('active','suspended') then raise exception 'INVALID_CUSTOMER_STATUS'; end if;
  if length(trim(coalesce(p_reason,''))) < 5 then raise exception 'REASON_REQUIRED'; end if;
  if actor = p_customer_id then raise exception 'SELF_STATUS_CHANGE_DENIED'; end if;
  if exists(
    select 1 from public.user_roles
    where user_id=p_customer_id
      and role in ('operations_admin','verification_reviewer','support_agent','finance_reviewer','analyst','super_admin')
      and revoked_at is null
  ) then raise exception 'ADMIN_ACCOUNT_PROTECTED'; end if;

  select status into previous from public.profiles where id=p_customer_id for update;
  if previous is null then raise exception 'CUSTOMER_NOT_FOUND'; end if;
  if previous not in ('active','suspended') then raise exception 'CUSTOMER_STATUS_LOCKED'; end if;
  if previous = p_status then raise exception 'STATUS_UNCHANGED'; end if;

  insert into public.idempotency_keys(user_id,command,key)
  values(actor,'admin_set_customer_status',p_idempotency_key)
  on conflict do nothing
  returning true into inserted;
  if not coalesce(inserted,false) then return; end if;

  update public.profiles set status=p_status,updated_at=now() where id=p_customer_id;
  insert into public.moderation_actions(target_user_id,actor_id,action_type,reason)
  values(p_customer_id,actor,case when p_status='suspended' then 'customer.suspend' else 'customer.reactivate' end,p_reason);
  insert into public.admin_audit_logs(
    id,actor_id,action,target_type,target_id,reason,correlation_id,before_snapshot,after_snapshot
  ) values(
    audit_id,actor,'customer.status.change','customer',p_customer_id,p_reason,audit_id,
    jsonb_build_object('status',previous),jsonb_build_object('status',p_status)
  );

  if p_status='suspended' then
    update public.push_tokens set enabled=false,updated_at=now() where user_id=p_customer_id;
    delete from auth.sessions where user_id=p_customer_id;
  end if;
  update public.idempotency_keys
  set status='completed',response=jsonb_build_object('status',p_status)
  where user_id=actor and command='admin_set_customer_status' and key=p_idempotency_key;
end $$;

revoke all on function public.admin_set_customer_status(uuid,public.account_status,text,text) from public,anon,authenticated;
grant execute on function public.admin_set_customer_status(uuid,public.account_status,text,text) to authenticated;

commit;
