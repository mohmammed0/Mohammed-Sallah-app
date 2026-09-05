# Repository map

| Path                     | Ownership                                   | Notes                                                                        |
| ------------------------ | ------------------------------------------- | ---------------------------------------------------------------------------- |
| `apps/mobile`            | Expo mobile product                         | Router composition, feature controllers, presentation, local recovery.       |
| `apps/web`               | Next.js public/admin web                    | Server-authorized admin console and public information.                      |
| `packages/api`           | Shared API contracts                        | Typed request/response boundary.                                             |
| `packages/config`        | Environment and branding                    | Only controlled environment access.                                          |
| `packages/database`      | Generated database types                    | Regenerate after schema changes; do not hand edit drift.                     |
| `packages/domain`        | Business invariants                         | Framework-independent domain logic.                                          |
| `packages/i18n`          | ar/en/ur/hi messages                        | Arabic source language; RTL/LTR parity.                                      |
| `packages/observability` | Safe telemetry contracts                    | Categorical, redacted events only.                                           |
| `services/media-scanner` | Outbound-only worker                        | HMAC, signed capabilities, ClamAV, sanitization, attestation.                |
| `supabase/migrations`    | Forward-only database authority             | Codex/security ownership; UI tools prohibited.                               |
| `supabase/functions`     | Edge authorization/providers                | Server-only secrets and capability issuance.                                 |
| `scripts`                | Repository gates and local operations       | Commands must fail closed and bound output.                                  |
| `docs`                   | Current, operational, and handoff knowledge | Historical reports are labelled under `docs/archive` or validation evidence. |

Primary commands and versions are in the root `package.json`, `.nvmrc`,
`supabase/config.toml`, `supabase/functions/deno.json`, and `.github/workflows/ci.yml`.
