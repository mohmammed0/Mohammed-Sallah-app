# M2R focused media-scanning remediation implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:executing-plans` and execute each
> task regression-first. The user forbids staging, commits, pushes, PRs, hosted mutations,
> deployment, and M3; all repository changes remain unstaged and uncommitted for M2C-R3.

**Goal:** Close only the confirmed M2C-R2 blockers while preserving the asynchronous metadata-only
scanner-control architecture, the 20 MiB product limit, M1 protected-media authorization, and the
clean D1 parent.

**Architecture:** Supabase `scan-upload` and `scanner-control` remain bounded metadata/control paths.
The no-media-body assertion applies to those scanning control-plane modules, not to every unrelated
Edge integration. The no-credential pull worker receives exact, attempt-clipped capabilities, scans
and sanitizes images or safely remuxes the two required MP4-family beta media classes, uploads direct
to opaque staging, proves readback integrity, and submits a signed manifest. Private database state
and autonomous cleanup remain authoritative.

**Tech stack:** PostgreSQL 17/pgTAP, Supabase Storage/Auth/Edge Functions (Deno), Node 24/TypeScript 6,
Zod 4, `@napi-rs/image`, reviewed exact FFmpeg/ffprobe container tooling, ClamAV 1.4 LTS, Docker
Compose, pnpm/Turbo, Vitest/node:test.

**Specification:**
`docs/superpowers/specs/2026-08-21-media-scanning-v2-architecture-design.md`, amended by the exact M2R
attachment and this plan.

**Global constraints:** Work only in `/mnt/c/Users/fas51/source/Sallah-media-scanning-v1` at base
`bc8afd939a532021dd5a6a975894b2cee4842a87`. Rewrite only the existing uncommitted M2 migration. Use
RED→GREEN tests before production changes. Do not stage, commit, push, create/update a PR or issue,
deploy, provision, run EAS, mutate hosted Supabase, or begin M2C-R3/M2D/M3.

---

### Task 1: Correct the scanning boundary and restore the authoritative beta media contract

**Files:**

- Modify: `supabase/functions/scan-upload/index.test.ts`
- Modify: `supabase/functions/media-access/index.test.ts`
- Modify: `services/media-scanner/src/contracts.ts`
- Modify: `services/media-scanner/src/media-policy.ts`
- Modify: `services/media-scanner/src/sanitize.ts`
- Modify: `services/media-scanner/src/pipeline.ts`
- Modify: `services/media-scanner/src/manifest.ts`
- Modify: `services/media-scanner/src/control-client.ts`
- Modify/create focused scanner policy/remux tests and fixtures
- Modify: `apps/mobile/src/lib/secure-upload.ts`
- Modify: `apps/mobile/src/features/request/request-composer.tsx`
- Modify: `apps/mobile/app/jobs.tsx`
- Modify/create focused mobile upload/journey tests

**TDD:** Add failing regressions proving the scanning control-plane inventory is exhaustive and
body-free while `media-access` streams without `arrayBuffer()`. Add failing client/scanner contract
tests for M4A voice and MP4 completion video. Preserve PDF/WebM/archive/executable fail-closed.

**Implementation:** Share one exact purpose/MIME policy across scanner and mobile adapters where
practical. Restore M4A request voice and MP4 completion selection without broadening unrelated UI.
Implement actual fixed-argv, no-shell, network-disabled ffprobe/ffmpeg remux and fail closed for any
unsupported codec/container/stream/metadata/trailing payload. Reopen and fully probe the remuxed
output before final ClamAV; never pass through original bytes.

**Verification:** Scanner policy/remux tests, real ffmpeg/ffprobe integration, mobile request voice
and completion-video journey tests, PDF/WebM/unsupported denial, scanning static-boundary test, and
M1 media-access streaming regression.

### Task 2: Make cleanup autonomous, non-jamming, and privacy-preserving

**Files:**

