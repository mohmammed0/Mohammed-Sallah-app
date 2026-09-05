# Dependency review — September 5, 2026

Status: CURRENT SUPPORTING DOCUMENT. Scope: the proposals open after integration of PR #36 at `2cf253bb44d417a02fd483395a862ff66bb4b053`. Decisions below are review decisions for this cleanup; current integration and checks are resolved through `main` and master issue #23.

راجعنا طلبات التحديث الفعلية ومصادرها الأصلية. يتضمن هذا التغيير التصحيح الأمني لـ Next.js وتحديث أدوات CI المتوافقة. تبقى إصدارات الجوال وبيئة التشغيل الأخرى مثبتة لحين ترقية منسقة. إغلاق اقتراح مؤجل لا يعني تطبيقه أو معالجة ثغرة غير مفحوصة، وتبقى تنبيهات الأمان وفحوصها مفعّلة.

## Adopted changes

| Proposal               | Adopted change                                                                    | Evidence and constraints                                                                                                                                                                                               |
| ---------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #37                    | `actions/upload-artifact` 7.0.1 at `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a`     | Existing archive, hidden-file and retention inputs remain unchanged; the prelaunch job must still download and verify its packet inputs.                                                                               |
| #38                    | `actions/setup-node` 7.0.0 at `820762786026740c76f36085b0efc47a31fe5020`          | `.nvmrc` remains Node 24.19.0 and pnpm remains 11.19.0. The observed hosted runner 2.337.0 exceeds the upstream Node 24 action minimum 2.327.1.                                                                        |
| #39                    | `supabase/setup-cli` 3.0.0 at `46f7f98c7f948ad727d22c1e67fab04c223a0520`          | CLI stays 2.114.0 in all three jobs. The Action changes its installation channel to npm in a temporary prefix and pins its setup-bun dependency. This installation is not a repository-lockfile integrity attestation. |
| Security subset of #40 | Next 16.3.1 → 16.3.4, with matching `@next/env` and optional `@next/swc` packages | Retains MIT notices and updates only the matching Next package family in the lockfile. No other proposal in #40 is implied adopted.                                                                                    |

Upstream Action references: [upload-artifact 7.0.1](https://github.com/actions/upload-artifact/releases/tag/v7.0.1), [setup-node 7.0.0](https://github.com/actions/setup-node/releases/tag/v7.0.0), [setup-cli 3.0.0](https://github.com/supabase/setup-cli/releases/tag/v3.0.0). Exact CI-only Action pins and license sources are in `oss-inventory.json`; their packages are not shipped inside the application.

### Why the Next patch is required

The [16.3.3 security release](https://github.com/vercel/next.js/releases/tag/v16.3.3) fixes the critical [Windows-hosted server RCE](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36) and [AVIF image-optimization RCE](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4). The [16.3.4 follow-up](https://github.com/vercel/next.js/releases/tag/v16.3.4) is the selected patch. The Windows condition is relevant to local Windows serving. Sallah already disables Next image optimization and excludes sharp, so the AVIF path is not treated as demonstrated application exposure.

The initial registry audit returned no known vulnerabilities, despite those published upstream advisories. Upstream advisory review therefore supplemented the registry result. A successful audit alone is not a complete vulnerability assessment. No exploit was executed against any hosted system.

## Proposals retained for a coordinated upgrade

| Proposal                           | Decision and reason                                                                                                                            | Required acceptance before a later upgrade                                                                                                                                                                                                                                                                                |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #28 — AsyncStorage 2.2.0 → 3.1.1   | Defer the native dependency change. SDK 57's actual bundled module matrix selects 2.2.0. No existing JS failure in the proposal is claimed.    | Align the Expo/native matrix, rebuild native targets and verify existing persisted accounts/data, restart and offline behavior. [Expo SDK 57 matrix](https://github.com/expo/expo/blob/sdk-57/packages/expo/bundledNativeModules.json); [v3 migration](https://react-native-async-storage.github.io/3.0/migration-to-3/). |
| #29 — URL polyfill 3.0.0 → 4.0.0   | Defer an elective parser rewrite. The upstream `/auto` API is retained; this is not a claim of React Native incompatibility.                   | Exercise Supabase/auth callback URL behavior and encoding in Hermes and the web runtime. [Upstream v4 release](https://github.com/charpeni/react-native-url-polyfill/releases/tag/v4.0.0).                                                                                                                                |
| #41 — Node types 24.3.0 → 26.4.1   | Defer a type API major targeting Node 26 while application/tooling runtime remains 24.19.0. A type package upgrade does not patch the runtime. | Upgrade the runtime deliberately and verify Node APIs, scanner, build and strict types together. [DefinitelyTyped version contract](https://github.com/DefinitelyTyped/DefinitelyTyped#how-do-definitely-typed-package-versions-relate-to-versions-of-the-corresponding-library).                                         |
| Remaining fifteen updates from #40 | Keep the validated versions pending the checks below. This grouped proposal is only partly incorporated, not fully superseded.                 | Preserve lock/inventory/notices, coordinated runtime contracts and real scanner/DB evidence.                                                                                                                                                                                                                              |

The remaining #40 version requests are retained here so closing a mixed proposal cannot lose them:

| Package               | Retained | Proposed |
| --------------------- | -------- | -------- |
| eslint                | 10.8.1   | 10.9.1   |
| supabase CLI          | 2.114.0  | 2.116.0  |
| turbo                 | 2.10.10  | 2.10.12  |
| typescript-eslint     | 8.67.0   | 8.69.0   |
| vitest                | 4.1.10   | 4.1.11   |
| @noble/hashes         | 2.3.0    | 2.4.0    |
| @supabase/supabase-js | 2.112.3  | 2.114.0  |
| @tanstack/react-query | 5.101.4  | 5.102.8  |
| lucide-react-native   | 1.18.0   | 1.39.0   |
| react-hook-form       | 7.85.0   | 7.87.0   |
| zod                   | 4.4.3    | 4.5.4    |
| @supabase/ssr         | 0.12.4   | 0.12.5   |
| @types/react-dom      | 19.2.4   | 19.2.5   |
| i18next               | 26.3.6   | 26.4.1   |
| @napi-rs/image        | 1.13.0   | 1.14.0   |

The CLI proposal leaves three workflow pins at 2.114.0 and requires review of changed database defaults. The scanner proposal leaves native integrity, image identity and container SBOM metadata at 1.13.0, requiring a rebuilt and verified scanner inventory. Zod changes must include the separately pinned Edge contracts. These are integration review requirements, not assertions that every newer version is defective.

The [noble-hashes 2.4.0 release](https://github.com/paulmillr/noble-hashes/releases/tag/2.4.0) contains security/correctness changes. The bounded Sallah call-site review found SHA-256 byte hashing and encoding helpers, without a demonstrated path into the changed options, Keccak entropy, WebCrypto output or large Blake3 stream behavior. That review is not an exhaustive upstream audit. Future advisories remain actionable even when a version-update proposal is closed.

## Verification and future work

Require `pnpm install --frozen-lockfile`, `pnpm licenses:check`, `pnpm security:scan`, `pnpm validate` and all six hosted CI jobs for the combined change. The web gate includes initial HTML language checks and existing browser journeys; database/scanner gates remain enabled. Keep actual PASS/FAIL/NOT RUN outcomes tied to their run/commit in the integration PR and master #23.

Dependabot version and security updates remain enabled. Do not suppress vulnerability findings or weaken native compatibility, RLS, scanner readiness, consent or CI to reduce the open PR count. A future security fix should be proposed immediately with the appropriate compatibility evidence. Repository cleanup does not authorize production deployment or public-store submission.
