# M2B production-quality media scanning repository implementation plan

> **For Codex:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` to implement this
> plan task-by-task. The user forbids commits and staging, so every implementer and reviewer must leave
> the shared M2 worktree uncommitted and unstaged and must report exact owned paths and RED/GREEN
> evidence instead of committing.

**Goal:** Replace the test-only upload scanner path with a repository-owned, locally validated ClamAV
gateway and a fail-closed attempt-bound promotion pipeline, without provisioning hosted services or
changing application features.

**Architecture:** Keep Supabase quarantine, authorization, clean buckets, and protected-media broker
authoritative. Add a Node/TypeScript gateway that authenticates raw bounded uploads, performs ClamD
INSTREAM scans before and after purpose-specific sanitization/validation, and returns a strict
versioned result. Edge independently validates that result before Storage promotion and an atomic
attempt-bound database completion. Privacy cleanup removes quarantine and orphan target objects.

**Tech Stack:** Node 24, TypeScript 6, Zod 4, `@napi-rs/image`, Deno/Supabase Edge Functions,
PostgreSQL 17/pgTAP, Docker Compose, official ClamAV 1.4 LTS image, pnpm/Turbo, Vitest/node:test.

**Specification:**
`docs/superpowers/specs/2026-08-21-media-scanning-beta-design.md`

**Global constraints:** Start from exact D1 SHA `bc8afd939a532021dd5a6a975894b2cee4842a87` in only
`/mnt/c/Users/fas51/source/Sallah-media-scanning-v1`. Use strict regression-first TDD. Create the one
forward migration with `supabase migration new`. Never edit an applied migration. No staging,
commits, push, PR/issue mutation, hosted Supabase, deployment, EAS, secrets, billing, store action,
M3, or parent-worktree writes. Preserve current client upload APIs and protected-media authorization.
All logs/errors are bounded safe categories. Use official/current primary documentation for technical
claims. End with a durable Codex Security diff scan and zero unresolved P0/P1.

---

### Task 1: Establish the scanner package and strict transport contracts

**Files:**

- Create: `services/media-scanner/package.json`
- Create: `services/media-scanner/tsconfig.json`
- Create: `services/media-scanner/src/contracts.ts`
- Create: `services/media-scanner/src/auth.ts`
- Create: `services/media-scanner/src/body.ts`
- Create: `services/media-scanner/test/contracts.test.ts`
- Create: `services/media-scanner/test/auth-body.test.ts`
- Modify: `package.json`
- Modify: `pnpm-workspace.yaml`
- Modify: `pnpm-lock.yaml`

**Step 1: Write failing boundary tests** for strict headers/result schemas, duplicate/comma-joined
header rejection, constant-time secret behavior, exact content length, disconnect, empty/oversized
body, and safe error categories. Expectations must be hand-derived literals.

**Step 2: Run the focused service tests and capture RED** caused only by missing production modules.

**Step 3: Implement the minimum strict contracts/auth/body reader.** Use exact dependencies and no
framework or command execution.

**Step 4: Run focused tests, typecheck, lint, and mutation probes GREEN.** Verify malformed inputs do
not echo content or secrets. Do not commit or stage.

### Task 2: Implement the bounded ClamD INSTREAM client

**Files:**

- Create: `services/media-scanner/src/clamd.ts`
- Create: `services/media-scanner/test/clamd.test.ts`

**Step 1: Write a real TCP fixture test** proving INSTREAM framing, network-byte-order chunks, zero
terminator, clean/malicious/error parsing, size-limit handling, connect timeout, response timeout,
abort, and socket cleanup. Name the production break each test catches.

**Step 2: Run and capture exact RED.**

**Step 3: Implement the smallest client** with bounded chunks and one request per connection. Never
expose ClamD text directly outside the module.

**Step 4: Run focused tests/type/lint GREEN** and mutate framing/timeout branches to prove coverage.

### Task 3: Implement purpose-specific sanitization and structural validation

**Files:**

- Create: `services/media-scanner/src/media-policy.ts`
- Create: `services/media-scanner/src/image-sanitizer.ts`
- Create: `services/media-scanner/src/iso-bmff.ts`
- Create: `services/media-scanner/src/ebml.ts`
- Create: `services/media-scanner/src/sanitize.ts`
- Create: `services/media-scanner/test/fixtures/*`
- Create: `services/media-scanner/test/sanitize.test.ts`
- Modify: `services/media-scanner/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `pnpm-workspace.yaml` only if the reviewed native package needs an explicit build approval
- Modify: `oss-inventory.json`
- Modify: `THIRD_PARTY_NOTICES.md`
- Modify: `docs/oss/OSS_INVENTORY.md`
- Modify: `docs/oss/OSS_EVALUATION.md`

**Step 1: Add failing behavior tests** for JPEG/PNG/WebP metadata and trailing-byte removal, decode
failure, dimensions/pixel bombs, same-format output, MP4 audio/video family/track bounds, WebM audio
bounds, malformed/oversized boxes/elements, active/polyglot inputs, unsupported purpose combinations,
and universal PDF rejection.

**Step 2: Capture RED.**

**Step 3: Add the reviewed exact image dependency and implement decode/re-encode.** Implement bounded
ISO-BMFF/EBML validators directly; do not add FFmpeg, GPL/LGPL runtime dependencies, shell commands,
or a general parser library.

**Step 4: GREEN plus supply-chain review.** Record native binary families, licenses, scripts,
integrity sources, minimum age, audit, and SBOM delta. Ensure React/Expo and unrelated packages do not
move.

### Task 4: Compose the two-pass scanner pipeline and HTTP gateway

**Files:**

- Create: `services/media-scanner/src/pipeline.ts`
- Create: `services/media-scanner/src/server.ts`
- Create: `services/media-scanner/src/index.ts`
- Create: `services/media-scanner/test/pipeline.test.ts`
- Create: `services/media-scanner/test/server.test.ts`
- Modify: `services/media-scanner/package.json`

**Step 1: Write failing tests** for first-scan rejection, sanitizer invocation, final-scan rejection,
strict clean result, input/output hashes, engine/signature metadata, auth/method/content-type failures,
timeout/unavailable mapping, concurrency bound, health/readiness, safe logs, and graceful shutdown.

**Step 2: Capture RED.**

**Step 3: Implement minimum pipeline/server** with injected scanner/sanitizer interfaces, request IDs,
deadlines, concurrency semaphore, no persistent media, and clean temporary cleanup.

**Step 4: GREEN and mutation checks.** Prove removing the second scan, auth, hash, or concurrency gate
breaks a focused test.

### Task 5: Add hardened local ClamAV/gateway containers and real EICAR integration

**Files:**

- Create: `infra/media-scanner/compose.yaml`
- Create: `infra/media-scanner/gateway.Dockerfile`
- Create: `infra/media-scanner/clamd.conf`
- Create: `infra/media-scanner/.dockerignore`
- Create: `scripts/test-media-scanner.mjs`
- Create: `scripts/test-media-scanner.test.mjs`
- Modify: `package.json`

**Step 1: Write failing orchestration/helper tests** for portable Docker resolution, health deadline,
safe local secret injection, exact expected fixtures, and deterministic cleanup.

**Step 2: Capture RED, then implement Compose/container configuration.** Pin official images/digests;
keep ClamD internal; run gateway non-root/read-only/no-capabilities with health and resource bounds.

**Step 3: Build locally and run real integration RED/GREEN:** clean decoded/re-encoded image, EICAR
malicious result, unauthorized request, PDF rejection, malformed media, ClamD unavailable, and final
scan. Do not use hosted services.

**Step 4: Inspect effective Compose config and images.** Record image digests, licenses, users,
ports, mounts, capabilities, health, and no secret in image/history.

### Task 6: Add the forward-only attempt-bound database contract

**Files:**

- Create with CLI: `supabase/migrations/<timestamp>_media_scanner_gateway.sql`
- Modify: `supabase/tests/database/upload_security.test.sql`
- Modify: `supabase/tests/database/upload_quarantine_cleanup.test.sql`
- Modify: `packages/database/src/database.types.ts`
- Modify: `docs/privacy/DATA_INVENTORY.md` only if the migration adds a table/column classification

**Step 1: Add pgTAP RED** for scan-attempt token uniqueness, stale-attempt completion/reject/fail
denial, strict bounded engine/signature/sanitizer metadata, safe immutable events, exact grants/RLS,
idempotent terminal behavior, retry limit, and orphan-target cleanup projection.

**Step 2: Run focused RED before creating the migration.**

**Step 3: Create one migration with Supabase CLI** and implement the minimum v2 claim/complete/fail/
reject and cleanup contract. Revoke legacy service completion paths if they bypass attempt binding;
preserve authenticated ticket signatures.

**Step 4: Reset and GREEN.** Run focused pgTAP, full DB, DB lint, regenerate public types, prove zero
drift, and cross-role/direct-boundary checks.

### Task 7: Integrate Edge orchestration and independent output validation

**Files:**

- Modify: `supabase/functions/_shared/upload-security.ts`
- Modify: `supabase/functions/_shared/upload-security.test.ts`
- Modify: `supabase/functions/scan-upload/index.ts`
- Create: `supabase/functions/scan-upload/index.test.ts`
- Modify: `supabase/config.toml` only if a local environment contract requires it

**Step 1: Add Deno RED** for v2 claim token propagation, scanner auth, strict response, input/output
hash mismatch, base64/size limits, Edge-side MIME/signature re-detection, sanitizer policy, PDF
fail-closed, stale completion, promotion rollback, cleanup deferral, timeout/unavailable retry, malware
terminal rejection, and no privileged client before user auth.

**Step 2: Capture exact RED.**

**Step 3: Implement minimum external-only production orchestration.** Deterministic mode remains
explicit local/test-only. No raw scanner detail reaches clients/logs.

**Step 4: Run focused and full Deno fmt/lint/check/tests GREEN.** Include malformed real-shape
responses and delayed streams rather than source-text checks.

### Task 8: Make physical cleanup cover orphan destination objects

**Files:**

- Modify: `supabase/functions/_shared/privacy.ts`
- Modify: `supabase/functions/_shared/privacy.test.ts`
- Modify: `supabase/functions/privacy-worker/index.ts`
- Create or modify: `supabase/functions/privacy-worker/index.test.ts`

**Step 1: Add RED** proving rejected/expired rows delete quarantine plus orphan target, clean rows delete
quarantine only, partial failure is retryable, a worker cannot delete an unexpected bucket/path, and
replay is idempotent.

**Step 2: Capture RED, implement minimum strict cleanup contract, then GREEN** focused/full Deno.

### Task 9: Extend local Supabase integration, production config, and operations evidence

**Files:**

- Modify: `scripts/test-local-supabase.mjs`
- Create: `scripts/test-media-scanner-supabase.mjs`
- Modify: `package.json`
- Modify: `.env.example`
- Modify: `packages/config/src/env.ts`
- Modify: `packages/config/test/env.test.ts`
- Modify: `docs/ENVIRONMENT.md`
- Modify: `docs/HUMAN_INPUTS.md`
- Modify: `docs/DEPLOYMENT.md`
- Modify: `docs/RELEASE.md`
- Modify: `docs/architecture/OVERVIEW.md`
- Modify: `docs/security/SECURITY_CONTROLS.md`
- Modify: `docs/security/THREAT_MODEL.md`
- Modify: `docs/privacy/RETENTION_MATRIX.md`
- Modify: `docs/validation/FINAL_VALIDATION_REPORT.md`

**Step 1: Add failing config/integration tests** for production-required gateway URL/secret, HTTPS,
private destination policy, signature freshness/capacity human inputs, and explicit local-only mode.

**Step 2: Capture RED, then implement config and local integration.** The end-to-end suite must use
real local Supabase Storage/database/Edge plus the real local gateway/ClamD and prove clean promotion,
EICAR rejection, unavailable retry, final-object authorization, and cleanup.

**Step 3: Update docs honestly.** Separate repository/local PASS from hosted NOT RUN; state PDFs fail
closed, ClamAV is not CDR, and no service/secret/infrastructure is provisioned.

**Step 4: Run affected checks GREEN** including docs, config, local integration, licenses, audit, SBOM,
and diff check.

### Task 10: Whole-branch review, security scan, and final verification

**Files:**

- Modify only credible M2 P0/P1 remediation files, regression-first, if independent review finds one.
- Create ignored/local Superpowers reports only through the SDD workflow; never stage them.

**Step 1: Run independent specification and code-quality reviews** over the D1-base-to-working-tree
diff. Review service/gateway, sanitizers, ClamD, containers, Edge, DB/RLS/RPC, cleanup, supply chain,
docs, and scope. Resolve all credible P0/P1 with RED/GREEN and re-review.

**Step 2: Run durable Codex Security diff scan** for the exact final working tree. Require complete
coverage, a sealed report/SARIF, and zero unresolved P0/P1. Do not fabricate hosted scan evidence.

**Step 3: Run fresh final verification:** frozen install, service unit/integration, real container
EICAR, clean Supabase reset, focused/full pgTAP, DB lint/types, full Deno, local Supabase end-to-end,
config fail-closed validation, mobile upload/trust regression, format/docs/i18n/data inventory,
licenses/audit/secrets/SBOM, Android local export if dependency graph affects mobile, diff check, and
`pnpm validate`.

**Step 4: Verify Git safety and report.** Branch/worktree exact, staged zero, no commits/push/PR,
parent D1 untouched, no hosted actions, and every PASS/FAIL/NOT RUN count stated honestly. Do not begin
M3.
