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

Date: 2026-08-19. Execution boundary: GitHub API and GitHub Actions only. The Windows
checkout, Android Studio, emulator, Metro, Gradle, local Supabase, EAS Build, production
infrastructure, and app stores were not used.

### Implemented contract

- Customer navigation is Home, Requests, Messages, and Account. The legacy provider branch remains
  unchanged and customer jobs are no longer a visible tab.
- The request route is an explicit recoverable journey:
  category → diagnostic chat → location → timing → review → success. Publication still requires
  customer confirmation and the existing idempotent Supabase command.
- Customer categories and subcategories are database-backed. Authoritative AI context now retains
  the confirmed subcategory through offline replay without fabricating an AI suggestion.
- Saved locations use owner-scoped RPCs and RLS. A transient selection stays in memory; publication
  creates an immutable request-location snapshot in the same transaction. Only foreground location
  permission is requested.
- The shared customer design system provides semantic light/dark tokens, accessible interaction
  states, RTL/LTR helpers, Lucide icons, localized loading/empty/error/success states, and
  reduced-motion behavior.
- The reference at `docs/screenshots/customer-experience-v1.svg` is an original design reference,
  not a device screenshot.

### Cloud validation evidence

- **Migration chain from zero — PASS:** Disposable Supabase reset completed before generated
  types were committed in `4b96368c60c3d0b7b300086501abeb21028e03d4`.
- **Generated database types — PASS:** Regenerated from the reset database; final CI verifies zero
  drift.
- **pgTAP and RLS — PASS:** 22 files / 510 assertions, including 18 saved-location/publication
  assertions.
- **Legacy timing upgrade — PASS:** 5/5 legacy combinations.
- **Local Supabase integration — PASS:** Storage, AI, and true concurrent core idempotency.
- **Mobile lint and strict typecheck — PASS:** GitHub Actions mobile job.
- **Mobile unit/component tests — PASS:** 21 files / 81 tests.
- **Expo Doctor and Android export/config check — PASS:** GitHub Actions mobile job; production
  placeholders remain fail-closed.
- **Web lint/typecheck/build — PASS:** GitHub Actions web job.
- **Web unit tests — PASS:** 3 files / 15 tests.
- **Playwright — PASS:** 8 passed / 2 explicitly skipped in the established suite.
- **Repository format and generated artifacts — PASS:** Cloud finalizer formatted sources,
  regenerated types, removed itself, and produced commit
  `4b96368c60c3d0b7b300086501abeb21028e03d4`.
- **Final full CI on report HEAD — BLOCKED / NOT RUN:** The push and pull-request jobs received
  zero steps and no runner because GitHub blocked Actions for account billing/spending-limit reasons.

Final-head [push run 32261239382](https://github.com/mohmammed0/Mohammed-Sallah-app/actions/runs/32261239382)
and [pull-request run 32261246335](https://github.com/mohmammed0/Mohammed-Sallah-app/actions/runs/32261246335)
were attempted. GitHub attached the same failure annotation to every zero-step job: recent account
payments failed or the Actions spending limit must be increased. The pull-request run was retried
twice after cooldown with the same result. This is an external runner/billing gate; no repository
command or test ran in those jobs.

The first pre-final CI run failed only at formatting and generated-type drift after its preceding
database/RLS/integration gates passed. Those generated artifacts were then corrected by the bounded
cloud finalizer. No test failure was suppressed.

### External and human gates

- Android emulator and physical-device visual validation: **NOT RUN** under the cloud-only boundary.
  Follow-up and required Maps preview key/package/SHA-1 restrictions are tracked in Issue #15.
- Camera/gallery, voice, foreground location, map gestures, large text, screen reader, RTL/LTR, and
  restart behavior on a real device: **NOT RUN** pending Issue #15 evidence.
- Provider visual redesign is deliberately outside this change and tracked in Issue #16.
- EAS Build/APK/AAB: **NOT STARTED**. No signing credential was accessed.
- Production deployment, migrations, secrets, paid services, and store submission: **NOT
  PERFORMED**.
- Draft PR #14 must remain open, draft, unmerged, and separate from production release gates.
