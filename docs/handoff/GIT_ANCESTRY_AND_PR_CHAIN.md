# Git ancestry and final integration

The final integration source is branch
`codex/repository-finalization-multitool-handoff-v1`. PR #33 is the sole merge
gate from that complete source directly to `main`. After the verified merge,
`main` is the only canonical/default integration branch and tag
`sallah-multitool-handoff-v1` identifies the immutable handoff baseline.

| PR  | Included head | Contained in final source | Final disposition                                           |
| --- | ------------- | ------------------------- | ----------------------------------------------------------- |
| #7  | `f23616b`     | Yes                       | Close as superseded after final `main` proof.               |
| #17 | `46e8c8c`     | Yes                       | Close as superseded after final `main` proof.               |
| #24 | `3218d55`     | Yes                       | Close as superseded after final `main` proof.               |
| #25 | `bc8afd9`     | Yes                       | Close as superseded after final `main` proof.               |
| #26 | `03c3525`     | Yes                       | Close as contained after final `main` proof.                |
| #31 | `268491a`     | Yes                       | Close as contained after final `main` proof.                |
| #32 | `f8bce88`     | Yes                       | Close as contained after final `main` proof.                |
| #33 | `git:HEAD`    | Final integration source  | Merge to `main` with a merge commit after exact-head gates. |

`origin/main` at the start of this finalization was
`26eec9688df5979fa7ebaa0eaf121ef1a150116e` and was proven to be an ancestor
of the final source. Every listed stacked head was also proven to be an
ancestor of the final source. The final merge commit and final `main` SHA are
reported externally after merge; no tracked file self-references its enclosing
commit.

Remote branches are deleted only when their exact heads are ancestors of the
verified final `main`. A divergent temporary or bot branch is retained and
reported rather than deleted or force-updated.
