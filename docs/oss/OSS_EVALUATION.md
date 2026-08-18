# OSS evaluation

Research date: 2026-08-17. Versions are exact resolved package versions; maintenance was checked through official repositories/releases and security policies. No application repository was cloned or vendored.

| Candidate                        | License          | Decision               | Rationale                                                                                                               |
| -------------------------------- | ---------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Expo / Expo Router               | MIT              | Adopted 57.0.14        | Stable SDK 57, native modules, EAS integration; Expo Doctor 21/21                                                       |
| React Native                     | MIT              | Adopted 0.86.2         | Expo-required version including Hermes regression fix                                                                   |
| Supabase platform/CLI/JS         | Apache-2.0/MIT   | Adopted                | Auth, Postgres/PostGIS/RLS, Storage, Realtime and Edge Functions in one operational boundary                            |
| Next.js                          | MIT              | Adopted 16.3.1         | App Router, static public site, server-authorized admin and security headers                                            |
| Turborepo                        | MIT              | Adopted 2.10.10        | Small pnpm task graph without extra services                                                                            |
| TanStack Query                   | MIT              | Adopted 5.101.4        | Bounded caching/retry/invalidation for mobile server state                                                              |
| React Hook Form                  | MIT              | Adopted 7.85.0         | Small React Native-compatible form state, paired with Zod                                                               |
| Zod                              | MIT              | Adopted 4.4.3          | Runtime validation for RPC, AI, env and query boundaries                                                                |
| i18next                          | MIT              | Adopted 26.3.6         | Shared locale resources and RTL direction                                                                               |
| Vitest / Playwright              | MIT / Apache-2.0 | Adopted                | Fast package tests and browser E2E/artifacts                                                                            |
| React Native Testing Library     | MIT              | Adopted 14.0.1         | Component-test foundation compatible with React Native                                                                  |
| Maestro                          | Apache-2.0       | External tool          | YAML mobile flows; requires emulator/device, no vendored binary                                                         |
| k6                               | AGPL-3.0         | Rejected as dependency | The repo contains only an original test script runnable by an external operator-installed tool; no k6 code/binary ships |
| shadcn/ui                        | MIT              | Reference only         | Custom lightweight visual system avoided copied trade dress and unnecessary generator output                            |
| Refine                           | MIT              | Rejected               | Admin needs were smaller than framework cost; server components/RPCs enforce authorization directly                     |
| Reanimated/gesture-handler       | MIT              | Deferred               | No v1 motion/gesture requirement; lower native risk and size                                                            |
| Sentry / OpenTelemetry exporters | permissive       | Deferred               | No production endpoint/credentials; structured contracts exist without fake active monitoring                           |
| MSW                              | MIT              | Deferred               | Deterministic domain/DB tests cover current boundaries; no extra mock runtime needed                                    |
| Full marketplace templates       | variable         | Rejected               | Branding, domain, RLS and UI were implemented originally; no third-party app copied                                     |

## Compatibility and supply chain

Expo versions are aligned with `expo install --check` and Expo Doctor. TypeScript 6.0.3 is the newest installed line accepted by the selected ESLint/Expo toolchain; TypeScript 7 was rejected after incompatibility was observed. pnpm exact versions and frozen lockfile are mandatory. Native build scripts are allowlisted (`esbuild`, `sharp`, `libxmljs2`, `supabase`) and newly published Expo packages are explicit minimum-age exceptions only because official SDK 57 compatibility required those exact releases.

`lightningcss` (MPL) and Sharp/libvips (Apache/LGPL) are Next transitive build/runtime components, not copied application source. Their names are package-scoped in the license gate, notices are preserved, and final binary-distribution obligations require legal review. CC-BY exceptions are data packages only. Any new license fails CI until reviewed.
