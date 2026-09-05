# RLS matrix

All exposed public tables have RLS enabled. No service-role key is available to clients.

| Resource                               | Customer                    | Matched provider          | Selected provider               | Assigned/granted support                        | Operations / other staff                                                                 | Other user |
| -------------------------------------- | --------------------------- | ------------------------- | ------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------- |
| Raw profile/preferences                | own                         | own                       | own                             | deny; linked safe identity RPC only             | deny; purpose-scoped projection RPCs only                                                | deny       |
| Safe identity / customer PII RPC       | own                         | deny unrelated            | deny unrelated                  | assigned-case display identity only             | PII requires `customer.pii.read`; marketplace/verification projections are field-limited | deny       |
| Exact address / job location RPC       | own address; active job RPC | deny                      | current eligible selected job   | linked case + `exact_location` + reason + audit | `operations.exact_location.read` + reason + audit                                        | deny       |
| Service-area coordinate resolution     | authenticated RPC only      | deny                      | authenticated RPC only          | authenticated RPC only                          | authenticated RPC only                                                                   | deny       |
| Foreground location-sharing sessions   | active account + own job    | deny                      | current eligible active session | deny unless separately linked and permissioned  | narrowly permissioned                                                                    | deny       |
| Request core/answers/clean media brief | own                         | matched, approximate only | participant                     | authorized linked case only                     | `operations.marketplace.read`                                                            | deny       |
| AI sessions/messages/diagnostics       | own                         | deny                      | deny                            | deny                                            | server/service workflow only                                                             | deny       |
| Offers                                 | offers on own request       | own offer                 | own/selected                    | authorized linked case only                     | `operations.marketplace.read`                                                            | deny       |
| Competing offers                       | customer only               | deny                      | deny other offers               | only when linked case policy explicitly permits | `operations.marketplace.read`                                                            | deny       |
| Jobs/history/change orders/proofs      | participant                 | deny unless selected      | participant                     | authorized linked case only                     | `operations.marketplace.read`                                                            | deny       |
| Conversations / historical text        | member, including blocked   | deny unless member        | member, including blocked       | case-authorized projections only                | `operations.marketplace.read` projection                                                 | deny       |
| New message mutation                   | live eligible member only   | deny unless selected      | live eligible member only       | deny direct mutation                            | deny direct mutation; audited workflows only                                             | deny       |
| Read-receipt mutation (M1)             | disabled                    | disabled                  | disabled                        | disabled                                        | disabled; no authoritative RPC                                                           | disabled   |
| Message attachment metadata/media      | live eligible member only   | deny unless selected      | live eligible member only       | moderation-safe hash/metadata projection only   | moderation-safe hash/metadata projection only                                            | deny       |
| Directional block state                | own rows via safe context   | deny raw counterparty row | own rows via safe context       | deny                                            | audited projection only                                                                  | deny       |
| Marketplace reports/events             | safe own acknowledgement    | deny raw workflow         | safe own acknowledgement        | open reports for active linked cases only       | keyset-paginated open queue; mutation requires operations permission                     | deny       |
| Report enforcement target(s)           | deny                        | deny                      | deny                            | deny                                            | read + mutate operations only; four non-PII contextual fields; batch 1–100               | deny       |
| Clean message-storage objects          | no direct bucket read       | no direct bucket read     | no direct bucket read           | no direct bucket read                           | no direct bucket read                                                                    | deny       |
| Signed-media broker                    | authorized owned/resource   | matched-resource subset   | participant resource            | linked case + evidence/read capability          | explicit operations/provider-document permission                                         | deny       |
| Provider documents/payout refs         | deny                        | own                       | own                             | deny                                            | verification/finance permission                                                          | deny       |
| Payments/holds/refunds                 | participant subset          | deny                      | participant subset              | linked case does not grant ledger-wide access   | minimal finance queue; mutation/confirmation via RPC/service                             | deny       |
| Support cases/messages/evidence        | opener; visible messages    | opener when applicable    | opener when applicable          | active assignment/grant and capability          | `operations.marketplace.read`                                                            | deny       |
| Internal support notes                 | deny                        | deny                      | deny                            | active `internal_note` capability only          | deny unless separately assigned/authorized                                               | deny       |
| Notifications/delivery history         | own                         | own                       | own                             | deny system-wide                                | `operations.notifications.read`                                                          | deny       |
| Admin audit/config                     | deny                        | deny                      | deny                            | deny unless independently authorized            | exact permission; active roles only                                                      | deny       |

