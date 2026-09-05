begin;

-- Existing hash-only drafts remain unapproved. Approval is an explicit operator action.
alter table public.legal_documents
  add column title text,
  add column body text,
  add column approved_at timestamptz,
  add column approval_reference text,
  add column withdrawn_at timestamptz,
  add constraint legal_approved_content_check check (
    approved_at is null or (
      title is not null and char_length(trim(title)) between 1 and 240
      and body is not null and octet_length(body) between 1 and 131072
      and approval_reference is not null and char_length(trim(approval_reference)) between 1 and 240
      and content_hash=encode(extensions.digest(convert_to(body,'UTF8'),'sha256'),'hex')
      and published_at is not null and effective_at is not null
      and locale in ('ar','en','ur','hi')
      and char_length(version) between 1 and 100
    )
  );
create index legal_documents_current_idx
  on public.legal_documents(locale,document_type,effective_at desc,published_at desc,id)
  where approved_at is not null and withdrawn_at is null;

insert into public.system_settings(key,value)
values ('legal.consent','{"enabled":true}'::jsonb)
on conflict(key) do nothing;

create function private.legal_consent_enabled() returns boolean
language sql volatile security definer set search_path='' as $$
  -- Absent or malformed settings fail closed. Only an explicit boolean false disables.
  select not coalesce((select value->'enabled'='false'::jsonb
    from public.system_settings where key='legal.consent'),false)
$$;

create function private.lock_legal_publication() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='system_settings' then
    if (tg_op='DELETE' and old.key<>'legal.consent')
       or (tg_op<>'DELETE' and new.key<>'legal.consent' and (tg_op='INSERT' or old.key<>'legal.consent')) then
      return coalesce(new,old);
    end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('sallah:legal:publication',0));
  if tg_table_name='legal_documents' and tg_op in ('UPDATE','DELETE') and old.approved_at is not null then
    if tg_op='DELETE' then raise exception 'APPROVED_LEGAL_DOCUMENT_IMMUTABLE'; end if;
    if (to_jsonb(new)-'withdrawn_at') is distinct from (to_jsonb(old)-'withdrawn_at') then
      raise exception 'APPROVED_LEGAL_DOCUMENT_IMMUTABLE';
    end if;
    if old.withdrawn_at is not null and new.withdrawn_at is distinct from old.withdrawn_at then
      raise exception 'WITHDRAWN_LEGAL_DOCUMENT_IMMUTABLE';
    end if;
  end if;
  return coalesce(new,old);
end $$;
create trigger legal_documents_publication_lock before insert or update or delete
  on public.legal_documents for each row execute function private.lock_legal_publication();
create trigger legal_consent_setting_lock before insert or update or delete
  on public.system_settings for each row execute function private.lock_legal_publication();

drop policy legal_documents_public_read on public.legal_documents;
create policy legal_documents_public_read on public.legal_documents for select
  using(approved_at<=now() and published_at<=now() and effective_at<=now() and withdrawn_at is null);
revoke select on public.legal_documents from anon,authenticated;
grant select(id,document_type,version,locale,content_hash,published_at,effective_at,requires_acceptance,title,body)
  on public.legal_documents to anon,authenticated;
revoke insert,update,delete on public.legal_acceptances from anon,authenticated,service_role;
drop policy legal_acceptances_insert on public.legal_acceptances;
alter table public.legal_acceptances
  add column accepted_content_hash text,
  add column accepted_document_version text,
  add column accepted_document_locale text;

create function private.current_legal_documents(p_locale text,p_as_of timestamptz default clock_timestamp())
returns setof public.legal_documents
language sql volatile security definer set search_path='' as $$
  select distinct on (d.document_type) d.* from public.legal_documents d
  where d.locale=p_locale and d.document_type in ('privacy','terms','community')
    and d.approved_at<=p_as_of and d.published_at<=p_as_of and d.effective_at<=p_as_of
    and d.withdrawn_at is null and d.requires_acceptance
  order by d.document_type,d.effective_at desc,d.published_at desc,d.id
