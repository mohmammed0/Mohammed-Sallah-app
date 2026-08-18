# Contributing

Use Node 24 LTS, pnpm 11.19.0, Docker, and Supabase CLI 2.114.0. Create a `codex/` or issue-linked branch, make one coherent change, and never edit an already-deployed migration.

## Quality gate

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
supabase db reset
supabase test db
pnpm build
```

Database/RPC changes require deny-by-default RLS, cross-role pgTAP coverage, idempotency for retryable commands, and regenerated `packages/database/src/database.types.ts`. UI changes require Arabic RTL verification, accessibility labels, loading/empty/error states, and translation-key parity. Dependencies must be exact-versioned, permissively licensed, recorded in the OSS inventory, and pass the license/security gates.

Use Conventional Commits. A PR must disclose actual PASS/FAIL/NOT RUN results, migrations, security impact, human inputs, screenshots, and rollback. Never include production secrets, demo credentials, raw personal data, or fake integration claims.
