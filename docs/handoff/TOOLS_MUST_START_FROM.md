# Tools must start from

`main` is the only canonical/default integration branch for Sallah. Historical
`codex/*` branches, stacked pull requests, local backups, and old worktrees are
evidence only and must not be selected as a parallel source of truth.

[PR #36](https://github.com/mohmammed0/Mohammed-Sallah-app/pull/36) was merged into `main`.
Its former task branch is historical evidence. Resolve current `main` for new work rather than
assuming the immutable handoff checkpoint is still the latest source. See the [prelaunch guide](../release/PRELAUNCH.md).

## Required start sequence

1. Fetch remote metadata without merging or rebasing.
2. Check out a clean local `main` that exactly matches `origin/main`.
3. Run `git status --short --branch` and stop on unexpected work.
4. Record `git rev-parse HEAD` in the task evidence.
5. Read the first file for the selected tool before changing anything.
6. Create a normal task branch from that exact SHA; never commit feature work directly to `main`.

The annotated handoff tag `sallah-multitool-handoff-v1` exists at
`2cf253bb44d417a02fd483395a862ff66bb4b053`. Its remote tag object is
`48b6824a52d2c2216408ad71d455a2e4ce98adee`; no cryptographic signature is claimed.
Use this fixed checkpoint only when explicitly reviewing that handoff. Do not move or replace it.
Current `main` identity must still be resolved and recorded for each task because a tracked file
cannot embed the SHA of the commit that contains itself.

## Tool entry points

| Tool or role  | First file                                  | Additional boundary                                                           |
| ------------- | ------------------------------------------- | ----------------------------------------------------------------------------- |
| Codex         | `AGENTS.md`                                 | Read the task-specific skill and smallest owning module.                      |
| Claude Code   | `CLAUDE.md`                                 | Then read `CLAUDE_CODE_HANDOFF.md`, `UI_ALLOWLIST.md`, and `UI_DENYLIST.md`.  |
| Figma         | `docs/handoff/FIGMA_HANDOFF.md`             | Design from approved routes, states, tokens, and privacy-safe mock data only. |
| Canva         | `docs/handoff/CANVA_HANDOFF.md`             | Use approved brand assets and licensed/public copy only.                      |
| Notion/Linear | `docs/handoff/NOTION_LINEAR_HANDOFF.md`     | Treat repository contracts and external-gate statuses as authoritative.       |
| GitHub        | `docs/handoff/GIT_ANCESTRY_AND_PR_CHAIN.md` | Require pull requests and actual green checks for future `main` changes.      |
| Release owner | `docs/release/EXTERNAL_RELEASE_GATES.md`    | Never convert an unexecuted physical/account/legal/Production gate to `PASS`. |

## Standard commands

```text
pnpm install --frozen-lockfile
pnpm validate
```

Database, Edge, scanner, EAS, Production, store, billing, legal, and secret
actions require their own explicit authorization and evidence. The handoff tag
is an engineering baseline, not Production or store approval.
