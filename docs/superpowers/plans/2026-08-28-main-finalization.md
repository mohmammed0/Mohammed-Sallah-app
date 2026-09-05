# Main Finalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the verified Sallah repository into `main`, preserve every unexecuted external release gate in versioned documentation, and leave GitHub with no open pull requests or issues.

**Architecture:** The existing canonical branch remains the only merge source. Repository changes are limited to handoff policy and release documentation; GitHub cleanup begins only after exact-head local checks, Codex Security, required PR checks against `main`, a merge commit, and post-merge `main` verification.

**Tech Stack:** Git, GitHub CLI, Node.js 24.19.0, pnpm 11.19.0, Supabase CLI 2.114.0, Deno 2.9.5, Docker/ClamAV, Codex Security.

**Spec:** `docs/superpowers/specs/2026-08-27-repository-finalization-multitool-handoff-design.md`

## Global Constraints

- Do not deploy Production, mutate Supabase Production, submit stores, enable billing, change secrets, force-push, rebase, squash, or rewrite history.
- Merge the complete canonical source to `main` through one final pull request using a merge commit.
- Do not close the tracker or remove branches until the exact merged `main` is green and the final tag exists.
- Delete a remote branch only after its exact head is proven to be an ancestor of `main`.
- Report physical-device, Apple, legal, store, restore, monitoring, and Production gates as `NOT RUN`, `HUMAN INPUT REQUIRED`, or `DEFERRED`; never as `PASS` without evidence.

---

### Task 1: Freeze current Git and GitHub state

**Files:**

- Read: `AGENTS.md`
- Read: `docs/handoff/CODEX_STARTING_BASELINE.md`

- [ ] Verify clean worktree, branch, local/remote SHA parity, worktrees, remotes, tags, stashes, and `main` ancestry.
- [ ] Verify every stacked PR head is contained in the canonical branch.
- [ ] Inventory all open PRs, issues, milestones, remote branches, checks, and protection/rulesets.
- [ ] Inspect each Dependabot proposal and current high-severity audit evidence before deciding its disposition.

### Task 2: Make `main` the machine-enforced handoff source

**Files:**

- Modify: `scripts/handoff-policy.test.mjs`
- Modify: `scripts/handoff-policy.mjs`
- Modify: `docs/handoff/handoff-manifest.json`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: `docs/handoff/CURRENT_STATE.md`
- Modify: `docs/handoff/README.md`
- Modify: `docs/handoff/CLAUDE_CODE_HANDOFF.md`
- Modify: `docs/handoff/CLAUDE_START_PROMPT.md`
- Create: `docs/handoff/TOOLS_MUST_START_FROM.md`

- [ ] Change the manifest-policy test to require `canonicalBranch: main` and verify the current implementation fails for the expected reason.
- [ ] Change the policy and manifest to use `main`, `git:HEAD`, the final PR-to-main contract, and release tag `sallah-multitool-handoff-v1`.
- [ ] Point Codex, Claude Code, Figma, Canva, Notion/Linear, and other tools to a clean checkout of `main` and require exact SHA resolution.
- [ ] Run handoff policy tests and the handoff check.

### Task 3: Preserve all external release gates

**Files:**

- Create: `docs/release/EXTERNAL_RELEASE_GATES.md`
- Modify: `docs/handoff/EXTERNAL_GATES.md`
- Modify: `docs/README.md`
- Modify: `docs/handoff/GIT_ANCESTRY_AND_PR_CHAIN.md`

- [ ] Record every named device, Push, GPS, accessibility, media-permission, network/restart, Apple, legal, GPL, store, restore, monitoring, on-call, Production, canary/rollback, and tester-invitation gate.
- [ ] For every gate record status, repository evidence, work not performed, reason, human input, and authoritative document link.
- [ ] State explicitly that issue closure and the final tag do not convert any external gate to `PASS`.
- [ ] Run documentation tests, link checks, formatting checks, and `git diff --check`.

### Task 4: Validate and publish the exact canonical head

**Files:**

- Review: all changed files from `104d9994f15364ba6e2391f56a30c7b0a7fad102` to working tree.

- [ ] Run the full documented local release gate, including `pnpm install --frozen-lockfile`, `pnpm validate`, database/Edge/scanner/E2E/supply-chain/SBOM gates not already inside it, and focused final documentation checks.
- [ ] Run one final Codex Security diff scan covering the complete final documentation/policy delta.
- [ ] Stage only explicit reviewed paths, create a conventional commit, verify clean state, fetch, and push normally.
- [ ] Change PR #33 base to `main`, update its title/body, and verify the complete diff and mergeability.
- [ ] Wait for exact-head `repository`, `mobile`, `web`, `supabase`, and `media-scanner` jobs against `main` to pass.

### Task 5: Merge and verify `main`

**Files:**

- No direct `main` edits.

- [ ] Mark the final PR ready, confirm auto-merge remains disabled, and merge with a merge commit.
- [ ] Fetch and create or update an isolated local `main` worktree by fast-forward only.
- [ ] Prove the canonical source is an ancestor of `origin/main`, local/remote parity, and a clean tree.
- [ ] Run `pnpm install --frozen-lockfile`, `pnpm validate`, final handoff/document/security/SBOM checks, and wait for all required `main` jobs.
- [ ] If post-merge validation fails, use a focused repair PR; do not push directly to `main`.

### Task 6: Tag and close GitHub state

**Files:**

- No repository edits.

- [ ] Create and push annotated tag `sallah-multitool-handoff-v1` on the verified final `main` SHA without moving an existing tag.
- [ ] Comment on and close superseded chain PRs; close non-adopted Dependabot version updates without claiming containment.
- [ ] Comment on and close issues with accurate `completed` or `not planned` reasons and the external-gate document.
- [ ] Update and close milestone `Closed Beta v0.1` only after open items reach zero.
- [ ] Delete only remote branches whose exact heads are ancestors of final `main`; retain and report all others.
- [ ] Configure `main` protection with actual check contexts when repository permissions support it.
- [ ] Requery PRs, issues, milestones, branches, checks, tag, local/remote SHA, ancestry, and worktree cleanliness; report `MAIN_FINALIZED` only if every mandatory condition is true.
