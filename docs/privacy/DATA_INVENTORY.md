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
- `aiMessageMedia`
- `aiDiagnostics`
- `aiUsage`
- `transcriptions`
- `matches`
- `offers`
- `jobs`
- `jobHistory`
- `jobEvents`
- `completionProofs`
- `customerAcceptances`
- `conversations`
- `messages`
- `messageAttachments`
- `messageDeliveryHistory`
- `payments`
- `refunds`
- `financialHolds`
- `invoices`
- `receipts`
- `cancellations`
- `cancellationDecisions`
- `disputes`
- `disputeEvents`
- `supportCases`
- `supportMessages`
- `supportEvidence`
- `ratings`
- `notifications`
- `uploadSecurityEvents`
- `privacyRequests`
- `blockedUsers`
- `providerQualifications`
- `providerQualificationHistory`
- `providerDocumentReviews`
- `providerStatusHistory`
- `providerSuspensions`
- `offerRevisions`
- `offerStatusHistory`
- `offerWithdrawals`
- `changeOrders`
- `changeOrderItems`
- `jobAssignments`
- `jobChecklists`
- `jobNotes`
- `completionAttempts`
- `acceptanceEvidence`
- `messageReadReceipts`
- `messageTranslations`
- `messageModeration`
- `paymentAttempts`
- `paymentEvents`
- `providerSettlements`
- `settlementEvents`
- `platformFees`
- `financialActionIntents`

<!-- export-manifest:end -->

## Export query coverage

Every manifest category is bound to a concrete query anchor in `build_data_export`. The parity
check fails when a category lacks an implementation query, its documented anchor drifts, or an
anchor disappears from the export function.

<!-- export-query-coverage:start -->

- `profile` → `profiles p_export`
- `roles` → `user_roles roles_export`
- `preferences` → `user_preferences preferences_export`
- `notificationPreferences` → `notification_preferences notification_preferences_export`
- `addresses` → `addresses addresses_export`
- `legalAcceptances` → `legal_acceptances legal_export`
- `devices` → `user_devices devices_export`
- `providerProfile` → `provider_profiles provider_profile_export`
- `providerServices` → `provider_services provider_services_export`
- `providerServiceAreas` → `provider_service_areas provider_areas_export`
- `providerAvailability` → `provider_availability provider_availability_export`
- `providerBlackouts` → `provider_blackout_periods provider_blackouts_export`
- `providerDocuments` → `provider_documents provider_documents_export`
- `providerPortfolio` → `provider_portfolio_items provider_portfolio_export`
- `serviceRequests` → `service_requests requests_export`
- `requestAnswers` → `service_request_answers request_answers_export`
- `requestMedia` → `request_media request_media_export`
- `requestTranslations` → `request_translations request_translations_export`
- `aiSessions` → `ai_sessions ai_sessions_export`
- `aiMessages` → `ai_messages ai_messages_export`
- `aiMessageMedia` → `ai_message_media ai_media_export`
- `aiDiagnostics` → `ai_diagnostics ai_diagnostics_export`
- `aiUsage` → `ai_usage_events ai_usage_export`
- `transcriptions` → `transcription_jobs transcriptions_export`
- `matches` → `request_provider_matches matches_export`
- `offers` → `offers offers_export`
- `jobs` → `jobs jobs_export`
- `jobHistory` → `job_status_history job_history_export`
- `jobEvents` → `job_events job_events_export`
- `completionProofs` → `completion_proofs completion_proofs_export`
- `customerAcceptances` → `customer_acceptances acceptances_export`
- `conversations` → `conversation_members conversations_membership_export`
- `messages` → `conversation_members messages_membership_export`
- `messageAttachments` → `conversation_members attachments_membership_export`
- `messageDeliveryHistory` → `message_delivery_events delivery_export`
- `payments` → `payments payments_export`
- `refunds` → `refunds refunds_export`
- `financialHolds` → `financial_holds holds_export`
- `invoices` → `invoices invoices_export`
- `receipts` → `receipts receipts_export`
- `cancellations` → `cancellation_requests cancellations_export`
- `cancellationDecisions` → `cancellation_decisions cancellation_decisions_export`
- `disputes` → `disputes disputes_export`
- `disputeEvents` → `dispute_events dispute_events_export`
- `supportCases` → `support_cases support_cases_export`
- `supportMessages` → `support_case_messages support_messages_export`
- `supportEvidence` → `support_case_evidence support_evidence_export`
- `ratings` → `ratings ratings_export`
- `notifications` → `notification_outbox notifications_export`
- `uploadSecurityEvents` → `upload_security_events upload_events_export`
- `privacyRequests` → `data_export_requests privacy_exports_export`
- `blockedUsers` → `blocked_users blocked_export`
- `providerQualifications` → `provider_restricted_qualifications qualifications_export`
- `providerQualificationHistory` → `provider_qualification_events qualification_events_export`
- `providerDocumentReviews` → `provider_document_reviews document_reviews_export`
- `providerStatusHistory` → `provider_status_history provider_history_export`
- `providerSuspensions` → `provider_suspensions suspensions_export`
- `offerRevisions` → `offer_revisions revisions_export`
- `offerStatusHistory` → `offer_status_history offer_history_export`
- `offerWithdrawals` → `offer_withdrawals withdrawals_export`
- `changeOrders` → `change_orders change_orders_export`
- `changeOrderItems` → `change_order_items change_items_export`
- `jobAssignments` → `job_assignments assignments_export`
- `jobChecklists` → `job_checklists checklists_export`
- `jobNotes` → `job_notes notes_export`
- `completionAttempts` → `completion_attempts attempts_export`
- `acceptanceEvidence` → `customer_acceptance_evidence acceptance_evidence_export`
- `messageReadReceipts` → `message_read_receipts read_receipts_export`
- `messageTranslations` → `message_translations message_translations_export`
- `messageModeration` → `message_moderation_events moderation_export`
- `paymentAttempts` → `payment_attempts payment_attempts_export`
- `paymentEvents` → `payment_events payment_events_export`
- `providerSettlements` → `provider_settlements settlements_export`
- `settlementEvents` → `settlement_events settlement_events_export`
- `platformFees` → `platform_fees fees_export`
- `financialActionIntents` → `financial_action_intents intents_export`

