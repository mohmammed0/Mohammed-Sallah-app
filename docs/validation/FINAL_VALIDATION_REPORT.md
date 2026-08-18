# Final validation report

Date: 2026-08-17. Environment: Windows/WSL workspace, Node 24.19.0, pnpm 11.19.0, Supabase CLI 2.114.0, Docker Desktop, Deno 2.9.5, Playwright Chromium 151, k6 2.2.0, Maestro 2.8.0, and Temurin JRE 17.0.20.

Statuses reflect actual command results. `NOT RUN` and `BLOCKED BY HUMAN PRODUCTION INPUTS` are never presented as passes. No production deployment, store submission, or real payment execution occurred.

## Command results

| Command                           | Result                             | Evidence and notes                                                                                            |
| --------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`  | PASS                               | All 11 workspace projects installed from the lockfile                                                         |
| `pnpm format:check`               | PASS                               | All tracked source and documentation matched Prettier                                                         |
| `pnpm lint`                       | PASS                               | 9 Turbo lint tasks                                                                                            |
| `pnpm typecheck`                  | PASS                               | 9 strict TypeScript tasks                                                                                     |
| `pnpm test`                       | PASS                               | 22 tests across domain, config, i18n, safe image parser, mobile, and web                                      |
| `pnpm test:integration`           | PASS                               | 2 cross-package contract tests                                                                                |
| `pnpm test:db`                    | PASS                               | 7 pgTAP files, 134 tests                                                                                      |
| `pnpm test:functions`             | PASS                               | 17 Deno tests covering diagnostic, HTTP, privacy, translation, upload scanning, and worker auth               |
| `pnpm test:security`              | PASS                               | 4 static security-boundary tests                                                                              |
| `pnpm test:e2e:web`               | PASS                               | 7 passed; 1 intentional skip because the state-changing admin journey runs once on Chromium                   |
| `pnpm test:e2e:mobile`            | NOT RUN                            | Maestro works, but reported exactly 0 connected devices and 1 missing shard                                   |
| `pnpm test:load:smoke`            | PASS                               | Local-only k6: 10 VUs/20s, 200/200 checks, 0% request failures, p95 3.75ms                                    |
| `pnpm validate`                   | PASS                               | Format, lint, typecheck, unit suites, Next build, and Android Metro export                                    |
| `pnpm build`                      | PASS                               | Next 16 production build plus Android Hermes export; Metro bundled 1,482 modules                              |
| `expo install --check`            | PASS                               | Expo dependencies current                                                                                     |
| `pnpm mobile:expo-check`          | PASS                               | Android export bundled 1,482 modules                                                                          |
| `pnpm mobile:expo-doctor`         | PASS                               | 21/21 checks                                                                                                  |
| `pnpm config:validate:production` | BLOCKED BY HUMAN PRODUCTION INPUTS | Exit 1 as designed: production project, domains, legal entity, store IDs, and provider credentials are absent |
| Production Expo config            | BLOCKED BY HUMAN PRODUCTION INPUTS | Exit 1 as designed without EAS project and production Supabase public configuration                           |
| `pnpm licenses:check`             | PASS                               | Permissive policy and documented package-scoped build/data exceptions                                         |
| `pnpm security:scan`              | PASS                               | Committed-secret patterns clean; dependency audit reports no known vulnerabilities                            |
| `pnpm audit --json`               | PASS                               | 0 advisories across 770 total dependencies                                                                    |
| `pnpm run sbom:generate`          | PASS                               | CycloneDX 1.7 with 770 components; SHA-256 `f1e620ab3af79c03844f946d512cc97a215875c83e2fa93972262564f42edd7d` |
| Supabase local stack              | PASS                               | Local API/Auth/Storage/Realtime/database available                                                            |
| `supabase db reset`               | PASS                               | 14 forward migrations plus catalog and deterministic local-only demo seed                                     |
| Generated database types          | PASS                               | SHA-256 stayed `769e6b4012ec18c9d00764d39d78a1dbc44d4368d60c3562c4094bbae2122b47` after regeneration          |
| Deno fmt/lint/check               | PASS                               | 19 files formatted, 18 linted, and 6 Edge entry points checked                                                |
| `pnpm i18n:check`                 | PASS                               | Matching ar/en/ur/hi keys; no direct Arabic literals remain in mobile source                                  |

The first direct k6 attempt used WSL loopback while the Next server ran on Windows and correctly failed with connection refused. The repository tool runner was then made WSL-aware, the local Windows host address was supplied explicitly, and the final repository command passed with the figures above.

## Acceptance scenarios A–G

| Scenario                             | Status             | Evidence and remaining requirement                                                                                                                                                                                                                                               |
| ------------------------------------ | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A — Arabic customer to Urdu provider | NOT RUN end-to-end | Arabic/Urdu UI, request draft, deterministic AI fallback, sealed offers, job lifecycle, secure uploads, and translation authorization are implemented. A full device journey needs a connected Android/iOS target; live translation needs approved provider inputs.              |
| B — AI unavailable                   | PASS               | Unit/integration/Deno tests prove schema-valid fallback, preserved input, editable draft, safety flags, and no publish authority.                                                                                                                                                |
| C — Sealed bid security              | PASS               | pgTAP proves providers cannot read competing offers and unrelated actors see none.                                                                                                                                                                                               |
| D — Location privacy                 | PASS               | pgTAP proves only the selected provider can read the exact address; matching uses approximate geography.                                                                                                                                                                         |
| E — Cancellation and dispute         | PARTIAL            | Authenticated/versioned/idempotent commands, RLS, audit/events, holds/intents, notifications, customer/provider status UI, admin human-decision UI, 37 database tests, and a passing browser decision journey exist. Real gateway reconciliation and device E2E remain external. |
| F — Account deletion/export          | PARTIAL            | Queue workers, Auth/session revocation, push/storage cleanup, transactional anonymization, exports, signed links, expiry, retry/dead letter, user/admin status, and tests exist. Final retention policy and full deployed worker/storage E2E require human/deployment inputs.    |
| G — Admin authorization              | PASS               | Cross-role pgTAP proves allowed admin actions and denied mutations, with immutable audit evidence.                                                                                                                                                                               |

## Security and residual risks

RLS is enabled on exposed tenant-sensitive tables and tested across roles. Offers are sealed, exact addresses are selected-provider-only, evidence/storage are private, and critical mutations use authenticated versioned/idempotent commands with locks and audit events. Disputes are decided only by authorized humans. AI remains server-side and cannot publish. Uploads are quarantined, signature-checked, sanitized where supported, scanned, and physically cleaned; production fails closed without an external malware scanner. Privacy workers and financial confirmations are service-role-only.

The former Metro `image-size@1.2.1` advisory path is replaced only at Metro's dependency edge by the tested private `@sallah/image-size-safe` workspace package. The UUID v7 advisory path is replaced with a compatible scoped `xcode>uuid@11.1.1` override. Raw audit and the policy scan are both clean; no audit exception is used.

No repository-controlled launch blocker remains confirmed by the executed matrix. Remaining gates are the connected-device run, real external provider credentials/deployments, final legal/business/localization approval, store accounts/signing, production infrastructure hardening, penetration testing, and backup restore evidence. The draft pull request must not be deployed directly; application rollback is by Git revert, while production migrations require tested backups and recovery procedures. Disabled integrations must remain off until configured and reviewed.
