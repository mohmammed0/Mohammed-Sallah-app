# Codex starting baseline

Date: 2026-08-27. This is the immutable starting record for the repository-finalization task. It records observed state; it is not release approval.

## Source and ancestry

- Worktree: `C:\Users\fas51\source\Sallah-repository-finalization-multitool-handoff-v1`
- Branch: `codex/repository-finalization-multitool-handoff-v1`
- Starting HEAD: `f8bce88065b8c9b4ab23521c9bd312d1a9e2b080`
- Starting tree: clean, empty index, no unexpected untracked files.
- Remote: `https://github.com/mohmammed0/Mohammed-Sallah-app.git`
- Base selected: `origin/codex/closed-beta-final-v1`, the current head of Draft PR #32.
- Ancestry proof: PR #32 contains the complete stacked PR chain and `codex/launch-readiness-v2`. The merge base between `codex/launch-readiness-v2` and PR #32 is `52fdb78ab2668437ff9f8ca6757669f9f8e93eb8`; the latter has 112 additional commits and no missing launch-readiness commit.
- Included milestone heads: PR #7 `f23616b`, PR #17 `46e8c8c`, PR #24 `3218d55`, PR #25 `bc8afd9`, PR #26 `03c3525`, PR #31 `268491a`, and PR #32 `f8bce88`.
- Missing known milestone commits: none discovered by ancestry inspection.

The canonical launch-readiness checkout, completed M2 and feature-complete worktrees, and the unfinished dirty V1 worktree are read-only inputs to this task. Legacy copies and backup repositories are excluded.

## Current hosted evidence

- Draft PR #32 is open, targets `codex/feature-complete-beta-v1`, has auto-merge disabled, and is not ready to merge.
- Exact PR #32 head workflows: push run `33062076893` and pull-request run `33062080697` both failed.
- `media-scanner`: PASS.
- `web`: PASS.
- `mobile`: FAIL because `apps/mobile/app/jobs.tsx` imports `@/design-system/customer-components`, which the focused Vitest runtime does not resolve.
- `repository`: FAIL through the same mobile test failure.
- `supabase`: FAIL because completion rejection creates two outbox rows for one logical provider notification; the assertion reports `have: 2`, `want: 1`.
- Later checks in a failed job are not accepted as evidence when skipped.

## Preview and production

- Supabase Preview project `wxzwdodhhevuunqpzewo`: `ACTIVE_HEALTHY`, PostgreSQL 17, 42 hosted migrations, and the expected AI, media, privacy, notification, push, scanner-control, translation, transcription, and reauthentication Edge Functions are active.
- DigitalOcean Preview scanner: Docker enabled, scanner worker/signature updater/ClamD healthy, signatures loaded, container ports private, host firewall SSH-only, and adequate CPU, memory, and disk headroom.
- Android emulator: Preview package `com.mohmammed0.sallah.preview` version `0.1.0` / version code `13` is installed and running.
- Last documented Android artifact: EAS build `208ab028-3796-45aa-99c3-ec9992298008`, SHA-256 `8758f6d42304991012c19e6467d1c7927c377cb5e5ccf9d9a06187603b1ad653`. It predates this finalization branch and is not exact-head evidence.
- Production: NOT TOUCHED and NOT VERIFIED by this task. No deployment, secret mutation, migration, store action, or production claim is authorized.

## Known defects and risks

- P0: none confirmed at baseline.
- P1: one logical completion-rejection event yields duplicate provider outbox rows after push fanout; idempotency/replay/concurrency behavior requires a real source fix.
- P1: the mobile CI test runtime cannot resolve a production design-system import used by the job screen.
- P2: PR #32 description still reports the customer-tab loop as open even though a later exact-APK comment records the repair.
- P2: Tracker #23 contains contradictory milestone checkboxes and status prose.
- P2: the final validation report describes an older PR #5 state and is not current release evidence.
- P2: several human-input and beta documents still describe Preview AI, scanner, Maps, and Push activation as not run even though newer Preview evidence exists; exact wording must be reconciled without converting external/device gates to PASS.

## Human input required

- Apple Developer team/signing and any paid enrollment.
- Physical-device Push receipt and physical GPS accuracy.
- Production domains, legal entity, privacy/terms approval, store accounts, production secrets, production scanner/network approvals, and public launch authorization.
- Any billing or paid-plan activation.

## Not run at baseline

- Exact-head full repository validation.
- Exact-head full pgTAP, reset, legacy upgrade, local Supabase integration, scanner integration, security scan, audit, licenses, and SBOM refresh.
- Exact-head Android Preview build and physical-device matrix.
- iOS build/signing.
- Production deployment, migration, smoke, or store submission.

## Stale descriptions discovered

- PR #32 body predates its latest navigation-fix comment and artifact.
- Tracker #23 mixes completed M2 evidence with unchecked M2 and later milestones.
- `docs/validation/FINAL_VALIDATION_REPORT.md` is a retained historical report, not the current handoff record.
- Human-input and beta activation prose must be separated into current Preview evidence versus still-external production/device gates.
