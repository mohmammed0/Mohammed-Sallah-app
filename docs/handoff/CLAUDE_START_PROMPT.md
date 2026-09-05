# Claude start prompt

Use this prompt after checking out `main`, verifying a clean tree, and replacing
`<EXACT_SHA>` with the output of `git rev-parse HEAD`:

> Create a new UI-only branch from `<EXACT_SHA>`. Read `CLAUDE.md`,
> `docs/handoff/CLAUDE_CODE_HANDOFF.md`, `UI_ALLOWLIST.md`, `UI_DENYLIST.md`,
> `DOMAIN_INVARIANTS.md`, `VIEW_MODEL_CATALOG.md`, `ROUTE_CATALOG.md`,
> `UI_STATE_MATRIX.md`, and the approved Figma specification, in that order.
> Implement presentation components, styling, motion, responsive composition,
> accessibility, and UI tests only. Preserve every route, role, status,
> authorization check, RPC, RLS policy, media/location/privacy boundary, and
> existing customer/provider behavior. Never modify denylisted paths. If the
> design needs a functional contract change, document it through
> `UI_CONTRACT_CHANGE_PROCESS.md` and stop that slice. After each coherent slice,
> run its focused tests and affected package checks. Before handoff run
> `pnpm i18n:check`, `pnpm ui:boundaries`, and `pnpm ui:catalog:check`. Do not add
> secrets, deploy, submit stores, force-push, or merge.

The `<EXACT_SHA>` replacement is intentionally external: a tracked document
cannot contain its own enclosing commit hash without becoming stale. Use tag
`sallah-multitool-handoff-v1` when the task must start from the immutable handoff baseline.
