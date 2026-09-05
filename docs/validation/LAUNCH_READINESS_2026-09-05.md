# Launch preparation — 2026-09-05

Status: HISTORICAL EVIDENCE. Audience: release owner and reviewers.

This report preserves the morning application and delivery checkpoints through `9e9f6b2`.
The subsequent code/GitHub prelaunch work retargeted PR #36 directly to `main` and added verification
tooling. See the [current prelaunch gate](../release/PRELAUNCH.md); results below retain their original
source identity and do not claim to validate later tooling changes or the new main-based PR checkout.

**Public production/store release: HUMAN INPUT REQUIRED.** At this checkpoint, implementation was in
[draft PR #36](https://github.com/mohmammed0/Mohammed-Sallah-app/pull/36), based on
`bbfe7f2d54f998124574334c7d98900389b01bfa` / PR #35. The final application source is
`de2b64813a7e61682d86f3528393d85c0f81dddb` on `codex/launch-readiness-v1`.
Each check below names its source. Subsequent delivery changes contain documentation and original screenshots only. The original dirty checkout
is preserved. No merge, hosted migration, production deployment or store submission occurred.

## Implemented behavior

- Native welcome uses each language's own name, correct Arabic/Urdu RTL, selected/focus states,
  translated entry text and scrollable large-text navigation. Authentication preserves input and
  supports validation, password visibility, recovery and policy access.
- Public policy/contact readers use current approved text and configured contact information in four
  locales. Translated skip links, language/direction, unavailable and retry states are explicit.
  Unapproved seed drafts cannot appear as published policies.
- Explicit AI permission is checked before text/image/audio transfer, including restored queues and
  upload/permission races. Manual entry and reporting remain available; withdrawing permission stops
  recording. Foreground location copy describes the actual temporary 30-minute session.
- Transactional database commands enforce immutable reviewed policy versions/hashes and exact-set
  acceptance. Legacy hash-only acceptance requires fresh consent. Publication and content commands
  serialize through a shared lock. Account/privacy and support access remain available during failure.
- Production configuration rejects placeholders, unsafe URLs, invalid native identities, mismatched
  or oversized Firebase files and server credentials in client configuration. The EAS worker validates
  its real secret file. CI forwards required push inputs and confines server secrets to validation.
- Native composition includes microphone permission and blocks background-location and overlay
  permissions. Scanner health requires fresh bounded heartbeat/readiness and ClamD evidence;
  operational logs exclude user identifiers, media capabilities and raw failures.

## Validation ledger

| Check                                                                | Result  | Scope and evidence                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Final local `pnpm validate`                                          | PASS    | Final source: 631 workspace tests passed, one explicit Windows symlink-privilege skip; lint, strict types, repository checks, Next build and Android/Hermes export passed.                                                                                                                                                                           |
| Workspace counts                                                     | PASS    | Mobile 347; web 100; scanner 116; config 23; domain 19; i18n 10; observability 7; image-size-safe 6; API 3. Root checker/contract tests run separately.                                                                                                                                                                                              |
| Production contracts                                                 | PASS    | Seven synthetic build/backend tests; missing real production inputs fail closed. This is not production activation.                                                                                                                                                                                                                                  |
| Hosted checkpoint                                                    | PASS    | All five jobs on `c542f551da2f1589379e2473774f3db978661917`: [push](https://github.com/mohmammed0/Mohammed-Sallah-app/actions/runs/33954063312), [PR](https://github.com/mohmammed0/Mohammed-Sallah-app/actions/runs/33954065779).                                                                                                                   |
| Final-source hosted CI                                               | PASS    | All five jobs passed on `de2b64813a7e61682d86f3528393d85c0f81dddb`: [push](https://github.com/mohmammed0/Mohammed-Sallah-app/actions/runs/33955812991), [PR](https://github.com/mohmammed0/Mohammed-Sallah-app/actions/runs/33955815594).                                                                                                            |
| Database runtime                                                     | PASS    | Hosted disposable Supabase: 34 files / 1,269 pgTAP checks, including 45 new legal checks; legacy upgrade, full migration/seed reset, lint, integration, generated types and real two-session publication race passed.                                                                                                                                |
| Edge Functions                                                       | PASS    | Hosted Deno format (58 files), lint (56 files), entrypoint checks and 136 tests passed.                                                                                                                                                                                                                                                              |
| Scanner runtime/supply chain                                         | PASS    | Hosted unit, container, remux, fixture, Supabase concurrency/integration, audit and SBOM jobs passed at the cited checkpoint. Production operation is a separate gate.                                                                                                                                                                               |
| Browser journeys                                                     | PASS    | 18 passed; four existing duplicate mobile admin cases intentionally skipped because state-changing/authorization admin scenarios run once on desktop. All eight new policy locale/viewport cases passed.                                                                                                                                             |
| Browser visuals                                                      | PASS    | 16 ordinary/200% captures from `cd79e2b` reviewed; web/i18n sources are unchanged at `de2b648`. Eight Arabic/English PNGs are byte-identical to inspected checkpoint images; all eight changed Urdu/Hindi images were freshly inspected and confirm translated headings, correct direction, wrapping and visible retry controls.                     |
| Final native APK/signature/install                                   | PASS    | [EAS Preview build](https://expo.dev/accounts/binmuhayas-team/projects/sallah/builds/179f33ed-d596-4a3c-95fd-8172ef1362f0), versionCode 19, exact `de2b648`. APK signature v2 verified, signing certificate unchanged, overlay/background-location absent and microphone present; installed successfully on isolated emulator user 10.               |
| Codex Security                                                       | PASS    | Sealed scan `1f4bdb95-36da-4d0a-9697-ce8b446cae96`: zero reportable findings, complete scoped coverage and no deferred review. Native `bbfe7f2..263a825` plus explicit `cd79e2b` supplement; the display-only `de2b648` change has a separate post-seal review with no new security candidate; [identity and limits](SECURITY_LAUNCH_2026-09-05.md). |
| Local Docker database                                                | NOT RUN | Docker Desktop failed startup in its inference pipe; actual hosted disposable Linux database results are recorded above.                                                                                                                                                                                                                             |
| Physical devices and full upgraded hosted customer/provider journeys | NOT RUN | Emulator, fixtures and components do not prove hardware or current production services.                                                                                                                                                                                                                                                              |

The inspected `cd79e2b` browser [artifact 9966027654](https://github.com/mohmammed0/Mohammed-Sallah-app/actions/runs/33954666266/artifacts/9966027654)
ZIP SHA-256: `4dbf3546319c3d8bf5961a7fdf04e416f1a203c0517525303b9649826c5f7820`.
The ignored local `artifacts/browser-cd79e2b/visual-byte-receipt.json` records screenshot names,
SHA-256 values and byte comparisons. GitHub artifact retention applies; download it for release archives.
Browser assertions establish hydrated HTML language/direction. Initial root HTML defaults to Arabic
before the client effect; policy-shell server markup has its requested locale. This does not prove
no-JavaScript root-language compliance or a full assistive-technology audit.

Curated original PNGs from that artifact are retained for GitHub review:
[Arabic mobile policy page](assets/launch-2026-09-05/web-policy-ar.png), SHA-256
`8662e4706382ae5215ccaddec07555cac0d405e6644640f97cfcbbaae0f7da4f`, and
[Urdu mobile policy page at 200% text](assets/launch-2026-09-05/web-policy-ur-large-text.png),
SHA-256 `c864e9ca1fa90fcb28b8d451e9ce733752aac56f1b799aa847ccdbc0decfd35c`. These show the intentional unapproved-policy unavailable state.

## GitHub and hosted environment review

The final APK is retained locally as
`artifacts/native-launch-readiness/preview-de2b64813a7e.apk` (115,651,477 bytes), SHA-256
`98e1520c2ef34737b9472d12fdb5fa113b43c09a7beb7d1d6889c8e81f73b456`.
This is an internal Preview APK, not a production AAB or a store submission.

- Main was unprotected; PRs #33, #35 and #36 were unmerged. Tracker issues #15, #16 and #18–#23
  remain open. Historical issue descriptions are not fresh results. No issues were closed or
  dependency PRs merged to manufacture readiness. Unreadable secret/deployment inventories are unknown.
- EAS `@binmuhayas-team/sallah`, Preview configuration and existing signing were accessible.
  Production EAS variables were absent at inventory; no signed iOS build was observed.
- Active Preview Supabase `wxzwdodhhevuunqpzewo` has 42 historical ledger rows. The
  [read-only reconciliation](PREVIEW_MIGRATION_RECONCILIATION_2026-09-05.md) found 37 exact SQL byte
  matches, four normalized matches and one historical no-op; that administrative function's current
  body was independently matched to its later authoritative definition. Historical version IDs differ.
- Three migrations are absent: logical notification deduplication and the two reviewed-consent
  migrations. Never blindly replay 42 foundations or repair a ledger. The deployed Preview has not
  been upgraded; policy unavailable is expected. The separate legacy project is not assumed production.

## Remaining launch inputs and sequence

1. Supply legal entity, domain/support address, service territory and named support, moderation,
   privacy and release owners. Approve twelve policy documents (three types in four locales), with
   actual review records and processor/retention decisions.
2. Select production backend, native identifiers and store accounts. Provision values through approved
   secret stores; credentials do not belong in a PR, screenshot or chat.
3. Review migration mapping/change window, apply only reconciled forward changes and matching Edge
   Functions, publish the approved packet, and verify consent enforcement is boolean `true`.
   Run both production environment and read-only backend preflights.
4. Complete physical Android/iOS GPS, camera/gallery/microphone, TalkBack/VoiceOver, push receipt/tap,
   network/restart and full customer/provider scenarios. Obtain production scanner/signature,
   alert-delivery, backup-restore and rollback evidence.
5. Review [listing drafts](../store/STORE_LISTING_DRAFTS.md), [data disclosures](../store/DATA_DISCLOSURE_WORKSHEET.md),
   reviewer accounts and real screenshots. Close the [store checklist](../store/RELEASE_CHECKLIST.md)
   and [external gates](../release/EXTERNAL_RELEASE_GATES.md) with evidence before submission.

Concrete commands/order: [policy publication](../operations/LEGAL_PUBLICATION.md) and
[native builds](../operations/EAS_NATIVE_BUILDS.md).

## Native visual verification

The installed version 18 exposed left-aligned Arabic/Urdu welcome paragraphs. Final version 19
uses native automatic paragraph alignment: both right-to-left languages were visually confirmed
right aligned, while English/Hindi remained left aligned. All four welcome screens have translated
entry text, native language labels, selected state and reachable sign-in. Arabic local validation and
Arabic/English 200% text wrapping and scroll-to-action were observed on the actual installed APK.

The [native verification report](NATIVE_LAUNCH_2026-09-05.md) records the exact APK, device environment,
actions, original screenshots and limits. These checks do not establish complete assistive-technology
compliance, physical hardware behavior or protected customer/provider journeys against an upgraded backend.

## Rollback and residual limits

Use a new reviewed revert or forward fix. Database migrations are forward-only: never edit an applied
migration, erase approved policies/acceptances or disable production consent to recover. Keep external
AI unavailable when authoritative consent functions are missing. Restore an approved packet or publish
a corrected immutable version; re-run preflights and cross-role/concurrency checks. Preserve audit,
signing and release evidence.

No dependencies or lockfile changed in this launch PR. Existing transitive native permissions,
server-container licensing/operational obligations, physical coverage and professional copy review
remain documented release-review items. A zero-finding source review does not close them. No billing,
credential, legal approval or public-store result was fabricated.
