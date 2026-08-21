# Security controls register

Preventive: strict environment validation, auth confirmation, minimum password policy, RLS, private storage, least-privilege roles, server-only secrets, state/RPC validation, idempotency, CSP, permissions policy, bounded uploads, allowed MIME types, rate limits, and production feature gates.

Detective: immutable admin/job/payment/settlement events, structured correlation IDs, notification failures/dead letters, dependency audit, license gate, secret patterns, TypeScript/Zod boundaries, database tests, and operational health metrics.

Corrective: global sign-out, token deletion, account suspension/deletion state, provider suspension, financial holds, dispute workflow, compensating migrations, backup restore to a new project, feature disablement, and credential rotation.

## Marketplace trust and UGC safety controls

- Block/unblock is an authenticated desired-state RPC, not a client toggle. It validates an existing
  job relationship, rejects self/unrelated/unknown targets with a bounded error, takes the canonical
  customer/provider pair lock before its command-specific idempotency lock, reconstructs retries,
  applies a 20/hour actor-hash limit, and appends an immutable event. Message send, offer submission,
  and offer selection take the same pair lock before block checks or legacy command replay. Whichever
  command obtains the lock establishes the serial order: a committed block denies every waiting new
  command or exact retry without offer, job, conversation, or command-idempotency mutation. Direct
  client mutation of `blocked_users` is revoked.
- Block state is projected as an actor-owned affordance, never counterparty enforcement metadata.
  Trust context returns only conversation/counterparty IDs, `blockedByMe`, generic
  `canCommunicate`, and `blocked` for an actor-owned block or `communication_unavailable` for every
  other denied condition. Block/unblock acknowledgements return only target ID, actor-desired
  `blocked`, `changed`, and fail-closed `canCommunicate: false`, including no-op and replay paths;
  clients refresh the conversation-specific trust context after every mutation. They never
  return `blockedByThem`, `isBlocked`, `mutualBlocked`, or restriction direction. The complete legacy
  command body remains a revoked private implementation behind the safe wrapper, preserving
  authorization, relationship validation, lock order, idempotency, and immutable events.
- Communication authorization is derived from the actual job parties and rechecked before replay.
  Either-direction blocking, inactive customer/provider accounts, non-active membership, a closed
  conversation, or a provider verification state other than `verified` denies new messages. Direct
  message writes are revoked in favor of the authoritative RPC; historical text stays available to
  participants for reporting and support evidence. Read-receipt mutation is disabled for M1 because
  direct writes are revoked and no authoritative receipt RPC exists.
- Message attachments require the same live communication predicate in both RLS and the service-only
  media broker. Upload identifiers are canonicalized and distinct upload rows are locked in sorted
  UUID order before inserts; duplicates and reused uploads fail with bounded domain errors. Message
  media uses a maximum two-minute HMAC-bound Edge proxy whose every GET reauthorizes current
  communication state, streams the private Storage response without Blob buffering, and disables
  caching; a pre-issued URL therefore stops delivering after a block or suspension. Gateway JWT
  verification is disabled only for this broker so custom-token GETs can
  reach the handler; POST still authenticates the Supabase bearer before privileged client creation,
  and other functions retain their prior gateway settings. The obsolete service-role grant on
  `authorize_clean_media` is revoked, closing its membership-only message-media path; the protected
  dispatcher accepts the active PostgreSQL `service_role` established by either current non-JWT
  secret API keys or legacy service-role JWTs, without trusting `current_user` or requiring a legacy
  claim GUC inside `SECURITY DEFINER`. Exact execute grants remain service-only, and the dispatcher
  retains required non-message authorization and short-lived storage URL behavior. The
  direct authenticated clean-object policy excludes `message-attachments`, including uploader and
  broad staff reads, while non-message clean objects and the broker's service-role Storage fetch keep
  their existing paths. Reports snapshot bounded text and attachment metadata/hash only—never object
  paths, signed URLs, broker tokens, exact locations, offers, payment data, or copied media.