$$;

create function private.has_current_legal_acceptance(p_user uuid,p_type text,p_version text,p_as_of timestamptz default clock_timestamp())
returns boolean language sql volatile security definer set search_path='' as $$
  select exists(
    select 1 from public.legal_acceptances a
    join public.legal_documents d on d.id=a.legal_document_id
    join lateral private.current_legal_documents(d.locale,p_as_of) current_doc on current_doc.id=d.id
    where a.user_id=p_user and d.document_type=p_type and d.version=p_version
      and a.accepted_content_hash=d.content_hash and a.accepted_document_version=d.version
      and a.accepted_document_locale=d.locale and a.accepted_at>=d.approved_at
  )
$$;

create function private.legal_consent_context(p_user uuid,p_locale text,p_as_of timestamptz default clock_timestamp()) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare documents jsonb; missing jsonb; accepted_all boolean;
begin
  if p_locale is null or p_locale not in ('ar','en','ur','hi') then raise exception 'INVALID_LOCALE'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',d.id,'documentType',d.document_type,'version',d.version,'locale',d.locale,
    'title',d.title,'body',d.body,'contentHash',d.content_hash,'requiresAcceptance',d.requires_acceptance,
    'accepted',private.has_current_legal_acceptance(p_user,d.document_type,d.version,p_as_of)
  ) order by d.document_type),'[]'::jsonb),
    coalesce(bool_and(private.has_current_legal_acceptance(p_user,d.document_type,d.version,p_as_of)),false)
  into documents,accepted_all from private.current_legal_documents(p_locale,p_as_of) d;
  select coalesce(jsonb_agg(t.type order by t.type),'[]'::jsonb) into missing
  from unnest(array['privacy','terms','community']) t(type)
  where not exists(select 1 from private.current_legal_documents(p_locale,p_as_of) d where d.document_type=t.type);
  return jsonb_build_object(
    'status',case when not private.legal_consent_enabled() then 'not_required'
      when jsonb_array_length(missing)>0 then 'unavailable'
      when accepted_all then 'accepted' else 'required' end,
    'documents',documents,'missingRequiredTypes',missing
  );
end $$;

