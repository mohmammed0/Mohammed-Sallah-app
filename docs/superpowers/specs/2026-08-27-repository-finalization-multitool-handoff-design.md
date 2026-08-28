# Repository finalization and multi-tool handoff design

Date: 2026-08-27
Status: approved by the user's finalization brief

## Objective

Produce one trustworthy, reviewable repository head that closes deterministic functional and CI failures, preserves the accepted Sallah architecture and Preview runtime, makes documentation agree with code and evidence, and gives Claude Code, Figma, Canva, Notion, Linear, GitHub, and future engineers explicit safe boundaries.

## Selected approach

Use the current Draft PR #32 head as the only source base because ancestry proves it contains the complete stacked chain and launch-readiness work. Work exclusively in a new child branch and worktree. Repair functional failures before cleanup or handoff documentation. Keep database changes forward-only and presentation cleanup contract-preserving. Run the complete repository and security gates only after bytes stabilize, then publish one normal branch and one Draft PR.

## Alternatives rejected

- Starting from `codex/launch-readiness-v2`: rejected because it would omit 112 descendant commits already present in PR #32.
- Starting from a legacy/backup checkout: rejected because those copies are not canonical and may contain stale or dirty work.
- Updating failing assertions or skipping jobs: rejected because both current failures represent real repository contracts, and the brief requires source fixes.
- Rebuilding the UI: rejected because current screens are the functional reference; visual polishing belongs to Figma/Canva after engineering handoff.
- Rewriting published history: rejected because the chain is already published and must remain auditable.

## Architecture and safety

- Supabase remains authoritative; RLS, RPC, Edge, scanner HMAC/attestation, private Storage, exact-location privacy, sealed offers, and trust boundaries remain fail-closed.
- A logical notification is persisted once. Transport delivery must not masquerade as a second user notification; replay, response loss, and concurrency must converge on the same authoritative event.
- Mobile and web presentation consume typed view/domain boundaries. No server secret, raw privileged row, or browser service-role access is introduced.
- Environment access remains centralized through `@sallah/config`.
- Current Preview services may be inspected for evidence; Production is never mutated.

## Functional repair strategy

1. Reproduce the exact pgTAP duplicate and trace every producer/trigger across migrations.
2. Add regression coverage for first execution, exact replay, response-loss retry, concurrent duplicate execution, unrelated later rejection, recipient/payload, and one logical event.
3. Add a forward-only migration that changes only the proven notification ownership model.
4. Reproduce the mobile module-resolution failure under the same focused Vitest command and correct the import/test boundary without altering application behavior.
5. Run focused GREEN checks before expanding to database and repository gates.

## Repository and handoff strategy

- Keep canonical root documentation and move superseded evidence into clearly marked archive/reference locations only when links and audit value are preserved.
- Remove generated or duplicate artifacts only after proving they are untracked, reproducible, and unused.
- Add `CLAUDE.md` as a concise pointer to `AGENTS.md` plus handoff documents; it must not duplicate or weaken engineering policy.
- Add machine-readable and human-readable handoff manifests that name editable areas, forbidden areas, validators, owners, evidence, and external gates.
- Design tools may change visual presentation and copy only within documented constraints. Business logic, schemas, authorization, security boundaries, deployment, secrets, and release state remain code-owner responsibilities.

## Verification and publication

- Focused RED/GREEN first; full reset, pgTAP, legacy upgrade, local integration, workspace validation, scanner gates, security/audit/licenses/SBOM, Expo checks, and exact-head build only after the final diff stabilizes.
- A standard Codex Security repository scan and final diff scan must report no unresolved P0/P1 and no deferred security-critical boundary.
- Normal commits only, explicit path staging, one normal push, one Draft PR, no merge or auto-merge.
- `READY_FOR_MULTI_TOOL_HANDOFF` requires all required exact-head hosted jobs green. External account/device/store gates remain explicit rather than fabricated.
