begin;

create schema if not exists private;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists postgis with schema extensions;
create extension if not exists pgtap with schema extensions;

create type public.user_role as enum ('customer','provider','operations_admin','verification_reviewer','support_agent','finance_reviewer','analyst','super_admin');
create type public.account_status as enum ('active','suspended','deletion_pending','anonymized');
create type public.provider_kind as enum ('individual','company');
create type public.verification_status as enum ('draft','submitted','under_review','more_information_required','verified','rejected','suspended');
create type public.request_status as enum ('draft','approved','published','matching','receiving_offers','provider_selected','cancelled','expired');
create type public.request_urgency as enum ('flexible','normal','urgent','safety_critical');
create type public.offer_status as enum ('active','revised','withdrawn','expired','selected','rejected');
create type public.job_status as enum ('provider_selected','scheduled','en_route','arrived','diagnosing','awaiting_change_order_approval','in_progress','completion_submitted','completed','cancelled','disputed');
create type public.change_order_status as enum ('pending','approved','rejected','expired','cancelled');
create type public.financial_status as enum ('pending','offline','authorized','captured','cancelled','refunded','failed','held','released');
create type public.case_status as enum ('open','waiting_customer','waiting_provider','waiting_operations','resolved','closed');
create type public.notification_status as enum ('pending','processing','delivered','failed','dead_letter','disabled');

create function private.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '', phone text, preferred_locale text not null default 'ar' check (preferred_locale in ('ar','en','ur','hi')),
  status public.account_status not null default 'active', avatar_path text, anonymized_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create trigger profiles_updated before update on public.profiles for each row execute function private.set_updated_at();
create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade, role public.user_role not null,
  granted_by uuid references public.profiles(id), granted_at timestamptz not null default now(), revoked_at timestamptz, primary key (user_id, role)
);
create table public.user_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade, timezone text not null default 'Asia/Riyadh', currency text not null default 'SAR',
  role_mode public.user_role not null default 'customer', reduced_motion boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade, in_app boolean not null default true, push boolean not null default true,
  email boolean not null default true, quiet_hours_start time, quiet_hours_end time, marketing boolean not null default false, updated_at timestamptz not null default now()
);

create table public.cities (
  id uuid primary key default gen_random_uuid(), code text not null unique, name_ar text not null, name_en text not null, country_code text not null default 'SA',
  timezone text not null default 'Asia/Riyadh', enabled boolean not null default true, boundary extensions.geography(multipolygon,4326), created_at timestamptz not null default now()
);
create table public.districts (
  id uuid primary key default gen_random_uuid(), city_id uuid not null references public.cities(id) on delete cascade, code text not null,
  name_ar text not null, name_en text not null, boundary extensions.geography(multipolygon,4326), enabled boolean not null default true, unique(city_id,code)
);
create index districts_city_idx on public.districts(city_id) where enabled;
create table public.addresses (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade, city_id uuid not null references public.cities(id),
  district_id uuid references public.districts(id), label text not null, formatted_address text not null, building text, unit text, access_notes text,
  location extensions.geography(point,4326) not null, is_default boolean not null default false, deleted_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index addresses_user_idx on public.addresses(user_id) where deleted_at is null;
create index addresses_location_gix on public.addresses using gist(location);

create table public.legal_documents (
  id uuid primary key default gen_random_uuid(), document_type text not null, version text not null, locale text not null, content_hash text not null,
  published_at timestamptz, effective_at timestamptz, requires_acceptance boolean not null default true, unique(document_type,version,locale)
);
create table public.legal_acceptances (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id), legal_document_id uuid not null references public.legal_documents(id),
  accepted_at timestamptz not null default now(), ip_hash text, user_agent_hash text, unique(user_id,legal_document_id)
);
create table public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id), status text not null default 'requested', requested_at timestamptz not null default now(),
  verified_at timestamptz, completed_at timestamptz, retention_snapshot jsonb not null default '{}'::jsonb, failure_category text, version integer not null default 1
);
create unique index one_open_deletion_per_user on public.account_deletion_requests(user_id) where status in ('requested','verified','processing');
create table public.data_export_requests (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id), status text not null default 'requested', requested_at timestamptz not null default now(),
  completed_at timestamptz, private_storage_path text, expires_at timestamptz, failure_category text
);
create table public.external_privacy_requests (
  id uuid primary key default gen_random_uuid(), email_hash text not null, request_type text not null check(request_type in ('deletion','export')),
  reason text, status text not null default 'received', requested_at timestamptz not null default now()
);
create table public.blocked_users (
  blocker_id uuid not null references public.profiles(id) on delete cascade, blocked_id uuid not null references public.profiles(id) on delete cascade,
  reason text, created_at timestamptz not null default now(), primary key(blocker_id,blocked_id), check(blocker_id<>blocked_id)
);
create table public.user_devices (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade, platform text not null,
  device_hash text not null, app_version text, last_seen_at timestamptz not null default now(), revoked_at timestamptz, unique(user_id,device_hash)
);
create table public.push_tokens (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade, device_id uuid references public.user_devices(id) on delete cascade,
  token_ciphertext text not null, provider text not null default 'expo', enabled boolean not null default true, last_result text, updated_at timestamptz not null default now(), unique(provider,token_ciphertext)
);

