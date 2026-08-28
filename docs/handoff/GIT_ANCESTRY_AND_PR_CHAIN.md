# Git ancestry and PR chain

Starting ancestry was verified with Git merge-base/ancestor checks. Every listed
head is contained by PR #32 head `f8bce88065b8c9b4ab23521c9bd312d1a9e2b080`,
which is the parent of the final handoff branch.

| PR    | Base → head                  | Head       | Status                  | Included | Disposition after final PR                     |
| ----- | ---------------------------- | ---------- | ----------------------- | -------- | ---------------------------------------------- |
| #7    | `main` → release candidate   | `f23616b`  | Open Draft              | Yes      | Superseded; close only after final green proof |
| #17   | #7 → closed-beta readiness   | `46e8c8c`  | Open Draft              | Yes      | Superseded                                     |
| #24   | #17 → bilingual organization | `3218d55`  | Open Draft              | Yes      | Superseded                                     |
| #25   | #24 → Expo alignment         | `bc8afd9`  | Open Draft              | Yes      | Superseded                                     |
| #26   | #25 → media scanning         | `03c3525`  | Open Draft              | Yes      | Parent milestone; link final PR                |
| #31   | #26 → feature complete       | `268491a`  | Open Draft              | Yes      | Parent milestone; link final PR                |
| #32   | #31 → professional beta      | `f8bce88`  | Open Draft              | Yes      | Direct parent; link final PR                   |
| Final | #32 → canonical handoff      | `git:HEAD` | Draft after publication | Yes      | Sole engineering handoff reference             |

No known milestone commit is missing. No branch is deleted, history rewritten,
or merged by this task. Exact final PR number and URLs are resolved at publication.
