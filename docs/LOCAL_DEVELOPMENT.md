# Local development

[العربية](ar/LOCAL_DEVELOPMENT.md) · [Documentation map](README.md)

Prerequisites: Node 24 LTS, Corepack/pnpm 11.19.0, Docker Desktop, Supabase CLI 2.114.0, and Android Studio/Xcode only for native device work. k6 and Maestro are external validation CLIs and are never shipped with the application.

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
supabase start
supabase db reset
supabase status
pnpm dev
```

`.env.local` is ignored local process state. Keep it untracked, never copy it into documentation or
test fixtures, and never print it in terminal or CI evidence. `.env.example` contains names and safe
defaults only; it is not a source of credentials. Mobile and browser configuration must continue to
use only the public variables documented in [the environment contract](ENVIRONMENT.md).

Use the local publishable key printed by `supabase status`; never copy its local secret key into `NEXT_PUBLIC_*` or `EXPO_PUBLIC_*`. The web app runs through Next.js and the mobile app through Expo. Local email is captured by Mailpit. Seed data includes catalog configuration plus deterministic local demo scenarios from `supabase/seed.demo.sql`; it must never be deployed as production data.

After migrations, run `supabase db reset`, `supabase test db`, regenerate the application contract with `supabase gen types typescript --local --schema public`, and verify no diff remains. Stop with `supabase stop` when desired. Windows/WSL path issues are avoided by running all repository commands from one shell/runtime consistently.

For M2V scanner verification, run `pnpm test:media-scanner:gates` and then
`pnpm test:media-scanner:supabase`. The latter owns an exact local ClamD container and temporary
unsigned EICAR-only signature database for the cross-system flow, exercises the real pull worker and
FFmpeg remux against local Storage/Edge, resets local
Supabase before and after, and removes its temporary files/container. It does not deploy or provision a
hosted scanner. `pnpm test:media-scanner` separately requires the official pinned EICAR signature.
Do not reuse generated HMAC values outside their process.

## Local demo accounts

`supabase db reset` loads deterministic data from `supabase/seed.demo.sql`; that file is local-only and must never be applied to production. Seeded accounts use the `.invalid` domain. All passwords are non-recoverable random values except the operations admin, which has the explicitly local-only Playwright password `LocalE2E-Only!2026`. Never reuse that fixture outside the local reset database. For other interactive local sign-in, issue a local email OTP or set a temporary password through Supabase Studio:

| Role                                | Email                                |
| ----------------------------------- | ------------------------------------ |
| Customer                            | `customer.demo@example.invalid`      |
| Authorization-test customer         | `customer2.demo@example.invalid`     |
| Urdu-preference provider            | `provider.demo@example.invalid`      |
| Competing Hindi-preference provider | `provider2.demo@example.invalid`     |
| Suspended provider                  | `provider.suspended@example.invalid` |
| Operations admin                    | `admin.demo@example.invalid`         |
| Support agent                       | `support.demo@example.invalid`       |
| Verification reviewer               | `reviewer.demo@example.invalid`      |

The seed includes a sealed-offer request, active job with pending change order, pending cancellation,
completed/rated job, conversation, offline payment record, support case, dispute/financial hold, and
in-app notifications.

## Local AI modes

The default local mode is deliberately non-live: diagnostic AI may use the explicit deterministic
adapter, provider translation is disabled unless a developer selects the visibly marked deterministic
adapter, and transcription is disabled. Deterministic output is test evidence only and cannot be
enabled in Preview or production.

Credentialled local adapter testing is optional. It requires an already approved OpenAI project and
a server-only `OPENAI_API_KEY` in the ignored `.env.local`, together with explicit provider and model
selection. The intended models are `gpt-5.6-terra` for diagnostics, `gpt-5.6-luna` for provider-brief
translation, and `gpt-transcribe` for clean-audio transcription. Do not place the credential in an
Expo/Next public variable, source file, shell transcript, test snapshot, or command argument.

Live diagnostic, translation, and transcription failures remain failures; local execution does not
silently switch a selected OpenAI operation to deterministic output. Diagnostic calls have a
30-second overall deadline, at most two attempts, and a 1,200-output-token cap. Translation has a
20-second deadline, at most two attempts, and an 800-output-token cap. Transcription has a 45-second
deadline and at most two attempts; because its audio endpoint has no output-token parameter, the
returned transcript is schema-bounded to 8,000 characters. Exhausted quota and billing failures are
terminal and do not consume a repeated paid attempt.

A successful credentialled local call proves only the adapter contract. Preview and production
activation still require account-owner secret configuration, model/quota access, and the documented
AI/privacy/data-processing approvals. Never report local deterministic or credentialled execution as
hosted activation.
