# Preview migration reconciliation — 2026-09-05

Status: CURRENT SUPPORTING DOCUMENT. Audience: release and database owners.

Read-only inspection of Preview project `wxzwdodhhevuunqpzewo` at 07:24 UTC compared
the ledger's stored SQL with repository migrations at `0f26a6a6932922334f45f195f39c3d5d85802b53`.
No hosted migration, setting, credential, ledger row, or user data was changed.

## Observed mapping

The local tree has 45 migrations; Preview has 42 ledger entries. All 42 historical
names map uniquely to local files, while none of their version identifiers match.
SHA-256 comparison found 37 exact byte matches and four matches after normalizing
line endings and trimming leading/trailing whitespace. This compares recorded SQL,
not every current database object or unrecorded administrative change.

| Local migration                                                    | Preview ledger version | Stored SQL comparison       |
| ------------------------------------------------------------------ | ---------------------- | --------------------------- |
| 202608170001_foundation.sql                                        | 20260819023749         | PASS (raw)                  |
| 202608170002_marketplace.sql                                       | 20260819023757         | PASS (raw)                  |
| 202608170003_operations.sql                                        | 20260819023758         | PASS (raw)                  |
| 202608170004_security_commands.sql                                 | 20260819023800         | PASS (raw)                  |
| 202608170005_hardening.sql                                         | 20260819023801         | PASS (raw)                  |
| 202608170006_product_commands.sql                                  | 20260819023814         | PASS (raw)                  |
| 202608170007_job_guards.sql                                        | 20260819023815         | PASS (raw)                  |
| 202608170008_admin_customers.sql                                   | 20260819023931         | HISTORICAL NO-OP; see below |
| 202608170009_edge_least_privilege.sql                              | 20260819023943         | PASS (raw)                  |
| 20260818014746_launch_workflows.sql                                | 20260819023946         | PASS (raw)                  |
| 20260818020801_cancellation_dispute_commands.sql                   | 20260819023948         | PASS (raw)                  |
| 20260818023038_upload_quarantine.sql                               | 20260819023950         | PASS (raw)                  |
| 20260818031500_upload_quarantine_cleanup.sql                       | 20260819024001         | PASS (raw)                  |
| 20260818034000_privacy_retention_contract.sql                      | 20260819024003         | PASS (raw)                  |
| 20260818044128_add_partial_refund_status.sql                       | 20260819024006         | PASS (raw)                  |
| 20260818044132_enforce_workflow_integrity.sql                      | 20260819024008         | PASS (raw)                  |
| 20260818044137_harden_privacy_and_media.sql                        | 20260819024011         | PASS (raw)                  |
| 20260818044142_authorize_location_and_admin.sql                    | 20260819024018         | PASS (raw)                  |
| 20260818101819_atomic_completion_and_core_idempotency.sql          | 20260819024020         | PASS (raw)                  |
| 20260818101820_provider_qualification_and_matching.sql             | 20260819024022         | PASS (raw)                  |
| 20260818101821_scoped_support_and_owner_export.sql                 | 20260819024025         | PASS (raw)                  |
| 20260818123749_finalize_completion_and_provider_selection.sql      | 20260819024027         | PASS (raw)                  |
| 20260818125200_atomic_ai_publication_and_scoped_admin.sql          | 20260819024036         | PASS (raw)                  |
| 20260818131931_schema_wide_data_export_classification.sql          | 20260819024039         | PASS (raw)                  |
| 20260818134350_add_privacy_reviewer_role.sql                       | 20260819024041         | PASS (raw)                  |
| 20260818134351_scope_customer_pii_permission.sql                   | 20260819024043         | PASS (raw)                  |
| 20260818140100_fix_media_and_eligibility_invalidation.sql          | 20260819024046         | PASS (raw)                  |
| 20260818140200_abandon_ai_intake.sql                               | 20260819024119         | PASS (raw)                  |
| 20260818140300_grant_scoped_support_access_reads.sql               | 20260819024126         | PASS (raw)                  |
| 20260818183816_merge_fix_integration_contracts.sql                 | 20260819024128         | PASS (raw)                  |
| 20260819031500_preview_security_hardening.sql                      | 20260819041115         | PASS (raw)                  |
| 20260819123353_customer_saved_locations.sql                        | 20260819171841         | PASS (trim)                 |
| 20260819151047_customer_location_authority.sql                     | 20260819171920         | PASS (trim)                 |
| 20260819151151_ai_contextual_quick_replies.sql                     | 20260819171929         | PASS (trim)                 |
| 20260819151200_ensure_service_city_boundaries.sql                  | 20260819171940         | PASS (trim)                 |
| 20260821055933_marketplace_trust_beta.sql                          | 20260826053749         | PASS (raw)                  |
| 20260821211724_media_scanner_gateway.sql                           | 20260826053755         | PASS (raw)                  |
| 20260825224850_closed_beta_push_notifications.sql                  | 20260826053800         | PASS (raw)                  |
| 20260825233000_feature_completion_controls.sql                     | 20260826053806         | PASS (raw)                  |
| 20260826053000_fix_ai_message_media_binding.sql                    | 20260826053807         | PASS (raw)                  |
| 20260826054406_notification_worker_schedule.sql                    | 20260826054533         | PASS (raw)                  |
| 20260826211831_default_first_time_provider_availability_safely.sql | 20260826212201         | PASS (raw)                  |

## Historical administrative function

The `202608170008_admin_customers` ledger entry contains only a 25-byte no-op.
It must not be treated as evidence that the original 2,941-byte local migration ran.
However, the current `admin_set_customer_status(uuid,account_status,text,text)`
function body exactly matches the later authoritative definition in
`20260821055933_marketplace_trust_beta.sql` after local line-ending normalization.
Both body hashes are
`0be0a518db806033473a0ef263bda3a499a27735b658326f43ff153f46975e4d`.
The live function is security-definer with an empty search path; its observed
EXECUTE grants are postgres, service_role and authenticated. This targeted check
does not establish schema-wide permission equivalence.

## Pending changes and release boundary

These three local migrations have no corresponding Preview ledger entry:

- `20260827214500_deduplicate_logical_notifications.sql`
- `20260905070000_reviewed_legal_consent.sql`
- `20260905073000_isolate_legal_publication_trigger_records.sql`

Review the existing database state and the exact pending statements before an
authorized forward deployment. Do not replay the 42 foundations, repair the ledger
automatically, or run an unreviewed bulk `supabase db push`. The new consent migration
enables enforcement and intentionally blocks content when reviewed policies are absent;
prepare the approved twelve-document packet and a coordinated rollout first. See
[Reviewed policy publication](../operations/LEGAL_PUBLICATION.md).

Local inspection receipts are in ignored `artifacts/preview-migration-fingerprints-2026-09-05.json`
and `artifacts/preview-migration-byte-comparison-2026-09-05.json`. The comparison
receipt SHA-256 is `98fb41fa7490431a3e07c98342a7de49f801d0a015aef2767e42aee7a0c25275`.