create function public.get_legal_consent_context(p_locale text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock_shared(hashtextextended('sallah:legal:publication',0));
  return private.legal_consent_context(auth.uid(),p_locale,clock_timestamp());
end
$$;

alter table public.privacy_events drop constraint privacy_events_request_type_check;
alter table public.privacy_events add constraint privacy_events_request_type_check
  check(request_type in ('account_deletion','data_export','legal_acceptance'));

create function public.accept_current_legal_documents(
  p_locale text,p_documents jsonb,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); context jsonb; item jsonb; submitted jsonb; expected jsonb;
  request_hash text; replay jsonb; acceptance_id uuid; p_as_of timestamptz;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.profiles where id=actor and status='active') then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  if p_documents is null or jsonb_typeof(p_documents)<>'array' then raise exception 'INVALID_LEGAL_DOCUMENTS'; end if;
  if jsonb_array_length(p_documents)<>3 then raise exception 'INVALID_LEGAL_DOCUMENTS'; end if;
  for item in select value from jsonb_array_elements(p_documents) loop
    if jsonb_typeof(item)<>'object' then raise exception 'INVALID_LEGAL_DOCUMENTS'; end if;
    if (select count(*) from jsonb_object_keys(item))<>2
      or jsonb_typeof(item->'id') is distinct from 'string'
      or jsonb_typeof(item->'contentHash') is distinct from 'string'
      or (item->>'id')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      or (item->>'contentHash')!~'^[0-9a-f]{64}$' then raise exception 'INVALID_LEGAL_DOCUMENTS'; end if;
  end loop;
  select jsonb_agg(value order by value->>'id') into submitted from jsonb_array_elements(p_documents);
  request_hash:=private.canonical_request_hash(jsonb_build_object('locale',p_locale,'documents',submitted));
  perform pg_advisory_xact_lock_shared(hashtextextended('sallah:legal:publication',0));
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':legal_consent:'||p_idempotency_key,0));
  replay:=private.idempotency_replay(actor,'legal_consent_v1',p_idempotency_key,request_hash);
  p_as_of:=clock_timestamp();
  if replay is not null then return private.legal_consent_context(actor,p_locale); end if;
  context:=private.legal_consent_context(actor,p_locale,p_as_of);
  if context->>'status'='unavailable' then raise exception 'LEGAL_DOCUMENTS_UNAVAILABLE'; end if;
  select jsonb_agg(jsonb_build_object('id',d.id,'contentHash',d.content_hash) order by d.id::text)
    into expected from private.current_legal_documents(p_locale,p_as_of) d;
  if submitted is distinct from expected then raise exception 'LEGAL_DOCUMENTS_CHANGED'; end if;
  insert into public.idempotency_keys(user_id,command,key,request_hash)
    values(actor,'legal_consent_v1',p_idempotency_key,request_hash);
  for item in select value from jsonb_array_elements(submitted) loop
    acceptance_id:=null;
    insert into public.legal_acceptances(user_id,legal_document_id,accepted_at,
      accepted_content_hash,accepted_document_version,accepted_document_locale)
      select actor,d.id,clock_timestamp(),d.content_hash,d.version,d.locale
      from private.current_legal_documents(p_locale,p_as_of) d where d.id=(item->>'id')::uuid
      on conflict(user_id,legal_document_id) do update set
        accepted_at=excluded.accepted_at,accepted_content_hash=excluded.accepted_content_hash,
        accepted_document_version=excluded.accepted_document_version,accepted_document_locale=excluded.accepted_document_locale
      where public.legal_acceptances.accepted_content_hash is distinct from excluded.accepted_content_hash
        or public.legal_acceptances.accepted_document_version is distinct from excluded.accepted_document_version
        or public.legal_acceptances.accepted_document_locale is distinct from excluded.accepted_document_locale
        or public.legal_acceptances.accepted_at<(select approved_at from public.legal_documents where id=excluded.legal_document_id)
      returning id into acceptance_id;
    if acceptance_id is not null then
      insert into public.privacy_events(user_id,request_id,request_type,event_type,actor_id,metadata)
        values(actor,acceptance_id,'legal_acceptance','current_document_accepted',actor,
          jsonb_build_object('documentId',item->>'id','contentHash',item->>'contentHash','locale',p_locale));
    end if;
  end loop;
  perform private.complete_idempotent_command(actor,'legal_consent_v1',p_idempotency_key,'{"accepted":true}'::jsonb);
  return private.legal_consent_context(actor,p_locale);
end $$;

create function private.require_legal_consent(p_user uuid) returns void
language plpgsql security definer set search_path='' as $$
declare context jsonb; locale text;
begin
  perform pg_advisory_xact_lock_shared(hashtextextended('sallah:legal:publication',0));
  if not exists(select 1 from public.profiles where id=p_user and status='active') then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  if not private.legal_consent_enabled() then return; end if;
  select preferred_locale into locale from public.profiles where id=p_user;
  if locale is null then raise exception 'AUTH_REQUIRED'; end if;
  context:=private.legal_consent_context(p_user,locale);
  if context->>'status'='unavailable' then raise exception 'LEGAL_DOCUMENTS_UNAVAILABLE'; end if;
  if context->>'status'<>'accepted' then raise exception 'LEGAL_ACCEPTANCE_REQUIRED'; end if;
end $$;

