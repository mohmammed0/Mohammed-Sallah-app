begin;
select no_plan();

-- The shared publication trigger must resolve only fields belonging to its table.
select lives_ok($$insert into public.system_settings(key,value) values('test.legal.trigger','{}')$$,
  'unrelated setting insert does not resolve legal document fields');
select lives_ok($$update public.system_settings set value='{"test":true}' where key='test.legal.trigger'$$,
  'unrelated setting update does not resolve legal document fields');
select lives_ok($$delete from public.system_settings where key='test.legal.trigger'$$,
  'unrelated setting delete does not resolve legal document fields');
select lives_ok($$delete from public.system_settings where key='legal.consent'$$,
  'consent setting deletion locks publication without reading document fields');
select lives_ok($$insert into public.system_settings(key,value) values('legal.consent','{"enabled":false}')$$,
  'consent setting insertion locks publication without reading document fields');
select lives_ok($$update public.system_settings set value='{"enabled":false,"test":true}' where key='legal.consent'$$,
  'consent setting update locks publication without reading document fields');

select has_function('public','get_legal_consent_context',array['text'],'public reader has no arbitrary user parameter');
select has_function('public','accept_current_legal_documents',array['text','jsonb','text'],'acceptance uses a versioned idempotent command');
select ok(not has_table_privilege('authenticated','public.legal_acceptances','INSERT'),'clients cannot forge acceptance rows');
select ok(not has_function_privilege('anon','public.accept_current_legal_documents(text,jsonb,text)','EXECUTE'),'anonymous users cannot accept for an account');
select ok(not has_function_privilege('authenticated','public.get_legal_release_readiness()','EXECUTE'),'production readiness is service-only');
select ok(not has_function_privilege('authenticated','public.assert_actor_legal_consent(uuid)','EXECUTE'),'AI service cannot be impersonated by authenticated clients');
select ok(not has_column_privilege('anon','public.legal_documents','approval_reference','SELECT'),'internal review reference is not public');

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',email,
  crypt(gen_random_uuid()::text,gen_salt('bf')),now(),'{}','{}',now(),now()
from (values
  ('d5000000-0000-4000-8000-000000000001'::uuid,'legal-customer@test.invalid'),
  ('d5000000-0000-4000-8000-000000000002'::uuid,'legal-provider@test.invalid')
) fixture(id,email);
insert into public.user_roles(user_id,role) values('d5000000-0000-4000-8000-000000000002','provider') on conflict do nothing;

select is(public.get_legal_consent_context('ar')->>'status','not_required','local/test seed explicitly disables enforcement without approving drafts');
update public.system_settings set value='{"enabled":true}' where key='legal.consent';
select is(public.get_legal_consent_context('ar')->>'status','unavailable','hash-only published drafts never satisfy approved policy requirements');
select throws_ok($$select private.require_legal_consent('d5000000-0000-4000-8000-000000000001')$$,'P0001','LEGAL_DOCUMENTS_UNAVAILABLE','server content gate fails closed when documents are absent');

-- Synthetic test policies only. No production policy or real legal approval is created by seed.
insert into public.legal_documents(document_type,version,locale,content_hash,published_at,effective_at,requires_acceptance)
values('privacy','test-v1','ar',encode(digest('old unseen draft','sha256'),'hex'),now()-interval '2 hours',now()-interval '2 hours',true);
insert into public.legal_acceptances(user_id,legal_document_id,accepted_at)
select 'd5000000-0000-4000-8000-000000000001',id,now()-interval '2 hours'
from public.legal_documents where document_type='privacy' and version='test-v1' and locale='ar';
update public.legal_documents set title='Fixture privacy',body='Synthetic policy fixture privacy ar',
  content_hash=encode(digest('Synthetic policy fixture privacy ar','sha256'),'hex'),
  approved_at=now()-interval '1 hour',approval_reference='test-fixture-only'
where document_type='privacy' and version='test-v1' and locale='ar';
select ok(not private.has_current_legal_acceptance('d5000000-0000-4000-8000-000000000001','privacy','test-v1'),
  'a legacy acceptance of unseen draft bytes cannot become acceptance of later approved content');
insert into public.legal_documents(document_type,version,locale,content_hash,published_at,effective_at,requires_acceptance,title,body,approved_at,approval_reference)
select type,'test-v1',locale,encode(digest('Synthetic policy fixture '||type||' '||locale,'sha256'),'hex'),
  now()-interval '1 hour',now()-interval '1 hour',true,'Fixture '||type,
  'Synthetic policy fixture '||type||' '||locale,now()-interval '1 hour','test-fixture-only'
from unnest(array['privacy','terms','community']) type
cross join unnest(array['ar','en','ur','hi']) locale
where not(type='privacy' and locale='ar');

create temporary table legal_test_payload as
select jsonb_agg(jsonb_build_object('id',id,'contentHash',content_hash) order by id::text) documents
from public.legal_documents where version='test-v1' and locale='ar';
grant select on legal_test_payload to authenticated;
select is(public.get_legal_consent_context('ar')->>'status','required','anonymous reader can read approved policies but has no acceptance');
select is(jsonb_array_length(public.get_legal_consent_context('ar')->'documents'),3,'all three current policies are returned');
select throws_ok($$select public.get_legal_consent_context('xx')$$,'P0001','INVALID_LOCALE','unsupported locales are rejected');
select throws_ok($$update public.legal_documents set body='changed after approval' where version='test-v1' and locale='ar'$$,
  'P0001','APPROVED_LEGAL_DOCUMENT_IMMUTABLE','approved bytes cannot be replaced under an accepted ID');