- Rewrite only: `supabase/migrations/20260821211724_media_scanner_gateway.sql`
- Modify: `supabase/tests/database/upload_security.test.sql`
- Modify: `supabase/tests/database/upload_quarantine_cleanup.test.sql`
- Modify: `supabase/tests/database/media_scan_concurrency.sh`
- Modify: `supabase/functions/_shared/privacy.ts`
- Modify: `supabase/functions/privacy-worker/index.ts`
- Modify/create focused privacy-worker tests
- Regenerate: `packages/database/src/database.types.ts`

**TDD:** Reproduce 25-hour stale quarantine/input/output/final-candidate artifacts remaining
unclaimable, a 20-attempt cleanup row violating its check and starving later rows, and expired nonce
records remaining forever. Prove active attempts and retained clean output are excluded.

**Implementation:** Age all eligible private-media artifacts into cleanup automatically at no more
than 24 hours, independent of scanner claims. Introduce a terminal cleanup dead-letter state instead
of selecting attempt-20 rows, continue later claims after an individual failure, and clean expired
request/attestation nonce ledgers. Preserve immutable attestation/audit evidence and exact owner-safe
projections. Add the required schedule contract and document that hosted pg_cron/Edge activation is
a later human/operations step.

**Verification:** Fresh reset, D1→M2 migration-up, focused/full pgTAP, real multi-session concurrency,
privacy-worker Deno tests, DB lint, generated types zero drift, and a 25-hour local cleanup run with
zero active/retained deletion.

### Task 3: Bound capabilities and make attestation nonce replay authoritative

**Files:**

- Modify: `supabase/functions/_shared/scanner-control.ts`
- Modify: `supabase/functions/_shared/scanner-control.test.ts`
- Modify: `supabase/functions/scanner-control/index.ts`
- Modify: `supabase/functions/scanner-control/index.test.ts`
- Modify: `services/media-scanner/src/capability-http.ts`
- Modify/create focused capability tests
- Modify: `packages/config/src/env.ts`
- Modify: `packages/config/test/env.test.ts`
- Modify: `scripts/validate-production-config.mjs`
- Modify Edge/config environment documentation and examples

**TDD:** First fail exact cases for a one-second remaining attempt minting input/output/readback
capabilities past the permitted finalization margin; duplicate attestation nonce across attempts;
hostname suffixes, percent-encoded host/path, IPv4/IPv6 literals outside explicit local/test,
userinfo, nondefault ports, query manipulation, fragments, and redirects.

**Implementation:** Compute every effective capability lifetime as the minimum of the configured
maximum and the remaining authoritative attempt deadline after reserving the required finalization
margin. Use Supabase Storage's officially supported S3 SigV4 presigned PUT path for exact configurable
output expiry because the standard signed-upload URL is fixed at two hours. Keep S3 credentials
strictly inside scanner-control Edge; the worker receives only one exact signed URL. Bind attestation
nonce uniqueness to scanner identity, action, attempt, manifest hash, and validity window in private
database state. Reject every stale/replayed mutation before capability or Storage work.

**Verification:** Deno/Node golden vectors, capability URL parsing and expiry assertions, zero
capability calls on stale/replay cases, official-local S3 PUT integration, and production config
fail-closed without the new S3 signer inputs.

### Task 4: Bound the mobile recovery journal without weakening restart repair

**Files:**

- Modify: `apps/mobile/src/lib/secure-upload.ts`
- Modify: `apps/mobile/src/features/media/secure-upload-recovery.tsx`
- Modify/create focused mobile secure-upload/recovery tests

**TDD:** Create a journal with 256 valid completed records and prove a new upload currently fails.
Add crash/restart cases around pruning, exact-operation recovery, account isolation, ambiguous state,
and clean-result consumption.

**Implementation:** Exclude terminal completed records from the active global capacity count, expire
them after a bounded retention window, and provide explicit owner-scoped prune/discard behavior.
Never silently evict active/ambiguous entries; preserve two-slot crash safety and exact upload/
operation/file-identity replay.

