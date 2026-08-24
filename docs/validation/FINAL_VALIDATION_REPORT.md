# Final validation report

Date: 2026-08-18. Environment: Windows/WSL, Node 24.19.0, pnpm 11.19.0,
Supabase CLI 2.114.0, Docker Desktop, Deno 2.9.5, Playwright Chromium 151, k6 2.2.0,
and Expo SDK 54.

Scope: four repository-controlled pre-merge corrections continued on draft PR #5 from reviewed HEAD
`f8b4e83cc87cd3954566c5d175d56efd43c96249`. The implementation commits are:

- `fa8462a` — `fix: make integration persistence atomic`
- `222827c` — `fix: scope request media and mobile mutations`
- `978c853` — `fix: persist admin intents across retries`

The final full branch SHA and CI links are recorded in the PR merge-gate table and release handoff,
because a tracked file cannot contain the SHA of its own commit. No production deployment, secret
change, merge, force-push, or history rewrite occurred.

## Migration and upgrade path

No migration was added or replaced. The existing unmerged migration
`20260818183816_merge_fix_integration_contracts.sql` was corrected in place, as required, because a
later migration could not repair its own predecessor failing on legacy timing rows. A reset from zero
applies all 30 migrations.

The pre-migration upgrade fixture starts at `20260818140300`, creates all five legacy timing shapes,
applies the corrected migration, and passes **5/5 conversions**:

- both null becomes explicit flexible with both values null;
- start-only becomes a bounded 60-minute scheduled window;
- a valid start/end pair is preserved;
- end-only becomes explicit flexible and clears the orphan end;
- an invalid pair keeps its start and receives a bounded 60-minute end.

## Validation evidence

| Command or suite                                     | Result | Evidence                                                                                              |
| ---------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------- |
| `pnpm test:legacy-upgrade`                           | PASS   | **5/5** legacy timing combinations                                                                    |
| `supabase db reset --local`                          | PASS   | Clean zero-to-head reset applied all **30 migrations** and seed                                       |
| Generated database types                             | PASS   | Regenerated from rebuilt PostgreSQL; zero formatted drift                                             |
| `supabase test db`                                   | PASS   | **20 pgTAP files, 445 assertions**, including RLS and concurrency                                     |
| `supabase db lint -s public,private --fail-on error` | PASS   | No application-schema errors                                                                          |
| Deno format, lint, check, and tests                  | PASS   | **32 tests**                                                                                          |
| Workspace Vitest                                     | PASS   | **78 tests**: mobile 39, web 15, domain 8, config 5, i18n 5, image parser 6                           |
| `pnpm test:integration`                              | PASS   | **2 tests**                                                                                           |
| `pnpm test:security`                                 | PASS   | **4 tests**                                                                                           |
| `pnpm test:local-supabase`                           | PASS   | Storage, AI, and true concurrent core idempotency scenarios                                           |
| `pnpm test:e2e:web`                                  | PASS   | **8 passed, 2 intentionally skipped** duplicate mobile-project cases                                  |
| `pnpm validate`                                      | PASS   | Format, lint, strict types, i18n, inventory, tests, web build, and Android bundle                     |
| Data inventory                                       | PASS   | 76 categories and exactly one classification for each of 130 tables                                   |
| Expo dependency check / Doctor                       | PASS   | Dependencies current; **21/21 checks**                                                                |
| Android export                                       | PASS   | Hermes bundle, **1,555 modules**                                                                      |
| k6 smoke                                             | PASS   | **200/200 checks**, zero failures, p95 **4.02 ms**                                                    |
| License, vulnerability, and secret checks            | PASS   | Approved license policy; no known high-severity vulnerability or committed production secret          |
| SBOM                                                 | PASS   | CycloneDX, 773 components; SHA-256 `b5d17a38dec3d07d1aa246456b2c5f0be3d2ea1850eccad4349779014a8067b5` |

The countable repository suites contain **569 passing tests/assertions**: 445 pgTAP, 32 Deno, 78
workspace Vitest, 2 integration, 4 security, and 8 Playwright. The 5 legacy conversion assertions,
local-Supabase scenarios, and 200 k6 checks are reported separately.

## Pre-merge correction gates

