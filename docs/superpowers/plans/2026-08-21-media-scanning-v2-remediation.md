# M2V media-scanning V2 remediation implementation plan

> Historical execution note: M2R supersedes this plan's audio/video fail-closed choice because the
> authorized closed-beta product contract retained M4A/MP4 voice and completion MP4 video. The
> current delta and verification contract are in the
> [M2R focused remediation plan](2026-08-24-media-scanning-focused-remediation.md).

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` and this
> plan task-by-task. The user forbids staging, commits, pushes, PRs, hosted mutations, deployment, and
> M3. Every implementer leaves exact owned paths unstaged and writes RED/GREEN evidence for a fresh
> reviewer.

**Goal:** Replace the synchronous Edge byte-proxy scanner with a durable asynchronous, capability-
based pull worker while preserving the 20 MiB product limit, authorization, and protected-media
broker.

**Architecture:** Edge is metadata/control only. Private database jobs and attempt-specific opaque
artifacts authorize a no-credential worker through HMAC scanner-control. The worker downloads and
uploads via exact signed capabilities, validates stored output by read-back, and signs a bounded
manifest. Edge verifies current state/metadata and performs server-side Storage promotion.

**Tech stack:** PostgreSQL 17/pgTAP, Supabase Storage/Auth/Edge Functions (Deno), Node 24/TypeScript 6,
Zod 4, `@napi-rs/image`, ClamAV 1.4 LTS, Docker Compose, pnpm/Turbo, Vitest/node:test.

**Specification:**
`docs/superpowers/specs/2026-08-21-media-scanning-v2-architecture-design.md`

**Global constraints:** Work only in `/mnt/c/Users/fas51/source/Sallah-media-scanning-v1` at base
`bc8afd939a532021dd5a6a975894b2cee4842a87`. Rewrite only the existing uncommitted M2 migration.
Use regression-first tests. All environment reads flow through `@sallah/config` or a strict Edge
adapter. The original plan failed audio/video/WebM/PDF closed; M2R replaces only the approved
M4A/MP4 audio and completion MP4 video cases with an immutable reviewed FFmpeg remux runtime. WebM
and PDF remain fail closed. Never transfer media bytes through scanning-control Edge. No
stage/commit/push/PR/deploy/provision/EAS/secret/M3 action.

---

### Task 1: Replace the database contract with private jobs, attempts, artifacts, and replay

**Files:**

- Rewrite: `supabase/migrations/20260821211724_media_scanner_gateway.sql`
- Modify: `supabase/tests/database/upload_security.test.sql`
- Modify: `supabase/tests/database/upload_quarantine_cleanup.test.sql`
- Create: `supabase/tests/database/media_scan_concurrency.sh`
- Modify: `packages/database/src/database.types.ts`
- Modify: `docs/privacy/DATA_INVENTORY.md`
- Modify: `docs/security/RLS_MATRIX.md`

**Required interfaces:** private `media_scan_jobs`, `media_scan_attempts`, `media_scan_artifacts`,
`media_scan_attestations`, `media_scan_events`, and `media_scanner_nonces`; authenticated
`start_or_get_media_scan(uuid)`/`get_my_file_upload_status(uuid)`; service-only claim, heartbeat,
prepare-output, readback authorization, attestation, finalize, reject, fail, status, nonce, and
artifact-cleanup RPCs. Every mutation has an operation UUID and exact replay fingerprint.

**TDD:** First add RED for all eight M2C defects visible at DB boundaries: clean replay; stale-attempt
finalization; attempt-specific paths/orphan independence; fixed attempt deadline/finalization margin;
private scanner evidence; current-attempt output preparation; nonce replay; and one-winner completion.
Add cross-role/grant tests and a real multi-session shell harness for two workers, reclaim, prepare,
complete, response loss, stale orphan, cleanup race, and HMAC nonce replay. Then rewrite the migration,
reset, run focused/full pgTAP, real concurrency, DB lint, regenerate public types, and prove zero drift.

**Review gate:** No owner/service direct private-table access, no old completion RPC executable, exact
safe owner projection, no identity-bearing scanner paths, and no stale/expired attempt mutation.

### Task 2: Implement metadata-only Edge control, async user replay, and client resume

**Files:**

- Create: `supabase/functions/_shared/scanner-control.ts`
- Create: `supabase/functions/_shared/scanner-control.test.ts`
- Create: `supabase/functions/scanner-control/index.ts`
- Create: `supabase/functions/scanner-control/index.test.ts`
- Rewrite: `supabase/functions/scan-upload/index.ts`
- Rewrite/modify: `supabase/functions/scan-upload/index.test.ts`
- Rewrite/modify: `supabase/functions/_shared/upload-security.ts`
- Modify: `supabase/functions/_shared/upload-security.test.ts`
- Modify: `supabase/functions/_shared/privacy.ts`
- Modify: `supabase/functions/privacy-worker/index.ts`
- Modify/create their focused tests
- Modify: `supabase/config.toml`
- Modify: `apps/mobile/src/lib/secure-upload.ts`
- Modify/create focused secure-upload tests only

**TDD:** Capture RED for missing/invalid `APP_ENV`, deterministic mode outside explicit local/test,
HMAC body/action/attempt/timestamp/nonce replay, exact capability origins, private server-side copy,
metadata-only 10/20 MiB scenarios, no Storage download/media upload/arrayBuffer/base64/hash path, safe
state replay after lost responses, current active state, stale attempts, staged-output replay, old-orphan
independence, promotion copy reconciliation, and cleanup. Add static AST/token tests plus behavioral
dependency spies proving zero media-body methods/calls.

**Implementation:** `scan-upload` performs only owner start/status. `scanner-control` bounds JSON to
64 KiB and authenticates HMAC before service privilege. It creates/reconciles server-side copies and
signed exact capabilities, validates canonical attestation and Storage metadata, performs server-side
final copy, and invokes transactional RPCs. It never downloads/uploads/hashes media. Missing/unknown
`APP_ENV` fails startup; `scanner-control` alone uses `verify_jwt=false` after custom auth. Mobile
persists pending upload IDs and bounded polling state so a restart resumes the same job.

**Verification:** Deno fmt/lint/check/full tests; mobile focused/type/lint/tests; explicit Edge heap
probe/calculation <=128 MiB and invariant between 10 and 20 MiB metadata; full-media-path static scan.

### Task 3: Convert the gateway into a no-credential pull worker and close content policy

**Files:**

- Create: `services/media-scanner/src/control-client.ts`
- Create: `services/media-scanner/src/capability-http.ts`
- Create: `services/media-scanner/src/deadline.ts`
- Create: `services/media-scanner/src/manifest.ts`
- Create: `services/media-scanner/src/worker.ts`
- Modify: `services/media-scanner/src/contracts.ts`
- Modify: `services/media-scanner/src/auth.ts`
- Modify: `services/media-scanner/src/clamd.ts`
- Modify: `services/media-scanner/src/pipeline.ts`
- Modify: `services/media-scanner/src/media-policy.ts`
- Modify: `services/media-scanner/src/image-sanitizer.ts`
- Modify: `services/media-scanner/src/sanitize.ts`
- Remove from runtime/delete when unused: push `server.ts`, raw `body.ts`, `ebml.ts`
- Modify/create corresponding tests and fixtures
- Modify: `services/media-scanner/package.json`, build config, and root scripts as required

**TDD:** RED golden Node/Deno HMAC vectors, strict manifest canonicalization, signed URL origin/redirect
denial, streaming size/hash, one monotonic 120-second deadline, stale lease, output capability ordering,
readback mismatch, ClamAV fresh/stale/missing/unparseable/future/reload states, APNG/animated WebP/MPO/
ICC/polyglot trailers, native decode failure, output reopen, approved M4A/MP4 remux, and PDF/WebM fail-closed. Include
PNG+ZIP, JPEG+executable, image+PDF, and MP4 trailing-payload fixtures.

**Implementation:** A one-job pull loop talks only to HMAC scanner-control and signed exact Storage
URLs. Downloads/uploads stream to attempt temp files; redirects fail; paths and origins must match.
Run first ClamAV, decode/reencode accepted static images, reopen/full-validate, second ClamAV, request
output capability, upload exact-attempt output, request readback, rehash, sign manifest, and complete.
M2R adds fixed-path/no-shell FFmpeg remux and FFprobe reopen for approved M4A/MP4 audio and completion
MP4 video only. Kill/abort the subprocess tree and delete all temp data on deadline or failure;
unsupported AV combinations have no output.

**Verification:** package unit/type/lint/build, mutation probes, real max-size image timing under the
deadline, measured worker/native peak, no database/Supabase/S3/user credential, temp cleanup, and no
push media ingress endpoint.

### Task 4: Harden containers, signature readiness, resources, config, and OSS evidence

**Files:**

- Rewrite/modify: `infra/media-scanner/compose.yaml`
- Modify: worker Dockerfile, ClamD config, entrypoint, ignore files
- Modify/create: `scripts/test-media-scanner.mjs`, its tests, and helpers
- Modify: `packages/config/src/env.ts`, tests, `.env.example`
- Modify: `scripts/validate-production-config.mjs`
- Modify: `package.json`, `pnpm-lock.yaml` only when the actual graph changes
- Modify: `oss-inventory.json`, `THIRD_PARTY_NOTICES.md`
- Modify: `docs/oss/OSS_INVENTORY.md`, `docs/oss/OSS_EVALUATION.md`

**TDD:** RED for one worker job, separate Edge/worker/ClamD budgets, 4 GiB ClamD limit, native cache,
fresh/missing/stale/unparseable signature readiness, reload window, no exposed worker port, private
ClamD, no broad credentials in worker image/environment, missing/invalid app environment, required
scanner secrets/origins/deadline/freshness, and exact digest/license/SBOM inventory.

**Implementation:** Pull worker has no host scan port, one active job, bounded queue/tmpfs/cgroup,
fixed origins, and exact image digests. ClamD is private with 4 GiB and reload headroom; readiness
enforces signature age. Production requires explicit beta/production external control configuration.
Record ClamAV, Node/Debian, native-image and optional binary evidence machine- and human-readably.

**Verification:** effective Compose inspection, image history/secret probes, licenses, audit, container
SBOM, real EICAR, stale-signature denial, max image, cleanup, and no floating source/tag.

### Task 5: Replace local integration and add mandatory CI/release gates

**Files:**

- Rewrite: `scripts/test-media-scanner-supabase.mjs`
- Modify/create focused integration helpers/tests
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/release-readiness.yml`
- Modify: root package scripts
- Modify M2-relevant environment, deployment, security, privacy, architecture, validation docs