create table public.service_categories (
  id uuid primary key default gen_random_uuid(), slug text not null unique, icon_key text not null, restricted boolean not null default false,
  verification_required boolean not null default true, enabled boolean not null default true, sort_order integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.service_category_translations (
  category_id uuid not null references public.service_categories(id) on delete cascade, locale text not null, name text not null, description text not null, primary key(category_id,locale)
);
create table public.service_subcategories (
  id uuid primary key default gen_random_uuid(), category_id uuid not null references public.service_categories(id) on delete cascade, slug text not null,
  restricted boolean not null default false, enabled boolean not null default true, sort_order integer not null default 0, unique(category_id,slug)
);
create table public.service_subcategory_translations (
  subcategory_id uuid not null references public.service_subcategories(id) on delete cascade, locale text not null, name text not null, description text not null, primary key(subcategory_id,locale)
);
create table public.service_questions (
  id uuid primary key default gen_random_uuid(), category_id uuid not null references public.service_categories(id) on delete cascade,
  subcategory_id uuid references public.service_subcategories(id) on delete cascade, key text not null, answer_type text not null, required boolean not null default false,
  safety_relevant boolean not null default false, options jsonb, validation jsonb not null default '{}'::jsonb, enabled boolean not null default true, sort_order integer not null default 0,
  unique(category_id,key)
);
create table public.service_question_translations (
  question_id uuid not null references public.service_questions(id) on delete cascade, locale text not null, prompt text not null, help_text text, primary key(question_id,locale)
);
create table public.service_regions (
  id uuid primary key default gen_random_uuid(), code text not null unique, name_ar text not null, name_en text not null,
  boundary extensions.geography(multipolygon,4326), enabled boolean not null default true
);

create table public.provider_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade, kind public.provider_kind not null, business_name text,
  commercial_registration_reference text, bio text, preferred_brief_locale text not null default 'ar', verification_status public.verification_status not null default 'draft',
  accepting_requests boolean not null default false, service_radius_km numeric(6,2) not null default 20 check(service_radius_km between 1 and 250),
  rating_average numeric(3,2) not null default 0 check(rating_average between 0 and 5), rating_count integer not null default 0,
  completed_jobs integer not null default 0, active_workload integer not null default 0, response_rate numeric(5,4) not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.provider_services (
  provider_id uuid not null references public.provider_profiles(user_id) on delete cascade, category_id uuid not null references public.service_categories(id),
  subcategory_id uuid references public.service_subcategories(id), qualified_for_restricted boolean not null default false, enabled boolean not null default true,
  created_at timestamptz not null default now(), primary key(provider_id,category_id)
);
create index provider_services_category_idx on public.provider_services(category_id,provider_id) where enabled;
create table public.provider_service_areas (
  id uuid primary key default gen_random_uuid(), provider_id uuid not null references public.provider_profiles(user_id) on delete cascade,
  city_id uuid not null references public.cities(id), district_id uuid references public.districts(id), center extensions.geography(point,4326), radius_m integer,
  enabled boolean not null default true, check((district_id is not null) or (center is not null and radius_m between 1000 and 250000))
);
create index provider_areas_provider_idx on public.provider_service_areas(provider_id) where enabled;
create index provider_areas_center_gix on public.provider_service_areas using gist(center);
create table public.provider_documents (
  id uuid primary key default gen_random_uuid(), provider_id uuid not null references public.provider_profiles(user_id) on delete cascade,
  document_type text not null, storage_path text not null, content_hash text not null, mime_type text not null,
  size_bytes bigint not null check(size_bytes between 1 and 20971520), status public.verification_status not null default 'submitted',
  expires_at date, created_at timestamptz not null default now(), deleted_at timestamptz
);
create table public.provider_document_reviews (
  id uuid primary key default gen_random_uuid(), document_id uuid not null references public.provider_documents(id), reviewer_id uuid not null references public.profiles(id),
  decision public.verification_status not null, reason text not null, created_at timestamptz not null default now()
);
create table public.provider_availability (
  id uuid primary key default gen_random_uuid(), provider_id uuid not null references public.provider_profiles(user_id) on delete cascade,
  weekday smallint not null check(weekday between 0 and 6), start_time time not null, end_time time not null, timezone text not null default 'Asia/Riyadh',
  check(start_time<end_time), unique(provider_id,weekday,start_time)
);
create table public.provider_blackout_periods (
  id uuid primary key default gen_random_uuid(), provider_id uuid not null references public.provider_profiles(user_id) on delete cascade,
  starts_at timestamptz not null, ends_at timestamptz not null, reason text, check(starts_at<ends_at)
);
create table public.provider_portfolio_items (
  id uuid primary key default gen_random_uuid(), provider_id uuid not null references public.provider_profiles(user_id) on delete cascade,
  category_id uuid references public.service_categories(id), title text not null, description text, storage_path text not null,
  sort_order integer not null default 0, created_at timestamptz not null default now()
);
create table public.provider_performance_snapshots (
  id uuid primary key default gen_random_uuid(), provider_id uuid not null references public.provider_profiles(user_id), snapshot_date date not null,
  rating numeric(3,2) not null, completion_rate numeric(5,4) not null, cancellation_rate numeric(5,4) not null, response_minutes integer,
  completed_jobs integer not null, active_workload integer not null, unique(provider_id,snapshot_date)
);
create table public.provider_status_history (
  id uuid primary key default gen_random_uuid(), provider_id uuid not null references public.provider_profiles(user_id), previous_status public.verification_status,
  new_status public.verification_status not null, actor_id uuid references public.profiles(id), reason text not null, created_at timestamptz not null default now()
);
create table public.provider_payout_accounts (
  id uuid primary key default gen_random_uuid(), provider_id uuid not null references public.provider_profiles(user_id), provider_name text not null,
  provider_token text not null, last4 text, status text not null default 'pending', created_at timestamptz not null default now(), unique(provider_name,provider_token)
);
create table public.provider_suspensions (
  id uuid primary key default gen_random_uuid(), provider_id uuid not null references public.provider_profiles(user_id), actor_id uuid not null references public.profiles(id),
  reason text not null, starts_at timestamptz not null default now(), ends_at timestamptz, lifted_by uuid references public.profiles(id), lifted_at timestamptz
);

create table public.service_requests (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null references public.profiles(id), category_id uuid references public.service_categories(id),
  subcategory_id uuid references public.service_subcategories(id), city_id uuid not null references public.cities(id), district_id uuid references public.districts(id),
  title text not null, structured_description text not null, original_text text not null, original_locale text not null default 'ar', urgency public.request_urgency not null default 'normal',
  requested_start timestamptz, requested_end timestamptz, approximate_location extensions.geography(point,4326), exact_address_id uuid references public.addresses(id),
  ai_provider text, ai_model text, ai_prompt_version text, customer_approved_at timestamptz, published_at timestamptz,
  status public.request_status not null default 'draft', cancellation_reason text, version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create index requests_customer_idx on public.service_requests(customer_id,created_at desc);
create index requests_marketplace_idx on public.service_requests(status,category_id,city_id,published_at desc) where status in ('published','matching','receiving_offers');
create index requests_approx_location_gix on public.service_requests using gist(approximate_location);
create table public.service_request_answers (
  id uuid primary key default gen_random_uuid(), request_id uuid not null references public.service_requests(id) on delete cascade,
  question_id uuid not null references public.service_questions(id), answer_text text, answer_number numeric, answer_boolean boolean, answer_options text[],
  created_at timestamptz not null default now(), unique(request_id,question_id)
);
create table public.request_media (
  id uuid primary key default gen_random_uuid(), request_id uuid not null references public.service_requests(id) on delete cascade, uploader_id uuid not null references public.profiles(id),
  storage_path text not null, thumbnail_path text, mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp','video/mp4','audio/mp4','audio/webm')),
  size_bytes bigint not null check(size_bytes between 1 and 20971520), content_hash text, media_kind text not null, upload_status text not null default 'pending',
  created_at timestamptz not null default now(), deleted_at timestamptz
);
create table public.request_status_history (
  id uuid primary key default gen_random_uuid(), request_id uuid not null references public.service_requests(id), actor_id uuid references public.profiles(id),
  previous_status public.request_status, new_status public.request_status not null, reason text, idempotency_key text, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), unique(request_id,idempotency_key)
);
create table public.request_safety_flags (
  id uuid primary key default gen_random_uuid(), request_id uuid not null references public.service_requests(id) on delete cascade, flag_type text not null,
  source text not null, severity text not null, reviewed_by uuid references public.profiles(id), reviewed_at timestamptz, guidance_version text, created_at timestamptz not null default now()
);
create table public.request_visibility (
  request_id uuid primary key references public.service_requests(id) on delete cascade, visibility text not null default 'matched_only',
  max_providers integer not null default 20 check(max_providers between 1 and 100), expires_at timestamptz, updated_at timestamptz not null default now()
);
create table public.request_publication_events (
  id uuid primary key default gen_random_uuid(), request_id uuid not null references public.service_requests(id), actor_id uuid not null references public.profiles(id),
  request_version integer not null, approval_snapshot jsonb not null, idempotency_key text not null unique, created_at timestamptz not null default now()
);

create function private.handle_new_user() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles(id,display_name,preferred_locale) values(new.id,coalesce(new.raw_user_meta_data->>'display_name',''),coalesce(new.raw_user_meta_data->>'preferred_locale','ar'));
  insert into public.user_roles(user_id,role) values(new.id,'customer');
  insert into public.user_preferences(user_id) values(new.id);
  insert into public.notification_preferences(user_id) values(new.id);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();

commit;
