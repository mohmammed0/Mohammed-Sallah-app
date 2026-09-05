# Launch preparation — 2026-09-05

Status: CURRENT SUPPORTING DOCUMENT. Audience: release owner and reviewers.

**Public production/store release: HUMAN INPUT REQUIRED.** Implementation is in
[draft PR #36](https://github.com/mohmammed0/Mohammed-Sallah-app/pull/36), based on
`bbfe7f2d54f998124574334c7d98900389b01bfa` / PR #35. The reviewed application checkpoint is
`cd79e2be459f65b0470f617f187780c627b1065b` on `codex/launch-readiness-v1`.
Each check below names its source. A subsequent native paragraph-alignment correction is under verification. The original dirty checkout
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

| Check                                                                | Result  | Scope and evidence                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Final local `pnpm validate`                                          | PASS    | Final source: 631 workspace tests passed, one explicit Windows symlink-privilege skip; lint, strict types, repository checks, Next build and Android/Hermes export passed.                                                                                                                                                                                       |
| Workspace counts                                                     | PASS    | Mobile 347; web 100; scanner 116; config 23; domain 19; i18n 10; observability 7; image-size-safe 6; API 3. Root checker/contract tests run separately.                                                                                                                                                                                                          |
| Production contracts                                                 | PASS    | Seven synthetic build/backend tests; missing real production inputs fail closed. This is not production activation.                                                                                                                                                                                                                                              |
| Hosted checkpoint                                                    | PASS    | All five jobs on `c542f551da2f1589379e2473774f3db978661917`: [push](https://github.com/mohmammed0/Mohammed-Sallah-app/actions/runs/33954063312), [PR](https://github.com/mohmammed0/Mohammed-Sallah-app/actions/runs/33954065779).                                                                                                                               |
| Final-source hosted CI                                               | PASS    | All five jobs passed on `cd79e2be459f65b0470f617f187780c627b1065b`: [push](https://github.com/mohmammed0/Mohammed-Sallah-app/actions/runs/33954666266), [PR](https://github.com/mohmammed0/Mohammed-Sallah-app/actions/runs/33954668087).                                                                                                                        |
| Database runtime                                                     | PASS    | Hosted disposable Supabase: 34 files / 1,269 pgTAP checks, including 45 new legal checks; legacy upgrade, full migration/seed reset, lint, integration, generated types and real two-session publication race passed.                                                                                                                                            |
| Edge Functions                                                       | PASS    | Hosted Deno format (58 files), lint (56 files), entrypoint checks and 136 tests passed.                                                                                                                                                                                                                                                                          |
| Scanner runtime/supply chain                                         | PASS    | Hosted unit, container, remux, fixture, Supabase concurrency/integration, audit and SBOM jobs passed at the cited checkpoint. Production operation is a separate gate.                                                                                                                                                                                           |
| Browser journeys                                                     | PASS    | 18 passed; four existing duplicate mobile admin cases intentionally skipped because state-changing/authorization admin scenarios run once on desktop. All eight new policy locale/viewport cases passed.                                                                                                                                                         |
| Browser visuals                                                      | PASS    | Final-source 16 ordinary/200% captures reviewed. Eight Arabic/English PNGs are byte-identical to inspected checkpoint images; all eight changed Urdu/Hindi images were freshly inspected and confirm translated headings, correct direction, wrapping and visible retry controls.                                                                                |
| Final native APK/signature/install                                   | PASS    | [EAS Preview build](https://expo.dev/accounts/binmuhayas-team/projects/sallah/builds/89b5d8a8-0289-4906-9407-fed4a7d0f625), versionCode 18, exact `cd79e2b`, finished at 08:28:20 UTC. APK signature v2 verified, signing certificate unchanged, overlay/background-location absent and microphone present; installed successfully on isolated emulator user 10. |
| Codex Security                                                       | PASS    | Sealed scan `1f4bdb95-36da-4d0a-9697-ce8b446cae96`: zero reportable findings, complete scoped coverage and no deferred review. Native `bbfe7f2..263a825` plus explicit `cd79e2b` supplement; [identity and limits](SECURITY_LAUNCH_2026-09-05.md).                                                                                                               |
| Local Docker database                                                | NOT RUN | Docker Desktop failed startup in its inference pipe; actual hosted disposable Linux database results are recorded above.                                                                                                                                                                                                                                         |
| Physical devices and full upgraded hosted customer/provider journeys | NOT RUN | Emulator, fixtures and components do not prove hardware or current production services.                                                                                                                                                                                                                                                                          |

Final-source browser [artifact 9966027654](https://github.com/mohmammed0/Mohammed-Sallah-app/actions/runs/33954666266/artifacts/9966027654)
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
`artifacts/native-launch-readiness/preview-cd79e2be459f.apk` (115,651,497 bytes), SHA-256
`ba4101849d92ab3e30edb368f5c591af3a5b1b75fe55ebbea9852d6c31be801e`.
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

## Native alignment follow-up

The installed version 18 revealed that explicit right alignment inside the RTL paragraph rendered
the Arabic/Urdu welcome title and lead on the left. The follow-up restores native automatic paragraph
alignment while preserving the shared locale direction. Version 18 proves signing, permission removal
and installation; it does not prove the corrected alignment. A new exact-source build and native
visual check are required before final delivery.

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
