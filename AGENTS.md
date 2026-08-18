# Repository engineering contract

## Architecture

- Keep a modular monolith: mobile and web clients depend on shared contracts; Supabase is the authoritative backend.
- Domain rules belong in `packages/domain` or transactional database commands, never in presentation components.
- Browser/mobile code may use the Supabase publishable key only. Secret/service-role keys are server-only.
- Financial amounts are integer SAR minor units. Timestamps are UTC and displayed in `Asia/Riyadh`.

## Required commands

Before proposing a change, run the smallest relevant checks and finish with `pnpm validate`. Database changes also require `supabase db reset` and `pnpm test:db` when Docker is available.

## TypeScript and validation

- Strict TypeScript, `noUncheckedIndexedAccess`, no implicit `any`, exhaustive unions.
- Validate every trust boundary with Zod and return structured safe errors.
- Do not read uncontrolled environment variables outside `@sallah/config`.

## Database and security

- Schema changes are forward-only timestamped migrations; never edit an applied migration.
- Enable RLS on every exposed table and start deny-by-default.
- Critical mutations use RPC or authenticated Edge Functions with auth, authorization, idempotency, version checks, transactions, and audit events.
- Never let providers read competing offers or unmatched exact locations. Add cross-role tests for every policy change.
- Never weaken a policy to make a UI test pass.

## Localization and accessibility

- Arabic is the source design language. Every visible string must use shared keys for Arabic, English, Urdu, and Hindi.
- Verify RTL/LTR, keyboard navigation, focus states, dynamic text, contrast, and screen-reader labels.

## OSS and supply chain

- Ship only reviewed permissive dependencies (MIT, Apache-2.0, BSD, ISC, OFL equivalents).
- Update `oss-inventory.json`, `THIRD_PARTY_NOTICES.md`, and lockfile for dependency changes.
- No vendored applications, copied branding, unreviewed binaries, secrets, or suppressed audit findings.

## Commits and pull requests

- Use conventional commits and coherent validated milestones.
- PRs must disclose PASS/FAIL/NOT RUN honestly, enumerate human inputs, security residual risks, migrations, screenshots, and rollback steps.
- Never merge, force-push, rewrite history, fabricate integrations, or represent demo/sandbox behavior as production.
