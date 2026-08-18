begin;

create table public.payments (
  id uuid primary key default gen_random_uuid(), job_id uuid not null references public.jobs(id), customer_id uuid not null references public.profiles(id),
  provider_id uuid not null references public.provider_profiles(user_id), provider_name text not null, provider_reference text,
  amount_minor bigint not null check(amount_minor>=0), currency text not null default 'SAR' check(currency='SAR'), status public.financial_status not null default 'pending',
  payment_mode text not null check(payment_mode in ('offline','gateway')), idempotency_key text not null unique, version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.payment_attempts (
  id uuid primary key default gen_random_uuid(), payment_id uuid not null references public.payments(id), attempt_number integer not null,
  provider_reference text, status public.financial_status not null, error_category text, created_at timestamptz not null default now(), unique(payment_id,attempt_number)
);
create table public.payment_events (
  id uuid primary key default gen_random_uuid(), payment_id uuid not null references public.payments(id), event_type text not null,
  amount_minor bigint, provider_event_id text, payload_hash text, created_at timestamptz not null default now(), unique(provider_event_id)
);
create table public.refunds (
  id uuid primary key default gen_random_uuid(), payment_id uuid not null references public.payments(id), amount_minor bigint not null check(amount_minor>0),
  reason text not null, status public.financial_status not null default 'pending', provider_reference text, idempotency_key text not null unique,
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
create table public.provider_settlements (
  id uuid primary key default gen_random_uuid(), provider_id uuid not null references public.provider_profiles(user_id), payment_id uuid not null references public.payments(id),
  gross_minor bigint not null check(gross_minor>=0), fee_minor bigint not null check(fee_minor>=0), net_minor bigint not null check(net_minor>=0),
  status public.financial_status not null default 'pending', provider_reference text, idempotency_key text not null unique, created_at timestamptz not null default now(),
  check(net_minor=gross_minor-fee_minor)
);
create table public.settlement_events (
  id uuid primary key default gen_random_uuid(), settlement_id uuid not null references public.provider_settlements(id), event_type text not null,
  actor_id uuid references public.profiles(id), reason text, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table public.platform_fees (
  id uuid primary key default gen_random_uuid(), job_id uuid not null references public.jobs(id), payment_id uuid references public.payments(id),
  rule_version text not null, basis_minor bigint not null, rate_bps integer not null check(rate_bps between 0 and 10000), amount_minor bigint not null check(amount_minor>=0),
  created_at timestamptz not null default now()
);
create table public.invoices (
  id uuid primary key default gen_random_uuid(), job_id uuid not null references public.jobs(id), invoice_number text not null unique,
  seller_snapshot jsonb not null, customer_snapshot jsonb not null, subtotal_minor bigint not null, vat_minor bigint not null default 0,
  platform_fee_minor bigint not null default 0, total_minor bigint not null, currency text not null default 'SAR', payment_method text not null,
  status text not null, issued_at timestamptz not null, private_pdf_path text, legal_review_version text
);
create table public.invoice_items (
  id uuid primary key default gen_random_uuid(), invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null, quantity numeric(10,3) not null check(quantity>0), unit_amount_minor bigint not null check(unit_amount_minor>=0), vat_rate_bps integer not null default 0
);
create table public.receipts (
  id uuid primary key default gen_random_uuid(), payment_id uuid not null references public.payments(id), receipt_number text not null unique,
  amount_minor bigint not null, currency text not null default 'SAR', issued_at timestamptz not null, private_pdf_path text
);
create table public.financial_holds (
  id uuid primary key default gen_random_uuid(), job_id uuid not null references public.jobs(id), payment_id uuid references public.payments(id),
  amount_minor bigint not null check(amount_minor>=0), reason text not null, status public.financial_status not null default 'held',
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), released_by uuid references public.profiles(id), released_at timestamptz
);
create table public.webhook_events (
  id uuid primary key default gen_random_uuid(), provider text not null, provider_event_id text not null, payload_hash text not null,
  signature_valid boolean not null, status text not null default 'received', attempts integer not null default 0, received_at timestamptz not null default now(), processed_at timestamptz,
  unique(provider,provider_event_id)
);

create table public.support_cases (
  id uuid primary key default gen_random_uuid(), opened_by uuid not null references public.profiles(id), request_id uuid references public.service_requests(id),
  job_id uuid references public.jobs(id), topic text not null, priority text not null default 'normal', status public.case_status not null default 'open',
  subject text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), closed_at timestamptz
);
create table public.support_case_messages (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references public.support_cases(id) on delete cascade, sender_id uuid not null references public.profiles(id),
  body text not null, visible_to_user boolean not null default true, created_at timestamptz not null default now()
);
create table public.support_case_evidence (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references public.support_cases(id), uploader_id uuid not null references public.profiles(id),
  private_storage_path text not null, mime_type text not null, size_bytes bigint not null check(size_bytes between 1 and 20971520), content_hash text, created_at timestamptz not null default now()
);
create table public.support_case_assignments (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references public.support_cases(id), assignee_id uuid not null references public.profiles(id),
  assigned_by uuid not null references public.profiles(id), assigned_at timestamptz not null default now(), ended_at timestamptz
);
create table public.support_internal_notes (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references public.support_cases(id), author_id uuid not null references public.profiles(id),
  body text not null, created_at timestamptz not null default now()
);
create table public.cancellation_requests (
  id uuid primary key default gen_random_uuid(), job_id uuid references public.jobs(id), request_id uuid references public.service_requests(id), requester_id uuid not null references public.profiles(id),
  lifecycle_state text not null, reason text not null, status text not null default 'pending', created_at timestamptz not null default now(), check(job_id is not null or request_id is not null)
);
create table public.cancellation_decisions (
  id uuid primary key default gen_random_uuid(), cancellation_request_id uuid not null unique references public.cancellation_requests(id),
  actor_id uuid not null references public.profiles(id), decision text not null, reason text not null, fee_minor bigint not null default 0,
  refund_implication text, impact_snapshot jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table public.disputes (
  id uuid primary key default gen_random_uuid(), job_id uuid not null references public.jobs(id), opened_by uuid not null references public.profiles(id),
  reason text not null, priority text not null default 'normal', status public.case_status not null default 'open', assigned_to uuid references public.profiles(id),
  created_at timestamptz not null default now(), resolved_at timestamptz
);
create table public.dispute_events (
  id uuid primary key default gen_random_uuid(), dispute_id uuid not null references public.disputes(id), actor_id uuid references public.profiles(id),
  event_type text not null, reason text, payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table public.resolution_actions (
  id uuid primary key default gen_random_uuid(), dispute_id uuid not null references public.disputes(id), actor_id uuid not null references public.profiles(id),
  action_type text not null, amount_minor bigint, reason text not null, idempotency_key text not null unique, created_at timestamptz not null default now()
);
create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(), target_user_id uuid not null references public.profiles(id), actor_id uuid not null references public.profiles(id),
  action_type text not null, reason text not null, starts_at timestamptz not null default now(), ends_at timestamptz, created_at timestamptz not null default now()
);

create table public.admin_roles (
  id uuid primary key default gen_random_uuid(), key text not null unique, name text not null, description text not null, system_role public.user_role not null
);
create table public.admin_permissions (
  id uuid primary key default gen_random_uuid(), key text not null unique, description text not null, risk_level text not null
);
create table public.admin_role_assignments (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id), admin_role_id uuid not null references public.admin_roles(id),
  granted_by uuid not null references public.profiles(id), reason text not null, granted_at timestamptz not null default now(), revoked_at timestamptz, unique(user_id,admin_role_id)
);
create table public.admin_role_permissions (
  admin_role_id uuid not null references public.admin_roles(id) on delete cascade, permission_id uuid not null references public.admin_permissions(id) on delete cascade,
  primary key(admin_role_id,permission_id)
);
create table public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(), actor_id uuid not null references public.profiles(id), action text not null, target_type text not null,
  target_id uuid, reason text not null, correlation_id uuid not null, before_snapshot jsonb, after_snapshot jsonb, ip_hash text, created_at timestamptz not null default now()
);
create index admin_audit_target_idx on public.admin_audit_logs(target_type,target_id,created_at desc);
create table public.feature_flags (
  key text primary key, enabled boolean not null default false, environments text[] not null default '{}', rules jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id), updated_at timestamptz not null default now()
);
create table public.system_settings (
  key text primary key, value jsonb not null, version integer not null default 1, sensitive boolean not null default false,
  updated_by uuid references public.profiles(id), updated_at timestamptz not null default now()
);
create table public.notification_templates (
  id uuid primary key default gen_random_uuid(), event_type text not null, channel text not null, locale text not null,
  subject_template text, body_template text not null, version integer not null default 1, enabled boolean not null default true, unique(event_type,channel,locale,version)
);
create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id), event_type text not null, channel text not null,
  template_id uuid references public.notification_templates(id), payload jsonb not null, deduplication_key text not null,
  status public.notification_status not null default 'pending', attempts integer not null default 0, available_at timestamptz not null default now(),
  last_error_category text, created_at timestamptz not null default now(), delivered_at timestamptz, unique(channel,deduplication_key)
);
create index notification_outbox_worker_idx on public.notification_outbox(status,available_at) where status in ('pending','failed');
create table public.dead_letter_events (
  id uuid primary key default gen_random_uuid(), source_type text not null, source_id uuid not null, error_category text not null,
  payload jsonb not null, attempts integer not null, created_at timestamptz not null default now(), resolved_at timestamptz, resolved_by uuid references public.profiles(id)
);
create table public.idempotency_keys (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id), command text not null, key text not null,
  request_hash text, response jsonb, status text not null default 'processing', expires_at timestamptz not null default (now()+interval '24 hours'),
  created_at timestamptz not null default now(), unique(user_id,command,key)
);
create table public.rate_limit_buckets (
  key_hash text not null, operation text not null, window_start timestamptz not null, count integer not null default 0, limit_value integer not null,
  updated_at timestamptz not null default now(), primary key(key_hash,operation,window_start)
);
create table public.scheduled_jobs (
  id uuid primary key default gen_random_uuid(), job_type text not null, payload jsonb not null, scheduled_at timestamptz not null, status text not null default 'pending',
  attempts integer not null default 0, locked_at timestamptz, completed_at timestamptz, error_category text
);
create index scheduled_jobs_worker_idx on public.scheduled_jobs(status,scheduled_at) where status='pending';
create table public.system_incidents (
  id uuid primary key default gen_random_uuid(), severity text not null, status text not null default 'open', title text not null, summary text not null,
  started_at timestamptz not null, resolved_at timestamptz, commander_id uuid references public.profiles(id), created_at timestamptz not null default now()
);

commit;
