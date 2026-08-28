# Validation evidence

Exact checkout identity is always the output of `git rev-parse HEAD`. Evidence
must be refreshed after final bytes stabilize and hosted workflow URLs are known.

## Focused remediation evidence

- Mobile trust integration: 49/49 PASS after isolating the visual module at the test boundary.
- Customer route/design/recovery: 28/28 PASS across 8 exact test files.
- Completion/idempotency pgTAP: 41/41 PASS on the forward migration.
- Push pgTAP: 66/66 PASS; safe transport is linked to one logical notification.
- Local pgTAP: 33 SQL files PASS in a fresh local schema, including RLS coverage.
- Local Supabase integration: PASS for location authority, private Storage,
  deterministic AI, true concurrent idempotency, and the one-logical-notification
  assertion. Windows `127.0.0.1:54321` was occupied by an older `wslrelay`, so
  the test was explicitly routed to the current Docker binding; no repository or
  hosted configuration was weakened.
- Edge/Deno: format and lint PASS; 134/134 function tests PASS; nine function
  entrypoints check successfully.
- Full deterministic scanner gate: PASS for real ClamAV/EICAR, image safety,
  M4A/MP4 audio and video remux, FFprobe reopen, signature freshness/staleness,
  bounded cleanup, and sequential resource limits. Edge memory is 8/8 PASS.
- Full `pnpm validate`: PASS, including format, docs, i18n, lint, strict
  typecheck, workspace tests, mobile/web production builds, and Android export.
- Web Playwright: 10 PASS and 4 intentional mobile-project admin skips; Chromium
  exercises the authoritative administration flows.
- Load smoke: 200/200 checks PASS with zero failed requests and p95 5.11 ms.
- Expo Doctor: 21/21 PASS with explicit local environment selection.
- Production configuration: correctly FAILS CLOSED when required Production
  values are absent.
- Licenses, high-severity dependency audit, and repository secret helper: PASS;
  no known high-severity dependency vulnerability and no repository secret hit.
- Repository SBOM SHA-256:
  `df8f5fc563274f6b7ec100a15f54232c9a8e34262156117f8178bc36d089eb12`.
- Scanner container SBOM SHA-256:
  `5cb35ac47181f5277908eec79d2a573eb311e0f94c244ccaf7a8013e046efd5d`.
- Scanner image identity:
  `sha256:e78971f29baeb6f9405239d9e05563bc547813bc04470c9aceeec08e9c967330`.
- Migration-set SHA-256: `99c924443da56f5d7fca1fa60ed575ffefebf103a58b4e61986b88572678309d`.
- Generated database types SHA-256:
  `9572a6ca5bd15d2c25003a791a389a98c6db870d1a1a7f455146883045fff5a7`.
- Lockfile SHA-256: `ad13ed60948d0d4abe37cbfd52cca9384e05a232f974c491499e96c74f670db5`.
- Handoff policy: 3/3 PASS.
- UI boundary policy: 3/3 PASS and repository scan PASS.
- UI catalog policy: 3/3 PASS; 28 synthetic states validated.
- Codex Security final diff scan:
  `sallah-finalization-diff-20260828T040000Z`; complete 71-file coverage,
  P0/P1/P2/P3 = 0/0/0/0, no deferred security coverage. TAC status was not
  available because its optional connector was not authenticated.
- Codex Security final repository scan:
  `sallah-final-repository-security-20260828T040500Z`; complete 650-file
  repository inventory across authentication and authorization, RLS/RPC and
  direct-table bypass, private Storage and scanner capabilities, exact-location
  privacy, marketplace trust, privacy/export/deletion, OpenAI and prompt
  injection, mobile/client secrets, logs, dependencies, licenses, and SBOM
  evidence. P0/P1/P2/P3 = 0/0/0/0 with no deferred security-critical coverage.

## Environment-specific limitation

Supabase CLI 2.114.0 on this Windows/WSL host can re-enter the first legacy
migration after local bootstrap and report that `user_role` already exists. A
fresh migration-free local project starts, and the complete ordered repository
migration set plus both seeds and all pgTAP files pass when applied once. The
unchanged historical foundation migration is not rewritten to mask a local CLI
state defect; exact-head hosted Linux CI remains authoritative for clean CLI
bootstrap and the legacy-upgrade wrapper.

## Pending exact-head gates

- Exact-head GitHub Actions required jobs after publication.
- Optional exact-head Android internal artifact only when existing credentials
  and free quota are available without billing.
