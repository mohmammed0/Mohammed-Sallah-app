# Provider qualification and matching

`run_matching` is the authoritative candidate generator and `submit_offer` independently repeats
eligibility checks at submission time. `select_offer` locks the request, offer, and provider and
revalidates the same policy inside the selection transaction. `get_provider_request_brief` repeats it, so a match
does not preserve access after verification, qualification, availability, blackout, capacity, block,
service-area, or catalog eligibility is revoked. Customer offer projections mark an ineligible offer
unselectable and include its structured reason.

Restricted category and subcategory eligibility comes only from the reviewer-controlled
`provider_restricted_qualifications` ledger. The legacy provider-service boolean is synchronized by
the reviewer command but cannot be changed by the provider. Category and subcategory restrictions
are evaluated independently; a restricted subcategory needs the corresponding subcategory grant.

Each matching run evaluates every provider profile and writes a `matching_candidates` row with an
explicit exclusion reason when ineligible. Current reasons cover inactive/unverified/non-accepting
providers, missing category/subcategory service, missing restricted qualification, unavailable time,
active blackout, capacity reached, customer/provider block, and outside service area. Revoked prior
matches are closed.

Distance is calculated with PostGIS from the request's approximate location to the closest eligible
service-area center. The score is normalized as `max(0, 1 - distance/radius)` after the radius check,
then weighted with availability, rating, response rate, workload headroom, and completed jobs. This
produces real distance ordering instead of awarding every in-radius provider a fixed distance weight.
Exact customer addresses never participate in matching or provider briefs.

Provider capacity is `active_workload < max_active_jobs`. Offer selection increments active workload;
exactly-once terminal completion/cancellation decrements it. `service_requests.timing_mode` is the
authoritative timing contract. Publication writes the mode and both window fields in the original
`service_requests` insert, before the `request_auto_match` trigger runs; there is no temporary
flexible state or post-match correction. `asap` stores the publication transaction time plus a
bounded 60-minute default window. All later checks reuse that exact stored window rather than sliding
it forward. `scheduled` requires a valid future `requested_start`/`requested_end` window and
applies full availability coverage plus blackout overlap. `flexible` stores no synthetic window and
does not exclude an otherwise eligible provider solely because the current time is outside ordinary
availability; provider offers remain authoritative for arrival estimates. Matching, brief access,
offer submission, and selection all call the same timing-aware eligibility policy.

An expired ASAP window returns `asap_window_expired`. Provider brief access, new offers, and offer
selection fail immediately; the next matching pass closes stale open candidates. The window is never
silently extended. The customer must create a new timing intent/request before matching can resume.
The upgrade migration converts legacy start-only and invalid pairs to bounded 60-minute scheduled
windows, preserves valid pairs, and clears orphan end-only values into an explicit flexible state.

Suspension, verification loss, material identity resubmission, restricted qualification revocation,
and service removal close affected open matches and withdraw affected active offers with customer
notification. Onboarding diffs final services instead of disabling/re-enabling every row: biography,
locale, unchanged services, and availability edits that still cover a request preserve valid offers.
Category-specific loss does not invalidate unrelated categories. Already selected active jobs remain
intact and receive an operations eligibility-review record rather than being silently removed.

Provider account verification and service approval are independent, server-authoritative gates.
Every enabled provider service has `draft`, `submitted`, `approved`, `more_information_required`,
`rejected`, or `suspended` review state. A verified provider may retain approved services and their
valid offers while a newly added category/subcategory remains draft or submitted. Matching, brief
access, offer submission, and selection require the exact applicable service row to be approved.
