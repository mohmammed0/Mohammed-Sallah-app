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
exactly-once terminal completion/cancellation decrements it. Eligibility uses the request execution
window: `requested_start`/`requested_end`, or an ASAP fallback beginning at the evaluation time. The
availability rule is full coverage by one availability row on the request's Riyadh-local weekday; a
blackout intersecting any part of the requested window excludes the provider. Existing-offer viewing
does not fail solely because the current clock moved outside normal hours, while offer submission and
selection still revalidate capacity, account, verification, service, qualification, blackout, and
the scheduled window.

Suspension, verification loss, material resubmission, restricted qualification revocation, and
service removal close open matches and withdraw active offers with customer notification. Already
selected active jobs remain intact and receive an operations eligibility-review record rather than
being silently removed.