**TDD:** RED workflow/config assertions for every mandatory command and variable. Add real multi-process
lease/promotion/orphan harness evidence. Integration must prove queued/active/clean/terminal replay,
clean response loss, output response loss, distinct retry artifacts, stale worker denial, final one-
winner, cleanup versus active scan, scanner HMAC replay, signed input/output/readback, exact EICAR,
fresh/stale signatures, accepted max static image, approved AV remux, rejected PDF/WebM/polyglots, broker authorization,
and before/after residue equality.

**Implementation:** CI has a mandatory scanner job with service unit/type/lint/build, container
hardening, real ClamAV/EICAR, image sanitizer/polyglot, approved AV remux plus rejected WebM/PDF, local Supabase/Storage/Edge,
real concurrency, signature freshness, Edge metadata-memory, licenses, audit/security, and SBOM. It
cannot be skipped by a relevant M2 path. Release readiness forwards all required scanner variables.
Docs state repository/local PASS versus hosted NOT RUN, claim remux only for the tested approved
M4A/MP4 paths, and never claim CDR.

**Verification:** Run the integration twice on final bytes, workflow structural tests, docs/i18n,
mobile/web regressions, licenses/audits/secrets/SBOM, and full `pnpm validate`.

### Task 6: Independent review, Codex Security, and final M2V verification

Run independent reviews for architecture/spec, Edge memory, HMAC/capability/SSRF, scanner/container,
image/polyglot, database/RLS/state machine, promotion/orphan/cleanup, privacy/OSS/CI, and M1 protected
media. Implementers—not the controller—remediate only credible P0/P1 regression-first and fresh
reviewers re-review.

Run a fresh durable Codex Security diff scan against
`bc8afd939a532021dd5a6a975894b2cee4842a87` after final bytes. Require complete genuine coverage,
sealed report/SARIF, and zero unresolved P0/P1.

Final verification includes frozen install; scanner unit/type/lint/build; real container EICAR,
signature and max-size/deadline evidence; clean reset and D1-to-M2 upgrade; focused/full pgTAP, DB
lint/types/concurrency; full Edge Deno; local end-to-end twice; config fail-closed; mobile/web; format,
docs/i18n/data inventory, licenses/audits/secrets/SBOM, diff check, and `pnpm validate`.

Verify HEAD unchanged, staged zero, no commit/push/PR/deploy/provision/EAS/M3, parent D1 untouched.
Return architecture variance still present if any stop condition in the specification remains.
