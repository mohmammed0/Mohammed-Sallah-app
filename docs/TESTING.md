# Testing

| Layer             | Command                                            | Purpose                                                          |
| ----------------- | -------------------------------------------------- | ---------------------------------------------------------------- |
| Format/lint/types | `pnpm format:check && pnpm lint && pnpm typecheck` | Static quality and generated-contract use                        |
| Unit              | `pnpm test`                                        | Domain state, matching, money, env, storage, i18n, content       |
| Integration       | `pnpm test:integration`                            | Cross-package contracts/fallback behavior                        |
| Database/RLS      | `pnpm test:db`                                     | Schema, deny-by-default and adversarial roles                    |
| Edge Functions    | `pnpm test:functions`                              | Deno boundaries, workers, scanning, AI, translation              |
| Security          | `pnpm test:security && pnpm security:scan`         | Static boundary assertions, secret/dependency scan               |
| Web E2E           | `pnpm test:e2e:web`                                | Public routes plus authenticated human cancellation/dispute flow |
| Mobile E2E        | `pnpm test:e2e:mobile`                             | Maestro flows; requires emulator/device and installed app        |
| Load              | `pnpm test:load:smoke`                             | Local-only k6 health smoke; requires external k6 binary          |
| Build             | `pnpm build && pnpm mobile:expo-check`             | Next production and Android Metro exports                        |

On Windows/WSL, repository tool scripts detect executable user-local WSL installations for Supabase, Deno, k6, and Maestro. For k6, set `BASE_URL` to the reachable local host when the web server and runner use different loopback namespaces. Acceptance scenarios A–G combine automated evidence and physical/integration verification. A command that lacks Docker, a browser, emulator, device, or credential is `NOT RUN`, never PASS. CI uploads Playwright artifacts on failure. Database changes must add tests showing both permitted and denied actors. AI tests use deterministic fallback; no paid call is required.