Support access requires an active account and non-revoked `support_agent` role plus either an active
case assignment or a temporary/escalation grant. Grants last at most 24 hours, have explicit
capabilities and reason, and can be revoked immediately. Support resolution commands are guarded by
the same linked-case scope. Analysts remain aggregate-only. Operations-wide marketplace, customer
PII, provider verification, notification, finance, and exact-location access are distinct
permissions. Support agents never inherit raw profile or ledger-wide reads. Customer PII lookup
requires an active privacy-reviewer or super-admin role, a target, and an audited reason.

## Marketplace trust and UGC safety

`blocked_users` remains directional so only the blocker can unblock, but the communication predicate
treats either direction as mutual. It derives the actual customer/provider pair from the job and
conversation, requires active accounts, an active verified provider, active membership, and no block.
Block/unblock, message send, offer submission, and offer selection take the same canonical
customer/provider transaction lock before checking block state or entering their command-specific
replay/mutation path. Whichever command holds the pair lock establishes the serial order: a committed
block denies a waiting fresh command or exact replay, while a completed offer command may commit before
the waiting block. An old conversation ID, role-mode switch, or once-valid client key cannot bypass the
new state. Attachment identifiers are deduplicated, sorted, and locked in UUID order before inserts;
duplicate or already-attached uploads receive bounded errors. Historical text remains
participant-readable for evidence. Direct message writes are revoked in favor of the RPC; read-receipt
mutation is disabled for M1 because no authoritative receipt RPC exists.

Trust projections expose only the actor-owned unblock affordance. `get_marketplace_trust_context`
returns conversation and counterparty IDs, `blockedByMe`, generic `canCommunicate`, and a restriction
of `blocked` only when the actor owns the block; every other denied condition is
`communication_unavailable`. It never returns counterparty-owned block state or a derived mutual-block
flag. `set_user_block` similarly returns only target ID, the actor's desired `blocked` state,
`changed`, and fail-closed `canCommunicate: false` for fresh, no-op, and replayed commands; clients
refresh the conversation-specific trust context after every mutation. The preserved private
mutation body is non-callable, so relationship checks, pair-lock order, idempotency, rate limiting,
and immutable audit evidence remain authoritative without exposing enforcement direction.

Message attachment RLS and `authorize_message_media` use the stricter live-communication predicate.
The service-only `authorize_protected_media` dispatcher marks message uploads for an HMAC-bound Edge
proxy instead of issuing a storage URL. Every proxy GET re-runs database authorization and streams the
private Storage response without buffering the object, returns `Cache-Control: no-store`, and uses a
maximum two-minute broker-token lifetime, so a URL minted before a block or suspension stops delivering immediately;
the gateway JWT check is disabled only for `media-access` so broker GETs can reach the HMAC verifier,
while POST still authenticates the bearer inside the handler before creating a privileged client.
Other protected-media purposes retain their existing short-lived storage URL behavior through the same
dispatcher. Its service boundary uses the active PostgreSQL `service_role`, so current non-JWT secret
API keys and legacy service-role JWTs follow the same fail-closed path without relying on a
JWT-specific claim GUC inside `SECURITY DEFINER`. The obsolete service-role execute grant on
`authorize_clean_media` is revoked, so message
media cannot fall back to its membership-only legacy branch. The authenticated clean-object policy
also excludes the `message-attachments` bucket, including uploader and broad staff reads, so direct
Storage select/list/sign flows cannot bypass broker reauthorization. Existing clean-object behavior
for non-message buckets and the service-role Storage fetch used after broker authorization are
preserved. Report evidence stores at most 2,000 text characters plus bounded attachment IDs, MIME,
byte count, and content hash; it never stores object paths, signed URLs, broker tokens, or media copies.