| Gate                             | Status | Repository-controlled result                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRE-MERGE-1 — atomic timing      | PASS   | Publication inserts `timing_mode` and the authoritative window before the automatic matching trigger. Scheduled first-run matching excludes unavailable providers; flexible creates no fabricated window; ASAP reuses its stored 60-minute window through match/offer/selection and returns `asap_window_expired`. Failed publication rolls back request and matching state.                             |
| PRE-MERGE-2 — turn-scoped media  | PASS   | Each pending turn owns exact local/upload bindings. Successful turns detach active media; a following text turn is text-only. Multiple offline recordings remain distinct, active replacement preserves pending files, retries work without restart, publication retains intended request attachments, and a 15-minute ownership-token lease serializes transcription while permitting stale recovery.   |
| PRE-MERGE-3 — per-service review | PASS   | Service rows use six reviewer-owned states. New services remain draft/submitted while the verified account and old approved offers remain valid. Matching/brief/offer/selection require the applicable approved service. Reviewer approval enables matching; removal affects only that category; returned and stored idempotent JSON matches final database state without contradictory account history. |
| PRE-MERGE-4 — serialized intents | PASS   | Mobile Promise-all tests prove one in-flight Promise, journal, key, and result for publication, selection, completion rejection, and onboarding. Browser intents and normalized expiry survive response loss/reconstruction, rotate after completed/terminal responses, and database replay leaves one assignment/grant, idempotency record, and audit event.                                            |

Focused evidence: atomic publication **16/16**, provider timing/qualification **32/32**,
per-service onboarding **18/18**, transcription claims **10/10**, browser reconstruction **8/8**,
mobile media/recovery **12/12**, and mobile mutation journal **8/8**.

## Remaining external NOT RUN gates

- Maestro and physical Android journey: **NOT RUN** because no ADB executable or Android target was
  available. Per policy, Maestro was not attempted without a real target.
- Physical iOS build/journey and store signing: **NOT RUN**; no Apple target/account was supplied.
- Live payment, SMS/OTP, push, production AI/provider integrations, production migration rehearsal,
  backup restore drill, penetration test, legal approval, and store release remain external human gates.
- Production configuration validation remains fail-closed until the approved production values in
  `docs/HUMAN_INPUTS.md` are supplied.

Application rollback is an additive Git revert. Applied database changes require a reviewed forward
compensation migration or backup restore; migration and Git history must not be rewritten. PR #5
must remain draft, open, and unmerged until all external gates are approved.

## Supabase Preview security hardening (Issue #9)

Date: 2026-08-19. Execution boundary: GitHub Actions and the isolated Supabase Preview project
`wxzwdodhhevuunqpzewo` only. Local Windows, Docker, local Supabase, Android, EAS, production
secrets, and the legacy/production Supabase project are outside this gate.

The forward-only migration
`20260819031500_preview_security_hardening.sql` converts both exposed provider views to invoker
semantics, replaces the provider directory's raw-table dependency with an eleven-field private
projection, removes the legacy six-argument completion overload, rebuilds function grants by exact
signature, fixes three mutable search paths, denies direct access to 24 internal RLS-without-policy
tables, hardens external deletion intake, and applies init-plan-safe `auth.uid()` predicates without
changing policy roles or row semantics.

A new 47-assertion pgTAP suite covers direct anonymous/authenticated/service-role execution,
participant view access, internal-table denial, public-field projection, search paths, default
privileges, legacy overload removal, non-enumerating deletion behavior, input bounds, redaction,
rate limiting, and audit rows. The repository total is 21 pgTAP files / 492 database assertions and
616 countable automated assertions when combined with the previously validated Deno, workspace,
integration, security, and Playwright suites. Hosted advisor counts and CI run links are recorded in
the Issue #9/PR handoff after the exact commit completes.

## Customer mobile experience redesign (Draft PR #14)

Date: 2026-08-19. Execution boundary: an isolated cloud checkout and disposable local Supabase
containers. The user's Windows checkout, Android Studio, emulator, Metro, Gradle, EAS Build,
production infrastructure, secrets, and app stores were not used. Resource-intensive checks ran
sequentially with bounded concurrency.

### Implemented contract

- `CustomerLocationProvider` is the single active-location authority for Home, intake, saved
  locations, and Account. A Home selection carries into intake; transient draft locations remain
  encrypted draft state until an explicit Save.
- `LocationPicker` owns foreground location, map movement, debounced reverse geocoding, localized
  fallback states, and server-authoritative service-city resolution. Address save and publication
  reject coordinate/city mismatches. Riyadh, Jeddah, and Dammam boundaries are supported; an
  unsupported Saudi point and a non-Saudi point are never rewritten as Riyadh.
