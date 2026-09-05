# Cloud-first device validation

Status: release-candidate planning only  
Baseline merge: `26eec9688df5979fa7ebaa0eaf121ef1a150116e`  
Approved PR source: `52fdb78ab2668437ff9f8ca6757669f9f8e93eb8`  
RC tag: `v0.1.0-rc.1`

This plan keeps repository work in GitHub Actions or Codex Cloud and keeps device execution off the local Windows host. No item is complete without linked evidence. Production integrations remain fail-closed.

## Resource-safety boundary

Do not use the local Windows checkout for release validation. Do not start Android Studio, an Android emulator, Docker Desktop, WSL services, local Supabase, Gradle, Metro, Expo development servers, or local Maestro. Android device validation must use a physical device or a managed cloud device service. Do not deploy production, submit to a store, activate a paid service, or place credentials in the repository.

## A. GitHub Actions or Codex Cloud

These tasks are repository-controlled and may run in GitHub-hosted CI or an isolated Codex Cloud environment:

- frozen-lockfile repository validation;
- format, lint, strict typecheck, unit and integration tests;
- Android JavaScript export validation without a local native toolchain;
- Expo dependency and configuration validation;
- EAS configuration schema and profile validation;
- dependency, license, vulnerability, secret and SBOM checks;
- release metadata and placeholder assertions;
- production fail-closed validation;
- immutable commit, workflow, artifact and checksum verification.

The already successful CI runs on approved source `52fdb78ab2668437ff9f8ca6757669f9f8e93eb8` remain valid unless application source or validation configuration changes.

## B. EAS cloud

These tasks require an authenticated Expo/EAS account and must run as explicit cloud builds:

- Android internal-distribution preview APK;
- Android release-candidate AAB;
- iOS preview build;
- signing preparation and credential classification.

Each task must pin an exact reviewed commit, profile and EAS project. Evidence must include the EAS build URL, build logs, artifact checksum, signing classification and profile. Do not submit an artifact to a store and do not initiate a paid build without explicit approval.

## C. Physical or managed cloud device

These checks require real hardware or an approved managed device service:

- camera capture;
- gallery selection;
- microphone permission and recording;
- voice upload and transcription;
- notification permission, receipt and deep-link routing;
- foreground location permission and updates;
- app and universal/deep links;
- signed private-media access and denial;
- offline queue, process restart and recovery behavior;
- accessibility, screen readers, large text, contrast, RTL and LTR;
- Maestro customer and provider journeys.

Emulator and Maestro results remain **NOT RUN** after interrupted local setup attempts. No device result may be inferred from those attempts.

## D. External credentials or approval

The following remain human or external gates:

- Expo/EAS account, project ownership and build authorization;
- Apple Developer and App Store Connect accounts;
- Google Play Console account and service account;
- production Supabase project, backups, domains and server-side secrets;
- approved AI provider, model, contract and data terms;
- approved translation provider, region, retention and DPA;
- SMS/OTP sender, templates and credentials;
- APNs, FCM or Expo push credentials;
- payment gateway, merchant account and reconciliation approval;
- monitoring, alerting and incident-response ownership;
- legal entity, policies, disclosures and Saudi-qualified legal approval;
- independent penetration testing.

Never put these credentials or secrets in Expo public variables, source files, issue comments, build logs or chat.

## Current EAS readiness

### Configured

- Expo application version: `0.1.0`.
- Slug: `sallah`; URL scheme: `sallah`.
- Platforms: Android and iOS.
- Runtime version policy: Expo fingerprint.
- EAS app-version source: remote.
- Development, preview and production channels exist.
- Preview uses internal distribution and automatic version increment.
- Production uses its own channel and automatic version increment.
- Foreground-only location is configured; background location is blocked.
- Phone OTP, background location and online payment feature flags are disabled.
- Store-review, privacy, data-safety, screenshot and release-checklist drafts exist under `docs/store/`.
- Production configuration fails closed when required public Supabase or EAS values are absent.

### Human identifiers still required

- `EAS_PROJECT_ID`.
- Final iOS bundle identifier; `sa.example.sallah` is a placeholder.
- Final Android application ID; `sa.example.sallah` is a placeholder.
- Apple App Store Connect application ID.
- Google Play service-account path and account ownership.
- Final legal entity, support address and public policy URLs.
- Production-restricted Google Maps key where maps are enabled.

### Authentication still required

- Expo/EAS account authentication and project access.
- Apple signing/account access for iOS.
- Google Play/signing access for Android distribution.
- Provider secret-store access for production backend configuration.

The `preview` profile can produce an internal Android cloud artifact without Android Studio, an emulator, a local Android SDK or a local Gradle build once the EAS project and approved build environment are supplied. This plan does not start that build.

## Evidence contract for the next execution

A cloud build task must record:

1. exact commit SHA and unchanged working source;
2. EAS profile and project;
3. build URL and complete status;
4. artifact type, byte size and SHA-256;
5. signing classification without exposing credentials;
6. build logs checked for secret leakage;
7. explicit confirmation of no store submission and no production deployment.

A physical or managed-device task must report each journey as PASS, FAIL or NOT RUN and attach device metadata, logs and screenshots. Production gates stay independent.
