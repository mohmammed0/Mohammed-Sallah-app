begin;

insert into public.admin_roles(key,name,description,system_role)
values(
  'privacy','Privacy reviewer',
  'Reasoned customer data-subject identity review','privacy_reviewer'
)
on conflict(key) do update set
  name=excluded.name,description=excluded.description,system_role=excluded.system_role;

delete from public.admin_role_permissions arp
using public.admin_roles ar,public.admin_permissions ap
where arp.admin_role_id=ar.id and arp.permission_id=ap.id
  and ar.key='support' and ap.key='customer.pii.read';

insert into public.admin_role_permissions(admin_role_id,permission_id)
select ar.id,ap.id
from public.admin_roles ar
join public.admin_permissions ap on ap.key in (
  'dashboard.aggregate.read','customer.pii.read'
)
where ar.key='privacy'
on conflict do nothing;

create function public.list_customer_pii(
  p_query text,p_reason text
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); result jsonb; safe_query text;
  audit_id uuid:=gen_random_uuid();
begin
  if not private.has_admin_permission('customer.pii.read') then
    raise exception 'CUSTOMER_PII_PERMISSION_REQUIRED';
  end if;
  if length(trim(coalesce(p_reason,'')))<5 then raise exception 'REASON_REQUIRED'; end if;
  safe_query:=left(regexp_replace(trim(coalesce(p_query,'')),'[%_\\]','','g'),80);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',item.id,'displayName',item.display_name,'phone',item.phone,
    'preferredLocale',item.preferred_locale,'status',item.status,
    'createdAt',item.created_at,
    'serviceRequestCount',(select count(*) from public.service_requests r
      where r.customer_id=item.id),
    'supportCaseCount',(select count(*) from public.support_cases c
      where c.opened_by=item.id),
    'deletion',(
      select jsonb_build_object(
        'status',d.status,'requestedAt',d.requested_at,
        'retentionSnapshot',d.retention_snapshot,'failureCategory',d.failure_category
      )
      from public.account_deletion_requests d where d.user_id=item.id
      order by d.requested_at desc limit 1
    )
  ) order by item.created_at desc),'[]'::jsonb) into result
  from (
    select p.* from public.profiles p
    where exists(select 1 from public.user_roles ur
      where ur.user_id=p.id and ur.role='customer' and ur.revoked_at is null)
      and (safe_query='' or p.display_name ilike '%'||safe_query||'%'
        or p.phone ilike '%'||safe_query||'%')
    order by p.created_at desc limit 100
  ) item;
  insert into public.admin_audit_logs(
    id,actor_id,action,target_type,reason,correlation_id,after_snapshot
  ) values(
    audit_id,actor,'customer.pii.list','customer_search',trim(p_reason),audit_id,
    jsonb_build_object(
      'queryUsed',safe_query<>'','resultCount',jsonb_array_length(result),
      'fields',jsonb_build_array('display_name','phone','locale','status','counts')
    )
  );
  return result;
end $$;

revoke all on function public.list_customer_pii(text,text)
  from public,anon,authenticated;
grant execute on function public.list_customer_pii(text,text) to authenticated;

commit;
