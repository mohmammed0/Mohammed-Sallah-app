# Provider verification runbook

Only `verification_reviewer` or `super_admin` may decide verification or grant/revoke a restricted
category/subcategory qualification. The qualification command requires a reason, idempotency key,
advisory lock, immutable qualification event, and admin audit record. A provider cannot set
`qualified_for_restricted` directly or through onboarding.

Open private documents through short-lived authorized access, verify document
type/expiry/name/business reference/category qualifications against the approved policy, check
tampering/duplication signals, and never download to unmanaged devices.

Decisions: `verified`, `more_information_required`, `rejected`, or `suspended`. Every decision
requires a specific, non-discriminatory reason; the RPC writes provider history and immutable admin
audit. Adding/removing a service category or subcategory, changing individual/company identity or
commercial registration, or adding/changing identity/commercial documents immediately disables
`accepting_requests` and returns a verified provider to `submitted` review. Biography, locale, and
ordinary availability changes may preserve verification. Restricted services require the externally
approved evidence matrix. The app never auto-verifies from AI.

Use four-eyes review for ambiguous or high-risk cases before launch policy permits approval. Re-review expiring documents and periodically sample verified providers. Suspend immediately for credible safety/fraud risk, preserve evidence, notify through support, and follow appeal policy. Final eligibility criteria and regulated-category obligations require Saudi legal/operations approval.
