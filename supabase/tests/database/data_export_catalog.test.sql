begin;
select plan(10);

select has_table(
  'public','data_export_table_classifications',
  'schema-wide export classification table exists'
);
select ok(
  public.assert_data_export_catalog_complete(),
  'every actual public application table has exactly one valid classification and query anchor'
);
select is(
  (select count(*) from public.data_export_table_classifications),
  (select count(*) from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r'),
  'classification row count exactly matches the live public table catalog'
);
select is(
  (select count(*) from public.data_export_table_classifications
    where length(trim(reason))<10),
  0::bigint,
  'every classification has a documented reason'
);
select is(
  (select count(*) from public.data_export_table_classifications x
    cross join lateral unnest(x.manifest_categories) category
    where x.classification in ('exported','exported_with_redaction')
      and not (public.get_data_export_manifest() ? category)),
  0::bigint,
  'every exported table maps to a concrete manifest category'
);
select is(
  (select count(*) from jsonb_object_keys(public.get_data_export_query_coverage()) key
    where not (public.get_data_export_manifest() ? key)),
  0::bigint,
  'every query-coverage key maps to a manifest category'
);
select is(
  jsonb_array_length(public.get_data_export_manifest()),
  76,
  'portable export publishes the complete version-four category manifest'
);
select is(
  (select count(*) from public.data_export_table_classifications
    where table_name in (
      'blocked_users','provider_restricted_qualifications',
      'provider_qualification_events','provider_document_reviews',
      'provider_status_history','provider_suspensions','offer_revisions',
      'offer_status_history','offer_withdrawals','change_orders',
      'change_order_items','job_assignments','job_checklists','job_notes',
      'message_read_receipts','message_translations','message_moderation_events',
      'payment_attempts','payment_events','provider_settlements',
      'settlement_events','platform_fees','financial_action_intents',
      'customer_acceptance_evidence'
    ) and classification not in ('exported','exported_with_redaction')),
  0::bigint,
  'all explicitly required lifecycle tables are owner-exported with appropriate redaction'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class
    where oid='public.data_export_table_classifications'::regclass),
  'classification metadata is protected by RLS'
);
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select throws_ok(
  $$select count(*) from public.data_export_table_classifications$$,
  'permission denied for table data_export_table_classifications',
  'authenticated clients cannot enumerate internal schema classifications'
);

select * from finish();
rollback;