**Verification:** Capacity, prune, restart, account-switch, corrupted-slot, response-loss, and exact
same-upload retry regressions plus full mobile lint/typecheck/tests.

### Task 5: Restore security regressions and make CI/release evidence immutable and mandatory

**Files:**

- Modify: `services/media-scanner/test/clamd-stream.test.ts`
- Modify: `services/media-scanner/test/v2-media-policy.test.ts`
- Modify/create image/polyglot fixtures and tests
- Modify: `scripts/test-edge-memory.test.mjs`
- Modify: `scripts/test-media-scanner.test.mjs`
- Modify: `scripts/test-media-scanner-ci.test.mjs`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/release-readiness.yml`
- Modify: container Dockerfiles/config and SBOM scripts as required
- Modify: `oss-inventory.json`, `THIRD_PARTY_NOTICES.md`, and OSS inventory/evaluation docs

**TDD:** Restore raw-error redaction, newline/extra-record, unknown/oversized ClamD reply,
connect/response timeout, abort, refused-socket, pixel/dimension bombs, malformed chunk/segment, and
metadata-stripping assertions. Add structural failures for mutable action tags, floating Deno,
missing Edge-memory execution, missing real remux, and missing always-run cleanup.

**Implementation:** Pin every mandatory action to an immutable reviewed commit and Deno to an exact
version. Run the real Edge-memory script and scanner integration in hosted CI without a bypassing path
filter. Add `if: always()` cleanup. Represent exact FFmpeg/ffprobe source/image version, digest,
license, package graph, optional binaries, ClamAV, and base images in machine/human OSS evidence.
Record any non-permissive container legal obligation honestly as a hosted-activation human gate.

**Verification:** Workflow structural tests; 10/20 MiB, malformed/replay/clean/cleanup measured Edge
memory scenarios <=128 MiB and size-independent; scanner unit/type/lint/build; real ClamAV/EICAR;
real remux; licenses, high audit, secrets scan, repository and container SBOM.

### Task 6: Align documentation and release claims to final measured behavior

**Files:**

- Modify the M2-relevant architecture, security, privacy, deployment, release, operations, human
  inputs, validation, OSS, and docs index files only

**Implementation:** State precisely that `scan-upload` and `scanner-control` are metadata-only;
`media-access` is the live-authorized streaming broker; existing AI/transcription provider transport
remains M3 scope. Record actual M4A/MP4 remux, unsupported classes, autonomous cleanup/dead letters,
capability lifetime rules, nonce replay, separate Edge/worker/ClamD/ffmpeg budgets, immutable CI pins,
and hosted activation/schedule/legal/operator inputs. Do not claim M2 changes unrelated provider
transport or runs hosted infrastructure.

**Verification:** Documentation checker, reciprocal/index links, i18n, release matrix, and exact
claims-to-evidence cross-check.

### Task 7: Run one final integrated M2R validation on stable bytes

**Validation order:** frozen install; focused scanner/mobile/Edge/database gates; scanner type/lint/
build; real ClamAV/EICAR, max image and real audio/video remux; fresh reset and exact D1→M2 upgrade;
full pgTAP, DB lint/types/concurrency; full Deno format/lint/check/tests; real Supabase/Storage/Edge/
worker/ClamD integration twice with residue equality; Edge memory matrix; mobile/web; docs/i18n;
licenses/audits/secrets/SBOM; `git diff --check`; full `pnpm validate` once on stable bytes.

**Final safety:** Recount modified/untracked/deleted/staged paths, recalculate migration/lock hashes,
confirm HEAD remains `bc8afd939a532021dd5a6a975894b2cee4842a87`, confirm D1 parent worktree remains clean, and report
hosted checks honestly as NOT RUN. Do not run the final Codex Security diff scan; that belongs to
M2C-R3.