`marketplace_reports`, `marketplace_report_events`, and `user_block_events` are RLS-enabled and have no
direct client table privileges. Reporters use `get_my_marketplace_reports`, which omits counterparty,
support-case, and evidence fields. Assigned support reads only linked reports and immutable transition
history; text snapshots and attachment evidence additionally require the case's `evidence` capability,
and escalation requires `internal_note`. Operations/super-admin staff use non-null expected versions,
command-namespaced idempotency, and audited triage/resolution. Embedded history is capped at the newest
50 events and carries returned/total/truncated metadata; same-state/same-priority commands are rejected
instead of appending no-op events. A suspended customer is rejected before offer-selection replay.
Finance, verification, analysts, ordinary users, and unassigned support receive no moderation rows.
Both report projections reject null or out-of-range limits. Closed-beta atomic
limits are 60 message sends per UTC minute, 10 reports per UTC hour, and 20 block-state commands per UTC
hour, independently keyed by a one-way actor hash.

User-target reports use `create_marketplace_report_v2` and require the exact active conversation in
which the two current participants interacted. The server derives and stores that conversation's job
and request; its canonical idempotency payload and active-report uniqueness key include the
conversation. The compatibility RPC rejects user targets with `REPORT_CONTEXT_REQUIRED` but continues
to derive message and rating context server-side. Before replay or mutation, message intake requires
the stored sender to be exactly the opposite job party in the bound conversation, while rating intake
requires its customer/provider identities to equal the report-bound job parties and permits only the
rated provider direction. Thus the same dual-role user may have separate active reports in separate
jobs, while repeated reports in one conversation deduplicate. Enforcement-target lookups validate the
stored conversation/job/request chain and classify the target from that exact job.

`transition_job`, change-order creation/decision, completion submission, the supported seven-argument
completion-acceptance command, foreground exact-location start/record, and participant exact-location
read all lock and recheck current contextual authorization before replay, mutation, or disclosure. The
customer account must be active. A provider must additionally retain the provider role, a verified
provider profile, exact job participation, and no open eligibility review for that job; a resolved
review does not itself block work. The audited staff exact-location overload retains its independent
permission/case/reason boundary. Generic transition, including cancellation, fails closed for inactive
participants; separate cancellation/dispute workflows remain available under their own policies.

The provider branch of direct `addresses` RLS and participant reads of `job_location_updates` and
`job_location_sharing_sessions` use the same current account, provider-role, verification, and
exact-job review predicate. This prevents a publishable-key client from bypassing the participant RPC
after suspension or provider deprivileging. Customer ownership of their own saved address remains
unchanged, while suspended customers cannot directly read sharing-session identifiers or live
coordinates. The existing separately permissioned staff session-metadata branch is preserved; exact
address and live-coordinate staff access remains reasoned and audited through the staff RPC.
Authenticated `INSERT`, `UPDATE`, and `DELETE` on `addresses` are revoked and the owner-write policy is
removed. Saved-address creation, update, default selection, and archival therefore remain available
only through their validating security-definer RPCs; neither active nor suspended clients can forge or
rewrite immutable request/job snapshots or bypass coordinate resolution.

`public.messages` is included in `supabase_realtime` for delivery only. Subscription rows remain
governed by the existing member `SELECT` policy, direct authenticated inserts remain revoked, and new
messages still require the authoritative RPC. No report, trust-event, moderation-action, or audit table
is added to the publication.

