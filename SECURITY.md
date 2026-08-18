# Security policy

Report vulnerabilities privately to the repository owner through GitHub private vulnerability reporting. Do not open a public issue containing exploits, credentials, personal data, exact addresses, provider documents, or payment records. A real production security email is a required human input before launch.

Supported code is the current controlled-launch branch and the latest released tag. Critical findings involving authentication bypass, RLS, sealed-offer leakage, exact-location disclosure, admin elevation, private storage, financial integrity, or remote execution receive priority.

## Baseline controls

- Supabase Auth plus database-enforced roles and RLS; UI hiding is never authorization.
- Exact customer addresses are readable only by the customer, selected provider, or authorized staff.
- Competing provider offers are sealed by policies and cross-role pgTAP tests.
- Critical mutations use security-definer RPCs with fixed `search_path`, actor checks, state validation, idempotency, versioning, and audit history.
- Private storage buckets require owner-prefixed paths; server-authorized signed URLs are short-lived.
- AI and secret keys are server-only. Logs exclude tokens, raw documents, addresses, prompts containing sensitive data, and payment data.
- Append-only triggers protect job, payment, settlement, and admin audit events.

See `docs/security/THREAT_MODEL.md`, `docs/security/RLS_MATRIX.md`, and `docs/operations/INCIDENT_RESPONSE.md`.
