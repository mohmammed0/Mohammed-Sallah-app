# Security controls register

Preventive: strict environment validation, auth confirmation, minimum password policy, RLS, private storage, least-privilege roles, server-only secrets, state/RPC validation, idempotency, CSP, permissions policy, bounded uploads, allowed MIME types, rate limits, and production feature gates.

Detective: immutable admin/job/payment/settlement events, structured correlation IDs, notification failures/dead letters, dependency audit, license gate, secret patterns, TypeScript/Zod boundaries, database tests, and operational health metrics.

Corrective: global sign-out, token deletion, account suspension/deletion state, provider suspension, financial holds, dispute workflow, compensating migrations, backup restore to a new project, feature disablement, and credential rotation.

Uploads enter a private quarantine bucket through a server-issued ticket with purpose-specific MIME, extension, and byte limits. The scanner verifies signatures, rejects active PDF content and the EICAR fixture, decodes/re-encodes supported images to strip metadata, and promotes only clean objects. RLS and database triggers prevent quarantined or unscanned objects from being referenced or served. The deterministic scanner is test/local-only; production validation requires an external scanner contract and fails closed without it. Failed and rejected objects enter a retryable physical-cleanup queue with an immutable audit trail.

Privacy requests use service-role-only queue claims, bounded exponential retry/dead letters, owner-scoped export paths, one-hour signed links by default, automatic object expiry, session/Auth soft deletion, push-token and storage cleanup, transactional anonymization, retention snapshots, and owner/admin status timelines. Final legal retention periods remain a required human approval.

Production actions still required: operator MFA/SSO, WAF/rate-limit tuning, centralized alerting, external malware-scanner deployment, penetration test, backup restore drill, AI red-team/evals, and Saudi legal/privacy review.

- Edge Functions receive narrowly enumerated service-role grants for request-translation reads/writes, AI/transcription usage inserts, and notification outbox processing. They receive no blanket public-schema DML and no profile deletion privilege. Handlers authenticate first, authorize the target resource explicitly, validate inputs, and write status/usage records.

## Supabase Preview privileged-surface controls

- Exposed views run as the caller. Provider request briefs keep participant RLS; the public provider
  directory uses a narrow security-definer projection without raw profile grants.
- Function defaults grant no execution to `PUBLIC`, `anon`, `authenticated`, or
  `service_role`. Every supported RPC is granted by exact signature in a reviewed migration.
- Legacy and internal compatibility overloads are removed from or denied to the client API.
- External account-deletion intake returns `void`, never checks account existence, validates a
  bounded email input, hashes the email, redacts email-shaped text from the optional reason, and
  applies atomic global and per-email limits. Accepted requests and limiter counters provide the
  audit trail without storing the submitted address.
- Trigger functions use an empty immutable `search_path`; referenced application relations are
  schema-qualified.
- Internal RLS-without-policy tables have all direct client privileges revoked.
