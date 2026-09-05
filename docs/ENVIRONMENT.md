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
| `OPENAI_API_KEY`                                                 | Edge only      | Shared server-side credential for explicitly enabled OpenAI operations; never public   |
| `AI_PROVIDER`, `OPENAI_DIAGNOSTIC_MODEL`                         | Edge only      | Live diagnostic: `openai` / `gpt-5.6-terra`; deterministic is local/test-only          |
| `OPENAI_DIAGNOSTIC_SUPPORTS_IMAGES`                              | Edge only      | Explicit capability gate; clean private images are never silently dropped              |
| `TRANSLATION_PROVIDER`, `OPENAI_TRANSLATION_MODEL`               | Edge only      | Live provider briefs: `openai` / `gpt-5.6-luna`; disabled unless explicitly selected   |
| `TRANSCRIPTION_PROVIDER`, `OPENAI_TRANSCRIPTION_MODEL`           | Edge only      | Live clean-audio transcription: `openai` / `gpt-transcribe`                            |
| `PAYMENT_PROVIDER`                                               | Server         | `offline` default; fake/sandbox forbidden in production                                |
| `PUSH_ENABLED`, `EXPO_ACCESS_TOKEN`                              | Edge/release   | Push must be explicit; the Expo token is server-only                                   |
| `PUSH_TOKEN_ENCRYPTION_KEY`, `NOTIFICATION_WORKER_SECRET`        | Edge only      | Dedicated AES-256 token key and distinct worker secret; never exposed to clients       |
| `EAS_PROJECT_ID`, bundle/package IDs                             | Mobile release | Human-owned production identifiers                                                     |
| `SALLAH_ANDROID_GOOGLE_MAPS_API_KEY`                             | Build only     | Restricted Android Maps key; injected into native config, never Expo JS `extra`        |
| Brand/legal/support/privacy/terms values                         | Build/runtime  | Placeholders rejected in production                                                    |

Preview mobile builds require explicit `EXPO_PUBLIC_SUPABASE_URL` and
`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; they never fall back to localhost. Android Preview builds
also require the restricted Maps key. EAS exposes `EAS_BUILD_PLATFORM`, so an explicit iOS-only
Preview configuration remains independent of the Android Maps credential.

The hosted notification schedule reads only
`sallah_preview_notification_worker_url` and
`sallah_preview_notification_worker_secret` from Supabase Vault. The URL must be the exact HTTPS
Preview Edge Function URL, the secret must be 32-256 UTF-8 bytes and distinct from the media-cleanup
worker secret, and neither value is stored in the cron command.

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

## OpenAI runtime contract

OpenAI is an authenticated server boundary. `OPENAI_API_KEY` is supplied only to Edge Functions and
must never use a `NEXT_PUBLIC_` or `EXPO_PUBLIC_` prefix, enter an EAS client bundle, appear in logs,
or be returned to a caller. Selecting any OpenAI-backed operation requires the shared credential and
its explicit provider/model setting:

| Operation                    | Provider/model              | Overall deadline | Attempts  | Output bound                     |
| ---------------------------- | --------------------------- | ---------------- | --------- | -------------------------------- |
| Diagnostic text/image intake | `openai` / `gpt-5.6-terra`  | 30 seconds       | At most 2 | 1,200 output tokens              |
| Provider brief translation   | `openai` / `gpt-5.6-luna`   | 20 seconds       | At most 2 | 800 output tokens                |
| Clean-audio transcription    | `openai` / `gpt-transcribe` | 45 seconds       | At most 2 | 8,000 validated transcript chars |

The audio endpoint has no output-token parameter; the server validates the returned transcript at
8,000 characters. SDK-internal retries are disabled so the shared runtime, deadline, and two-attempt
limit remain authoritative. Only retryable timeouts, rate limits, and provider 5xx failures may use
the second attempt; exhausted quota and billing errors are terminal and are not retried. Logs and
persisted failure records contain bounded categories, attempts, latency, and usage counts only—not
prompts, transcripts, provider bodies, private media, or raw exceptions.

There is no silent live fallback. In `preview` or `production`, a missing credential, unsupported
provider, exhausted deadline, or invalid structured response fails explicitly. Diagnostic and
transcription callers retain their editable/retry flow; translation returns an explicit failed state
with the unchanged original brief. Deterministic diagnostic and translation adapters remain
available only when both `APP_ENV` and the explicit provider selection are local/test.

Repository support for these adapters does not activate them. Preview and production remain blocked
until the account owner supplies the credential through the approved server secret store and the
AI/privacy owners approve the payload, region, retention, notices, quota, and selected model access.
See [Required human inputs](HUMAN_INPUTS.md).

Production is fail-closed: missing values, `.invalid`/`example`/placeholder content, deterministic AI,
deterministic translation, incomplete configuration for any explicitly selected OpenAI provider,
deterministic media scanning, incomplete scanner operations inputs, incomplete encrypted push-worker
configuration, and fake/sandbox payment adapters cause a non-zero validator exit. Rotate a leaked
key immediately, revoke affected sessions/tokens, review audit logs, and follow the incident runbook.

## Production build and policy verification

The release workflow maps every `productionRequiredKeys` entry into its validator step, including
the encrypted push-worker contract. `pnpm config:validate:backend` makes one bounded, service-only
read of `get_legal_release_readiness`; missing current policies, disabled enforcement or inconsistent
translation versions fail the launch gate. It never publishes policies or changes settings.

GitHub's `GOOGLE_SERVICES_JSON` secret holds Firebase **client JSON content**, while the EAS variable
of that name is a **file**. The GitHub build passes content only to `pnpm build:production`, which
validates the Android package, rejects server credential fields, writes a private temporary file,
passes its path as `GOOGLE_SERVICES_JSON`, and removes the directory on success or failure. Do not
pass raw JSON as an Expo file path. `NEXT_PUBLIC_SITE_URL` comes from `SALLAH_PUBLIC_URL` and the web
build/runtime receives `SALLAH_SUPPORT_EMAIL`. Hosting must preserve those approved runtime values.

See [Reviewed policy publication](operations/LEGAL_PUBLICATION.md) for the complete legal packet and
forward-migration rollout. Production configuration checks do not authorize deployment or submission.
