begin;

-- The table was introduced after the schema-wide authenticated SELECT grant.
-- RLS remains deny-by-default and limits rows to the grantee, assigned staff,
-- or operations-wide marketplace permission.
grant select on public.support_case_access_grants to authenticated;

commit;
