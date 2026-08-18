# Threat model

Assets: identities/sessions, exact addresses, provider documents, request media, sealed offers, messages, AI content, payment/settlement records, admin authority, and audit evidence. Adversaries include anonymous abuse, malicious customers/providers, compromised accounts/devices, over-privileged operators, supply-chain compromise, prompt injection, webhook spoofing, and accidental disclosure.

| Threat                        | Primary controls                                                          | Residual risk/action                                       |
| ----------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Cross-tenant data access      | RLS, auth.uid predicates, cross-role pgTAP                                | Retest every policy/migration                              |
| Competing offer disclosure    | sealed-offer policies, customer RPC                                       | Metadata inference monitored                               |
| Exact location leak           | separate address table/policy, rounded matching point                     | Device screenshots/social engineering                      |
| Provider document leak        | private bucket, owner/admin access, signed URLs                           | Add malware scanning before broad launch                   |
| Admin privilege abuse         | DB roles, route guards, reason, immutable audit                           | Configure MFA/SSO and periodic access review               |
| Invalid job/financial state   | RPC locks, state machine, idempotency, append-only ledger                 | Operational overrides require future dual control          |
| AI injection/unsafe diagnosis | bounded schema, server prompts, safety flags, editable approval, fallback | Provider model behavior needs red-team/evals               |
| Credential leakage            | environment separation, scans, no public secrets                          | Configure production secret manager/rotation               |
| Notification/webhook replay   | dedupe keys, attempt ledger, signature design                             | Gateway/provider-specific verification pending credentials |
| DoS/cost abuse                | rate limits, caps, pagination, AI budgets                                 | Production thresholds require load evidence                |

Out of scope for this code-only run: physical device compromise, provider identity fraud beyond manual evidence, production cloud/account hardening, real gateway/SMS/push behavior, and legal policy adequacy.
