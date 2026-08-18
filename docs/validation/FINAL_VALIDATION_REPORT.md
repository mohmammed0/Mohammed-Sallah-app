# Final validation report

Date: 2026-08-18. Environment: Windows/WSL, Node 24.19.0, pnpm 11.19.0,
Supabase CLI 2.114.0, Docker Desktop, Deno 2.9.5, Playwright Chromium 151, k6 2.2.0,
Expo SDK 54, and Maestro 2.8.0.

Scope: seven repository-controlled integration fixes continued on draft PR #5 from reviewed HEAD
`c81e6e2f60ba39eaa648741cab2cd9af7c660a93`. The final branch HEAD and CI links are recorded in the
PR merge-gate table and release handoff because a tracked file cannot contain the SHA of its own
commit. No production deployment, secret change, merge, force-push, or history rewrite occurred.

Implementation commit: `7b50ae7` — `fix: close launch readiness integration gaps`.

## Migration

One forward-only migration was added; no existing migration was edited. A reset from zero applies all
30 migrations:

- `20260818183816_merge_fix_integration_contracts.sql`

It persists request timing mode, aligns matching/offer selection semantics, atomically binds replayed
transcriptions, restores dispute pre-states, narrows onboarding invalidation to material final-state
changes, and extends the shared role/database contracts.

## Validation evidence

| Command or suite                         | Result | Evidence                                                                                              |
| ---------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------- |
| `supabase db reset --local`              | PASS   | Clean reset from zero applied all 30 migrations and seed                                              |
| Generated database types                 | PASS   | Regenerated from local PostgreSQL; zero byte drift after repository formatting                        |
| `supabase test db`                       | PASS   | 17 pgTAP files, **397 assertions**                                                                    |
| `supabase db lint --local --level error` | PASS   | No database errors; two pre-existing unused-variable warnings only                                    |
| Deno function tests                      | PASS   | **30 tests**                                                                                          |
| Workspace Vitest through `pnpm validate` | PASS   | **67 tests**: mobile 29, web 14, domain 8, config 5, i18n 5, image parser 6                           |
| `pnpm test:integration`                  | PASS   | **2 tests**                                                                                           |
| `pnpm test:security`                     | PASS   | **4 tests**; secret and static security boundaries clean                                              |
| `pnpm test:local-supabase`               | PASS   | Storage/AI scenarios and true concurrent idempotency/replay behavior                                  |
| `pnpm test:e2e:web`                      | PASS   | **8 passed, 2 intentionally skipped** duplicate mobile-project cases                                  |
| `pnpm validate`                          | PASS   | Format, lint, strict typecheck, i18n, catalog assertion, tests, web build, Android export             |
| Data inventory                           | PASS   | 76 categories and one classification for each of 130 tables                                           |
| Expo Doctor                              | PASS   | **21/21 checks**                                                                                      |
| Android export                           | PASS   | Hermes bundle, **1,554 modules**                                                                      |
| k6 smoke                                 | PASS   | **200/200 checks**, zero failures, p95 **3.78 ms**                                                    |
| License check                            | PASS   | Reviewed policy, inventory, and notices                                                               |
| Vulnerability/secret scan                | PASS   | No known disallowed vulnerability or committed secret                                                 |
| SBOM                                     | PASS   | CycloneDX, 773 components; SHA-256 `75909b2727790f0afa6103a101a8c6f24e2e98b8b72d529dc960218a56653c8f` |

The countable repository suites contain **508 passing tests**: 397 pgTAP, 30 Deno, 67 workspace
Vitest, 2 integration, 4 security, and 8 Playwright. Local-Supabase scenarios and 200 k6 checks are
reported separately because they are scenario/load checks rather than the same assertion model.

## Merge-fix gate

| Defect                                | Status | Repository-controlled result                                                                                                                                                                                                                                                      |
| ------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MERGE-FIX-1 — flexible scheduling     | PASS   | Explicit `asap`/`scheduled`/`flexible` mode is persisted and exposed. ASAP uses now plus a documented 60-minute bound; scheduled validates its window and blackout; flexible has no synthetic current window. Matching, submission, brief access, and selection share the policy. |
| MERGE-FIX-2 — offline voice replay    | PASS   | Retained audio survives restart, uploads/scans/transcribes once by `clientMessageId`, then supplies its transcript to AI. Failure stays retryable; publication binds transcription atomically; deletion/replacement removes local files.                                          |
| MERGE-FIX-3 — fake AI suggestion      | PASS   | Initial suggestion is null. Only authoritative diagnostics populate it; manual, AI-confirmed, and customer-corrected sources are distinct and persisted; publish requires explicit confirmation.                                                                                  |
| MERGE-FIX-4 — mutation intents        | PASS   | Mobile journals use five lifecycle states, preserve only retryable response-loss payloads, isolate users, retain server results before cleanup, and permit corrected terminal mutations. Browser forms use unique form-instance intent IDs and normalize defaults before hashing. |
| MERGE-FIX-5 — onboarding invalidation | PASS   | Final-state service diffs preserve offers for biography, locale, unchanged categories, and still-covering availability. Category/qualification loss withdraws only affected offers where possible; selected jobs route to operations review.                                      |
| MERGE-FIX-6 — dispute resume state    | PASS   | General disputes restore documented safe pre-state policies; completion rejection resumes `in_progress`; completed jobs reject ordinary resume; location sharing and events/history follow the selected policy.                                                                   |
| MERGE-FIX-7 — user roles              | PASS   | One shared runtime contract includes `privacy_reviewer` across mobile, web, domain, generated database types, and tests. Staff-only users receive a controlled restricted mobile state; marketplace navigation still requires customer/provider ownership.                        |

## Remaining external NOT RUN gates

- Maestro and physical Android journey: **NOT RUN** because ADB reported no emulator/device.
- Physical iOS build/journey and store signing: **NOT RUN**; no Apple target/account was supplied.
- Live payment, SMS/OTP, push, production AI/provider integrations, production migration rehearsal,
  backup restore drill, penetration test, legal approval, and store release remain external human gates.
- Production configuration validation remains fail-closed until the approved production values in
  `docs/HUMAN_INPUTS.md` are supplied.

Application rollback is a new Git revert commit. Applied database changes require a reviewed forward
compensation migration or backup restore; migration and Git history must not be rewritten. PR #5 is
required to remain draft, open, and unmerged until all external gates are approved.
