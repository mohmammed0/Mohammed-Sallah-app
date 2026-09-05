# تحسين الواجهات وجاهزية المستودع | UI and repository readiness

Date: 2026-09-05 UTC. This report describes a local follow-on to the unmerged
handoff PR, not a Production release.

## النتيجة | Outcome

تحسّنت الصفحة الرئيسية وتسجيل الدخول وإعدادات الحساب، وأُصلحت حالات البحث
والأخطاء واستعادة المحاولة. تمت مواءمة حزم Expo وإصلاح ثلاث ثغرات متوسطة في
الاعتماديات. الجاهزية للنشر الكامل ما زالت تتطلب تحقق GitHub على التغيير النهائي،
واختبارات الأجهزة، ومدخلات وحسابات النشر المعتمدة.

The isolated working directory is `C:/Users/fas51/source/Sallah-ui-readiness-v1`,
branch `codex/ui-readiness-v1`, based on
`703319cba606d54e7bda455584c3830637ebe319`. This is a scoped follow-on prepared
for a draft PR against PR #33's branch. Publication and subsequent hosted CI
results are recorded in that PR; this report records the local validation phase.
The original dirty checkout and its existing changes were preserved.

Live GitHub inspection confirmed that `main` remains
`26eec9688df5979fa7ebaa0eaf121ef1a150116e`; [PR #33](https://github.com/mohmammed0/Mohammed-Sallah-app/pull/33)
is draft and unmerged. This work is staged on its existing implementation so it
can be reviewed without recreating the older UI. It does not establish a new
canonical main or a published handoff tag.

## ما تغيّر | Changes

- Home: clearer primary service action and request/message shortcuts; active
  requests and waiting offers appear before service browsing; explicit unmatched
  search and empty-catalogue states; search reset and failed-query retries;
  no false empty-history message while loading or unavailable; request timestamps
  use `Asia/Riyadh`; service cards wrap and retain full labels.
- Authentication: sign-in/signup modes with one primary action, show/hide password,
  email validation, signup password guidance, duplicate-submission protection,
  exception-safe pending cleanup, current signup language and contextual recovery.
  Supabase Auth and session-provider role routing remain authoritative.
- Account: readable native language names and selected radio states; clearer
  notification grouping; password reauthentication sits beside privacy commands;
  destructive confirmation and server reauthentication remain intact.
- Shared action buttons retain their accessible name when showing a spinner and
  expose disabled/busy states. All added product strings use shared Arabic,
  English, Urdu and Hindi keys.
- Expo SDK 57 patch alignment: Expo `57.0.20`, Router `57.0.19`, and seven compatible
  native module patches. React `19.2.3` / React Native `0.86.3` remain SDK aligned.
- Dependency security: fixed `decode-uri-component` `0.5.0` with a one-line
  `query-string` default-export compatibility patch; patched both `xmldom`
  branches to `0.8.15` / `0.9.12`. Exact overrides, lock integrity, OSS inventory
  and notices are recorded; no audit finding is suppressed.
- Dependabot scheduled minor/patch updates no longer mix SDK-managed runtime
  versions into the generic update group. Security update eligibility remains.
- The media-scanner Docker build context includes the exact reviewed pnpm patch.
  Both root and worker-specific ignore rules include the patch. A Docker
  context-export regression test checks both selections and that declared patches are present
  while synthetic environment files, dependency folders and unrelated patches are excluded.
  It explicitly skips locally when the Docker daemon is unavailable.
- A pre-existing secure-upload test used an August date that expired after the
  seven-day retention window. Its clock is now fixed and restored between tests;
  production retention behavior was not altered.

No schema migration, server authorization change or production service activation
is included.

## الأدلة | Validation evidence

Evidence files live under ignored `artifacts/` in this working directory.

| Check                                           | Status  | Evidence / limitation                                                                                                                                                                                                              |
| ----------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frozen dependency installation                  | PASS    | Exact lockfile installed; final verification recorded with local logs.                                                                                                                                                             |
| Focused UI/auth/account tests                   | PASS    | 23 component tests across the four changed UI suites.                                                                                                                                                                              |
| Upload retention fixture and home recovery      | PASS    | 26 tests; initial failures reproduced before correction.                                                                                                                                                                           |
| Dependency security / routing / config tests    | PASS    | 22 focused tests; malformed URI and XML failures reproduced before remediation.                                                                                                                                                    |
| Expo Android/Hermes export                      | PASS    | 3,491 modules after decoder compatibility patch.                                                                                                                                                                                   |
| Full dependency audit                           | PASS    | No known vulnerabilities after all three transitive fixes; see dependency review artifact.                                                                                                                                         |
| Package integrity / license review              | PASS    | 24 changed versions, MIT licenses, registry integrity matched, no new install scripts.                                                                                                                                             |
| `pnpm validate`                                 | PASS    | Formatting, documentation, handoff, UI, localization, inventory, lint, strict TypeScript, 541 workspace tests and web/Android builds; `artifacts/ui-readiness-validate.log` and final `artifacts/ui-readiness-validate-final.log`. |
| Integration / security boundary tests           | PASS    | Two integration tests and four security tests; separate `ui-readiness-integration.log` and `ui-readiness-security-tests.log`.                                                                                                      |
| Edge Function tests                             | PASS    | 134 Deno tests, zero failures; `artifacts/ui-readiness-functions.log`. Controlled providers; not live-service evidence.                                                                                                            |
| Expo compatibility / Doctor                     | PASS    | Dependencies aligned; 21/21 Doctor checks after final dependency remediation.                                                                                                                                                      |
| OSS / SBOM                                      | PASS    | License policy passed; `artifacts/sbom.cdx.json` regenerated from the final dependency tree.                                                                                                                                       |
| Actual-component browser preview                | PASS    | Eight interaction/render checks, four languages, no browser page errors.                                                                                                                                                           |
| Codex Security initial UI diff snapshot         | PASS    | Scan `3f2f35b2-1e5c-4cbc-b7b5-c0d82ddd106d`: seven source surfaces, zero findings. It precedes final dependency remediation and is not a seal of the final worktree.                                                               |
| Local database reset / database and backend E2E | NOT RUN | Docker daemon unavailable; no database changes in this slice.                                                                                                                                                                      |
| Physical Android/iOS, TalkBack/VoiceOver        | NOT RUN | ADB lists zero targets; installed emulator executable is unusable. Browser adapter evidence is not native evidence.                                                                                                                |
| Live email/auth-provider delivery               | NOT RUN | Unit and preview tests use controlled service responses.                                                                                                                                                                           |
| Hosted CI at local validation                   | NOT RUN | Local checks precede branch publication. Read subsequent hosted results on the associated draft PR.                                                                                                                                |

Additional browser accessibility spot checks passed: keyboard activation in Arabic
and English, visible 3px focus, stable accessible submit name while busy, six
200%-text layouts at 390px, and ten color pairs (normal text minimum 4.71:1).
See `artifacts/ui-preview/accessibility-results.json`. These are adapter checks,
not native font scaling, a full WCAG audit or TalkBack/VoiceOver evidence.

The browser preview is at `http://127.0.0.1:4178` while its local server runs.
`artifacts/ui-preview/` contains screenshots, smoke results, source fingerprints,
and reproduction scripts. It renders the actual mobile components through a DOM
adapter with synthetic data. No fixture account is authenticated against a live
service. This is not an installable mobile build.

Review captures: [Home](../design/captures/ui-readiness-2026-09-05/home-ar.png),
[sign-in](../design/captures/ui-readiness-2026-09-05/auth-ar.png), and
[account](../design/captures/ui-readiness-2026-09-05/account-ar.png).
These captures contain synthetic data and share the browser limitations above.

`artifacts/sdk57-patch-review.json` records package review, reproduction results,
and lock/patch hashes. A separate final review found no actionable compatibility
regression in the decoder patch, overrides, tests and actual consumers.
The final SBOM SHA-256 is
`c739fd85c02b524d6211ff32cbf8c14c5d35bac318a671bd321b3982a6bd4b87`.
The Codex Security snapshot is
`codex-security-snapshot/v1:sha256:be8f07d4b12bd9060afa5c74ac2d94f23fb380e4274bf0ceb927bacdc864920d`.
The scanner reported that the working tree changed during the run; later dependency
fixes have separate tests and integrity evidence. TAC access could not be checked
because its connector was not connected. The tool reported 4,337,646 scan-accounted
tokens including 4,272,896 cached input tokens; this is tool accounting, not a cost estimate.

## مراجعة GitHub والمدخلات المتبقية | GitHub and release gates

- The first hosted [PR #35 run](https://github.com/mohmammed0/Mohammed-Sallah-app/actions/runs/33946408752)
  on `35c602acd7cec0bcbaa0461af251b4c2b474e249` passed repository, mobile, web and
  Supabase jobs. The media-scanner job failed before runtime probes because the
  Docker allowlist omitted the required pnpm patch. The follow-up includes the
  narrow context fix and its regression check. Subsequent exact-head results are
  recorded on PR #35; this initial failure is not a billing/account rejection.
- The second [hosted run](https://github.com/mohmammed0/Mohammed-Sallah-app/actions/runs/33946868052)
  passed the root-context export test but found that Docker's worker-specific
  ignore file overrides the root rules. The next correction includes that
  effective allowlist and exercises the actual worker Dockerfile selection as
  well as the root selection. A passing generic context check alone is insufficient.

- PR #33 is mergeable but draft/unstable, with no submitted review. Its
  [push run](https://github.com/mohmammed0/Mohammed-Sallah-app/actions/runs/33152404429)
  and [PR run](https://github.com/mohmammed0/Mohammed-Sallah-app/actions/runs/33152406452)
  failed before job steps. The recorded historical cause is account billing;
  current billing status was not established.
- The [September 1 PR #34 run](https://github.com/mohmammed0/Mohammed-Sallah-app/actions/runs/33461044924)
  did execute. Web/database jobs passed; incompatible React/native updates failed
  Expo checks and TypeScript. This confirms an actual compatibility defect and
  is the basis for the Dependabot guard. It does not prove a continuing billing block.
- `main` was unprotected and repository rulesets were empty at inspection.
  An owner must configure the required review/check protection. No repository
  permission or protection was changed in this task.
- Fifteen PRs and nine issues were open at initial inspection. No merge, issue closure,
  force-push, billing change, deployment or store upload is included in this change.
- Complete review and CI for the final proposed integration, followed by separately
  authorized integration. Supply physical-device evidence, signing/store accounts,
  legal/privacy approvals, production credentials, backup/restore and alert drills,
  and release-owner approval as listed in
  [External release gates](../release/EXTERNAL_RELEASE_GATES.md).

## الرجوع عن التغيير | Rollback

The original checkout is intact. This local change can be reviewed or discarded
as an isolated worktree after preserving any desired output. For a future merged
change, use an additive Git revert; restore package manifests, workspace overrides,
patch and lockfile together, then install with `--frozen-lockfile` and revalidate.
Reverting security overrides reintroduces known advisories and requires review.
No database rollback is required for this slice.
