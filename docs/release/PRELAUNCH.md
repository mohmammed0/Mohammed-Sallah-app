# Code and GitHub prelaunch gate

Status: CURRENT SUPPORTING DOCUMENT. Audience: engineering, reviewers and release owners.

هذه بوابة تجهيز الكود وGitHub قبل الإطلاق الفعلي. تجمع الفحوص الآلية ونسخ الحزم
وبصمات المصدر والترحيلات في حزمة قابلة للتحقق. اعتماد الجهة والسياسات وتجهيز الإنتاج
والأجهزة والمتاجر مرحلة لاحقة؛ لا تمنع اختبار الكود في بيئة مستقلة.

## Current integration

[PR #36](https://github.com/mohmammed0/Mohammed-Sallah-app/pull/36) was merged into `main` at
`2cf253bb44d417a02fd483395a862ff66bb4b053`, preserving the earlier PR #33/#35 history.
[All six main CI jobs passed](https://github.com/mohmammed0/Mohammed-Sallah-app/actions/runs/33994499891),
and that run's [prelaunch packet](https://github.com/mohmammed0/Mohammed-Sallah-app/actions/runs/33994499891/artifacts/9977772072)
was retained and verified against a clean checkout of the merge SHA.

The annotated tag [`sallah-multitool-handoff-v1`](https://github.com/mohmammed0/Mohammed-Sallah-app/tree/sallah-multitool-handoff-v1)
preserves this engineering checkpoint. Its tag object is `48b6824a52d2c2216408ad71d455a2e4ce98adee`
and its target is the merge SHA above; no cryptographic signing is claimed. The tag stays immutable
while `main` may advance. Resolve current `main` with `git rev-parse HEAD` in a clean checkout and
use matching CI for new work. After any source or base change, require fresh CI for the exact candidate
and its PR merge checkout. Current follow-up gates remain in [tracker #23](https://github.com/mohmammed0/Mohammed-Sallah-app/issues/23).

## Automated repository gate

All six CI jobs must pass:

| Job           | What it proves                                                                                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| repository    | Format, documentation/handoff, boundaries, strict types, units, production rejection, prelaunch helper tests, supply-chain checks and SBOM.                               |
| mobile        | Expo dependency/doctor checks and actual Android **and iOS** Metro/Hermes exports. These exports are not signed native applications.                                      |
| web           | Next build and real browser tests against the disposable local backend, with retained visual evidence.                                                                    |
| supabase      | Clean migrations/seeds, pgTAP/RLS, legacy upgrade, concurrent publication, type generation, Edge tests and authenticated HTTP customer/provider journeys.                 |
| media-scanner | Real container, Storage/Edge/worker/ClamD, media, concurrency and supply-chain checks in isolated CI services.                                                            |
| prelaunch     | Runs only after all five preceding jobs succeed; downloads this run's mobile export and SBOM, generates their source-bound inventory, verifies it and retains the packet. |

The authenticated HTTP journey explicitly enables legal consent with twelve synthetic `TEST ONLY`
documents. It exercises rejection before acceptance, exact displayed hashes, per-account acceptance
and retries, the marketplace lifecycle, policy rotation and renewed acceptance. It never approves
real policies or touches a hosted backend. The fixture requires test mode, an explicit disposable
acknowledgment, the local API and Docker socket; overlapping runs are rejected. Normal cleanup restores
the prior setting and withdraws only its own documents. An interrupted fixture requires a fresh
disposable database reset before retry.

Run repository validation with `pnpm validate`. With an intentionally disposable local Supabase
already started and reset, the Linux integration command is:

```bash
APP_ENV=test UPLOAD_SCANNER_MODE=deterministic AI_PROVIDER=deterministic \
SALLAH_DISPOSABLE_DB_CONFIRMED=1 pnpm test:local-supabase
```

On Windows, set those four process variables in PowerShell before the same command. The runner uses
the explicit local WSL Docker socket. A stopped Docker runtime means NOT RUN locally; the CI job
provides independent disposable Linux execution.

## Retained packet and verification

Every successful CI run retains `prelaunch-packet` for 30 days. It includes `prelaunch/current/packet.json`
and `prelaunch-inputs/` with the Android/iOS export and SBOM. Download that artifact from the exact
successful run into the checkout's ignored `artifacts/` directory, then use:

```text
pnpm prelaunch:verify --packet artifacts/prelaunch/current/packet.json
```

Use a clean checkout of the packet's recorded checkout SHA. A PR workflow may test a temporary merge
commit; its `ci.checkoutCommit` and `ci.pullRequestHead` identify different things and must not be relabeled.
Preserve the packet together with its artifact inputs and source identity before retention expires.

Each packet creates a new child directory and refuses to overwrite an older packet; use a fresh name
for each local candidate. For a local packet, first finish/commit the candidate, run `pnpm validate`,
`pnpm mobile:expo-check` and `pnpm sbom:generate`, then supply the observed commit explicitly:

```bash
CANDIDATE_SHA=$(git rev-parse HEAD)
pnpm prelaunch:packet --out artifacts/prelaunch/current --expect-head "$CANDIDATE_SHA" \
  --mobile-export apps/mobile/.expo-check --sbom artifacts/sbom.cdx.json \
  --artifact-source-sha "$CANDIDATE_SHA"
pnpm prelaunch:verify --packet artifacts/prelaunch/current/packet.json
```

The packet preserves the nine established legacy date/sequence migration IDs without inventing UTC
clock times. Later migrations retain full UTC timestamp validation. Existing applied migration names
and contents are never rewritten.

The packet records tracked source hashes, a migration inventory, release/store/config
references, and supplied artifact hashes. Missing files, a dirty checkout, different source identity,
changed bytes, unsafe paths and symlinks cannot silently pass. Artifact source identity is an explicit
caller declaration checked against the checkout; the inventory is not a cryptographic build attestation.
The CI dependency graph and logs provide execution evidence. A packet alone does not prove tests ran.

Expo export behavior: [official CLI documentation](https://docs.expo.dev/more/expo-cli/). Artifact
download semantics: [official GitHub CLI documentation](https://cli.github.com/manual/gh_run_download).

## Boundary after this gate

Prelaunch readiness covers the reviewed code, reproducible validation and GitHub integration candidate.
The [production readiness workflow](../../.github/workflows/release-readiness.yml) is separate and
continues to reject missing production configuration or unapproved policies. This CI packet is built
with synthetic test configuration and must not be promoted as a production build.

Before actual rollout, follow [migration reconciliation](../validation/PREVIEW_MIGRATION_RECONCILIATION_2026-09-05.md),
[policy publication](../operations/LEGAL_PUBLICATION.md), [deployment](../DEPLOYMENT.md),
[external gates](EXTERNAL_RELEASE_GATES.md) and the [store checklist](../store/RELEASE_CHECKLIST.md).
The existing [Android Preview 19 report](../validation/NATIVE_LAUNCH_2026-09-05.md) remains evidence for
its exact application commit. Source inventory or iOS export does not upgrade it to a new signed APK,
physical-device result, iOS native build, legal approval or production deployment.

Rollback preparation remains forward-only for the database: preserve immutable policies/acceptances,
use compensating changes, retain the prior approved app/web artifact and rerun affected checks.
Repository validation does not authorize merge, hosted migration, production activation or submission.
