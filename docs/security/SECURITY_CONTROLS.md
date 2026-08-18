# Security controls register

Preventive: strict environment validation, auth confirmation, minimum password policy, RLS, private storage, least-privilege roles, server-only secrets, state/RPC validation, idempotency, CSP, permissions policy, bounded uploads, allowed MIME types, rate limits, and production feature gates.

Detective: immutable admin/job/payment/settlement events, structured correlation IDs, notification failures/dead letters, dependency audit, license gate, secret patterns, TypeScript/Zod boundaries, database tests, and operational health metrics.

Corrective: global sign-out, token deletion, account suspension/deletion state, provider suspension, financial holds, dispute workflow, compensating migrations, backup restore to a new project, feature disablement, and credential rotation.

Production actions still required: operator MFA/SSO, WAF/rate-limit tuning, centralized alerting, private document malware scanning, penetration test, backup restore drill, AI red-team/evals, and Saudi legal/privacy review.

- Edge Functions receive narrowly enumerated service-role grants for request-translation reads/writes, AI/transcription usage inserts, and notification outbox processing. They receive no blanket public-schema DML and no profile deletion privilege. Handlers authenticate first, authorize the target resource explicitly, validate inputs, and write status/usage records.
