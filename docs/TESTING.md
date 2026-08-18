# Testing

| Layer             | Command                                            | Purpose                                                          |
| ----------------- | -------------------------------------------------- | ---------------------------------------------------------------- |
| Format/lint/types | `pnpm format:check && pnpm lint && pnpm typecheck` | Static quality and generated-contract use                        |
| Unit              | `pnpm test`                                        | Domain state, matching, money, env, storage, i18n, content       |
| Integration       | `pnpm test:integration`                            | Cross-package contracts/fallback behavior                        |
| Database/RLS      | `supabase test db`                                 | Schema, deny-by-default and adversarial roles                    |
| Security          | `pnpm test:security && pnpm security:scan`         | Static boundary assertions, secret/dependency scan               |
| Web E2E           | `pnpm test:e2e:web`                                | Public routing, Arabic/English, deletion and accessibility smoke |
| Mobile E2E        | `pnpm test:e2e:mobile`                             | Maestro flows; requires emulator/device and installed app        |
| Load              | `pnpm test:load:smoke`                             | k6 smoke; requires external k6 binary                            |
| Build             | `pnpm build && pnpm mobile:expo-check`             | Next production and Android Metro exports                        |

Acceptance scenarios A–G combine automated evidence and physical/integration verification. A command that lacks Docker, a browser, emulator, device, or credential is `NOT RUN`, never PASS. CI uploads Playwright artifacts on failure. Database changes must add tests showing both permitted and denied actors. AI tests use deterministic fallback; no paid call is required.