- Report intake derives message sender, conversation, job, request, and rating ownership on the
  server; validates relationship and reference legitimacy before replay or mutation; bounds categories
  and details; deduplicates active targets; rate-limits to 10/hour per actor hash; and creates exactly
  one linked abuse support case plus one immutable submission event. A message sender must be exactly
  the opposite party in the bound conversation job. A rating's customer/provider must equal that
  rating's job parties, and only the rated provider may report it. User targets require
  `create_marketplace_report_v2` with an exact active conversation whose other participant is the
  target. Conversation context is part of both the durable request hash and active-report uniqueness
  key, so dual-role classification comes from the stored conversation job rather than the latest
  relationship or a global provider profile. The old RPC fails user targets closed; message and rating
  targets retain server-derived context.
- Active-job participant commands recheck current eligibility before idempotency replay. Transition,
  change-order creation/decision, completion submission, and the supported seven-argument
  completion-acceptance command, foreground exact-location start/record, and participant
  exact-location read require an active account and exact job role. Providers additionally require a
  current provider role, verified profile, and no open review for that exact job. Resolved reviews
  allow work unless a separate current account/provider gate still denies it. The audited staff
  exact-location overload retains its separate permission/case/reason boundary. Generic cancellation
  through transition is also denied to inactive participants; dedicated cancellation/dispute
  workflows remain separate.
- Direct publishable-key reads cannot bypass those participant gates. The selected-provider branch of
  `addresses` and participant RLS on `job_location_updates` and `job_location_sharing_sessions` use a
  private stable current-eligibility predicate. Suspended customers/providers, revoked provider role,
  failed verification, and open exact-job reviews lose direct live-coordinate and sharing-token
  reads; deprivileged providers also lose the customer exact address. Customer ownership of their own
  saved addresses and the existing separately permissioned staff session-metadata branch remain
  unchanged. Staff exact address/live-coordinate disclosure still uses the reasoned audited RPC.
- Authenticated clients have no direct `INSERT`, `UPDATE`, or `DELETE` privilege on `addresses`, and
  there is no owner-write policy. Saved-address create/update/default/archive behavior remains on the
  validating security-definer RPCs, preventing active or suspended customers from rewriting bound
  request/job snapshots, manufacturing snapshots, or bypassing coordinate resolution.
- `public.messages` belongs to `supabase_realtime` only as a delivery surface. Member `SELECT` RLS
  remains authoritative for subscriptions, direct client inserts remain revoked, and the message RPC
  remains the only authenticated write path. Private report, trust-event, moderation, and audit tables
  are not published.
- Reporter, assigned-support, and operations projections are separate. Staff projections include
  immutable transition history. Support requires an active case assignment/grant; `read` alone omits
  text/attachment evidence, `evidence` reveals the bounded snapshot, and `internal_note` permits
  escalation. Operations/super-admin triage and final decisions require non-null expected versions,
  use command-namespaced durable keys, bounded reasons, immutable report events, and the existing
  immutable admin audit log. Embedded history is limited to the newest 50 events with explicit
  returned/total/truncated metadata, and no-change triage/escalation commands are rejected without an
  event. Null page limits are rejected. Account/provider suspension stays in the existing privileged
  commands, and final offer selection checks that the customer is active before idempotency replay.
- The authoritative open moderation queue filters to submitted, triaged, and escalated reports before
  its 1–100 bound, orders by the stable `(created_at, id)` tuple, and returns a keyset cursor and
  `hasMore`. Resolved and dismissed rows cannot starve later open reports. Scoped support is filtered
  to active linked-case `read` access on every page and still needs `evidence` independently; the
  original bounded projection remains compatible for existing callers.
