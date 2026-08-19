begin;

select plan(47);

-- View security semantics and stable public contracts.
select ok(
  coalesce((select c.reloptions @> array['security_invoker=true'] from pg_class c where c.oid='public.provider_request_briefs'::regclass), false),
  'provider request briefs execute with invoker privileges'
);
select ok(
  coalesce((select c.reloptions @> array['security_invoker=true'] from pg_class c where c.oid='public.provider_public_profiles'::regclass), false),
  'provider public profiles execute with invoker privileges'
);
select is(
  (select array_agg(a.attname::text order by a.attnum)
   from pg_attribute a
   where a.attrelid='public.provider_public_profiles'::regclass and a.attnum>0 and not a.attisdropped),
  array['user_id','kind','business_name','bio','preferred_brief_locale','verification_status',
        'rating_average','rating_count','completed_jobs','response_rate','created_at']::text[],
  'provider public profile projection keeps only approved fields'
);
select is(
  (select count(*) from pg_attribute a
   where a.attrelid in ('public.provider_public_profiles'::regclass,'public.provider_request_briefs'::regclass)
     and a.attnum>0 and not a.attisdropped
     and a.attname::text = any(array['email','phone','formatted_address','exact_address_id','customer_id'])),
  0::bigint,
  'public projections contain no direct identity or exact-address columns'
);

-- Function surface is explicit, least-privilege, and migration-safe.
select hasnt_function(
  'public','accept_completion',
  array['uuid','boolean','text','integer','text','text'],
  'legacy six-argument completion function is removed'
);
select has_function(
  'public','accept_completion',
  array['uuid','boolean','text','integer','text','text','uuid[]'],
  'authoritative completion function remains'
);
select is(
  (select count(*)
   from pg_proc p
   join pg_namespace n on n.oid=p.pronamespace
   cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
   where n.nspname in ('public','private') and p.prosecdef
     and acl.grantee=0 and acl.privilege_type='EXECUTE'),
  0::bigint,
  'no public or private security-definer function inherits PUBLIC execute'
);
select is(
  (select array_agg(
     n.nspname||'.'||p.proname||'('||pg_catalog.oidvectortypes(p.proargtypes)||')'
     order by n.nspname,p.proname,pg_catalog.oidvectortypes(p.proargtypes)
   )
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname in ('public','private') and p.prosecdef
     and has_function_privilege('anon',p.oid,'EXECUTE')),
  array[
    'private.provider_public_profile_rows()',
    'public.request_external_account_deletion(text, text)'
  ]::text[],
  'anon can execute only the two reviewed public contracts'
);
select ok(
  not has_function_privilege('authenticated','public.get_data_export_manifest_v3()','EXECUTE'),
  'legacy export manifest helper is service-only'
);
select ok(
  not has_function_privilege('authenticated','public.get_data_export_query_coverage_v3()','EXECUTE'),
  'legacy export coverage helper is service-only'
);
select ok(
  not has_function_privilege('authenticated','public.upsert_provider_onboarding_without_final_diff(jsonb)','EXECUTE'),
  'onboarding compatibility helper is service-only'
);
select ok(
  not has_function_privilege('authenticated','public.run_matching(uuid,integer)','EXECUTE'),
  'matching worker command is not client executable'
);
select ok(
  has_function_privilege('service_role','public.run_matching(uuid,integer)','EXECUTE'),
  'matching worker command remains service-role executable'
);
select ok(
  has_function_privilege('anon','public.request_external_account_deletion(text,text)','EXECUTE'),
  'external account deletion has an explicit anon grant'
);
select ok(
  has_function_privilege('authenticated','public.request_external_account_deletion(text,text)','EXECUTE'),
  'external account deletion remains available to signed-in users'
);
select is(
  (select p.prorettype::regtype::text from pg_proc p
   where p.oid='public.request_external_account_deletion(text,text)'::regprocedure),
  'void',
  'external account deletion returns a non-enumerating void result'
);
select ok(
  has_function_privilege('authenticated','private.can_read_request(uuid)','EXECUTE'),
  'request RLS helper remains available to authenticated policies'
);
select ok(
  has_function_privilege('authenticated','private.is_admin()','EXECUTE'),
  'storage RLS admin helper remains available to authenticated policies'
);
select ok(
  not has_function_privilege('authenticated','private.set_updated_at()','EXECUTE'),
  'trigger helper is not directly executable by authenticated users'
);

select ok(
  (select coalesce(p.proconfig,'{}'::text[]) @> array['search_path=""']
   from pg_proc p where p.oid='private.set_updated_at()'::regprocedure),
  'set_updated_at has an immutable empty search path'
);
select ok(
  (select coalesce(p.proconfig,'{}'::text[]) @> array['search_path=""']
   from pg_proc p where p.oid='private.reject_event_mutation()'::regprocedure),
  'reject_event_mutation has an immutable empty search path'
);
select ok(
  (select coalesce(p.proconfig,'{}'::text[]) @> array['search_path=""']
   from pg_proc p where p.oid='private.enforce_settlement_amount()'::regprocedure),
  'enforce_settlement_amount has an immutable empty search path'
);

