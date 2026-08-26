# Required human inputs

[العربية](ar/HUMAN_INPUTS.md) · [Documentation map](README.md)

These values cannot be safely invented. Development placeholders deliberately make production validation fail.

| Input                                                                                                                         | Owner                   | Required before              | Safe fallback                                                  |
| ----------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ---------------------------- | -------------------------------------------------------------- |
| Final public brand and Arabic/English spelling                                                                                | Business                | Store metadata/domain        | `SALLAH` codename                                              |
| Legal entity name and Saudi registration details                                                                              | Legal                   | Production/legal text        | `REQUIRES_LEGAL_ENTITY`                                        |
| Production iOS bundle ID and Android package                                                                                  | Mobile owner            | EAS production build         | `sa.example.sallah` rejected in production                     |
| Apple team, App Store Connect app ID, Google Play account/service account                                                     | Release owner           | Signing/submission           | Submit disabled/placeholders                                   |
| EAS project ID and Expo access token                                                                                          | Release owner           | EAS build/push               | Local export only                                              |
| Public domain, support email, support URL, privacy URL, terms URL                                                             | Business/legal          | Public launch/store review   | `.invalid` values rejected                                     |
| Final privacy policy, terms, retention schedule, consent wording                                                              | Saudi-qualified counsel | Production/store review      | Engineering drafts only                                        |
| Supabase production project and secrets                                                                                       | Platform owner          | Deployment                   | Local Supabase                                                 |
| OpenAI project credential, `gpt-5.6-terra` access, vision approval, quota, and diagnostic payload/data terms                  | AI owner/legal/privacy  | Preview/live diagnostic AI   | Explicit unavailable/manual intake; no silent live fallback    |
| OpenAI `gpt-transcribe` access and clean-audio payload/DPA/region/retention approval                                          | AI owner/legal/privacy  | Preview/live transcription   | Recording remains retryable and customer text remains editable |
| OpenAI `gpt-5.6-luna` access and translation payload/DPA/region/retention approval                                            | AI owner/legal/privacy  | Preview/live provider briefs | Original text plus explicit unavailable status                 |
| SMS sender/provider credentials and templates                                                                                 | Operations              | Phone OTP/SMS                | Email auth; SMS disabled                                       |
| Payment merchant/gateway credentials and commercial rules                                                                     | Finance/legal           | Online payment               | Offline/post-service ledger mode                               |
| Android Google Maps SDK key, billing, and allowed app restrictions                                                            | Mobile/platform         | Android production maps      | Production validator/build remains blocked                     |
| Expo/APNs/FCM credentials, Expo access token, AES-256 push-token key, distinct worker secret, and Preview schedule owner      | Mobile/platform/SRE     | Push delivery                | In-app outbox; push remains fail-closed                        |
| Production monitoring/alert provider credentials                                                                              | SRE                     | Production on-call           | Structured logs only                                           |
| Private HTTPS scanner-control and Storage origins, two HMAC secrets, DNS/routes/firewalls/TLS identity, and processing region | Security/platform       | Production uploads           | Quarantine remains fail-closed                                 |
| ClamAV signature-update owner, freshness SLO (maximum 24 hours), monitoring, and stale-signature response                     | Security/SRE            | Production uploads           | Production scanner gate remains blocked                        |
| Scanner worker capacity, one-job concurrency, ClamD/native memory, readiness, and alert thresholds                            | Platform/SRE            | Production uploads           | Repository bounds are not production capacity evidence         |
| Scanner deny-by-default egress policy and permitted signature-update destinations                                             | Security/platform       | Production uploads           | Local Docker bridge is not production egress evidence          |
| Scanner runtime-image minimization/allowlist, GPL distribution review, and incident runbooks                                  | Security/legal/SRE      | Production scanner image     | Local image remains development evidence only                  |
| Vault-backed privacy-worker URL/secret and ownership of the 15-minute media-cleanup schedule                                  | Platform/SRE            | Hosted M2 activation         | Hosted scheduler fails closed; local integration only          |
| Publicly reachable Supabase URL used in signed media responses                                                                | Platform owner          | Deployed private media       | Local broker rewrites only the local Docker URL                |
| Reviewer customer/provider accounts and approved seeded journey                                                               | Release/operations      | Store review                 | No fabricated accounts                                         |
| Named production privacy, finance, support, and operations reviewers with least-privilege assignments                         | Security/operations     | Admin production enablement  | Local role-scoped demo accounts only                           |
| Arabic/English/Urdu/Hindi professional copy review                                                                            | Localization owner      | Public launch                | Engineering translations                                       |
| Provider verification policy and regulated-category evidence list                                                             | Operations/legal        | Provider approval            | Manual review, no auto-verify                                  |
| Backup retention/RPO/RTO approval                                                                                             | Platform/legal          | Production                   | Proposed values in runbook                                     |