- The scalar and 1–100 batch report enforcement-target lookups require both operations marketplace
  read and mutation permissions and emit exactly four non-PII identifiers per report. The batch
  rejects null, empty, duplicate, oversized, or partly unavailable input atomically and preserves input
  order. It uses one `WITH ORDINALITY` relational plan over only the required report, job,
  conversation, message, and rating columns; it neither loops through report IDs nor invokes the
  scalar/helper per row. Both paths derive customer/provider role from the report's job-party
  position, validate stored user conversation, rating author/job context, and both the message sender
  and exact stored message conversation when applicable, and fail closed for unknown, missing,
  unrelated, cross-conversation, or ambiguous context. They never treat global provider-profile
  existence as the target role, including for dual-role users. Final reports remain eligible because
  report resolution and account enforcement are separate authorized actions.
- Customer status enforcement uses a canonical v2 durable intent over customer ID, requested status,
  and trimmed reason. Current operator authorization is rechecked before replay; completed retries
  return without repeating the state mutation, moderation action, audit record, session revocation, or
  push-token disablement, while an altered payload using the same key is rejected.
- The focused pgTAP suite covers direct-query, old-ID, role-switch, replay, attachment/media, forged
  reference, cross-conversation report corruption, active deduplication, actor-isolated rate limits,
  staff separation, version conflict, immutable evidence, current exact-location eligibility, and
  customer/provider suspension regressions. It also covers direct request-snapshot DML denial,
  broker-only message-object reads, and corrupt message/rating job-party denial before report mutation.
  `marketplace_trust_concurrency.sh` covers block-first/send-second and
  send-first/block-second in real database sessions, including post-block denial.
  `marketplace_offer_block_concurrency.sh` covers both lock orders independently for offer
  submission and offer selection.

Uploads enter a private quarantine bucket through a server-issued ticket with purpose-specific MIME, extension, and byte limits. The scanner verifies signatures, rejects active PDF content and the EICAR fixture, decodes/re-encodes supported images to strip metadata, and promotes only clean objects. RLS and database triggers prevent quarantined or unscanned objects from being referenced or served. The deterministic scanner is test/local-only; production validation requires an external scanner contract and fails closed without it. Failed and rejected objects enter a retryable physical-cleanup queue with an immutable audit trail.

Privacy requests use service-role-only queue claims, bounded exponential retry/dead letters, owner-scoped export paths, one-hour signed links by default, automatic object expiry, session/Auth soft deletion, push-token and storage cleanup, transactional anonymization, retention snapshots, and owner/admin status timelines. Final legal retention periods remain a required human approval.

Production actions still required: operator MFA/SSO, WAF/rate-limit tuning, centralized alerting, external malware-scanner deployment, penetration test, backup restore drill, AI red-team/evals, and Saudi legal/privacy review.

- Edge Functions receive narrowly enumerated service-role grants for request-translation reads/writes, AI/transcription usage inserts, and notification outbox processing. They receive no blanket public-schema DML and no profile deletion privilege. Handlers authenticate first, authorize the target resource explicitly, validate inputs, and write status/usage records.

## Supabase Preview privileged-surface controls

- Exposed views run as the caller. Provider request briefs keep participant RLS; the public provider
  directory uses a narrow security-definer projection without raw profile grants.
- Application-migration function defaults grant no execution to `PUBLIC`, `anon`, `authenticated`,
  or `service_role`; Supabase-owned platform defaults remain provider-managed. Every supported RPC is granted by exact signature in a reviewed migration.
- Legacy and internal compatibility overloads are removed from or denied to the client API.
- External account-deletion intake returns `void`, never checks account existence, validates a
  bounded email input, hashes the email, redacts email-shaped text from the optional reason, and
  applies atomic global and per-email limits. Accepted requests and limiter counters provide the
  audit trail without storing the submitted address.
- Trigger functions use an empty immutable `search_path`; referenced application relations are
  schema-qualified.
- Internal RLS-without-policy tables have all direct client privileges revoked.
