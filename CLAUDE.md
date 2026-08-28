# Claude Code repository contract

Sallah is an Arabic-first Saudi service marketplace. Supabase is authoritative;
mobile and web consume shared typed contracts. This file governs UI-only work by
Claude Code. `AGENTS.md` and repository security rules take precedence.

## Start and commands

Use Node 24.19.0 and pnpm 11.19.0. Install with `pnpm install --frozen-lockfile`.
Read `docs/handoff/CLAUDE_CODE_HANDOFF.md`, `UI_ALLOWLIST.md`, and
`UI_DENYLIST.md` before changing code. Use the exact starting SHA from
`git rev-parse HEAD` on the canonical handoff branch.

After an approved UI slice run its focused rendering tests, affected package
lint/typecheck, `pnpm i18n:check`, `pnpm ui:boundaries`, and
`pnpm ui:catalog:check`. Do not call an empty or unrelated test selector evidence.

## Architecture and UI boundary

Domain rules belong in `packages/domain` or transactional commands. Presentation
consumes typed controllers/view models and safe error projections. Do not add
direct table/RPC access to visual primitives, infer permission from navigation,
or expose raw database rows/errors.

Allowed work: components, styling, approved motion, screen composition,
responsive behavior, ar/en/ur/hi strings, accessibility, and UI tests within the
allowlist. If Figma needs new data, statuses, permissions, or transitions, use
`docs/handoff/UI_CONTRACT_CHANGE_PROCESS.md`.

## Prohibited

No migrations, RLS/RPC/Edge/domain changes, service-role or secret code,
protected-media/location/trust changes, dependency without license review,
backend deployment, Production/store action, force-push, history rewrite, merge,
or secret. Preserve Arabic-first RTL, Urdu RTL, English/Hindi LTR, touch targets,
focus, text scaling, reduced motion, and licensed assets.