Production enablement requires `pnpm config:validate:production` to pass with non-placeholder values and documented approval.

## OpenAI Preview and production activation

The repository contains server-only OpenAI adapters, but neither repository completion nor local
tests authorize live processing. Before enabling any adapter in Preview or production, the named
owners must provide and record all of the following without placing a plaintext credential in an
issue, PR, chat, log, mobile bundle, or source file:

- an approved OpenAI project and server-secret-store owner;
- confirmed access and quota for `gpt-5.6-terra`, `gpt-5.6-luna`, and `gpt-transcribe` as applicable;
- separate approval of diagnostic text/images, scanner-clean audio, and provider-brief translation
  payloads, including DPA, processing region, retention, deletion, and customer/provider notices;
- an explicit decision to enable each provider in the target environment rather than relying on a
  default;
- a bounded credentialled canary showing safe success and safe provider failure without recording
  prompts, transcripts, private media, raw responses, or secret values.

Activation is per operation. Approval for diagnostic text does not authorize image input, audio
transcription, or translation. Missing approval or account access keeps that operation disabled or
explicitly unavailable while independent application flows continue. Runtime limits are fixed at 30
seconds/two attempts/1,200 output tokens for diagnostic, 20 seconds/two attempts/800 output tokens for
translation, and 45 seconds/two attempts plus an 8,000-character transcript bound for transcription.
No live operation silently falls back to deterministic content.

The bounded local adapter smoke on 2026-08-25 made one synthetic diagnostic request and returned the
safe terminal category `OPENAI_QUOTA_REQUIRED`; no second paid attempt was made. The OpenAI project
owner must provide approved model quota before the remaining live text, image, transcription, and
translation canary can run. Enabling billing or changing the account plan remains a human-owned action.

The production scanner approval must record exact external control and Storage origins, separate
control/attestation HMAC rotation owners, `private-only` network policy, signature maximum age, one-job
worker capacity, the fixed deadline, metadata timeout, alerts, continuous ClamD readiness, outbound
update policy, and regional data-processing decision.
Configuration validation can reject public IP literals but cannot prove that a DNS name resolves only
inside the approved private network. That evidence belongs to network tests and operator review.

ClamAV detects malware; it is not content disarm and reconstruction (CDR). Static JPEG/PNG/WebP are
decoded and re-encoded. Approved M4A/MP4 audio and completion MP4 video use bounded, metadata-stripping
FFmpeg remux with FFprobe reopen validation. WebM and PDF remain fail-closed. Deterministic local/test
mode is not equivalent to production controls.

Repository automation can validate structure, local authorization, and fail-closed behavior, but cannot approve provider contracts, create production accounts, choose legal retention outcomes, supply store signing identities, or claim a physical-device/iOS result. Those items remain external gates rather than software passes.

## Customer UX preview map gate

The customer location flow is implemented but Android Preview remains blocked until a human
provides evidence for both of these inputs:

- a Google Maps Android SDK key restricted to package
  `com.mohmammed0.sallah.preview`;
- the SHA-1 fingerprint of the actual EAS Preview signing certificate added to the same
  application restriction.

The key must be supplied through the existing EAS/Expo secret path and must never be committed.
Enable only the required Maps SDK. Activating billing or another paid API requires explicit
approval. iOS Preview uses Apple Maps and does not require this key.

Physical-device customer UX evidence is also outstanding: real GPS and map tiles, permission
denial and settings re-enable, camera, gallery, microphone/transcription, keyboard behavior,
foreground/background transitions, large text and screen-reader traversal. Keep each item NOT
RUN until a device artifact and evidence exist. This redesign does not start an EAS build.