create function public.assert_actor_legal_consent(p_user_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  perform private.require_legal_consent(p_user_id);
end $$;

create function private.require_content_legal_consent() returns trigger
language plpgsql security definer set search_path='' as $$
declare row_data jsonb:=to_jsonb(new); previous jsonb; field text; content_changed boolean:=false;
begin
  -- Support evidence remains available while a user reviews, declines or cannot load policies.
  if tg_table_name='file_uploads' and row_data->>'purpose'='support_evidence' then return new; end if;
  if tg_op='UPDATE' then
    previous:=to_jsonb(old);
    foreach field in array string_to_array(tg_argv[1],',') loop
      if row_data->field is distinct from previous->field then content_changed:=true; exit; end if;
    end loop;
    if not content_changed then return new; end if;
    -- Account anonymization removes content and must stay available without fresh acceptance.
    if auth.role()='service_role' and exists(select 1 from public.profiles where id=(row_data->>tg_argv[0])::uuid
      and status in ('deletion_pending','anonymized')) then return new; end if;
  end if;
  perform private.require_legal_consent((row_data->>tg_argv[0])::uuid);
  return new;
end $$;
create trigger legal_consent_request before insert or update on public.service_requests
  for each row execute function private.require_content_legal_consent('customer_id','title,structured_description,original_text');
create trigger legal_consent_offer before insert or update on public.offers
  for each row execute function private.require_content_legal_consent('provider_id','provider_note');
create trigger legal_consent_message before insert or update on public.messages
  for each row execute function private.require_content_legal_consent('sender_id','body');
create trigger legal_consent_upload before insert on public.file_uploads
  for each row execute function private.require_content_legal_consent('user_id','');
create trigger legal_consent_provider before insert or update on public.provider_profiles
  for each row execute function private.require_content_legal_consent('user_id','business_name,bio');
create trigger legal_consent_portfolio before insert or update on public.provider_portfolio_items
  for each row execute function private.require_content_legal_consent('provider_id','title,description,storage_path');
create trigger legal_consent_completion before insert or update on public.completion_proofs
  for each row execute function private.require_content_legal_consent('provider_id','description');
create trigger legal_consent_rating before insert or update on public.ratings
  for each row execute function private.require_content_legal_consent('customer_id','review');
create trigger legal_consent_change_order before insert or update on public.change_orders
  for each row execute function private.require_content_legal_consent('provider_id','reason,description');

create function public.get_legal_release_readiness() returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare missing jsonb; aligned boolean; p_as_of timestamptz;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('sallah:legal:publication',0));
  p_as_of:=clock_timestamp();
  select coalesce(jsonb_agg(jsonb_build_object('locale',l.locale,'documentType',t.type)
    order by l.locale,t.type),'[]'::jsonb) into missing
  from unnest(array['ar','en','ur','hi']) l(locale)
  cross join unnest(array['privacy','terms','community']) t(type)
  where not exists(select 1 from private.current_legal_documents(l.locale,p_as_of) d where d.document_type=t.type);
  select not exists(
    select d.document_type from unnest(array['ar','en','ur','hi']) l(locale)
    cross join lateral private.current_legal_documents(l.locale,p_as_of) d
    group by d.document_type having count(distinct d.version)<>1
  ) into aligned;
  return jsonb_build_object('ready',private.legal_consent_enabled() and jsonb_array_length(missing)=0 and aligned,
    'consentEnabled',private.legal_consent_enabled(),'missingDocuments',missing,'versionsAligned',aligned);
end $$;

revoke all on function private.legal_consent_enabled(),private.lock_legal_publication(),
  private.current_legal_documents(text,timestamptz),private.has_current_legal_acceptance(uuid,text,text,timestamptz),
  private.legal_consent_context(uuid,text,timestamptz),private.require_legal_consent(uuid),
  private.require_content_legal_consent() from public,anon,authenticated,service_role;
revoke all on function public.get_legal_consent_context(text),
  public.accept_current_legal_documents(text,jsonb,text),public.get_legal_release_readiness()
  from public,anon,authenticated,service_role;
grant execute on function public.get_legal_consent_context(text) to anon,authenticated;
grant execute on function public.accept_current_legal_documents(text,jsonb,text) to authenticated;
grant execute on function public.get_legal_release_readiness() to service_role;
revoke all on function public.assert_actor_legal_consent(uuid) from public,anon,authenticated,service_role;
grant execute on function public.assert_actor_legal_consent(uuid) to service_role;

commit;
