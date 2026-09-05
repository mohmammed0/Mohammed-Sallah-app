# Current state

## Repository

- Canonical/default integration branch: `main`.
- Exact candidate source identity: run `git rev-parse HEAD` in a clean PR #36 checkout.
  After an authorized merge, resolve the integrated identity separately from clean `main`.
- Immutable handoff tag: `sallah-multitool-handoff-v1` after final verified merge.
- Final integration gate: PR #36 from
  `codex/launch-readiness-v1` directly to `main`.
- Final `main` SHA: reported externally after merge because a tracked file cannot embed the SHA of
  the commit that contains itself.
- Production and store submission: **NOT RUN**.

See the current [code and GitHub prelaunch gate](../release/PRELAUNCH.md).

## Product and hosted Preview

The repository contains customer, provider, administration, AI, protected
media, scanner, push, location, privacy, and closed-beta operations flows.
Supabase Preview and the outbound-only DigitalOcean scanner were verified in
the recorded Preview evidence. The final integration performs no hosted mutation,
Production action, or store submission.

## Readiness meanings

| State               | Meaning                                                                       |
| ------------------- | ----------------------------------------------------------------------------- |
| Engineering handoff | Code, contracts, documentation, tests, and tool boundaries are coherent.      |
| Closed beta         | Preview services and installable artifacts may be used by approved testers.   |
| Production          | Requires separate production configuration, evidence, approvals, and rollout. |
| Store               | Requires legal, policy, signing, screenshots, and store review.               |
| Physical device     | Must be reported only from an actual device run.                              |

See [tool starting rules](TOOLS_MUST_START_FROM.md), [known limitations](KNOWN_LIMITATIONS.md),
[external gates](../release/EXTERNAL_RELEASE_GATES.md), and
[human inputs](HUMAN_INPUTS_REMAINING.md).
