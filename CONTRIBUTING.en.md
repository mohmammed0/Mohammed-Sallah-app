# Contributing guide

[Contributing gateway](CONTRIBUTING.md) · [العربية](CONTRIBUTING.ar.md)

## Before starting

1. Read [AGENTS.md](AGENTS.md) and the [closed-beta status](docs/status/CLOSED_BETA.md).
2. Confirm the work belongs to an approved issue or milestone and starts from the approved beta
   head.
3. Use Node 24 LTS, pnpm 11.19.0, Docker, and Supabase CLI 2.114.0.
4. Do not create a credential, secret, paid service, or fabricated integration to bypass a human
   gate.

## Branch model

- `main` is stable or released work only.
- The RC branch is parent release-candidate integration.
- The beta branch is closed-beta integration.
- Each milestone is a bounded child branch from an approved beta head.

Do not merge, push, or deploy unless an authorized owner explicitly requests it.

## Code and data rules

- Preserve the modular monolith; domain rules belong in `packages/domain` or transactional
  database commands.
- Use strict TypeScript and Zod at every trust boundary, exhaustive unions, and no implicit
  `any`.
- Money is integer SAR minor units; timestamps are UTC and display in `Asia/Riyadh`.
- Never edit an applied migration. Add a forward-only timestamped migration.
- Enable RLS on exposed tables and start deny-by-default.
- Sensitive RPCs require authentication, authorization, idempotency, version checks, transactions,
  and audit events.
- Add pgTAP allowed/denied cross-role cases, especially for exact locations and competing offers.
- Regenerate `packages/database/src/database.types.ts` and prove zero drift.

## Language and accessibility

- Arabic is the source design language.
- Visible copy uses shared Arabic, English, Urdu, and Hindi keys.
- Verify RTL/LTR, keyboard navigation, focus, large text, contrast, and screen-reader labels.
- Cover loading, empty, error, offline, retry, success, and destructive states as applicable.

## Dependencies

Accept only reviewed, exact-version permissive dependencies. Update `oss-inventory.json`,
`THIRD_PARTY_NOTICES.md`, and the lockfile, then run license and security gates. Do not vendor
applications, copied branding, unreviewed binaries, or suppressed findings.

## Validation

```bash
pnpm install --frozen-lockfile
pnpm docs:check
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm validate
```

For database changes:

```bash
supabase db reset
pnpm test:db
```

Do not report a command as PASS unless it ran. Missing Docker, browser, device, or credentials means
NOT RUN.

## Commits and pull requests

- Use Conventional Commits for coherent, validated milestones.
- PRs disclose scope, applications, migrations, security/privacy impact, OSS, actual validation,
  human inputs, residual risks, screenshots, and rollback.
- Never include secrets, real accounts, PII, exact addresses, documents, messages, or payment data.
- Database rollback uses reviewed forward compensation or approved restore, never history rewrite.
