begin;

-- Trigger records are table-specific. PostgreSQL resolves record fields while
-- preparing an expression, even when an earlier boolean operand is false.
create or replace function private.lock_legal_publication() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='system_settings' then
    if tg_op='DELETE' then
      if old.key<>'legal.consent' then return old; end if;
    elsif tg_op='INSERT' then
      if new.key<>'legal.consent' then return new; end if;
    else
      if new.key<>'legal.consent' and old.key<>'legal.consent' then return new; end if;
    end if;
    perform pg_advisory_xact_lock(hashtextextended('sallah:legal:publication',0));
  elsif tg_table_name='legal_documents' then
    perform pg_advisory_xact_lock(hashtextextended('sallah:legal:publication',0));
    if tg_op in ('UPDATE','DELETE') then
      if old.approved_at is not null then
        if tg_op='DELETE' then raise exception 'APPROVED_LEGAL_DOCUMENT_IMMUTABLE'; end if;
        if (to_jsonb(new)-'withdrawn_at') is distinct from (to_jsonb(old)-'withdrawn_at') then
          raise exception 'APPROVED_LEGAL_DOCUMENT_IMMUTABLE';
        end if;
        if old.withdrawn_at is not null and new.withdrawn_at is distinct from old.withdrawn_at then
          raise exception 'WITHDRAWN_LEGAL_DOCUMENT_IMMUTABLE';
        end if;
      end if;
    end if;
  else
    raise exception 'INVALID_LEGAL_PUBLICATION_TABLE';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;

commit;
