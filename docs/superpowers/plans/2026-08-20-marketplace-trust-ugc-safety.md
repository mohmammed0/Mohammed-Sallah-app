# M1 Marketplace Trust and UGC Safety Implementation Plan

> **Execution:** Use Superpowers subagent-driven development sequentially. No commit is authorized; task reports and reviews use the ignored plan workspace and exact working-tree diffs.

**Goal:** Deliver the complete local trust path from customer/provider report and block controls through authoritative RPC/RLS enforcement, scoped moderation, immutable evidence, and regression coverage.

**Architecture:** Add one forward-only trust migration that reuses `blocked_users`, `support_cases`, admin RBAC/audit, idempotency keys, and rate-limit buckets. Add shared Zod trust contracts, a journaled mobile trust client/component, and a least-privilege web moderation queue. Preserve historical text evidence while mutually denying communication and protected media for either-direction blocks.

**Tech stack:** PostgreSQL/Supabase RLS and security-definer RPCs, pgTAP, TypeScript 6, Zod 4, Expo Router/React Native, Next.js App Router server actions, Vitest, Playwright.

**Approved design:** `docs/superpowers/specs/2026-08-20-marketplace-trust-ugc-safety-design.md`

---

### Task 1: Authoritative database trust boundary

**Files:**

- Create: `supabase/tests/database/marketplace_trust_ugc_safety.test.sql`
- Create: `supabase/migrations/20260820010000_marketplace_trust_ugc_safety.sql`
- Modify: `supabase/functions/media-access/index.ts`
- Modify: `packages/database/src/database.types.ts`
- Modify: `docs/security/RLS_MATRIX.md`
- Modify: `docs/security/SECURITY_CONTROLS.md`
- Modify: `docs/privacy/RETENTION_MATRIX.md`

**Step 1: Write failing pgTAP regressions**

Add fixtures for a customer/provider job conversation, unrelated users, assigned and unassigned support staff, operations, and super admin. Prove both-direction block/unblock, self/invalid denial, relationship checks, repeated-command reconstruction, direct INSERT denial, old-conversation and role-switch resistance, attachment/media denial, report legitimacy/forgery/reference bounds/deduplication, rate-limit threshold and actor isolation, safe reporter projection, staff separation, triage/version/idempotency/audit, immutable events, and suspension-aware messaging.

**Step 2: Run the focused test and confirm RED**

Run `pnpm exec supabase test db --file supabase/tests/database/marketplace_trust_ugc_safety.test.sql` against a clean local reset. Confirm failures are missing trust objects/behavior, not fixture errors.

**Step 3: Implement the migration minimally**

Create private helper predicates and actor-scoped rate limiting; create `marketplace_reports`, append-only `marketplace_report_events`, and append-only `user_block_events`; add default-deny RLS; add safe reporter/moderator projections; add explicit `set_user_block`, `create_marketplace_report`, and report triage/resolution RPCs with fixed search paths, exact grants, locks, idempotency, bounded errors, version checks, support-case linking, and audit records. Revoke direct message and block mutations, replace policies with the selected contract, and replace the message RPC so checks occur before replay.

**Step 4: Enforce protected media access**

Update the local `media-access` function to call the server-authoritative message-media authorization boundary and add a focused Deno/static assertion where the function test harness supports it. Do not duplicate or expose media.

**Step 5: Regenerate types and update security documentation**

Run the repository type-generation command after a clean reset and update RLS, security-control, and retention matrices with the exact contract, rate defaults, projections, and evidence limits.

**Step 6: Run focused GREEN checks**

Run the new pgTAP test, existing messaging/idempotency/scoped-support/provider-qualification tests, Deno checks if the Edge function changed, and database type-drift check.

### Task 2: Shared contracts and four-locale mobile trust flow

**Files:**

- Create: `packages/domain/src/trust.ts`
- Create: `packages/domain/test/trust.test.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/domain/package.json`
- Modify: `packages/i18n/src/index.ts`
- Modify: `packages/i18n/test/i18n.test.ts`
- Create: `apps/mobile/src/features/trust/trust-client.ts`
- Create: `apps/mobile/src/features/trust/trust-controls.tsx`
- Create: `apps/mobile/test/trust-controls.test.tsx`
- Create: `apps/mobile/test/trust-client.test.ts`
- Modify: `apps/mobile/src/lib/mutation-journal.ts`
- Modify: `apps/mobile/test/mutation-journal.test.ts`
- Modify: `apps/mobile/app/messages.tsx`
- Modify: `apps/mobile/app/jobs.tsx`

**Step 1: Write failing contract and UI tests**

Test category/details/context schemas and safe server-result parsing; all four locale keys and directions; report/block/unblock controls, confirmation, loading/disabled states, live-region success/error/retry, logical RTL/LTR layout, and minimum accessible action semantics; exact-payload journal replay; message and rating insertion points without raw identifiers or errors.

