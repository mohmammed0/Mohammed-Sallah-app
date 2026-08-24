# Environment contract

Environments are `local`, `test`, `preview`, and `production`. Copy `.env.example` to an ignored local file; never commit values. Mobile/browser bundles may receive only `EXPO_PUBLIC_*`, `NEXT_PUBLIC_*`, the Supabase URL, and the publishable key. `SUPABASE_SECRET_KEY`, AI keys, payment keys, signing credentials, and service-role values are server-only.

| Variable group                                                   | Scope          | Notes                                                                                  |
| ---------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------- |
| `*_SUPABASE_URL`, `*_SUPABASE_PUBLISHABLE_KEY`                   | Public client  | RLS remains mandatory                                                                  |
| `SUPABASE_SECRET_KEY`                                            | Edge only      | Never supplied to the scanner worker; never expose or log                              |
| `UPLOAD_SCANNER_CONTROL_ORIGIN`, `UPLOAD_SCANNER_STORAGE_ORIGIN` | Edge/worker    | Exact scanner-facing origins; HTTPS is required outside explicit local/test            |
| `UPLOAD_SCANNER_CONTROL_SECRET`, `*_ATTESTATION_SECRET`          | Server only    | Distinct HMAC secrets; never a Supabase, S3, publishable, service-role, or user key    |
| `UPLOAD_SCANNER_STORAGE_S3_ACCESS_KEY_ID`, `*_SECRET_ACCESS_KEY` | Edge only      | Presigns one exact attempt-bound S3 PUT; never supplied to worker or client            |
| `UPLOAD_SCANNER_STORAGE_S3_REGION`                               | Edge only      | Exact reviewed Storage S3 region used in SigV4                                         |
| `UPLOAD_SCANNER_NETWORK_POLICY`                                  | Operations     | Preview/production must be `private-only`; routing requires operator evidence          |
| `UPLOAD_SCANNER_SIGNATURE_MAX_AGE_HOURS`                         | Operations     | Enforced by ClamD readiness, claim, and attestation verification; maximum is 168 hours |
| `UPLOAD_SCANNER_MAX_CONCURRENT_JOBS`, `*_JOB_DEADLINE_SECONDS`   | Worker         | Exactly one active job and one immutable 120-second deadline per attempt               |
| `UPLOAD_SCANNER_CONTROL_TIMEOUT_MS`, `*_ALERTS_ENABLED`          | Operations     | Metadata-call timeout is exactly 5 seconds; alerts required outside local/test         |
| `UPLOAD_SCANNER_WORKER_ID`, `*_IDLE_DELAY_MS`                    | Worker         | Opaque scanner identity and bounded 100-10,000ms idle pull interval                    |
| `AI_PROVIDER`, model and provider keys                           | Edge/server    | Deterministic provider local/test only                                                 |
| `PAYMENT_PROVIDER`                                               | Server         | `offline` default; fake/sandbox forbidden in production                                |
| `EAS_PROJECT_ID`, `EXPO_ACCESS_TOKEN`, bundle/package IDs        | Mobile release | Human-owned production identifiers                                                     |
| `SALLAH_ANDROID_GOOGLE_MAPS_API_KEY`                             | Build only     | Restricted Android Maps key; injected into native config, never Expo JS `extra`        |
| Brand/legal/support/privacy/terms values                         | Build/runtime  | Placeholders rejected in production                                                    |

`UPLOAD_SCANNER_MODE=deterministic` is allowed only in local/test and is not evidence of production
malware scanning or sanitization. Preview and production require `external`, the complete operations
contract above, exact HTTPS control and Storage origins, and distinct 32-256 UTF-8-byte HMAC secrets.
The worker appends only the fixed `/functions/v1/scanner-control` path, validates every capability
against the configured Storage origin, and refuses redirects. Public and loopback IP literals fail
closed. A DNS name such as `scanner.internal` cannot prove network privateness syntactically:
operators must prove private DNS resolution, routes, firewall policy, TLS identity, and
deny-by-default egress. Missing or unknown `APP_ENV` never defaults to local behavior.

Input, output, and readback capabilities are clipped to the lesser of their configured maximum and
the remaining attempt deadline minus the 15-second finalization margin. The output S3 credential is
used only inside `scanner-control` to produce an exact opaque-path SigV4 URL; the worker receives no
broad S3 credential. Hosted cleanup additionally requires the two Vault entries documented in
[Required human inputs](HUMAN_INPUTS.md); they are not environment variables exposed to clients.

Production is fail-closed: missing values, `.invalid`/`example`/placeholder content, deterministic AI,
deterministic media scanning, incomplete scanner operations inputs, and fake/sandbox payment adapters
cause a non-zero validator exit. Rotate a leaked key immediately, revoke affected sessions/tokens,
review audit logs, and follow the incident runbook.
