# Launch preparation — 2026-09-05

Status: CURRENT SUPPORTING DOCUMENT. Audience: release owner and reviewers.

This work continues from `bbfe7f2d54f998124574334c7d98900389b01bfa` / draft PR #35 on
`codex/launch-readiness-v1`. Full production/store readiness is not claimed. The original checkout
and its existing changes remain preserved; no merge, production deployment or store submission is
part of these local preparation results.

## Implemented launch controls

- Native microphone permission composition, production identifiers and four-language iOS purpose strings.
- Explicit AI data permission, manual alternative, report-to-support entry, restored queue checks and
  safe withdrawal. Foreground location disclosure describes the actual temporary update session.
- Approved policy reader, account/auth entry points, exact-version acceptance and database content gates.
  See [Policy publication](../operations/LEGAL_PUBLICATION.md) for publication and rollback.
- Public legal/contact pages use current reviewed documents, safe text, four locales and configured
  contact information. Missing inputs display an unavailable state.
- Release CI forwards required encrypted-push settings, verifies current database policies and creates
  a short-lived, package-matched Firebase client file for the build. Turbo hashes relevant mobile/web
  inputs. Server secrets are confined to validation steps.
- Scanner health probes inspect bounded heartbeat/readiness records instead of process existence.
  Logs contain allowlisted operational categories and no user/object identifiers or capabilities.

## Validation evidence

The final exact-source results and CI links must be recorded before this packet can be used to
approve a release. Current focused evidence:

| Check                                                       | Result          | Scope                                                                                                |
| ----------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------- |
| Native config/plugin/Expo CLI tests                         | PASS            | 23 tests; actual installed plugin composition and config loading                                     |
| Mobile suite                                                | PASS            | 324 tests in the full workspace run                                                                  |
| API consent boundary                                        | PASS            | 3 tests                                                                                              |
| Public web suite                                            | PASS            | 100 tests; 16 local HTTP locale/page combinations and direct Next build                              |
| Config suite                                                | PASS            | 23 tests in the full workspace run                                                                   |
| Production build/backend contract                           | PASS            | 7 tests; synthetic configuration and backend responses                                               |
| Scanner service                                             | PASS / SKIP     | 116 pass; one Windows symlink-privilege case skipped                                                 |
| Edge Functions                                              | PASS            | 136 tests, including consent failure handling                                                        |
| Full `pnpm validate`                                        | PASS            | 600 workspace tests passed / one explicit Windows symlink skip; web and Android/Hermes export passed |
| New database migration / pgTAP / publication race           | NOT RUN locally | Docker Desktop failed startup in its inference pipe; hosted verification required                    |
| Current-source native APK / device journeys                 | NOT RUN         | Free EAS Preview build is prepared; exact committed source required                                  |
| Physical Android/iOS, production providers and store review | NOT RUN         | External evidence remains required                                                                   |

Source reviews found and corrected missing release variables, filtered build inputs, a microphone
permission removal, stale consent during publication, legacy acceptance reuse, direct portfolio
updates, client misuse of deletion cleanup and account/recording UX races. Source review and unit
tests do not replace database concurrency, device, hosted provider or operational evidence.

## Verified external inventory

- EAS project `@binmuhayas-team/sallah` is accessible. Preview variable names and existing Android
  signing/build history are available. The checked free cycle had 0/15 Android builds used.
- No production EAS environment variables were present at the inventory checkpoint; no iOS build
  was observed. Existing Android versionCode 13 is historical and does not validate these changes.
- Supabase Preview `wxzwdodhhevuunqpzewo` is active. Its ledger matched 42 of the previous 43 migration
  names and zero local version identifiers. The logical-notification migration was unmatched; the
  new legal migration is an additional pending change. This is not permission to replay foundations.
- The separate legacy Supabase `Sallah` project is not an assumed production target. GitHub main was
  unprotected; draft PRs #33 and #35 remained unmerged. Inaccessible deployment/secret inventories
  were recorded as unknown, not absent.

## Required owner inputs

The launch owner must supply final legal entity, domain/support address, approved policy versions and
moderation operations; select the production backend and native identifiers; configure production
credentials/signing through secret stores; and provide store ownership and physical-device evidence.
Production scanner host, fresh signatures, alert delivery, backup restoration and rollback still need
current observed results. Repository code does not establish these external facts.

No credentials, billing changes, live user-data writes, policy approvals or store submissions were
fabricated. Do not publish until the release checklist and these remaining gates are actually closed.
