# SALLAH — English guide

[Language gateway](README.md) · [العربية](README.ar.md)

SALLAH is an Arabic-first Saudi marketplace for safely coordinating customers, verified service
providers, and marketplace operations. This monorepo treats Supabase as the authoritative source
for marketplace rules, authorization, and data; mobile and web clients consume shared contracts.

## Vision

The product aims to reduce ambiguity when requesting, comparing, and completing local services
while keeping human choice and server authorization central. AI can structure a problem
description, but it does not approve a provider, publish a request, or execute a payment by itself.

## Repository status

The repository is in **code and GitHub prelaunch preparation**:

- [PR #36](https://github.com/mohmammed0/Mohammed-Sallah-app/pull/36) is the current integration
  candidate directly to `main`. Use its current head and matching CI run for current results;
  earlier pull requests and their history remain preserved evidence.
- The [prelaunch gate](docs/release/PRELAUNCH.md) combines code validation, Android/iOS exports,
  consent-enabled HTTP journeys in a disposable test environment, and a source/migration/artifact packet.
- Earlier Supabase Preview, Storage, outbound scanner, and OpenAI evidence retains its recorded
  date and scope; Preview has not received the new consent migrations or approved policies.
- Physical devices, a native iOS build, Production, legal approval, formal backup/alert drills,
  and stores remain separate external gates.

See [closed-beta status](docs/status/CLOSED_BETA.md) and
[Master Tracker #23](https://github.com/mohmammed0/Mohammed-Sallah-app/issues/23) for the current
milestone record.

## Components

| Path                | Purpose                                                                        |
| ------------------- | ------------------------------------------------------------------------------ |
| `apps/mobile`       | Expo Router app for customer and provider roles                                |
| `apps/web`          | Public site, privacy surfaces, and operations portal                           |
| `packages/domain`   | Shared domain rules and validated contracts                                    |
| `packages/database` | Generated database types                                                       |
| `packages/i18n`     | Arabic, English, Urdu, and Hindi copy                                          |
| `supabase`          | Migrations, RLS, RPC, Storage, Realtime, Edge Functions, and tests             |
| `docs`              | Architecture, security, privacy, operations, release, and contributor guidance |

## Engineering and trust principles

- Clients use only the Supabase publishable key; service and provider secrets remain server-side.
- Marketplace rules live in `packages/domain` or transactional database commands, not view code.
- Exact locations, protected media, and sealed offers are disclosed only in authorized context.
- Database changes are forward-only; exposed tables start with deny-by-default RLS.
- Money is integer SAR minor units; timestamps are UTC and display in `Asia/Riyadh`.
- Evidence is reported honestly as PASS, FAIL, or NOT RUN; a missing device or credential is never
  converted into a pass.

## Local start

Prerequisites: Node.js 24 LTS, Corepack/pnpm 11.19.0, Docker Desktop, and Supabase CLI 2.114.0.

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
supabase start
supabase db reset
pnpm dev
```

Local values are intentionally nonproduction. Never copy the local secret key into
`NEXT_PUBLIC_*` or `EXPO_PUBLIC_*`. Read the
[canonical local-development guide](docs/LOCAL_DEVELOPMENT.md).

## Validation

```bash
pnpm docs:check
pnpm validate
pnpm test:db
pnpm test:e2e:web
```

Database tests require Docker. Mobile end-to-end validation requires an emulator or physical
device with the app installed. See the [testing guide](docs/TESTING.md) for result semantics.

## Branch model

- `main`: canonical integration branch; new work starts from its clean head under the [starting rules](docs/handoff/TOOLS_MUST_START_FROM.md).
- `codex/launch-readiness-v1`: PR #36 candidate to `main`; resolve its current head when reviewing the PR.
- Earlier RC, beta, and milestone branches: historical evidence, not parallel integration sources.

This finalization does not merge a branch or deploy Production or stores.

## Key links

- [Documentation map](docs/README.md)
- [Code and GitHub prelaunch guide](docs/release/PRELAUNCH.md)
- [Multi-tool handoff](docs/handoff/README.md)
- [Arabic project overview](docs/ar/PROJECT_OVERVIEW.md)
- [Closed-beta status](docs/status/CLOSED_BETA.md)
- [Required human inputs](docs/HUMAN_INPUTS.md)
- [Contributing](CONTRIBUTING.en.md)
- [Security reporting](SECURITY.en.md)
- [Architecture overview](docs/architecture/OVERVIEW.md)
- [Security controls register](docs/security/SECURITY_CONTROLS.md)

## Ownership

The application source is proprietary unless the repository owner publishes an explicit license.
Repository visibility does not grant permission to reuse the product or brand. Third-party licenses
and notices are recorded in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
