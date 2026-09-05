# Git ancestry and prelaunch integration

[PR #36](https://github.com/mohmammed0/Mohammed-Sallah-app/pull/36) is the current prelaunch
integration candidate from `codex/launch-readiness-v1` directly to `main`. It was retargeted
on 2026-09-05 to include the earlier stack in one review, preserving all commits and review history.
`main` remains the canonical/default branch. No merge or history rewrite is part of preparation.

| PR  | Included checkpoint | Relationship to current candidate                                        |
| --- | ------------------- | ------------------------------------------------------------------------ |
| #7  | `f23616b`           | Earlier milestone history retained.                                      |
| #17 | `46e8c8c`           | Earlier milestone history retained.                                      |
| #24 | `3218d55`           | Earlier milestone history retained.                                      |
| #25 | `bc8afd9`           | Earlier milestone history retained.                                      |
| #26 | `03c3525`           | Earlier milestone history retained.                                      |
| #31 | `268491a`           | Earlier milestone history retained.                                      |
| #32 | `f8bce88`           | Earlier milestone history retained.                                      |
| #33 | `703319c`           | Earlier finalization checkpoint contained in PR #36.                     |
| #35 | `bbfe7f2`           | UI checkpoint contained in PR #36.                                       |
| #36 | `git:HEAD`          | Current integration candidate; resolve its fresh head and main-based CI. |

Fresh inspection on 2026-09-05 found `origin/main` at
`26eec9688df5979fa7ebaa0eaf121ef1a150116e` and confirmed it is an ancestor of candidate
`9e9f6b2155b6fd5995fc124da0a25f3fc71e4356`. That checkpoint contained 133 commits and
533 changed files relative to main. Later prelaunch tooling commits extend that history;
use `git rev-list --count origin/main..HEAD` and `git diff --stat origin/main...HEAD`
for current scope. Earlier scoped security reports retain their own ranges and do not attest
to the entire main-based diff.

Follow the [prelaunch gate](../release/PRELAUNCH.md). A source push or base change requires
fresh candidate and PR merge-checkout CI. The packet records those distinct source identities.
A passing candidate is reviewable; it is not a merged release or a production deployment.

Earlier PRs and remote branches are preserved for historical review. Any later closure, deletion,
merge or handoff tag creation is a separate authorized integration action after exact-source checks.
The final main SHA must be reported from the actual merge outcome; no tracked file fabricates or
self-references the commit containing it.
