# Threat model

Assets: identities/sessions, exact addresses, provider documents, request media, sealed offers, messages, AI content, payment/settlement records, admin authority, and audit evidence. Adversaries include anonymous abuse, malicious customers/providers, compromised accounts/devices, over-privileged operators, supply-chain compromise, prompt injection, webhook spoofing, and accidental disclosure.

| Threat                         | Primary controls                                                                                                                                                   | Residual risk/action                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Cross-tenant data access       | RLS, auth.uid predicates, cross-role pgTAP                                                                                                                         | Retest every policy/migration                                                                              |
| Competing offer disclosure     | sealed-offer policies, customer RPC                                                                                                                                | Metadata inference monitored                                                                               |
| Exact location leak            | separate address table/policy, rounded matching point                                                                                                              | Device screenshots/social engineering                                                                      |
| Provider document/upload abuse | private quarantine, exact capabilities, two ClamAV scans, image decode/re-encode, bounded approved MP4/M4A remux, fail-closed unsupported formats, promotion/audit | ClamAV is not CDR; WebM/PDF fail closed; production scanner/region require deployment                      |
| Scanner compromise or bypass   | dedicated HMAC + one-shot nonce, no broad data credential, opaque attempt paths, signed manifest, Edge metadata/lease/path checks, atomic completion               | DNS/TLS/routes/firewalls, image minimization, legal approval, and deny-by-default egress need hosted proof |
| Stale signatures/unready ClamD | readiness parses engine/database timestamp, claim and manifest enforce maximum age, reload mismatch fails closed                                                   | Continuous signature updates/readiness, alerting, and incident response need operators                     |
| Scanner overload               | one active worker job, 120-second immutable attempt deadline, 20 MiB/40 MP bounds, 1 GiB worker with <=768 MiB acceptance peak, and 4 GiB ClamD local budgets      | Hosted load, native-memory, cgroup, and capacity evidence remain production inputs                         |
| Edge media-memory exhaustion   | Edge handles bounded metadata only; static and behavioral tests prohibit body download, full buffers, Base64, media hashing, upload, and sanitization              | Recheck platform behavior and official hosted limit after deployment                                       |
| Stale attempt/orphan poisoning | distinct opaque artifacts, current-token/lease checks, response-loss replay, deadline-clipped capabilities, 24-hour scheduled cleanup and dead-letter handling     | Hosted schedule activation and monitoring remain external                                                  |
| Admin privilege abuse          | DB roles, route guards, reason, immutable audit                                                                                                                    | Configure MFA/SSO and periodic access review                                                               |
| Invalid job/financial state    | RPC locks, state machine, idempotency, append-only ledger                                                                                                          | Operational overrides require future dual control                                                          |
| AI injection/unsafe diagnosis  | bounded schema, server prompts, safety flags, editable approval, fallback                                                                                          | Provider model behavior needs red-team/evals                                                               |
| Credential leakage             | environment separation, scans, no public secrets                                                                                                                   | Configure production secret manager/rotation                                                               |
| Notification/webhook replay    | dedupe keys, attempt ledger, signature design                                                                                                                      | Gateway/provider-specific verification pending credentials                                                 |
| DoS/cost abuse                 | rate limits, upload caps, bounded parsers, pagination, AI budgets                                                                                                  | Production thresholds require load evidence                                                                |

The local integration uses real local Supabase Storage/PostgreSQL/Edge, the repository pull worker,
exact signed capabilities, and real ClamD/EICAR. It does not prove hosted networking, capacity,
runtime-image/legal readiness, alerting, or continuous signature updates. Image sanitation and actual
M4A/MP4 audio plus completion MP4 video remux are local repository evidence. WebM, PDFs, archives,
Office files, scripts, executables, and unknown formats fail closed; no PDF CDR is claimed. Scanner operational metadata
remains private and is not exposed through owner projections.

The metadata-only Edge control applies to scanning functions. The M1 `media-access` broker streams
after live authorization. Clean-authorized `ai-diagnostic` and `transcribe` provider media transfer
remains an explicit M3 gate and is not represented as completed by this repository-local M2 evidence.

Out of scope for this code-only run: physical device compromise, provider identity fraud beyond manual
evidence, production cloud/account hardening, hosted gateway/SMS/push behavior, and legal policy
adequacy.
