begin;

create table public.ai_prompt_versions (
  id uuid primary key default gen_random_uuid(), purpose text not null, version text not null, schema_version text not null,
  system_prompt_hash text not null, enabled boolean not null default false, created_at timestamptz not null default now(), unique(purpose,version)
);
create table public.ai_sessions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id), request_id uuid references public.service_requests(id),
  purpose text not null, status text not null default 'active', locale text not null, provider text, model text, prompt_version_id uuid references public.ai_prompt_versions(id),
  created_at timestamptz not null default now(), ended_at timestamptz
);
create table public.ai_messages (
  id uuid primary key default gen_random_uuid(), session_id uuid not null references public.ai_sessions(id) on delete cascade, actor text not null check(actor in ('user','assistant','system')),
  original_content text not null, redacted_content text, sequence_number integer not null, created_at timestamptz not null default now(), unique(session_id,sequence_number)
);
create table public.ai_diagnostics (
  id uuid primary key default gen_random_uuid(), session_id uuid not null references public.ai_sessions(id), request_id uuid references public.service_requests(id),
  schema_version text not null, provider text not null, model text not null, prompt_version text not null, structured_output jsonb not null,
  customer_edited_output jsonb, fallback_source text, latency_ms integer, error_category text, created_at timestamptz not null default now()
);
create table public.ai_usage_events (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id), session_id uuid references public.ai_sessions(id),
  provider text not null, model text not null, operation text not null, input_units integer not null default 0, output_units integer not null default 0,
  estimated_cost_minor integer not null default 0, latency_ms integer, success boolean not null, error_category text, created_at timestamptz not null default now()
);
create index ai_usage_budget_idx on public.ai_usage_events(user_id,created_at desc);
create table public.ai_rate_limit_events (
  id uuid primary key default gen_random_uuid(), user_id uuid references public.profiles(id), ip_hash text, operation text not null,
  limit_name text not null, observed_count integer not null, window_started_at timestamptz not null, created_at timestamptz not null default now()
);
create table public.translation_jobs (
  id uuid primary key default gen_random_uuid(), source_hash text not null, source_locale text not null, target_locale text not null, provider text,
  model text, model_version text, status text not null default 'pending', attempts integer not null default 0, error_category text, created_at timestamptz not null default now(), completed_at timestamptz,
  unique(source_hash,source_locale,target_locale,model_version)
);
create table public.request_translations (
  id uuid primary key default gen_random_uuid(), request_id uuid not null references public.service_requests(id) on delete cascade, translation_job_id uuid references public.translation_jobs(id),
  source_locale text not null, target_locale text not null, original_content jsonb not null, translated_content jsonb, status text not null default 'pending',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(request_id,target_locale)
);
create table public.transcription_jobs (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id), request_id uuid references public.service_requests(id),
  private_audio_path text not null, source_locale text, provider text, model text, status text not null default 'pending', transcript text,
  customer_edited_transcript text, expires_at timestamptz, error_category text, created_at timestamptz not null default now(), completed_at timestamptz
);

create table public.matching_runs (
  id uuid primary key default gen_random_uuid(), request_id uuid not null references public.service_requests(id), configuration_version text not null,
  weights jsonb not null, status text not null default 'running', candidate_count integer not null default 0, created_at timestamptz not null default now(), completed_at timestamptz
);
create table public.matching_candidates (
  id uuid primary key default gen_random_uuid(), matching_run_id uuid not null references public.matching_runs(id) on delete cascade,
  provider_id uuid not null references public.provider_profiles(user_id), eligible boolean not null, score numeric(9,6), score_components jsonb not null default '{}'::jsonb,
  exclusion_reason text, created_at timestamptz not null default now(), unique(matching_run_id,provider_id)
);
create index matching_candidates_rank_idx on public.matching_candidates(matching_run_id,score desc) where eligible;
create table public.request_provider_matches (
  id uuid primary key default gen_random_uuid(), request_id uuid not null references public.service_requests(id), provider_id uuid not null references public.provider_profiles(user_id),
  matching_run_id uuid not null references public.matching_runs(id), score numeric(9,6) not null, status text not null default 'invited',
  brief_translation_id uuid references public.request_translations(id), notified_at timestamptz, viewed_at timestamptz, expires_at timestamptz,
  created_at timestamptz not null default now(), unique(request_id,provider_id)
);
create index provider_matches_feed_idx on public.request_provider_matches(provider_id,status,created_at desc);