select throws_ok($$delete from public.legal_documents where version='test-v1' and locale='ar'$$,
  'P0001','APPROVED_LEGAL_DOCUMENT_IMMUTABLE','approved documents cannot be deleted through the shared trigger');

select set_config('request.jwt.claims','{"sub":"d5000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select throws_ok($$select public.accept_current_legal_documents('ar','[]','legal-empty-0001')$$,
  'P0001','INVALID_LEGAL_DOCUMENTS','missing required documents cannot be accepted');
select throws_ok($$select public.accept_current_legal_documents('ar',jsonb_set((select documents from legal_test_payload),'{0,contentHash}',to_jsonb(repeat('a',64))),'legal-stale-0001')$$,
  'P0001','LEGAL_DOCUMENTS_CHANGED','a hash different from the displayed current text is rejected');
select is(public.accept_current_legal_documents('ar',(select documents from legal_test_payload),'legal-accept-0001')->>'status',
  'accepted','customer explicitly accepts exactly the current published set');
select is(public.accept_current_legal_documents('ar',(select documents from legal_test_payload),'legal-accept-0001')->>'status',
  'accepted','identical acceptance is idempotent');
select is((select count(*) from public.legal_acceptances),3::bigint,'retry does not duplicate acceptance');
select is((select count(*) from public.privacy_events where request_type='legal_acceptance'),3::bigint,'each accepted document has one audit event');
select is((select count(*) from public.legal_acceptances where accepted_content_hash is not null),3::bigint,
  'fresh explicit acceptance upgrades legacy rows to exact reviewed byte snapshots');
select is(public.get_legal_consent_context('en')->>'status','accepted','changing UI language preserves acceptance of the same current policy version');
reset role;
select lives_ok($$select private.require_legal_consent('d5000000-0000-4000-8000-000000000001')$$,'server accepts the customer with current consent');

select set_config('request.jwt.claims','{"sub":"d5000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
select is(public.get_legal_consent_context('ar')->>'status','required','another provider does not inherit customer acceptance');
select is((select count(*) from public.legal_acceptances),0::bigint,'cross-role acceptance history remains private');
reset role;
select throws_ok($$insert into public.provider_profiles(user_id,kind,bio) values('d5000000-0000-4000-8000-000000000002','individual','unaccepted content')$$,
  'P0001','LEGAL_ACCEPTANCE_REQUIRED','provider content is gated at the database mutation');
set local role authenticated;
select is(public.accept_current_legal_documents('ar',(select documents from legal_test_payload),'legal-provider-accept')->>'status','accepted','provider accepts separately');
reset role;
insert into public.provider_profiles(user_id,kind,bio) values('d5000000-0000-4000-8000-000000000002','individual','accepted fixture content');
insert into public.provider_portfolio_items(id,provider_id,title,description,storage_path)
values('d5000000-0000-4000-8000-000000000003','d5000000-0000-4000-8000-000000000002','Fixture','Fixture','synthetic/portfolio.jpg');
update public.profiles set status='deletion_pending' where id='d5000000-0000-4000-8000-000000000002';
set local role authenticated;
select throws_ok($$update public.provider_portfolio_items set title='new content using retained JWT' where id='d5000000-0000-4000-8000-000000000003'$$,
  'P0001','ACCOUNT_NOT_ACTIVE','deletion-pending client cannot use the cleanup exemption to post new portfolio content');
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select lives_ok($$update public.provider_portfolio_items set title='Anonymized',description=null where id='d5000000-0000-4000-8000-000000000003'$$,
  'authorized server deletion cleanup remains available without renewed consent');

select set_config('request.jwt.claims','{"sub":"d5000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
-- A new current policy invalidates an older accepted version, without changing accepted bytes.
insert into public.legal_documents(document_type,version,locale,content_hash,published_at,effective_at,requires_acceptance,title,body,approved_at,approval_reference)
values('terms','test-v2','ar',encode(digest('New synthetic terms','sha256'),'hex'),now(),now(),true,'Fixture terms v2','New synthetic terms',now(),'test-fixture-only');
select is(public.get_legal_consent_context('ar')->>'status','required','new effective policy version requires fresh consent');
select throws_ok($$select private.require_legal_consent('d5000000-0000-4000-8000-000000000001')$$,
  'P0001','LEGAL_ACCEPTANCE_REQUIRED','previous acceptance cannot authorize new content after policy rotation');
set local role authenticated;
select is(public.accept_current_legal_documents('ar',(select documents from legal_test_payload),'legal-accept-0001')->>'status',
  'required','replaying old success returns current consent status rather than a stale success');
select throws_ok($$select public.accept_current_legal_documents('ar',(select documents from legal_test_payload),'legal-accept-stale-set')$$,
  'P0001','LEGAL_DOCUMENTS_CHANGED','old complete set cannot be accepted after policy rotation');
reset role;

select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
select throws_ok($$select public.assert_actor_legal_consent('d5000000-0000-4000-8000-000000000001')$$,
  'P0001','LEGAL_ACCEPTANCE_REQUIRED','AI/transcription service must enforce current user consent before an external transfer');
select is(public.get_legal_release_readiness()->>'ready','false','production preflight rejects versions not aligned across all four locales');
reset role;
update public.system_settings set value='{"enabled":false}' where key='legal.consent';
select is(public.get_legal_release_readiness()->>'ready','false','disabled enforcement can never pass production preflight');
update public.system_settings set value='{"enabled":"false"}' where key='legal.consent';
select ok(private.legal_consent_enabled(),'malformed false string cannot disable the gate');

select * from finish();
rollback;