**Step 2: Run focused tests and confirm RED**

Run `pnpm --filter @sallah/domain test`, `pnpm --filter @sallah/i18n test`, and focused mobile Vitest files. Confirm failures are the missing contracts/components/operations.

**Step 3: Implement shared contracts and journaled client**

Add strict Zod discriminated contexts for user/message/rating reports and safe block/report responses. Extend the journal with explicit `marketplace_report` and `user_block_state` operations. The client authenticates locally, sends only bounded validated identifiers/details, reuses the persisted idempotency key, maps server errors into safe deterministic UI categories, and never toggles state implicitly.

**Step 4: Implement reusable mobile trust controls**

Build a localized accessible sheet/confirmation flow with reason selection, optional explanation, success/error announcements, retry, block/unblock confirmation, and disabled loading states. Use existing primitives and logical-direction styles; do not redesign the message screen.

**Step 5: Integrate messaging and rating surfaces**

Load server-derived trust context for the selected conversation, attach report/block/unblock to counterpart message cards, disable the composer and protected media loading when blocked/suspended, refresh state after commands, and add a report-rating entry for eligible completed-job ratings. Keep both customer/provider route aliases on the same shared code path.

**Step 6: Run focused GREEN checks**

Run domain, i18n, mobile trust, message/component, mutation-journal, lint, and strict typecheck targets.

### Task 3: Least-privilege moderation operations workflow

**Files:**

- Modify: `apps/web/src/lib/admin-permissions.ts`
- Modify: `apps/web/src/lib/auth.ts`
- Modify: `apps/web/app/admin/layout.tsx`
- Create: `apps/web/app/admin/moderation/page.tsx`
- Modify: `apps/web/app/admin/actions.ts`
- Modify: `apps/web/test/admin-permissions.test.ts`
- Modify: `apps/web/test/admin-workflows.test.ts`
- Create: `tests/e2e-web/admin-moderation.spec.ts`
- Modify: `packages/i18n/src/index.ts`

**Step 1: Write failing permission/workflow tests**

Assert moderation navigation and queue use the minimal report projection RPC; support staff require assigned-case scope; operations can triage/escalate/resolve but cannot directly bypass suspension commands; forms carry durable intent, expected version, bounded reasons, safe evidence fields, and no direct private-table reads. Add an E2E path for authorized triage and an unauthorized role denial.

**Step 2: Run focused tests and confirm RED**

Run web admin permission/workflow tests and the focused Playwright spec where local infrastructure is available.

**Step 3: Implement the queue and actions**

Add moderation read/resolve permission typing that mirrors database grants. Load the minimal projection through RPC, show permitted context/history and assignment state, and add triage/dismiss/resolve/escalate actions with Zod validation, durable command keys, expected versions, and server-side RPC calls. Link to existing customer/provider enforcement pages for authorized suspension; never mutate account state in the page/action.

**Step 4: Run focused GREEN checks**

Run web unit tests, lint/typecheck, and focused E2E. Verify ordinary users, analysts, finance, unassigned support, and verification-only roles cannot exceed their scope.

### Task 4: Integration, independent review, and release gate

**Files:**

- Modify only files necessary to resolve credible findings.
- Create ignored task/review artifacts under `.superpowers/sdd/2026-08-20-marketplace-trust-ugc-safety/`.

**Step 1: Run integration regressions**

Run focused domain/mobile/web tests, Supabase clean reset, generated-type drift, full pgTAP/RLS, Deno checks for changed Edge code, security tests, and browser E2E. Use systematic debugging for every unexpected failure; fix the cause and rerun the narrowest reproducer before broad validation.

**Step 2: Conduct independent reviews in the required order**

Provide each reviewer the approved design, implementation plan, protected-file rule, exact base-to-working-tree diff excluding `.agents`, focused test evidence, and previous-review findings. Review sequentially for: specification compliance; code quality; marketplace-trust invariants; privileged RPC/RLS; Codex Security diff scan. Resolve every credible P0/P1 and record accepted P2 risk with rationale.

**Step 3: Run final verification before completion**

Run formatting, lint, strict typecheck, mobile tests, web/admin tests, integration tests, clean Supabase reset, generated-type drift, pgTAP/RLS, changed Deno checks, security tests, relevant browser E2E, and full `pnpm validate`. Mark unavailable Docker/Supabase checks `NOT RUN`; do not substitute weaker evidence.

**Step 4: Re-check protected and Git state**

Confirm branch and HEAD are unchanged, the four `.agents` files match their starting aggregate SHA-256, no protected file is staged/modified, no files are staged, and only M1 application/test/migration/documentation changes plus the protected untracked infrastructure remain. Confirm no cloud or Git publication action occurred.