- Saved-address Add/Edit/Archive/Make default commands preserve actual IDs, wait for asynchronous
  loading, preserve the current default, and serialize default changes transactionally.
- The diagnostic timeline scrolls independently while the shared composer remains fixed above the
  keyboard and safe area. Text, camera, gallery, voice, offline replay, `clientMessageId`, and exact
  per-message pending/retry/offline states are retained. Diagnostic v4 supplies contextual quick
  replies while free text remains available.
- Runtime locale direction reaches customer primitives, service grids, location header, chat,
  forms, review, and tabs. Arabic/Urdu render RTL and English/Hindi render LTR without depending on
  an application restart.
- Review exposes the editable category, subcategory, title, summary, structured answers, safe media
  previews, voice/transcript state, location details, timing, urgency, safety guidance, and AI
  uncertainty/fallback state. It never renders raw paths, signed URLs, enums, or internal errors.
- Android Maps configuration remains a build-time, Git-excluded concern. Missing provider/key and
  map-render timeout states show localized recovery UI; only the boolean readiness flag reaches JS.

### Migrations and fresh-install behavior

- `20260819151047_customer_location_authority.sql`: geographic boundaries, safe resolver RPC,
  coordinate/city enforcement, and transactionally unique default selection.
- `20260819151151_ai_contextual_quick_replies.sql`: active strict `diagnostic-v4` prompt contract.
- `20260819151200_ensure_service_city_boundaries.sql`: fresh-reset ordering for launch-city rows and
  missing boundaries, without replacing operator-managed values.

Fresh reset initially exposed two fixture-ordering defects: city boundaries did not yet exist when
the first authority migration ran, and old demo/pgTAP fixtures used `(0,0)` as a Riyadh placeholder.
The forward migration above fixes catalog ordering, and only synthetic Riyadh fixtures now use a
valid Riyadh point. Rejection fixtures remain invalid. No RLS or authorization policy was weakened.

### Exact-head repository validation

The final full SHA and CI run links are recorded in PR #14 after the final commit because a tracked
file cannot contain the hash of its own commit.

| Command or suite                          | Result | Evidence                                                                                              |
| ----------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------- |
| Clean `pnpm install --frozen-lockfile`    | PASS   | Official checksummed Node 22 runtime; lockfile supply-chain policy **786 entries**                    |
| `supabase db reset --local`               | PASS   | Zero-to-head migrations and seed                                                                      |
| Generated database types                  | PASS   | Regenerated from local PostgreSQL, formatted, zero drift                                              |
| `supabase test db`                        | PASS   | **24 files / 532 assertions**, including RLS and location authority                                   |
| `supabase db lint`                        | PASS   | No `public`/`private` application-schema errors                                                       |
| `pnpm test:legacy-upgrade`                | PASS   | **5/5** legacy timing combinations                                                                    |
| Deno format, lint, check, and tests       | PASS   | **34 tests**                                                                                          |
| Workspace Vitest                          | PASS   | **131 tests**: mobile 90, web 15, domain 10, config 5, i18n 5, image parser 6                         |
| `pnpm test:integration`                   | PASS   | **2 tests**                                                                                           |
| `pnpm test:security`                      | PASS   | **4 tests**                                                                                           |
| `pnpm test:local-supabase`                | PASS   | Location, storage, AI, and concurrent idempotency/default-address scenarios                           |
| `pnpm test:e2e:web`                       | PASS   | **8 passed / 2 intentionally skipped** established mobile-project duplicate cases                     |
| `pnpm validate`                           | PASS   | Format, i18n, captures, inventory, lint, strict types, tests, web build, Android export               |
| Data inventory                            | PASS   | 76 categories and one classification for each of 130 tables                                           |
| Expo dependency check / Doctor            | PASS   | Dependencies aligned; **21/21** checks                                                                |
| Android export                            | PASS   | Hermes export, **3,410 modules**, 6.9 MB bundle                                                       |
| k6 smoke                                  | PASS   | **200/200**, zero failures, p95 4.4 ms                                                                |
| License, vulnerability, and secret checks | PASS   | Approved policy; no high-severity vulnerability or committed production secret                        |
| SBOM                                      | PASS   | CycloneDX, 786 components; SHA-256 `dd1a7ed0c3dca12a7f327daf40711c2fea6bf7cdef408ebeaa4617f160856565` |

