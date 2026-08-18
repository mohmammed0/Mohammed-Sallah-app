# Provider verification runbook

Only `verification_reviewer` or `super_admin` may decide verification or grant/revoke a restricted
category/subcategory qualification. The qualification command requires a reason, idempotency key,
advisory lock, immutable qualification event, and admin audit record. A provider cannot set
`qualified_for_restricted` directly or through onboarding.

Open private documents through short-lived authorized access, verify document
type/expiry/name/business reference/category qualifications against the approved policy, check
tampering/duplication signals, and never download to unmanaged devices.

Account decisions are `verified`, `more_information_required`, `rejected`, or `suspended`. Every
decision requires a specific, non-discriminatory reason; the RPC writes provider history and
immutable admin audit. Material identity/company-registration changes and new identity/commercial
documents disable `accepting_requests` and return a verified account to account review. Biography,
locale, ordinary availability, and service-only changes do not contradict or silently reset a valid
account verification.

Each category/subcategory row has its own `draft`, `submitted`, `approved`,
`more_information_required`, `rejected`, or `suspended` decision. A provider may save a new service
as draft or submit it, but only `verification_reviewer`/`super_admin` can approve it. The final JSON
returned by onboarding is read back from committed provider/service state. Existing approved
services remain eligible while a new service waits; removing a service withdraws only that
service's matches/offers. Matching, provider-brief access, offer submission, and offer selection all
require the applicable row to be approved. Restricted services additionally require the separate,
reviewer-controlled qualification ledger and approved evidence matrix. The app never auto-verifies
from AI.

Use four-eyes review for ambiguous or high-risk cases before launch policy permits approval. Re-review expiring documents and periodically sample verified providers. Suspend immediately for credible safety/fraud risk, preserve evidence, notify through support, and follow appeal policy. Final eligibility criteria and regulated-category obligations require Saudi legal/operations approval.