select is(
  (select count(*)
   from pg_class c join pg_namespace n on n.oid=c.relnamespace
   cross join lateral unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) privilege
   where n.nspname='public' and c.relkind in ('r','p') and c.relrowsecurity
     and not exists(select 1 from pg_policy pol where pol.polrelid=c.oid)
     and has_table_privilege('authenticated',c.oid,privilege)),
  0::bigint,
  'authenticated has no privilege on RLS-without-policy internal tables'
);
select is(
  (select count(*)
   from pg_class c join pg_namespace n on n.oid=c.relnamespace
   cross join lateral unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) privilege
   where n.nspname='public' and c.relkind in ('r','p') and c.relrowsecurity
     and not exists(select 1 from pg_policy pol where pol.polrelid=c.oid)
     and has_table_privilege('anon',c.oid,privilege)),
  0::bigint,
  'anon has no privilege on RLS-without-policy internal tables'
);
select is(
  (select count(*)
   from pg_default_acl d
   join pg_namespace n on n.oid=d.defaclnamespace
   join pg_roles owner_role on owner_role.oid=d.defaclrole
   cross join lateral aclexplode(d.defaclacl) acl
   where d.defaclobjtype='f' and n.nspname in ('public','private')
     and owner_role.rolname='postgres'
     and (
       acl.grantee=0
       or acl.grantee in (
         (select oid from pg_roles where rolname='anon'),
         (select oid from pg_roles where rolname='authenticated'),
         (select oid from pg_roles where rolname='service_role')
       )
     )
     and acl.privilege_type='EXECUTE'),
  0::bigint,
  'future application functions receive no implicit client or service execute grant'
);
select is(
  (select count(*)
   from pg_policies p
   cross join lateral (
     select lower(coalesce(p.qual,'')||' '||coalesce(p.with_check,'')) expression
   ) e
   where p.schemaname='public'
     and (
       regexp_count(e.expression,'auth[.]uid[(][)]')
         <> regexp_count(e.expression,'select[[:space:]]+auth[.]uid[(][)]')
       or regexp_count(e.expression,'auth[.]jwt[(][)]')
         <> regexp_count(e.expression,'select[[:space:]]+auth[.]jwt[(][)]')
     )),
  0::bigint,
  'all public auth policy calls use init-plan caching'
);

-- Synthetic accounts prove both invoker projections without real customer data.
insert into auth.users(
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
)
select id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
       email,crypt(gen_random_uuid()::text,gen_salt('bf')),now(),'{}','{}',now(),now()
from (values
 ('91000000-0000-4000-8000-000000000001'::uuid,'verified-provider@test.invalid'),
 ('91000000-0000-4000-8000-000000000002'::uuid,'pending-provider@test.invalid'),
 ('91000000-0000-4000-8000-000000000003'::uuid,'projection-customer@test.invalid'),
 ('91000000-0000-4000-8000-000000000004'::uuid,'matched-provider@test.invalid'),
 ('91000000-0000-4000-8000-000000000005'::uuid,'unmatched-provider@test.invalid'),
 ('91000000-0000-4000-8000-000000000006'::uuid,'ordinary-customer@test.invalid'),
 ('91000000-0000-4000-8000-000000000007'::uuid,'registered-delete@test.invalid')
) fixture(id,email);

insert into public.user_roles(user_id,role) values
 ('91000000-0000-4000-8000-000000000004','provider'),
 ('91000000-0000-4000-8000-000000000005','provider');

insert into public.provider_profiles(
  user_id,kind,business_name,bio,verification_status,accepting_requests
) values
 ('91000000-0000-4000-8000-000000000001','individual','Verified Fixture','Safe public bio','verified',true),
 ('91000000-0000-4000-8000-000000000002','individual','Pending Fixture','Must remain private','submitted',true);

insert into public.service_requests(
  id,customer_id,category_id,city_id,title,structured_description,original_text,
  approximate_location,status,published_at,customer_approved_at
)
select
  '92000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000003',
  category.id,city.id,'Projection test','Synthetic structured complaint',
  'Synthetic complaint',st_setsrid(st_makepoint(0,0),4326)::geography,
  'draft',now(),now()
from (select id from public.service_categories where slug='general-handyman') category
cross join (select id from public.cities where code='riyadh') city;

update public.service_requests
set status='published'
where id='92000000-0000-4000-8000-000000000001';

insert into public.matching_runs(
  id,request_id,configuration_version,weights,status
) values(
  '93000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000001',
  'security-hardening-test','{}','completed'
);

insert into public.request_provider_matches(
  request_id,provider_id,matching_run_id,score,status,expires_at
) values(
  '92000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000004',
  '93000000-0000-4000-8000-000000000001',
  .9,'invited',now()+interval '1 day'
);

