begin;

-- Least-privilege DML for authenticated Edge handlers. The service role is
-- server-only and bypasses RLS, so every handler must authorize its resource.
grant select on public.request_provider_matches,public.provider_profiles,public.service_requests,
  public.request_safety_flags,public.service_categories,public.service_category_translations,
  public.cities,public.request_translations,public.translation_jobs to service_role;
grant insert,update on public.request_translations,public.translation_jobs to service_role;
grant update(brief_translation_id,viewed_at) on public.request_provider_matches to service_role;
grant insert on public.ai_usage_events,public.transcription_jobs to service_role;
grant select,update on public.notification_outbox to service_role;

commit;
