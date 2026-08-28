# Claude Code handoff

Claude Code owns presentation implementation after Figma approval. It does not
own backend, database, authorization, infrastructure, or deployment.

## Read first

1. Root `CLAUDE.md`
2. This file
3. [Allowlist](UI_ALLOWLIST.md) and [denylist](UI_DENYLIST.md)
4. [View models](VIEW_MODEL_CATALOG.md), [routes](ROUTE_CATALOG.md), and
   [state matrix](UI_STATE_MATRIX.md)
5. [Domain invariants](DOMAIN_INVARIANTS.md) and [privacy boundaries](PRIVACY_BOUNDARIES.md)
6. Approved Figma specification

Create a new UI branch from `git rev-parse HEAD` of the canonical handoff branch.
Preserve existing behavior and routes. If a design needs new data, status,
permission, RPC, or transition, stop that slice and submit a UI contract request.

Run focused rendering tests, affected mobile/web lint and typecheck,
`pnpm i18n:check`, `pnpm ui:boundaries`, and `pnpm ui:catalog:check`.
Never add secrets, force-push, deploy Production, or submit stores.