`list_open_marketplace_reports` is the authoritative work queue. It excludes resolved and dismissed
reports before applying a 1–100 bound, orders oldest first by `(created_at, id)`, and returns a
created-at/report-ID keyset cursor plus `hasMore`; therefore final reports cannot consume open queue
slots and every open report remains reachable. Scoped support retains the same active case and
independent evidence-capability checks as the compatibility projection. The compatibility
`list_marketplace_reports` RPC remains available for existing callers.

`get_marketplace_report_enforcement_target` and its bounded batch companion require both
`operations.marketplace.read` and `operations.mutate`. They return only report, support-case,
reported-user, and contextual target-role identifiers. The batch accepts 1–100 unique non-null report
IDs, preserves input order, and fails the whole request if any target is unavailable. It resolves the
bounded array through one ordinality-based relational plan with explicit context columns rather than
per-report function calls or evidence-row loading. Customer/provider classification is derived from
the report-bound job and validated against the stored user conversation or target-specific message or
rating context, never from global provider-profile existence, so dual-role users remain unambiguous. A
message target must belong to the report's stored conversation in both scalar and batch paths. Missing,
unrelated, cross-conversation, or ambiguous context fails closed. Final reports remain eligible because
moderation resolution and the separately authorized account action are distinct operational steps.

`admin_set_customer_status` rechecks the caller's live operations role before replay. Its v2 durable
intent hashes customer ID, requested status, and trimmed reason before target lookup and same-state
validation, so a retry after a committed-but-lost response reconstructs success while the same key
with altered payload fails closed. The original status, self/admin-protection, reason, session
revocation, push-token, moderation-action, and audit semantics remain transactional.

The authoritative runtime role list is exported by `@sallah/domain` and includes
`privacy_reviewer`. Database-generated types, web authorization, and mobile session parsing consume
the same contract. Staff-only roles never imply customer/provider navigation. An unknown future role
produces a controlled restricted mobile state instead of an endless initialization state.

## Media-scanner control plane

`private.media_scan_jobs`, `media_scan_attempts`, `media_scan_artifacts`,
`media_scan_attestations`, `media_scan_events`, and `media_scanner_nonces` are RLS-enabled with no
allow policy and no direct table grant, including to `service_role`. Authenticated clients have only
`start_or_get_media_scan(uuid, uuid)` and `get_my_file_upload_status(uuid)`; the queue mutation
requires a caller-created operation UUID with exact replay/mismatch semantics, while the latter is
read-only and returns the exact safe owner projection with no operational evidence. Scanner-control
uses narrowly granted, fixed-search-path
service RPCs for claim, heartbeat, output preparation, readback authorization, attestation,
finalization, rejection/failure, nonce consumption, and one-artifact-at-a-time cleanup.

Scanner-request authentication nonces are strictly one-shot: the first valid consumer wins and every
duplicate fails with `SCANNER_NONCE_REPLAY`, including an identical nonce-operation replay and a
duplicate after stored expiry. Response-loss recovery uses a fresh nonce and fresh nonce-operation
UUID while retaining the separate domain operation UUID used for idempotent business-state replay.
The scanner-control timestamp window remains plus or minus 30 seconds, and nonce consumption never
returns a prior accepted receipt.

Every attempt has one immutable 120-second processing deadline. A timely attestation receives a
fixed 15-second metadata-only finalization margin, and retries create distinct opaque input, output,
and final-candidate paths. Exact operation UUID/fingerprint replay reconstructs the saved receipt;
altered replay and every stale-attempt prepare, readback, attest, finalize, fail, or reject operation
fail closed. Owner and scanner state transitions use a consistent job-before-upload/attempt lock
order. Scanner signature freshness and eligibility are rechecked against a post-lock clock, and a
future ClamAV signature timestamps fail closed with no positive skew at both the pre-lock and
post-lock checks. The separate scanner-request authentication window does not relax antivirus
signature freshness. A timely attested attempt remains authoritative through its complete
finalization margin. The bounded
attestation matches the database-owned purpose, detected input/output MIME,
deadline, paths, sizes, hashes, sanitizer evidence, clean scans, readback hash, and fresh ClamAV
signature evidence. Completion retains only the winning candidate as `file_uploads.final_path`;
cleanup leases one non-retained artifact at a time and rechecks it before recording deletion.
The service-only attempt-status RPC returns a fixed 28-key reconciliation receipt containing the
authoritative attempt/job states, deadlines, declared/detected media policy, bounded sizes and
hashes, sanitizer identity, manifest fingerprint, and input/output/final artifact states and paths.
It remains unavailable to authenticated owners, and trusted Edge must strip source/final/private
metadata from every scanner-worker response.