<!-- export-query-coverage:end -->

Owner scope includes both sides of a marketplace interaction: sent and received conversation
messages and attachment metadata (including historical memberships), cancellations and disputes
affecting the owner's request/job regardless of opener, participant-visible decisions/events,
user-visible support replies/evidence, financial records involving the owner, notification delivery
history, AI usage/media/translations, and owner upload-security events. Provider exports retain the
commercial-registration reference while omitting private document paths and hashes.

The portable export removes counterparty contact and private identity fields, payment-provider
references, internal support messages/notes, private storage paths, signed URLs, security hashes,
and exact coordinates. Approximate request geography is also omitted from the portable payload;
the legal/data-governance policy remains the authority for any future location portability change.

## Schema-wide classification

After a clean reset, every public application table must have exactly one row in
`data_export_table_classifications`: `exported`, `exported_with_redaction`,
`internal_security_only`, `operational_only`, or `not_user_related`. Exported rows map to manifest
categories and concrete query anchors. Every excluded row carries its repository-reviewed reason;
the classification table is the authoritative, testable documentation for those per-table reasons.

The current catalog contains 130 classified tables: 14 `exported`, 64
`exported_with_redaction`, 17 `internal_security_only`, 21 `operational_only`, and 14
`not_user_related`. `assert_data_export_catalog_complete()` compares those rows with
`pg_catalog`; pgTAP and CI fail on any new, missing, duplicate, invalid, or unmapped table. The
classification metadata itself is service-role-only and protected by RLS.

`scripts/check-data-inventory.mjs` compares the 76-category manifest, documented anchors, database
coverage map, concrete export queries, classification cardinality, all five classification kinds,
and the presence of the catalog assertion on every full validation run.

The database function and this document are two views of one explicit 76-category contract. Export generation fails if an unlisted category is introduced, and CI fails if the documented list, query coverage, or actual database catalog drifts. Account deletion uses the same ownership inventory for storage discovery, paginates until no objects remain, and records a failure instead of claiming completion when cleanup is incomplete.
