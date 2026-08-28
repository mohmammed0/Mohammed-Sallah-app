# Repository finalization implementation plan

> Execute in order. Keep Production, published history, legacy worktrees, and secrets untouched.

**Goal:** Close exact current failures, consolidate repository truth, and publish a safe multi-tool handoff branch and Draft PR.

**Base:** `f8bce88065b8c9b4ab23521c9bd312d1a9e2b080` (`origin/codex/closed-beta-final-v1`)

## 1. Freeze the observed baseline

- Record ancestry, worktrees, CI runs, Preview services, stale descriptions, known defects, and external gates in `docs/handoff/CODEX_STARTING_BASELINE.md`.
- Verify the new worktree is clean and all excluded worktrees remain untouched.

## 2. Repair mobile CI module resolution

- Reproduce `trust-screen-integration.test.tsx` under the mobile workspace.
- Confirm the unresolved alias is the first failure and not a missing tracked file.
- Apply the smallest import/test-boundary correction.
- Run the exact failing file, relevant design-system tests, lint, and typecheck.

## 3. Repair completion-rejection notification idempotency

- Start/reset local Supabase from the current migration chain.
- Reproduce `atomic_completion_idempotency.test.sql` with two rows for one logical event.
- Trace RPC inserts and notification fanout triggers.
- Add focused RED coverage for replay, response loss, concurrency, later independent rejection, recipient, and payload.
- Create a new forward-only migration; never edit an applied migration.
- Run focused pgTAP, all pgTAP, legacy upgrade, generated-type drift, and local Supabase integration.

## 4. Stabilize remaining product behavior

- Run targeted mobile, web, Edge, scanner, and integration checks to discover deterministic failures.
- Fix only confirmed defects test-first; preserve auth, RLS, marketplace trust, private media, scanner, AI, Push, Maps, and offline/idempotency contracts.
- Record external-only gates without fake success.

## 5. Normalize repository presentation

- Inventory dead code, duplicate helpers/configs, unused dependencies, generated artifacts, root clutter, oversized mixed-responsibility modules, and client/server boundary violations.
- Make only evidence-backed removals or narrow extractions.
- Update OSS inventory/lockfile only if dependencies change.

## 6. Create the handoff package

- Add canonical architecture, domain-flow, data-model, API/RPC, security, service, testing, build, deployment, operations, environment, business-model, human-input, decision-log, technical-debt, and known-issues handoff documents.
- Add Claude Code, Figma, Canva, Notion, Linear, GitHub, visual allowlist/denylist, and handoff manifest files.
- Add concise `CLAUDE.md` routing without duplicating `AGENTS.md`.
- Ensure no prompt grants tools authority over Production, schemas, authorization, secrets, deployments, or release state.

## 7. Consolidated verification

- Run formatting/docs/i18n/inventory, lint/typecheck/tests/builds, database reset/pgTAP/lint/types, Edge/Deno, local Supabase, scanner/ClamAV/media/concurrency/cleanup, E2E where supported, licenses/audit/secrets/SBOM, Expo compatibility/Doctor/export, production fail-closed config, and `git diff --check`.
- Run standard Codex Security scan and final diff scan against the starting base; resolve credible P0/P1 test-first.
- Run final exact-head Android Preview build only when connected credentials/quota permit it without billing, then inspect and document the artifact.

## 8. Publish and prove

- Create coherent conventional commits with explicit path staging.
- Fetch and verify remote state, push normally once, and create one Draft PR based on `codex/closed-beta-final-v1`.
- Update stale PR/tracker text with exact evidence; do not merge.
- Monitor exact-head push and PR workflows until all required jobs finish.
- Report READY only if exact-head required CI is green and the working tree/index are clean; otherwise report the precise blocker.
