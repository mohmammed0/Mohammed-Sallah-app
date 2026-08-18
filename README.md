# SALLAH — Saudi Services Marketplace

SALLAH is an Arabic-first marketplace for safely coordinating customers, verified service providers, and marketplace operations across Saudi Arabia. This repository contains one Expo mobile app, one Next.js public/admin web app, shared TypeScript domain packages, and a Supabase backend.

> Status: controlled-launch v1 implementation. External production credentials, legal approvals, and store accounts are intentionally not fabricated. See [`docs/HUMAN_INPUTS.md`](docs/HUMAN_INPUTS.md).

## Applications

- `apps/mobile`: Expo Router application for customer and provider roles (Arabic, English, Urdu, Hindi; RTL/LTR).
- `apps/web`: Next.js App Router public website, account-deletion/export pages, and server-authorized operations portal.
- `supabase`: PostgreSQL migrations, RLS, RPC command boundary, seed data, Edge Functions, and security tests.
- `packages`: domain rules, API contracts, database types, configuration, localization, observability, and UI foundations.

## Quick start

Prerequisites: Node.js 24 LTS, Corepack, Docker Desktop, and the Supabase CLI.

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
supabase start
supabase db reset
pnpm dev
```

Local development uses safe placeholders and the deterministic AI provider. Production configuration fails closed when required inputs are absent.

## Validation

```bash
pnpm validate
pnpm test:db
pnpm test:e2e:web
pnpm mobile:expo-doctor
pnpm config:validate:production
```

See [`docs/LOCAL_DEVELOPMENT.md`](docs/LOCAL_DEVELOPMENT.md), [`docs/TESTING.md`](docs/TESTING.md), and [`BUILD_PROGRESS.md`](BUILD_PROGRESS.md).

## Safety boundaries

- Exact customer locations are private until provider selection.
- Offers are sealed from competing providers through RLS.
- Business state transitions use transactional RPCs/Edge Functions.
- AI output is advisory, schema-validated, editable, and never publishes a request.
- Production payments default to `offline`; fake/sandbox adapters are rejected in production.
- Service-role and AI secrets never enter browser or mobile bundles.

## License

Proprietary application source unless the repository owner publishes an explicit license. Third-party dependencies remain under their respective permissive licenses; see [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
