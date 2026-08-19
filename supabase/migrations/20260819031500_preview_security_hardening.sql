begin;

-- Safe defaults: future functions are private until a migration grants EXECUTE explicitly.
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema private revoke execute on functions from public, anon, authenticated, service_role;

-- Remove mutable search paths from trigger functions; qualify all referenced relations.
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end
$$;

create or replace function private.reject_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'APPEND_ONLY_RECORD';
end
$$;

create or replace function private.enforce_settlement_amount()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  captured bigint;
begin
  select pg_catalog.coalesce(
    pg_catalog.sum(
      case
        when event_type = 'captured' then amount_minor
        when event_type = 'refunded' then -amount_minor
        else 0
      end
    ),
    0
  )
  into captured
  from public.payment_events
  where payment_id = new.payment_id;

  if new.gross_minor > captured then
    raise exception 'SETTLEMENT_EXCEEDS_CAPTURED_AMOUNT';
  end if;
  return new;
end
$$;

-- Keep the public provider directory column-limited without granting raw-table access.
create or replace function private.provider_public_profile_rows()
returns table (
  user_id uuid,
  kind public.provider_kind,
  business_name text,
  bio text,
  preferred_brief_locale text,
  verification_status public.verification_status,
  rating_average numeric(3,2),
  rating_count integer,
  completed_jobs integer,
  response_rate numeric(5,4),
  created_at timestamp with time zone
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.user_id,
    p.kind,
    p.business_name,
    p.bio,
    p.preferred_brief_locale,
    p.verification_status,
    p.rating_average,
    p.rating_count,
    p.completed_jobs,
    p.response_rate,
    p.created_at
  from public.provider_profiles p
  join public.profiles u on u.id = p.user_id
  where p.verification_status = 'verified'::public.verification_status
    and u.status = 'active'::public.account_status
$$;

alter view public.provider_request_briefs
  set (security_invoker = true, security_barrier = true);

create or replace view public.provider_public_profiles
with (security_invoker = true, security_barrier = true)
as
select
  user_id,
  kind,
  business_name,
  bio,
  preferred_brief_locale,
  verification_status,
  rating_average::numeric(3,2) as rating_average,
  rating_count,
  completed_jobs,
  response_rate::numeric(5,4) as response_rate,
  created_at
from private.provider_public_profile_rows();

revoke all on public.provider_request_briefs from public, anon, authenticated;
grant select on public.provider_request_briefs to authenticated;
grant select on public.provider_request_briefs to service_role;

revoke all on public.provider_public_profiles from public, anon, authenticated;
grant select on public.provider_public_profiles to anon, authenticated;
grant select on public.provider_public_profiles to service_role;

-- Anonymous callers use only the reviewed projection, never the underlying profile tables.
revoke all privileges on table public.provider_profiles from anon;
revoke all privileges on table public.profiles from anon;

-- Public privacy intake is deliberately non-enumerating. Accepted attempts are audited
-- in external_privacy_requests; atomic global/per-email counters bound abuse.
create or replace function public.request_external_account_deletion(
  p_email text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := pg_catalog.lower(pg_catalog.btrim(pg_catalog.coalesce(p_email, '')));
  email_hash text;
  bounded_reason text;
  allowed boolean;
begin
  if pg_catalog.char_length(normalized_email) not between 3 and 320
     or normalized_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  then
    raise exception 'INVALID_REQUEST' using errcode = '22023';
  end if;

  email_hash := pg_catalog.encode(extensions.digest(normalized_email, 'sha256'), 'hex');
  bounded_reason := case
    when p_reason is null then null
    else pg_catalog.left(
      pg_catalog.regexp_replace(
        pg_catalog.btrim(p_reason),
        '[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+',
        '[redacted-email]',
        'gi'
      ),
      1000
    )
  end;

  allowed := public.consume_rate_limit(
    pg_catalog.encode(
      extensions.digest('external-account-deletion:global', 'sha256'),
      'hex'
    ),
    'external_account_deletion_global',
    pg_catalog.date_trunc('hour', pg_catalog.clock_timestamp()),
    100
  );
  if not allowed then
    return;
  end if;

  allowed := public.consume_rate_limit(
    pg_catalog.encode(
      extensions.digest('external-account-deletion:' || email_hash, 'sha256'),
      'hex'
    ),
    'external_account_deletion_email',
    pg_catalog.date_trunc('day', pg_catalog.clock_timestamp()),
    3
  );
  if not allowed then
    return;
  end if;

  insert into public.external_privacy_requests(email_hash, request_type, reason)
  values (
    email_hash,
    'deletion',
    bounded_reason
  );
end
$$;

comment on function public.request_external_account_deletion(text,text) is
  'Non-enumerating external deletion intake. Explicitly public, globally and per-email rate limited, and hash-only audited.';

-- The six-argument completion command predates clean rejection evidence and must not
-- remain callable beside the authoritative seven-argument command.
drop function public.accept_completion(uuid, boolean, text, integer, text, text);

-- Reset inherited/default EXECUTE and rebuild the supported API explicitly.
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;

grant execute on function public.abandon_ai_intake_session(uuid) to authenticated;
grant execute on function public.accept_completion(uuid,boolean,text,integer,text,text,uuid[]) to authenticated;
grant execute on function public.admin_marketplace_health() to authenticated;
grant execute on function public.admin_set_category(uuid,boolean,text,text) to authenticated;
grant execute on function public.admin_set_customer_status(uuid,public.account_status,text,text) to authenticated;
grant execute on function public.assign_support_case(uuid,uuid,text[],text,timestamp with time zone,text) to authenticated;
grant execute on function public.confirm_financial_action(uuid,text,text,text) to authenticated;
grant execute on function public.create_change_order(jsonb) to authenticated;
grant execute on function public.create_resource_file_upload(text,uuid,text,text,bigint) to authenticated;
grant execute on function public.create_unbound_file_upload(text,text,text,bigint) to authenticated;
grant execute on function public.decide_cancellation(uuid,boolean,bigint,text,integer,text) to authenticated;
grant execute on function public.decide_change_order(uuid,boolean,text,text) to authenticated;
grant execute on function public.end_support_case_assignment(uuid,text,text) to authenticated;
grant execute on function public.get_account_deletion_summary() to authenticated;
grant execute on function public.get_authorized_job_location(uuid,uuid,text) to authenticated;
grant execute on function public.get_authorized_job_location(uuid) to authenticated;
grant execute on function public.get_completion_proof_manifest(uuid) to authenticated;
grant execute on function public.get_customer_offers(uuid) to authenticated;
grant execute on function public.get_customer_pii(uuid,text) to authenticated;
grant execute on function public.get_data_export_manifest() to authenticated;
grant execute on function public.get_finance_review_queue() to authenticated;
grant execute on function public.get_marketplace_safe_identity(uuid,uuid) to authenticated;
grant execute on function public.get_provider_request_brief(uuid) to authenticated;
grant execute on function public.get_provider_verification_identity(uuid,text) to authenticated;
grant execute on function public.get_session_context() to authenticated;
grant execute on function public.grant_support_case_access(uuid,uuid,text,text[],text,timestamp with time zone,text) to authenticated;
grant execute on function public.link_ai_session_to_request(uuid,uuid) to authenticated;
grant execute on function public.list_customer_pii(text,text) to authenticated;
grant execute on function public.open_dispute(uuid,text,integer,text) to authenticated;
grant execute on function public.publish_service_request(jsonb) to authenticated;
grant execute on function public.reconcile_blocked_account_deletions(uuid) to authenticated;
grant execute on function public.record_job_location(uuid,uuid,double precision,double precision,numeric) to authenticated;
grant execute on function public.request_account_deletion() to authenticated;
grant execute on function public.request_data_export() to authenticated;
grant execute on function public.request_job_cancellation(uuid,text,integer,text) to authenticated;
grant execute on function public.request_service_request_cancellation(uuid,text,integer,text) to authenticated;
grant execute on function public.resolve_dispute(uuid,text,bigint,text,text,integer,text) to authenticated;
grant execute on function public.restore_active_ai_intake() to authenticated;
grant execute on function public.review_provider(uuid,public.verification_status,text,text) to authenticated;
grant execute on function public.review_provider_service(uuid,uuid,public.provider_service_review_status,text,text) to authenticated;
grant execute on function public.revoke_support_case_access(uuid,text,text) to authenticated;
grant execute on function public.select_offer(uuid,text) to authenticated;
grant execute on function public.send_message_with_attachments(uuid,text,uuid[],text) to authenticated;
grant execute on function public.set_active_role(public.user_role) to authenticated;
grant execute on function public.set_provider_restricted_qualification(uuid,uuid,uuid,boolean,text,text) to authenticated;
grant execute on function public.start_ai_intake_session(text,text) to authenticated;
grant execute on function public.start_job_location_sharing(uuid,integer,boolean) to authenticated;
grant execute on function public.stop_job_location_sharing(uuid,text) to authenticated;
grant execute on function public.submit_completion(uuid,jsonb,text) to authenticated;
grant execute on function public.submit_offer(jsonb) to authenticated;
grant execute on function public.transition_job(uuid,text,text,text) to authenticated;
grant execute on function public.upsert_provider_onboarding(jsonb) to authenticated;

grant execute on function public.request_external_account_deletion(text,text) to anon, authenticated;
grant execute on function private.provider_public_profile_rows() to anon, authenticated, service_role;
grant execute on function private.can_access_conversation(uuid) to authenticated;
grant execute on function private.can_access_job(uuid) to authenticated;
grant execute on function private.can_read_request(uuid) to authenticated;
grant execute on function private.has_admin_permission(text) to authenticated;
grant execute on function private.has_cancellation_financial_access(uuid) to authenticated;
grant execute on function private.has_linked_support_job_access(uuid,text) to authenticated;
grant execute on function private.has_linked_support_request_access(uuid,text) to authenticated;
grant execute on function private.has_role(public.user_role[]) to authenticated;
grant execute on function private.has_support_case_access(uuid,text) to authenticated;
grant execute on function private.has_support_subject_access(uuid) to authenticated;
grant execute on function private.is_admin() to authenticated;

-- Internal compatibility/export helpers remain service-only.
revoke execute on function public.get_data_export_manifest_v3() from public, anon, authenticated;
revoke execute on function public.get_data_export_query_coverage_v3() from public, anon, authenticated;
revoke execute on function public.upsert_provider_onboarding_without_final_diff(jsonb) from public, anon, authenticated;

-- RLS-without-policy tables are server internals: remove direct client DML/DDL grants.
revoke all privileges on table public."account_reauthentications" from public, anon, authenticated;
revoke all privileges on table public."admin_permissions" from public, anon, authenticated;
revoke all privileges on table public."admin_role_assignments" from public, anon, authenticated;
revoke all privileges on table public."admin_role_permissions" from public, anon, authenticated;
revoke all privileges on table public."admin_roles" from public, anon, authenticated;
revoke all privileges on table public."ai_prompt_versions" from public, anon, authenticated;
revoke all privileges on table public."ai_rate_limit_events" from public, anon, authenticated;
revoke all privileges on table public."data_export_table_classifications" from public, anon, authenticated;
revoke all privileges on table public."dead_letter_events" from public, anon, authenticated;
revoke all privileges on table public."external_privacy_requests" from public, anon, authenticated;
revoke all privileges on table public."feature_flags" from public, anon, authenticated;
revoke all privileges on table public."idempotency_keys" from public, anon, authenticated;
revoke all privileges on table public."moderation_actions" from public, anon, authenticated;
revoke all privileges on table public."notification_templates" from public, anon, authenticated;
revoke all privileges on table public."payment_attempts" from public, anon, authenticated;
revoke all privileges on table public."payment_events" from public, anon, authenticated;
revoke all privileges on table public."platform_fees" from public, anon, authenticated;
revoke all privileges on table public."rate_limit_buckets" from public, anon, authenticated;
revoke all privileges on table public."scheduled_jobs" from public, anon, authenticated;
revoke all privileges on table public."settlement_events" from public, anon, authenticated;
revoke all privileges on table public."system_incidents" from public, anon, authenticated;
revoke all privileges on table public."system_settings" from public, anon, authenticated;
revoke all privileges on table public."translation_jobs" from public, anon, authenticated;
revoke all privileges on table public."webhook_events" from public, anon, authenticated;

-- Cache auth.uid() once per statement in every affected public RLS policy.
alter policy "deletion_owner_read" on "public"."account_deletion_requests" to public
  using (((user_id = (select auth.uid())) OR private.has_admin_permission('customer.pii.read'::text)));

alter policy "addresses_authorized_read" on "public"."addresses" to public
  using (((user_id = (select auth.uid())) OR (EXISTS ( SELECT 1
   FROM jobs j
  WHERE ((j.exact_address_id = addresses.id) AND (j.provider_id = (select auth.uid())) AND (j.status <> ALL (ARRAY['completed'::job_status, 'cancelled'::job_status])))))));

alter policy "addresses_owner_write" on "public"."addresses" to public
  using ((user_id = (select auth.uid())))
  with check ((user_id = (select auth.uid())));

alter policy "ai_diagnostics_owner" on "public"."ai_diagnostics" to public
  using ((EXISTS ( SELECT 1
   FROM ai_sessions s
  WHERE ((s.id = ai_diagnostics.session_id) AND (s.user_id = (select auth.uid()))))));

alter policy "ai_message_media_owner_read" on "public"."ai_message_media" to "authenticated"
  using ((EXISTS ( SELECT 1
   FROM (ai_messages m
     JOIN ai_sessions s ON ((s.id = m.session_id)))
  WHERE ((m.id = ai_message_media.message_id) AND (s.user_id = (select auth.uid()))))));

alter policy "ai_messages_owner" on "public"."ai_messages" to public
  using ((EXISTS ( SELECT 1
   FROM ai_sessions s
  WHERE ((s.id = ai_messages.session_id) AND (s.user_id = (select auth.uid()))))));

alter policy "ai_sessions_owner" on "public"."ai_sessions" to public
  using ((user_id = (select auth.uid())));

alter policy "ai_usage_owner" on "public"."ai_usage_events" to public
  using ((user_id = (select auth.uid())));

alter policy "blocks_owner_all" on "public"."blocked_users" to public
  using ((blocker_id = (select auth.uid())))
  with check ((blocker_id = (select auth.uid())));

alter policy "cancellation_decisions_participants_read" on "public"."cancellation_decisions" to public
  using ((EXISTS ( SELECT 1
   FROM cancellation_requests c
  WHERE ((c.id = cancellation_decisions.cancellation_request_id) AND ((c.requester_id = (select auth.uid())) OR ((c.job_id IS NOT NULL) AND private.can_access_job(c.job_id)) OR ((c.request_id IS NOT NULL) AND private.has_linked_support_request_access(c.request_id, 'read'::text)) OR private.has_cancellation_financial_access(c.id) OR private.has_admin_permission('operations.marketplace.read'::text))))));

alter policy "cancellations_participants" on "public"."cancellation_requests" to public
  using (((requester_id = (select auth.uid())) OR ((job_id IS NOT NULL) AND private.can_access_job(job_id)) OR ((request_id IS NOT NULL) AND private.has_linked_support_request_access(request_id, 'read'::text)) OR private.has_cancellation_financial_access(id) OR private.has_admin_permission('operations.marketplace.read'::text)));

alter policy "customer_acceptance_evidence_participants_read" on "public"."customer_acceptance_evidence" to "authenticated"
  using ((EXISTS ( SELECT 1
   FROM (customer_acceptances a
     JOIN jobs j ON ((j.id = a.job_id)))
  WHERE ((a.id = customer_acceptance_evidence.acceptance_id) AND (((select auth.uid()) = j.customer_id) OR ((select auth.uid()) = j.provider_id))))));

alter policy "export_owner_read" on "public"."data_export_requests" to public
  using (((user_id = (select auth.uid())) OR private.has_admin_permission('customer.pii.read'::text)));

alter policy "disputes_participants" on "public"."disputes" to public
  using (((opened_by = (select auth.uid())) OR private.can_access_job(job_id)));

alter policy "file_upload_owner_read" on "public"."file_uploads" to public
  using ((user_id = (select auth.uid())));

alter policy "financial_action_participants_read" on "public"."financial_action_intents" to "authenticated"
  using ((private.has_role(ARRAY['finance_reviewer'::user_role, 'super_admin'::user_role]) OR ((source_type = 'cancellation'::text) AND (EXISTS ( SELECT 1
   FROM cancellation_requests c
  WHERE ((c.id = financial_action_intents.source_id) AND ((c.requester_id = (select auth.uid())) OR ((c.job_id IS NOT NULL) AND private.can_access_job(c.job_id))))))) OR ((source_type = 'dispute'::text) AND (EXISTS ( SELECT 1
   FROM disputes d
  WHERE ((d.id = financial_action_intents.source_id) AND private.can_access_job(d.job_id)))))));

alter policy "location_sessions_participants_read" on "public"."job_location_sharing_sessions" to "authenticated"
  using (((EXISTS ( SELECT 1
   FROM jobs j
  WHERE ((j.id = job_location_sharing_sessions.job_id) AND (((select auth.uid()) = j.customer_id) OR ((select auth.uid()) = j.provider_id))))) OR private.has_admin_permission('job.exact_location.read'::text)));

alter policy "job_location_participants" on "public"."job_location_updates" to public
  using (((expires_at > now()) AND (EXISTS ( SELECT 1
   FROM jobs j
  WHERE ((j.id = job_location_updates.job_id) AND (((select auth.uid()) = j.customer_id) OR ((select auth.uid()) = j.provider_id)))))));

alter policy "job_notes_participants" on "public"."job_notes" to public
  using (((author_id = (select auth.uid())) OR ((visibility = 'participants'::text) AND ((EXISTS ( SELECT 1
   FROM jobs j
  WHERE ((j.id = job_notes.job_id) AND (((select auth.uid()) = j.customer_id) OR ((select auth.uid()) = j.provider_id))))) OR private.has_linked_support_job_access(job_id, 'read'::text) OR private.has_admin_permission('operations.marketplace.read'::text))) OR private.has_linked_support_job_access(job_id, 'internal_note'::text) OR private.has_admin_permission('operations.marketplace.read'::text)));

alter policy "legal_acceptances_insert" on "public"."legal_acceptances" to public
  with check ((user_id = (select auth.uid())));

alter policy "legal_acceptances_owner" on "public"."legal_acceptances" to public
  using (((user_id = (select auth.uid())) OR private.has_admin_permission('customer.pii.read'::text)));

alter policy "matching_candidates_provider_staff" on "public"."matching_candidates" to public
  using (((provider_id = (select auth.uid())) OR (EXISTS ( SELECT 1
   FROM matching_runs mr
  WHERE ((mr.id = matching_candidates.matching_run_id) AND private.has_linked_support_request_access(mr.request_id, 'read'::text)))) OR private.has_admin_permission('operations.marketplace.read'::text)));

alter policy "message_delivery_members" on "public"."message_delivery_events" to public
  using (((user_id = (select auth.uid())) OR private.has_admin_permission('operations.notifications.read'::text)));

alter policy "moderation_reporter_staff" on "public"."message_moderation_events" to public
  using (((reporter_id = (select auth.uid())) OR (EXISTS ( SELECT 1
   FROM (messages m
     JOIN conversations c ON ((c.id = m.conversation_id)))
  WHERE ((m.id = message_moderation_events.message_id) AND (c.job_id IS NOT NULL) AND private.has_linked_support_job_access(c.job_id, 'read'::text)))) OR private.has_admin_permission('operations.marketplace.read'::text)));

alter policy "message_receipts_members" on "public"."message_read_receipts" to public
  using ((user_id = (select auth.uid())))
  with check ((user_id = (select auth.uid())));

alter policy "messages_members_insert" on "public"."messages" to public
  with check (((sender_id = (select auth.uid())) AND private.can_access_conversation(conversation_id)));

alter policy "notification_owner" on "public"."notification_outbox" to public
  using (((user_id = (select auth.uid())) OR private.has_admin_permission('operations.notifications.read'::text)));

alter policy "notification_preferences_self_all" on "public"."notification_preferences" to public
  using ((user_id = (select auth.uid())))
  with check ((user_id = (select auth.uid())));

alter policy "offer_revisions_sealed" on "public"."offer_revisions" to public
  using ((EXISTS ( SELECT 1
   FROM offers o
  WHERE ((o.id = offer_revisions.offer_id) AND ((o.provider_id = (select auth.uid())) OR (EXISTS ( SELECT 1
           FROM service_requests r
          WHERE ((r.id = o.request_id) AND (r.customer_id = (select auth.uid()))))) OR private.has_linked_support_request_access(o.request_id, 'read'::text) OR private.has_admin_permission('operations.marketplace.read'::text))))));

alter policy "offer_history_sealed" on "public"."offer_status_history" to public
  using ((EXISTS ( SELECT 1
   FROM offers o
  WHERE ((o.id = offer_status_history.offer_id) AND ((o.provider_id = (select auth.uid())) OR (EXISTS ( SELECT 1
           FROM service_requests r
          WHERE ((r.id = o.request_id) AND (r.customer_id = (select auth.uid()))))) OR private.has_linked_support_request_access(o.request_id, 'read'::text) OR private.has_admin_permission('operations.marketplace.read'::text))))));

alter policy "offer_withdrawals_owner" on "public"."offer_withdrawals" to public
  using (((provider_id = (select auth.uid())) OR (EXISTS ( SELECT 1
   FROM offers o
  WHERE ((o.id = offer_withdrawals.offer_id) AND private.has_linked_support_request_access(o.request_id, 'read'::text)))) OR private.has_admin_permission('operations.marketplace.read'::text)));

alter policy "offers_sealed" on "public"."offers" to public
  using (((provider_id = (select auth.uid())) OR (EXISTS ( SELECT 1
   FROM service_requests r
  WHERE ((r.id = offers.request_id) AND (r.customer_id = (select auth.uid()))))) OR private.has_linked_support_request_access(request_id, 'read'::text) OR private.has_admin_permission('operations.marketplace.read'::text)));

alter policy "payments_participants" on "public"."payments" to "authenticated"
  using (((customer_id = (select auth.uid())) OR (provider_id = (select auth.uid())) OR private.has_role(ARRAY['super_admin'::user_role])));

alter policy "privacy_events_owner_read" on "public"."privacy_events" to public
  using (((user_id = (select auth.uid())) OR private.has_admin_permission('customer.pii.read'::text)));

alter policy "profiles_self_read" on "public"."profiles" to "authenticated"
  using ((id = (select auth.uid())));

alter policy "profiles_self_update" on "public"."profiles" to public
  using ((id = (select auth.uid())))
  with check (((id = (select auth.uid())) AND (status = 'active'::account_status)));

alter policy "provider_availability_owner" on "public"."provider_availability" to public
  using ((provider_id = (select auth.uid())))
  with check ((provider_id = (select auth.uid())));

alter policy "provider_blackouts_owner" on "public"."provider_blackout_periods" to public
  using ((provider_id = (select auth.uid())))
  with check ((provider_id = (select auth.uid())));

alter policy "provider_document_reviews_staff" on "public"."provider_document_reviews" to public
  using (((reviewer_id = (select auth.uid())) OR (EXISTS ( SELECT 1
   FROM provider_documents d
  WHERE ((d.id = provider_document_reviews.document_id) AND (d.provider_id = (select auth.uid()))))) OR private.has_role(ARRAY['verification_reviewer'::user_role, 'super_admin'::user_role])));

alter policy "provider_documents_owner_insert" on "public"."provider_documents" to public
  with check ((provider_id = (select auth.uid())));

alter policy "provider_documents_private" on "public"."provider_documents" to public
  using (((provider_id = (select auth.uid())) OR private.has_role(ARRAY['verification_reviewer'::user_role, 'super_admin'::user_role])));

alter policy "provider_payout_private" on "public"."provider_payout_accounts" to public
  using (((provider_id = (select auth.uid())) OR private.has_role(ARRAY['finance_reviewer'::user_role, 'super_admin'::user_role])));

alter policy "provider_performance_read" on "public"."provider_performance_snapshots" to public
  using (((provider_id = (select auth.uid())) OR private.has_support_subject_access(provider_id) OR private.has_admin_permission('operations.marketplace.read'::text)));

alter policy "provider_portfolio_owner" on "public"."provider_portfolio_items" to public
  using ((provider_id = (select auth.uid())))
  with check ((provider_id = (select auth.uid())));

alter policy "provider_profile_owner_update" on "public"."provider_profiles" to public
  using ((user_id = (select auth.uid())))
  with check ((user_id = (select auth.uid())));

alter policy "provider_profile_private" on "public"."provider_profiles" to public
  using (((user_id = (select auth.uid())) OR private.has_support_subject_access(user_id) OR private.has_admin_permission('operations.marketplace.read'::text) OR private.has_admin_permission('provider.document.read'::text)));

alter policy "provider_qualification_events_owner_or_reviewer_read" on "public"."provider_qualification_events" to "authenticated"
  using (((provider_id = (select auth.uid())) OR private.has_role(ARRAY['verification_reviewer'::user_role, 'super_admin'::user_role])));

alter policy "provider_qualifications_owner_or_reviewer_read" on "public"."provider_restricted_qualifications" to "authenticated"
  using (((provider_id = (select auth.uid())) OR private.has_role(ARRAY['verification_reviewer'::user_role, 'super_admin'::user_role])));

alter policy "provider_areas_owner" on "public"."provider_service_areas" to public
  using ((provider_id = (select auth.uid())))
  with check ((provider_id = (select auth.uid())));

alter policy "provider_services_owner_read" on "public"."provider_services" to public
  using (((provider_id = (select auth.uid())) OR private.has_support_subject_access(provider_id) OR private.has_admin_permission('operations.marketplace.read'::text) OR private.has_admin_permission('provider.document.read'::text)));

alter policy "provider_services_owner_write" on "public"."provider_services" to public
  using ((provider_id = (select auth.uid())))
  with check ((provider_id = (select auth.uid())));

alter policy "settlements_provider_finance" on "public"."provider_settlements" to "authenticated"
  using (((provider_id = (select auth.uid())) OR private.has_role(ARRAY['super_admin'::user_role])));

alter policy "provider_status_history_read" on "public"."provider_status_history" to public
  using (((provider_id = (select auth.uid())) OR private.has_support_subject_access(provider_id) OR private.has_admin_permission('operations.marketplace.read'::text) OR private.has_admin_permission('provider.document.read'::text)));

alter policy "provider_suspensions_read" on "public"."provider_suspensions" to public
  using (((provider_id = (select auth.uid())) OR private.has_support_subject_access(provider_id) OR private.has_admin_permission('operations.marketplace.read'::text) OR private.has_admin_permission('provider.document.read'::text)));

alter policy "push_owner_all" on "public"."push_tokens" to public
  using ((user_id = (select auth.uid())))
  with check ((user_id = (select auth.uid())));

alter policy "rating_replies_read" on "public"."rating_replies" to public
  using (((moderation_status = 'published'::text) OR (provider_id = (select auth.uid())) OR private.has_admin_permission('operations.marketplace.read'::text)));

alter policy "ratings_participants" on "public"."ratings" to public
  using (((provider_id = (select auth.uid())) OR (customer_id = (select auth.uid())) OR (moderation_status = 'published'::text) OR private.has_admin_permission('operations.marketplace.read'::text)));

alter policy "receipts_participants" on "public"."receipts" to "authenticated"
  using (((EXISTS ( SELECT 1
   FROM payments p
  WHERE ((p.id = receipts.payment_id) AND (((select auth.uid()) = p.customer_id) OR ((select auth.uid()) = p.provider_id))))) OR private.has_role(ARRAY['super_admin'::user_role])));

alter policy "refunds_customer_finance" on "public"."refunds" to "authenticated"
  using (((EXISTS ( SELECT 1
   FROM payments p
  WHERE ((p.id = refunds.payment_id) AND (((select auth.uid()) = p.customer_id) OR ((select auth.uid()) = p.provider_id))))) OR private.has_role(ARRAY['super_admin'::user_role])));

alter policy "matches_parties" on "public"."request_provider_matches" to public
  using (((provider_id = (select auth.uid())) OR private.can_read_request(request_id)));

alter policy "support_grants_scoped_read" on "public"."support_case_access_grants" to public
  using (((user_id = (select auth.uid())) OR private.has_support_case_access(case_id, 'read'::text) OR private.has_admin_permission('operations.marketplace.read'::text)));

alter policy "support_assignments_scoped_read" on "public"."support_case_assignments" to public
  using (((assignee_id = (select auth.uid())) OR private.has_support_case_access(case_id, 'read'::text) OR private.has_admin_permission('operations.marketplace.read'::text)));

alter policy "support_evidence_participants" on "public"."support_case_evidence" to public
  using (((EXISTS ( SELECT 1
   FROM support_cases c
  WHERE ((c.id = support_case_evidence.case_id) AND (c.opened_by = (select auth.uid()))))) OR private.has_support_case_access(case_id, 'evidence'::text) OR private.has_admin_permission('operations.marketplace.read'::text)));

alter policy "support_messages_insert" on "public"."support_case_messages" to public
  with check (((sender_id = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM support_cases c
  WHERE ((c.id = support_case_messages.case_id) AND (c.opened_by = (select auth.uid())))))));

alter policy "support_messages_participants" on "public"."support_case_messages" to public
  using (((visible_to_user AND (EXISTS ( SELECT 1
   FROM support_cases c
  WHERE ((c.id = support_case_messages.case_id) AND (c.opened_by = (select auth.uid())))))) OR private.has_support_case_access(case_id, 'read'::text) OR private.has_admin_permission('operations.marketplace.read'::text)));

alter policy "support_cases_open" on "public"."support_cases" to public
  with check ((opened_by = (select auth.uid())));

alter policy "support_cases_participants" on "public"."support_cases" to public
  using (((opened_by = (select auth.uid())) OR private.has_support_case_access(id, 'read'::text) OR private.has_admin_permission('operations.marketplace.read'::text)));

alter policy "transcription_owner" on "public"."transcription_jobs" to public
  using ((user_id = (select auth.uid())));

alter policy "upload_events_owner_read" on "public"."upload_security_events" to public
  using ((user_id = (select auth.uid())));

alter policy "devices_owner_all" on "public"."user_devices" to public
  using ((user_id = (select auth.uid())))
  with check ((user_id = (select auth.uid())));

alter policy "preferences_self_all" on "public"."user_preferences" to public
  using ((user_id = (select auth.uid())))
  with check ((user_id = (select auth.uid())));

alter policy "roles_self_read" on "public"."user_roles" to public
  using (((user_id = (select auth.uid())) OR private.has_admin_permission('operations.marketplace.read'::text)));

commit;
