---
name: sallah-release-orchestrator
description: "Use when Sallah work concerns release readiness, closed beta, release candidates, Android or iOS validation, external-service readiness, security gates, production readiness, store readiness, launch blockers, or cross-domain release work."
---

# Sallah Release Orchestrator

Coordinate release evidence without replacing specialist technical guidance. Repository authorization and safety rules always win.

## Start from current evidence

1. Read the repository-root `AGENTS.md` and the user's current authorization.
2. Discover the live repository root, branch, full HEAD, remotes, and working-tree state. Never reuse a reported SHA without verification.
3. Read the relevant existing sources instead of copying them into this skill:
   - `docs/HUMAN_INPUTS.md`
   - `docs/validation/FINAL_VALIDATION_REPORT.md`
   - `docs/RELEASE.md`, `docs/DEPLOYMENT.md`, and `docs/ENVIRONMENT.md`
   - `docs/store/` and any current release-specific directory that actually exists
4. Identify pre-existing changes and preserve them.

## Maturity model

Assess stages in order:

`repository validation -> Preview validation -> physical-device validation -> closed-beta readiness -> public-production readiness`

Classify every gate as exactly one of:

| Status | Meaning |
| --- | --- |
| `PASS` | Current evidence tied to the exact HEAD and target environment proves the gate. |
| `FAIL` | Executed evidence demonstrates a defect or unmet requirement. |
| `NOT RUN` | The check was not executed; record the concrete reason. |
| `HUMAN INPUT REQUIRED` | A named owner must supply approval, credentials, legal judgment, money, hardware, or another non-inventable input. |

Never promote `NOT RUN` or deterministic fallback evidence to `PASS`. Repository tests, simulators, static exports, automated or SVG captures, mocks, sandboxes, and fallback providers do not prove physical-device or live-provider behavior.

## Specialist routing

- Expo/EAS/native build behavior: official Expo plugin.
- React Native performance: `vercel-react-native-skills`, with Expo authoritative for Expo/EAS behavior.
- Supabase/Postgres/RLS: official `supabase` and `supabase-postgres-best-practices`.
- OpenAI APIs: OpenAI Developers plugin.
- Web implementation: Build Web Apps.
- Security: Codex Security first, then the applicable OWASP audit skill.
- App Store risk: `app-store-review` as a secondary audit; verify blockers against current Apple documentation.
- Sallah marketplace invariants: `sallah-marketplace-trust`.

## Evidence and boundaries

For each artifact, retain source HEAD, command/workflow, environment, timestamp, path or URL, checksum when applicable, and signing identity/status. Do not imply that evidence from an earlier SHA validates a later one.

Stop at human-only, credential, financial, destructive, production, or public-store boundaries unless the user separately and explicitly authorizes that exact action. Generic skills never authorize commit, push, force-push, PR creation, merge, deployment, EAS build, store submission, billing, secret operations, production migrations, or destructive infrastructure changes.
