# Data inventory

| Class                | Examples                                                | Location                   | Sensitivity                    |
| -------------------- | ------------------------------------------------------- | -------------------------- | ------------------------------ |
| Identity/contact     | auth ID, name, email/phone, locale                      | Auth/profiles              | confidential                   |
| Precise location     | address, point, access notes                            | addresses/jobs             | highly confidential            |
| Approximate location | rounded request point, city/district                    | service requests           | confidential                   |
| Provider evidence    | identity/license/registration images                    | private storage + metadata | highly confidential            |
| Service content      | text, answers, photos, voice/transcript                 | DB/private storage         | potentially sensitive          |
| Marketplace          | matches, sealed offers, job/change orders               | DB                         | confidential/commercial        |
| Communications       | messages, support, moderation                           | DB/private storage         | confidential                   |
| AI metadata          | original input, structured result, model/usage/fallback | DB                         | potentially sensitive          |
| Financial            | amounts, provider-neutral refs, holds/events            | DB                         | confidential; no raw card data |
| Security/ops         | device hash, push token ciphertext, audit/log metadata  | DB/logs                    | confidential                   |

Purpose, access, retention, deletion/anonymization, subprocessors, and cross-border handling require final legal approval. Data minimization and RLS apply independently of policy text.

## Account export manifest

The export worker emits exactly the following top-level categories. Storage paths, signed URLs,
content hashes used as internal controls, device hashes, provider tokens, payment-provider
references, audit IP hashes, and data belonging only to another participant are excluded.

<!-- export-manifest:start -->

- `profile`
- `roles`
- `preferences`
- `notificationPreferences`
- `addresses`
- `legalAcceptances`
- `devices`
- `providerProfile`
- `providerServices`
- `providerServiceAreas`
- `providerAvailability`
- `providerBlackouts`
- `providerDocuments`
- `providerPortfolio`
- `serviceRequests`
- `requestAnswers`
- `requestMedia`
- `requestTranslations`
- `aiSessions`
- `aiMessages`
- `aiDiagnostics`
- `transcriptions`
- `matches`
- `offers`
- `jobs`
- `jobHistory`
- `jobEvents`
- `completionProofs`
- `conversations`
- `messages`
- `messageAttachments`
- `payments`
- `refunds`
- `financialHolds`
- `cancellations`
- `disputes`
- `supportCases`
- `ratings`
- `notifications`
- `privacyRequests`

<!-- export-manifest:end -->

`scripts/check-data-inventory.mjs` compares this list with the database export manifest on every
full validation run.

The database function and this document are two views of one explicit 40-category contract. Export generation fails if an unlisted category is introduced, and CI fails if the documented list drifts. Account deletion uses the same ownership inventory for storage discovery, paginates until no objects remain, and records a failure instead of claiming completion when cleanup is incomplete.