create table public.offers (
  id uuid primary key default gen_random_uuid(), request_id uuid not null references public.service_requests(id), provider_id uuid not null references public.provider_profiles(user_id),
  total_amount_minor bigint not null check(total_amount_minor between 0 and 100000000), visit_fee_minor bigint not null default 0 check(visit_fee_minor>=0),
  labor_amount_minor bigint check(labor_amount_minor>=0), materials_included boolean not null, materials_estimate_minor bigint check(materials_estimate_minor>=0),
  currency text not null default 'SAR' check(currency='SAR'), estimated_arrival_minutes integer not null check(estimated_arrival_minutes between 5 and 10080),
  estimated_duration_minutes integer not null check(estimated_duration_minutes between 15 and 43200), warranty_days integer not null default 0 check(warranty_days between 0 and 3650),
  provider_note text not null default '', expires_at timestamptz not null, status public.offer_status not null default 'active', version integer not null default 1,
  idempotency_key text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(provider_id,request_id), unique(provider_id,idempotency_key)
);
create index offers_customer_compare_idx on public.offers(request_id,status,total_amount_minor) where status='active';
create table public.offer_revisions (
  id uuid primary key default gen_random_uuid(), offer_id uuid not null references public.offers(id), revision integer not null, snapshot jsonb not null,
  actor_id uuid not null references public.profiles(id), reason text not null, created_at timestamptz not null default now(), unique(offer_id,revision)
);
create table public.offer_status_history (
  id uuid primary key default gen_random_uuid(), offer_id uuid not null references public.offers(id), actor_id uuid references public.profiles(id),
  previous_status public.offer_status, new_status public.offer_status not null, reason text, created_at timestamptz not null default now()
);
create table public.offer_withdrawals (
  id uuid primary key default gen_random_uuid(), offer_id uuid not null references public.offers(id), provider_id uuid not null references public.provider_profiles(user_id),
  reason text not null, created_at timestamptz not null default now()
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(), request_id uuid not null unique references public.service_requests(id), selected_offer_id uuid not null unique references public.offers(id),
  customer_id uuid not null references public.profiles(id), provider_id uuid not null references public.provider_profiles(user_id), exact_address_id uuid not null references public.addresses(id),
  status public.job_status not null default 'provider_selected', scheduled_start timestamptz, scheduled_end timestamptz,
  approved_total_minor bigint not null check(approved_total_minor>=0), currency text not null default 'SAR' check(currency='SAR'),
  version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), completed_at timestamptz
);
create index jobs_customer_idx on public.jobs(customer_id,status,created_at desc);
create index jobs_provider_idx on public.jobs(provider_id,status,created_at desc);
create table public.job_status_history (
  id uuid primary key default gen_random_uuid(), job_id uuid not null references public.jobs(id), actor_id uuid not null references public.profiles(id),
  previous_status public.job_status, new_status public.job_status not null, reason text not null, idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), unique(job_id,idempotency_key)
);
create table public.job_events (
  id uuid primary key default gen_random_uuid(), job_id uuid not null references public.jobs(id), event_type text not null, actor_id uuid references public.profiles(id),
  payload_version text not null default '1', payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table public.job_assignments (
  id uuid primary key default gen_random_uuid(), job_id uuid not null references public.jobs(id), provider_id uuid not null references public.provider_profiles(user_id),
  assigned_at timestamptz not null default now(), ended_at timestamptz, reason text
);
create table public.job_location_updates (
  id uuid primary key default gen_random_uuid(), job_id uuid not null references public.jobs(id), provider_id uuid not null references public.provider_profiles(user_id),
  location extensions.geography(point,4326) not null, accuracy_m numeric(8,2), captured_at timestamptz not null, expires_at timestamptz not null,
  sharing_consent_at timestamptz not null, created_at timestamptz not null default now(), check(expires_at>captured_at)
);
create index job_location_updates_gix on public.job_location_updates using gist(location);
create index job_location_expiry_idx on public.job_location_updates(expires_at);
create table public.job_checklists (
  id uuid primary key default gen_random_uuid(), job_id uuid not null references public.jobs(id), item_key text not null, label_snapshot text not null,
  required boolean not null default false, completed_by uuid references public.profiles(id), completed_at timestamptz, unique(job_id,item_key)
);
create table public.job_notes (
  id uuid primary key default gen_random_uuid(), job_id uuid not null references public.jobs(id), author_id uuid not null references public.profiles(id),
  body text not null, visibility text not null check(visibility in ('participants','provider','operations')), created_at timestamptz not null default now(), deleted_at timestamptz
);
create table public.change_orders (
  id uuid primary key default gen_random_uuid(), job_id uuid not null references public.jobs(id), provider_id uuid not null references public.provider_profiles(user_id),
  reason text not null, description text not null, added_amount_minor bigint not null check(added_amount_minor>=0), revised_total_minor bigint not null check(revised_total_minor>=0),
  currency text not null default 'SAR', status public.change_order_status not null default 'pending', expires_at timestamptz not null,
  customer_decision_at timestamptz, customer_id uuid references public.profiles(id), version integer not null default 1, idempotency_key text not null,
  created_at timestamptz not null default now(), unique(provider_id,idempotency_key)
);
create table public.change_order_items (
  id uuid primary key default gen_random_uuid(), change_order_id uuid not null references public.change_orders(id) on delete cascade,
  description text not null, quantity numeric(10,3) not null check(quantity>0), unit_amount_minor bigint not null check(unit_amount_minor>=0),
  total_amount_minor bigint generated always as ((quantity*unit_amount_minor)::bigint) stored
);
create table public.completion_proofs (
  id uuid primary key default gen_random_uuid(), job_id uuid not null references public.jobs(id), provider_id uuid not null references public.provider_profiles(user_id),
  storage_path text not null, mime_type text not null, size_bytes bigint not null check(size_bytes between 1 and 20971520), description text,
  captured_at timestamptz, created_at timestamptz not null default now()
);
create table public.customer_acceptances (
  id uuid primary key default gen_random_uuid(), job_id uuid not null unique references public.jobs(id), customer_id uuid not null references public.profiles(id),
  accepted boolean not null, reason text, accepted_total_minor bigint not null check(accepted_total_minor>=0), created_at timestamptz not null default now()
);
create table public.ratings (
  id uuid primary key default gen_random_uuid(), job_id uuid not null unique references public.jobs(id), customer_id uuid not null references public.profiles(id),
  provider_id uuid not null references public.provider_profiles(user_id), score smallint not null check(score between 1 and 5), review text,
  moderation_status text not null default 'published', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.rating_replies (
  id uuid primary key default gen_random_uuid(), rating_id uuid not null unique references public.ratings(id), provider_id uuid not null references public.provider_profiles(user_id),
  reply text not null, moderation_status text not null default 'published', created_at timestamptz not null default now()
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(), job_id uuid not null unique references public.jobs(id), status text not null default 'active', created_at timestamptz not null default now(), closed_at timestamptz
);
create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade, user_id uuid not null references public.profiles(id),
  member_role text not null, joined_at timestamptz not null default now(), left_at timestamptz, support_access_reason text, primary key(conversation_id,user_id)
);
create table public.messages (
  id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.conversations(id) on delete cascade, sender_id uuid not null references public.profiles(id),
  body text not null check(char_length(body) between 1 and 4000), client_message_id text, created_at timestamptz not null default now(), edited_at timestamptz, deleted_at timestamptz,
  unique(sender_id,client_message_id)
);
create index messages_page_idx on public.messages(conversation_id,created_at desc,id desc);
create table public.message_attachments (
  id uuid primary key default gen_random_uuid(), message_id uuid not null references public.messages(id) on delete cascade, uploader_id uuid not null references public.profiles(id),
  storage_path text not null, mime_type text not null, size_bytes bigint not null check(size_bytes between 1 and 20971520), created_at timestamptz not null default now()
);
create table public.message_delivery_events (
  id uuid primary key default gen_random_uuid(), message_id uuid not null references public.messages(id) on delete cascade, user_id uuid not null references public.profiles(id),
  status text not null, created_at timestamptz not null default now()
);
create table public.message_read_receipts (
  message_id uuid not null references public.messages(id) on delete cascade, user_id uuid not null references public.profiles(id), read_at timestamptz not null default now(), primary key(message_id,user_id)
);
create table public.message_translations (
  id uuid primary key default gen_random_uuid(), message_id uuid not null references public.messages(id) on delete cascade, translation_job_id uuid references public.translation_jobs(id),
  source_locale text not null, target_locale text not null, original_text text not null, translated_text text, status text not null default 'pending',
  created_at timestamptz not null default now(), unique(message_id,target_locale)
);
create table public.message_moderation_events (
  id uuid primary key default gen_random_uuid(), message_id uuid not null references public.messages(id), reporter_id uuid references public.profiles(id),
  action text not null, reason text not null, actor_id uuid references public.profiles(id), created_at timestamptz not null default now()
);

commit;
