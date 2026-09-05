# Review accounts

No credentials are fabricated or committed. Before submission, the release owner creates isolated reviewer accounts containing only synthetic data in the backend actually used by the submitted binary. Do not route reviewers secretly to different behavior or supply credentials for an unrelated preview environment:

- Customer: verified email, readable approved current legal docs, supported synthetic address, one published request with offers, one selected/completable job. Verify both the first-time acceptance journey and an already accepted journey; never fabricate acceptance receipts.
- Provider: submitted and manually verified synthetic provider, one enabled category/service area/availability, no real identity document, one invited request and selected job.
- Admin accounts are not supplied to store reviewers unless explicitly required and must use least privilege/MFA.
- Disposable customer: separate account for reauthentication, export and deletion so deletion does not disable the main review journey.

Store credentials belong in the console's secure reviewer fields, never Git, screenshots, issue comments, or PR text. The seeded journey must not use production users or claim real payment/SMS/push delivery. Document environment URL, reset behavior, deletion route, AI fallback, and any feature flags immediately before submission.

Record the exact source SHA, binary version/build and checksum, application identifier, backend, enabled features, distribution channel, fixture reset owner, timestamp and evidence paths. Confirm reviewer access is not blocked by verification email, expiry, territories or allowlists. Do not claim these accounts or fixtures exist until provisioned and tested.

Customer walkthrough: sign in and read/accept required policies; choose the prepared service location; try manual request entry and the optional AI permission flow; review a prepared request and compare its offers; select the fixture provider; inspect job/chat and change-order approval; review completion and rating. Use a separate fixture for dispute/report/block flows.

Provider walkthrough: sign in as the verified provider; inspect the eligible request's approximate area; submit an offer; open the selected job; advance through permitted stages; start/stop foreground sharing and leave the app to verify stopping; submit synthetic completion evidence. A separate unverified fixture can demonstrate onboarding.
