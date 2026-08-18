# Environment contract

Environments are `local`, `test`, `preview`, and `production`. Copy `.env.example` to an ignored local file; never commit values. Mobile/browser bundles may receive only `EXPO_PUBLIC_*`, `NEXT_PUBLIC_*`, the Supabase URL, and the publishable key. `SUPABASE_SECRET_KEY`, AI keys, payment keys, signing credentials, and service-role values are server-only.

| Variable group                                            | Scope          | Notes                                                   |
| --------------------------------------------------------- | -------------- | ------------------------------------------------------- |
| `*_SUPABASE_URL`, `*_SUPABASE_PUBLISHABLE_KEY`            | Public client  | RLS remains mandatory                                   |
| `SUPABASE_SECRET_KEY`                                     | Server only    | Never expose or log                                     |
| `AI_PROVIDER`, model and provider keys                    | Edge/server    | Deterministic provider local/test only                  |
| `PAYMENT_PROVIDER`                                        | Server         | `offline` default; fake/sandbox forbidden in production |
| `EAS_PROJECT_ID`, `EXPO_ACCESS_TOKEN`, bundle/package IDs | Mobile release | Human-owned production identifiers                      |
| Brand/legal/support/privacy/terms values                  | Build/runtime  | Placeholders rejected in production                     |

Production is fail-closed: missing values, `.invalid`/`example`/placeholder content, deterministic AI, and fake/sandbox payment adapters cause a non-zero validator exit. Rotate a leaked key immediately, revoke affected sessions/tokens, review audit logs, and follow the incident runbook.
