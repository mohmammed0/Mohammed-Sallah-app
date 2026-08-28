# Current state

## Repository

- Canonical branch: `codex/repository-finalization-multitool-handoff-v1`.
- Exact source identity: run `git rev-parse HEAD` in the canonical checkout.
- Parent source: PR #32 head `f8bce88065b8c9b4ab23521c9bd312d1a9e2b080`.
- Final Draft PR: resolved from the canonical branch after publication.
- Production and store submission: **NOT RUN**.

## Product and hosted Preview

The repository contains customer, provider, administration, AI, protected
media, scanner, push, location, privacy, and closed-beta operations flows.
Supabase Preview and the outbound-only DigitalOcean scanner were read-only
verified during the starting baseline. No hosted mutation is part of this
finalization branch unless explicitly recorded in validation evidence.

## Readiness meanings

| State               | Meaning                                                                       |
| ------------------- | ----------------------------------------------------------------------------- |
| Engineering handoff | Code, contracts, documentation, tests, and tool boundaries are coherent.      |
| Closed beta         | Preview services and installable artifacts may be used by approved testers.   |
| Production          | Requires separate production configuration, evidence, approvals, and rollout. |
| Store               | Requires legal, policy, signing, screenshots, and store review.               |
| Physical device     | Must be reported only from an actual device run.                              |

See [known limitations](KNOWN_LIMITATIONS.md), [external gates](EXTERNAL_GATES.md),
and [human inputs](HUMAN_INPUTS_REMAINING.md).
