begin;
select plan(15);

select has_column('public','service_requests','timing_mode','requests persist authoritative timing mode');
select col_type_is('public','service_requests','timing_mode','request_timing_mode','timing mode uses the constrained enum');
select is((select enum_range(null::public.request_timing_mode)::text),'{asap,scheduled,flexible}','timing values are exact');
select has_column('public','provider_services','review_status','services persist reviewer-owned state');
select is((select enum_range(null::public.provider_service_review_status)::text),
  '{draft,submitted,approved,more_information_required,rejected,suspended}',
  'provider service review states are exact');

select ok(pg_get_functiondef('private.apply_dispute_job_outcome(uuid,uuid,text,text)'::regprocedure) like '%when ''provider_selected'' then ''provider_selected''::public.job_status%','provider-selected disputes restore provider-selected');
select ok(pg_get_functiondef('private.apply_dispute_job_outcome(uuid,uuid,text,text)'::regprocedure) like '%when ''scheduled'' then ''scheduled''::public.job_status%','scheduled disputes restore scheduled');
select ok(pg_get_functiondef('private.apply_dispute_job_outcome(uuid,uuid,text,text)'::regprocedure) like '%when ''en_route'' then ''scheduled''::public.job_status%','en-route disputes use the documented safe scheduled policy');
select ok(pg_get_functiondef('private.apply_dispute_job_outcome(uuid,uuid,text,text)'::regprocedure) like '%when ''arrived'' then ''arrived''::public.job_status%','arrived disputes restore arrived');
select ok(pg_get_functiondef('private.apply_dispute_job_outcome(uuid,uuid,text,text)'::regprocedure) like '%when ''diagnosing'' then ''diagnosing''::public.job_status%','diagnosing disputes restore diagnosing');
select ok(pg_get_functiondef('private.apply_dispute_job_outcome(uuid,uuid,text,text)'::regprocedure) like '%when ''awaiting_change_order_approval'' then ''diagnosing''::public.job_status%','change-order disputes safely restore diagnosing');
select ok(pg_get_functiondef('private.apply_dispute_job_outcome(uuid,uuid,text,text)'::regprocedure) like '%dispute.completion_attempt_id is not null then resume_state:=''in_progress''%','completion rejection resumes into rework');
select ok(pg_get_functiondef('private.apply_dispute_job_outcome(uuid,uuid,text,text)'::regprocedure) like '%else null end;%INVALID_DISPUTE_RESUME_STATE%','completed and other invalid pre-states reject ordinary resume');

select ok('privacy_reviewer'=any(enum_range(null::public.user_role)::text[]),'database role contract includes privacy reviewer');
select ok(pg_get_functiondef('public.upsert_provider_onboarding(jsonb)'::regprocedure)
  like '%provider_service_removed%','onboarding final diff scopes service-removal invalidation');

select * from finish();
rollback;