The countable repository suites contain **711 passing tests/assertions**: 532 pgTAP, 34 Deno, 131
workspace Vitest, 2 integration, 4 security, and 8 Playwright. The 5 legacy conversions,
local-Supabase scenarios, and 200 k6 checks are reported separately. Deterministic rendered captures
are checked for byte-for-byte drift by `pnpm customer-captures:check`:

- Arabic RTL: `docs/screenshots/customer-redesign-ar-rtl.svg`
- English LTR: `docs/screenshots/customer-redesign-en-ltr.svg`

These are automated rendered/test captures, not emulator or physical-device screenshots.

### External and human gates

- GitHub Actions on the exact final SHA must be reported from GitHub after push. A billing/budget
  refusal is an external **NOT RUN**, not a passing CI result.
- Android emulator and physical-device visual validation: **NOT RUN**. The restricted Preview Maps
  key/package/SHA-1 and real-device evidence remain tracked in Issue #15.
- Camera/gallery, voice, foreground location, map gestures, large text, screen reader, RTL/LTR, and
  restart behavior on a real device: **NOT RUN** pending Issue #15 evidence.
- Provider visual redesign is deliberately outside this change and tracked in Issue #16.
- EAS Build/APK/AAB: **NOT STARTED**. No signing credential was accessed.
- Production deployment, migrations, secrets, paid services, and store submission: **NOT
  PERFORMED**.
- Draft PR #14 must remain open, draft, unmerged, and separate from production release gates.

## M2V repository/local media-scanning implementation

Date: 2026-08-24. Source: green D1 SHA
`bc8afd939a532021dd5a6a975894b2cee4842a87`. Execution boundary: the isolated local M2 worktree,
local Supabase/Docker, the repository pull worker, and ClamD. Changes remain uncommitted, unstaged,
unpublished, and subject to repeat M2C review.

### M2R focused-remediation evidence

| Command or suite                                    | Result | Evidence                                                                                              |
| --------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------- |
| `pnpm test:media-scanner:gates`                     | PASS   | 7/7 CI/release tests: cross-platform discovery, explicit test config, pins, cleanup, and integrations |
| `pnpm test:edge-memory`                             | PASS   | 2/2; 10 MiB 65,544,192 B, 20 MiB 66,105,344 B; below 128 MiB and size-independent                     |
| Full Edge Deno tests                                | PASS   | **93/93** HMAC/capability/nonce/metadata-only scanner control and M1 protected-media regressions      |
| `pnpm test:local-supabase`                          | PASS   | Explicit `test`/deterministic queue, replay and authorization contract; no scanner credential         |
| `pnpm test:media-scanner:supabase`                  | PASS   | 28 labels; real Storage/DB/Edge/worker/ClamD/remux/replay/cleanup; exact zero residue drift           |
| D1-to-M2 upgrade/fresh pgTAP                        | PASS   | Upgrade 3 files/143; fresh full **28 files/1,035 assertions**; public/private lint zero               |
| `supabase/tests/database/media_scan_concurrency.sh` | PASS   | Real claim/reclaim/prepare/finalize/cleanup/signature/nonce races with one-winner assertions          |
| Scanner package                                     | PASS   | **15 files/100 tests**; strict build/type/lint and malformed/bomb/protocol/timeout/redaction coverage |
| `pnpm test:media-scanner`                           | PASS   | Official EICAR/freshness, max images, sequential native isolation, cleanup, cgroup proof, SBOM        |
| `pnpm test:media-scanner:remux`                     | PASS   | 6 labels: real M4A/audio-MP4/video-MP4 remux, metadata strip, reopen, timeout kill, trailing denial   |
| `pnpm validate`                                     | PASS   | Format, docs, i18n, inventories, scanner gates, lint, strict types, tests, web build, Android export  |
| License, audit, and secret checks                   | PASS   | Policy checks; no known high-severity vulnerability or repository secret                              |
| Repository and container SBOM                       | PASS   | CycloneDX **808** repository components and **336** exact-image container components                  |

The V2 integration proves queued, active, clean, and terminal replay; completion and output-response
loss; distinct retry artifacts and old-orphan cleanup; stale-worker denial; one-winner completion;
cleanup versus an active attempt; one-shot HMAC nonce replay; exact signed input, output, and readback;
real EICAR detection; fresh/stale signature decisions; a 19,368,173-byte static image beneath the
120-second job deadline; clean M4A, audio-MP4, and completion-video MP4 after actual bounded remux;
fail-closed malformed/unsupported audio/video, WebM, PDF, and polyglot input; autonomous real-Storage
cleanup for all four 25-hour artifact states; and protected-media owner
allow/outsider denial. Edge transports bounded metadata only. It performs no media body download,
full buffer/Base64/hash/sanitize/upload path; promotion is a server-side Storage copy after current
attempt, manifest, signature, and exact object-metadata checks.

