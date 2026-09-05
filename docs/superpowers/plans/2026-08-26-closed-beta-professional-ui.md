# Sallah Closed-Beta Professional UI/UX Implementation Plan

> **Mode:** Beta completion with focused verification. The exhaustive security, database, device-matrix, and store audits remain a separate pre-launch phase.

## Goal

Deliver a coherent Arabic-first customer, provider, and admin experience on the proven Preview backend; close the remaining Push, Maps, and operations configuration gaps; verify the core marketplace journey; and produce one installable Android Preview APK without changing the existing trust model.

## Guardrails

- Keep Supabase authoritative and preserve all RLS, RPC, scanner, media, location, and marketplace trust contracts.
- Do not place OpenAI, notification-worker, service-role, S3, scanner, or other server secrets in a client or tracked file.
- Keep provider verification, service approval, sealed offers, and exact-location authorization unchanged.
- Use focused package checks and emulator smoke during implementation; do not run the deferred final security/release audit.
- Make no Production deployment, store submission, billing change, rebase, amend, force-push, or merge.

## Workstream 1 — Preview services and build inputs

1. Inventory the live Supabase Preview functions, cron jobs, Vault names, scanner health, EAS Preview environment names, Firebase app configuration, restricted Maps input, and emulator capability.
2. Repair only confirmed configuration gaps. For Push, align the existing notification-worker Edge secret and its scheduler Vault secret, preserve bounded retry/dead-letter behavior, and verify safe payload/token lifecycle paths.
3. Confirm the existing Android Maps key and Firebase file are injected through EAS Preview, not Git, and verify map/location behavior on the Android emulator.
4. Verify the existing DigitalOcean scanner remains outbound-only, healthy, restartable, log-bounded, and free of public application/ClamD ports.
5. Document backup and alerting capability honestly; keep the formal restore drill and full alert drill deferred.

## Workstream 2 — Design evidence and shared system

1. Record the current Android and admin UI baseline before changing presentation.
2. Audit maintained, licensed reference projects and official Material, Apple, Expo, and React Native guidance. Use patterns only; copy no external code or assets.
3. Define the Saudi Premium Service Marketplace direction, semantic tokens, typography, spacing, radii, elevation, motion, haptics, interaction states, RTL/LTR behavior, accessibility, skeletons, offline/error/retry states, and map/status patterns.
4. Extend the existing mobile primitives rather than adding a second component framework or moving business logic into UI code.

## Workstream 3 — Customer mobile experience

1. Unify welcome/authentication and customer tab navigation with the shared visual system.
2. Refine home, service selection, AI intake, text/image/voice, transcript confirmation, clarification, location, timing, review, and publication progression.
3. Refine requests/offers comparison, provider trust indicators, job timeline, messaging/attachments, completion, support, rating, account, notification, offline, loading, empty, error, and retry states.
4. Keep every mutation and eligibility check in its current domain/server contract.

## Workstream 4 — Provider mobile experience

1. Refine provider tabs, dashboard, availability, verification and profile status, onboarding, qualifications, documents, service area, and review states.
2. Refine feed, translated/original brief, offer composition, jobs, messaging, lifecycle actions, completion evidence, earnings, support, and account/privacy states.
3. Preserve approximate-location-only feed data, approved-category eligibility, sealed offers, and lifecycle-gated exact location.

## Workstream 5 — Admin operations console

1. Improve Arabic-first navigation, responsive layout, dashboard hierarchy, tables, filters, status badges, action confirmation, loading, empty, and error treatment.
2. Retain all server-side permission checks and server actions; do not add browser service-role access or UI-only authorization.
3. Present only categorical, redacted service health and operational counts.

## Workstream 6 — Focused verification and beta journey

1. Run formatting, i18n parity, mobile lint/typecheck and focused route/component tests, web lint/typecheck and focused admin tests, and affected Edge checks only if service code changes.
2. Run Expo compatibility/Doctor, Android local export, Preview configuration checks, and secret-bundle inspection.
3. On the emulator, verify startup, Arabic/English/Urdu/Hindi directionality, customer/provider authentication, Maps, Push token/configuration, and the synthetic customer request → provider offer → selection → messaging → completion → rating journey.
4. Verify admin visibility and live scanner/OpenAI status without broad audits or real personal data.

## Workstream 7 — Artifact and publication

1. Commit coherent UI, service readiness, test, and documentation changes without rewriting parent history.
2. Build exactly one EAS Android Preview APK from the final committed SHA, download it, verify package/version/signing, scan obvious bundled configuration for secrets, calculate SHA-256, install it, and launch twice on the emulator.
3. Push only `codex/closed-beta-final-v1` and create one Draft PR against `codex/feature-complete-beta-v1`.
4. Record iOS configuration status and `APPLE_SIGNING_REQUIRED` if an already-paid signing team is unavailable.

## Acceptance evidence

- Focused checks and emulator journey pass on the final bytes.
- Scanner/OpenAI remain operational; Push and Maps are configured and verified to the emulator-supported extent.
- Customer, provider, and admin UIs use one coherent professional direction with four-locale and RTL/LTR support.
- One exact-head Android APK and checksum are saved in Downloads.
- Worktree/index are clean, Draft PR is open, and no Production/store/merge action occurred.