Provider onboarding preserves its public `upsert_provider_onboarding(jsonb)` signature but now
accepts each client document only as exact `{uploadId, documentType}`. The empty-search-path wrapper
locks and validates the actor-owned clean `provider_document` upload, derives final path, content
SHA-256, detected MIME, and size internally, then delegates to a revoked private legacy authority.
Cross-owner, wrong-purpose, non-clean, duplicate, and legacy path/hash inputs fail closed. Direct
authenticated provider-document inserts and path/hash column reads are revoked; safe review metadata
remains readable under the existing owner/staff RLS policy.

Raw authenticated reads of `file_uploads` and `upload_security_events` are revoked. Storage policies
use narrow private authorization helpers instead, while preserving the M1 protected-message broker:
the `message-attachments`, quarantine, `scan-input`, and `scan-output` buckets never gain a broad
authenticated clean-object path. Storage objects continue to be mutated through Storage APIs, not by
direct writes to the `storage` schema.

Automated evidence includes the focused Task 1 active-job/location, trust, and moderation-pagination
suites with 370 cross-role assertions, an eight-file scoped surface with 541 assertions, and the
complete 28-file pgTAP suite with 1019 assertions. The focused media-scan database gate adds 105
assertions plus a real multi-session claim/reclaim, preparation, finalization, cleanup, and nonce
race harness. A five-file onboarding/media contract gate adds 155 assertions, including the exact
safe upload-reference boundary and existing eligibility/review behavior. The complete suite includes
`scoped_support_authorization.test.sql`, `cross_role.test.sql`, `rls.test.sql`,
`pii_admin_scope.test.sql`, `customer_location_authority.test.sql`, `schema.test.sql`, and
`launch_readiness_p0.test.sql`. They cover direct
raw-table PII denial, purpose-scoped projections, assigned/unassigned/expired support,
explicitly ended assignments, revoked roles, unrelated request/job denial, independent exact-location and internal-note access,
analyst denial, operations access, competing offers, unmatched location denial, clean-media
authorization, message attachment ownership, and completion-proof access. Quarantine writes require
the first object-path segment to equal `auth.uid()`. Clean message attachments have no direct
authenticated read policy and are accessed only through the reauthorizing broker; reviewed non-message
clean-object owner/staff behavior remains separately scoped.

## Preview security-hardening gate

The exposed provider projections use invoker semantics. `provider_request_briefs` reads
`service_requests` through its existing RLS and `private.can_read_request` participant check.
`provider_public_profiles` reads a fixed, eleven-field projection supplied by
`private.provider_public_profile_rows()`; the helper exposes only active, verified providers and
does not grant clients raw-table access. The projection contains no email, phone, customer identity,
exact address, or private-document field.

Every `SECURITY DEFINER` function in `public` and `private` has inherited `PUBLIC` execution
revoked. Anonymous execution is limited to the explicitly reviewed external-deletion intake and the
private helper behind the safe public provider view. Authenticated user, staff, and service-worker
RPCs are granted by exact signature. Staff RPCs retain their server-side role/permission checks;
worker and compatibility helpers remain service-only.

RLS-enabled tables with no policy are classified as internal/service-only and have no direct
`anon` or `authenticated` table privileges. This is intentional deny-by-default behavior, not a
missing allow policy. Public RLS predicates cache `auth.uid()` with scalar subqueries; policy
semantics and role coverage are otherwise unchanged.