The lightweight `test:local-supabase` boundary deliberately supplies `APP_ENV=test`,
`UPLOAD_SCANNER_MODE=deterministic`, and `AI_PROVIDER=deterministic` explicitly. It proves quarantine
authorization plus asynchronous queue/status/response-loss replay without a scanner secret; it is not
malware or sanitization evidence. The separate mandatory `media-scanner` job owns the real pull worker,
ClamAV, sanitization/remux, promotion, replay, concurrency, and cleanup lifecycle.

The harness resets local Supabase before and after the run, stops the function server and exact
ClamD container, removes temporary signatures/media, and compares counts for Auth users, uploads,
private jobs/attempts/artifacts/attestations/events/nonces, and Storage objects. Failure cleanup also
resets the database; setup or primary test errors are not hidden. The final run preserved the exact
baseline counts: 9 Auth users, 1 seeded upload, and zero jobs, attempts, artifacts, attestations,
events, nonces, or Storage objects. The mandatory CI scanner job is not path-filtered and runs scanner
lint/typecheck/test/build, container hardening/build, real
ClamAV/EICAR, image/polyglot and unsupported-format policy, local Supabase/Storage/Edge integration,
real DB concurrency, freshness/memory/remux gates, licenses, audit/security, and repository/container
SBOM. Third-party Actions and Deno are pinned exactly; final cleanup uses `if: always()` without
converting the original job result. Hosted Actions execution remains **NOT RUN**.

The final standalone container accepted a 19,368,173-byte PNG in 2,644 ms and separately exercised
8,192 x 4,882 (39,993,344-pixel) JPEG, PNG, and WebP through both ClamAV scans and
decode/re-encode/reopen. Their cgroup peaks were 415,330,304, 537,280,512, and 432,246,784 bytes.
Three sequential high-entropy WebP jobs used distinct child PIDs, completed in 6,003/5,346/5,459 ms,
left no child or temp residue, and peaked at 688,717,824 bytes under a 1,073,741,824-byte no-swap
worker limit; ClamD retained its separate 4 GiB budget. The final worker image ID is
`sha256:381923e7bd1612cdd9e1c6079dcaa66bbda3c6e816803852279d70137e7d592f`. The repository SBOM
SHA-256 is `390856a1d77687aa6b92d7f0f51eb99b0332ed6136f71549280b47782d3e8b7d`; the exact-image container
SBOM SHA-256 is `23e6b11dde394d7a6d73c3bc96c00f07727897e574856457bb3added896b3961`.

Configuration requires explicit `APP_ENV` and external mode outside local/test. The scanner uses
dedicated control and attestation HMAC secrets, never database/S3/Supabase service-role/publishable/user
credentials. Exact HTTPS control and Storage origins, strict signed-query allowlists, no redirects,
one active job, a fixed 120-second
deadline, bounded metadata timeouts, fresh signatures, private-network policy, and alerts are
release-gated. Syntax cannot prove DNS privateness; operators must prove routing, firewall, TLS, and
egress behavior.

### Remaining external gates

- Hosted scanner provisioning, Supabase/Edge deployment, production secrets, and private-network/TLS
  configuration: **NOT RUN**.
- Continuous signature updates/ClamD readiness, alerts, hosted load/capacity, deny-by-default egress,
  and production runtime-image hardening: **NOT RUN**.
- ClamAV GPL-2.0-only production legal/operator approval and source-offer obligations: **NOT RUN**;
  the pinned ClamAV container remains repository/local evidence only.
- Hosted Actions, EAS, emulator, and physical-device validation: **NOT RUN**.
- ClamAV is malware detection, not CDR. Static JPEG/PNG/WebP use decode/re-encode/reopen. Approved
  M4A/MP4 audio and completion MP4 video use bounded FFmpeg remux and FFprobe reopen. WebM, PDFs,
  archives, Office files, scripts, executables, and unknown formats fail closed; no PDF CDR is claimed.
- The hosted 15-minute cleanup scheduler requires human-provisioned Vault URL/secret inputs and is
  **NOT RUN**; local pg_cron contract, database aging, and real Storage deletion are repository evidence.
