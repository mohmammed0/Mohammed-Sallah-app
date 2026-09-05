# Testing

[العربية](ar/TESTING.md) · [Documentation map](README.md)

| Layer             | Command                                            | Purpose                                                                 |
| ----------------- | -------------------------------------------------- | ----------------------------------------------------------------------- |
| Format/lint/types | `pnpm format:check && pnpm lint && pnpm typecheck` | Static quality and generated-contract use                               |
| Unit              | `pnpm test`                                        | Domain state, matching, money, env, storage, i18n, content              |
| Integration       | `pnpm test:integration`                            | Cross-package contracts/fallback behavior                               |
| Prelaunch helpers | `pnpm test:prelaunch`                              | Disposable legal fixture guards and source/artifact packet verification |
| Local Supabase    | `pnpm test:local-supabase`                         | Explicit test-mode queue/replay/auth plus AI and marketplace flows      |
| Media scanner     | `pnpm test:media-scanner:supabase`                 | Real V2 Storage/Edge/pull-worker/ClamD/remux/replay/cleanup flow        |
| Edge memory       | `pnpm test:edge-memory`                            | Scanning-control static prohibition plus size-independent peak          |
| Scanner container | `pnpm test:media-scanner`                          | Real EICAR, signatures, max policy, isolation, residue, and SBOM        |
| Scanner remux     | `pnpm test:media-scanner:remux`                    | Real M4A/audio-MP4/video-MP4 FFmpeg remux and timeout cleanup           |
| Scanner CI gates  | `pnpm test:media-scanner:gates`                    | Mandatory workflow commands, release variables, and gate inventory      |
| Database/RLS      | `pnpm test:db`                                     | Schema, deny-by-default and adversarial roles                           |
| Edge Functions    | `pnpm test:functions`                              | Deno boundaries, workers, scanning, AI, translation                     |
| Security          | `pnpm test:security && pnpm security:scan`         | Static boundary assertions, secret/dependency scan                      |
| Web E2E           | `pnpm test:e2e:web`                                | Public routes plus authenticated human cancellation/dispute flow        |
| Mobile E2E        | `pnpm test:e2e:mobile`                             | Maestro flows; requires emulator/device and installed app               |
| Load              | `pnpm test:load:smoke`                             | Builds and owns a local Next server; requires external k6 binary        |
| Build             | `pnpm build && pnpm mobile:expo-check`             | Next production and Android/iOS Metro/Hermes exports                    |

The authenticated local Supabase runner requires `APP_ENV=test`, `SALLAH_DISPOSABLE_DB_CONFIRMED=1`,
and an intentionally disposable, reset local backend. Its guarded synthetic legal fixture enables
consent and verifies rejection, acceptance, customer/provider completion and rating, and policy rotation.
It binds database mutations to the explicit local Docker socket and restores its own fixture state;
an interrupted run requires a fresh reset. See [prelaunch commands and evidence](release/PRELAUNCH.md).
Android/iOS exports prove bundling, not signing, a native iOS build or physical-device behavior.

On Windows/WSL, repository tool scripts detect executable user-local WSL installations for Supabase,
Deno, k6, and Maestro. The media-scanner integration requires local Supabase and Docker, creates only
local random HMAC values and a disposable unsigned EICAR-only cross-system signature database, and
resets the
database before and after each run. It never uses or provisions hosted credentials. The web E2E runner
reads only the local public API URL and publishable key from `supabase status`, rebuilds Next with those
values, and passes them to Playwright without persisting them. It resets the local database by default;
CI sets `SALLAH_E2E_DATABASE_PREPARED=true` only after its explicit reset has succeeded, preventing a
redundant container reset. For k6, set `BASE_URL` to the reachable local host when the web server and
runner use different loopback namespaces. Acceptance scenarios A–G combine automated evidence and
physical/integration verification. A command that lacks Docker, a browser, emulator, device, or
credential is `NOT RUN`, never PASS. CI retains Playwright reports and visual evidence on success and failure. Database changes must
add tests showing both permitted and denied actors. AI tests use deterministic fallback; no paid call
is required.

The scanning-control Edge inventory is explicit and must remain metadata-only. The rule is not a
repository-wide ban: `media-access` is separately tested as a live-authorized streaming broker, while
the clean-authorized `ai-diagnostic` and `transcribe` provider transports remain an explicit M3
activation review. See [Media-scanner boundary map](security/MEDIA_SCANNER_TEST_BOUNDARY_MAP.md).

Separately, `pnpm test:media-scanner` preserves the pinned official ClamAV EICAR signature, adds only
a harmless deterministic freshness overlay, and requires the detected name `Eicar-Test-Signature`.