set local role anon;
select is(
  (select count(*) from public.provider_public_profiles where user_id='91000000-0000-4000-8000-000000000001'),
  1::bigint,
  'anon can read the verified active provider through the safe projection'
);
select is(
  (select count(*) from public.provider_public_profiles where user_id='91000000-0000-4000-8000-000000000002'),
  0::bigint,
  'anon cannot read a provider pending verification'
);
select throws_like(
  $select count(*) from public.provider_profiles
    where user_id='91000000-0000-4000-8000-000000000001'$,
  '%permission denied for table provider_profiles%',
  'anon cannot bypass the projection to read a raw provider profile'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000004',true);
select is(
  (select count(*) from public.provider_request_briefs where id='92000000-0000-4000-8000-000000000001'),
  1::bigint,
  'matched provider reads the request brief through RLS'
);
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000005',true);
select is(
  (select count(*) from public.provider_request_briefs where id='92000000-0000-4000-8000-000000000001'),
  0::bigint,
  'unmatched provider cannot read the request brief'
);

set local role anon;
select throws_like(
  $$select public.submit_offer('{}'::jsonb)$$,
  '%permission denied for function submit_offer%',
  'anon cannot invoke provider offer command'
);
select throws_like(
  $$select public.admin_marketplace_health()$$,
  '%permission denied for function admin_marketplace_health%',
  'anon cannot invoke admin health command'
);
select throws_like(
  $$select public.review_provider('91000000-0000-4000-8000-000000000001','verified','x','x')$$,
  '%permission denied for function review_provider%',
  'anon cannot invoke provider review command'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000006',true);
select throws_ok(
  $$select public.admin_set_customer_status(
      '91000000-0000-4000-8000-000000000006','suspended','unauthorized','ordinary-denied'
    )$$,
  'OPERATIONS_PERMISSION_REQUIRED',
  'ordinary authenticated user is denied by staff authorization'
);
select throws_like(
  $$select count(*) from public.external_privacy_requests$$,
  '%permission denied for table external_privacy_requests%',
  'authenticated cannot read external privacy intake rows directly'
);

set local role anon;
select throws_like(
  $$select count(*) from public.external_privacy_requests$$,
  '%permission denied for table external_privacy_requests%',
  'anon cannot read external privacy intake rows directly'
);
select throws_ok(
  $$select public.request_external_account_deletion('not-an-email','invalid')$$,
  '22023',
  'INVALID_REQUEST',
  'malformed external deletion input receives a generic error'
);
select lives_ok(
  $$select public.request_external_account_deletion('registered-delete@test.invalid','registered account')$$,
  'existing-account deletion intake has the generic success contract'
);
select lives_ok(
  $$select public.request_external_account_deletion('missing-delete@test.invalid','missing account')$$,
  'nonexistent-account deletion intake has the same generic success contract'
);
select lives_ok(
  $$select public.request_external_account_deletion(
      'burst-delete@test.invalid',
      'Email BURST-DELETE@test.invalid '||repeat('x',1200)
    ) from generate_series(1,4)$$,
  'fourth per-email request is silently rate limited'
);

reset role;

select is(
  (select count(*) from public.external_privacy_requests
   where email_hash=encode(digest('burst-delete@test.invalid','sha256'),'hex')),
  3::bigint,
  'only the first three per-email requests are accepted and audited'
);
select is(
  (select count(*) from public.rate_limit_buckets
   where operation='external_account_deletion_email'
     and key_hash=encode(digest(
       'external-account-deletion:'||encode(digest('burst-delete@test.invalid','sha256'),'hex'),
       'sha256'
     ),'hex')
     and count=4 and limit_value=3),
  1::bigint,
  'per-email limiter records the rejected fourth attempt atomically'
);
select ok(
  exists(select 1 from public.rate_limit_buckets
         where operation='external_account_deletion_global' and limit_value=100),
  'global abuse limiter is active'
);
select ok(
  (select max(length(reason))<=1000
          and bool_and(reason not ilike '%burst-delete@test.invalid%')
   from public.external_privacy_requests
   where email_hash=encode(digest('burst-delete@test.invalid','sha256'),'hex')),
  'stored reasons are bounded and raw email addresses are redacted'
);
select is(
  (select count(*) from public.external_privacy_requests
   where email_hash ilike '%@%'
      or coalesce(reason,'') ilike '%registered-delete@test.invalid%'
      or coalesce(reason,'') ilike '%missing-delete@test.invalid%'
      or coalesce(reason,'') ilike '%burst-delete@test.invalid%'),
  0::bigint,
  'external deletion audit stores no raw submitted email'
);
select unlike(
  pg_get_functiondef('public.request_external_account_deletion(text,text)'::regprocedure),
  '%auth.users%',
  'external deletion never queries account existence'
);

select * from finish();
rollback;
