# R1 Bilingual Repository Organization Implementation Plan

> **Workflow:** Execute this plan with the repository release-orchestrator and the selected
> Superpowers verification/review skills. The user explicitly forbids staging, commits, pushes,
> pull-request changes, deployments, and M2 implementation.

**Goal:** Make the frozen M1 repository understandable and reviewable in Arabic and English without
changing product, database, dependency, deployment, or release behavior.

**Starting point:** codex/repository-bilingual-organization-v1 at
46e8c8cd5bc85dcbd24efad50ab0d22cd39eb31b.

**Design:** Keep deep technical documents canonical in English. Add Arabic-first bilingual
gateways, aligned full guides, audience/status-aware indexes, a current closed-beta status source,
and a dependency-free static documentation validator. Preserve superseded status material as dated
historical evidence.

## Pre-change document classification

| Classification              | Files                                                                                                                                                      |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current source of truth     | AGENTS.md, architecture/security/operations/privacy/release/store guides, docs/HUMAN_INPUTS.md, docs/LOCAL_DEVELOPMENT.md, docs/TESTING.md, M1 design/plan |
| Current supporting document | docs/DEPLOYMENT.md, docs/ENVIRONMENT.md, docs/RELEASE.md, OSS records, screenshots, third-party notices                                                    |
| Historical evidence         | docs/validation/FINAL_VALIDATION_REPORT.md, archived BUILD_PROGRESS.md                                                                                     |
| Stale or contradictory      | Root README.md, CONTRIBUTING.md, and SECURITY.md are incomplete English-only gateways; BUILD_PROGRESS.md is superseded as current status                   |
| Generated                   | docs/privacy/DATA_INVENTORY.md, screenshot captures, SBOM/inventory artifacts where identified by their own source                                         |

## Task 1: Establish navigation and current status

**Files:**

- Modify: README.md
- Create: README.ar.md, README.en.md
- Create: docs/README.md, docs/ar/README.md, docs/en/README.md
- Create: docs/ar/PROJECT_OVERVIEW.md, docs/ar/CLOSED_BETA.md
- Create: docs/status/README.md, docs/status/CLOSED_BETA.md
- Create: docs/archive/README.md
- Move: BUILD_PROGRESS.md to docs/archive/2026-08-17-build-progress.md

1. Write Arabic-first root and documentation gateways with explicit language links.
2. Make docs/status/CLOSED_BETA.md the current repository status source.
3. Record M1 frozen/completed, M2 architecture-selected/not-started, and distinct
   PASS/NOT RUN/HUMAN INPUT REQUIRED/OUT OF BETA SCOPE states.
4. Preserve the old build progress verbatim under a dated archive notice and update every reference.

## Task 2: Add contributor, security, and operating guides

**Files:**

- Modify: CONTRIBUTING.md, SECURITY.md
- Create: CONTRIBUTING.ar.md, CONTRIBUTING.en.md
- Create: SECURITY.ar.md, SECURITY.en.md
- Create: docs/ar/LOCAL_DEVELOPMENT.md, docs/ar/TESTING.md, docs/ar/HUMAN_INPUTS.md

1. Preserve exact tool, migration, RLS, pgTAP, generated-type, localization, accessibility,
   supply-chain, conventional-commit, and honest-evidence rules in both languages.
2. Route vulnerability reports to GitHub private vulnerability reporting.
3. Mark the production security email as a human input; do not invent one.
4. Link Arabic summaries to canonical deep technical documents.

## Task 3: Make GitHub contribution surfaces bilingual

**Files:**

- Modify: .github/pull_request_template.md
- Modify: .github/ISSUE_TEMPLATE/bug.yml
- Modify: .github/ISSUE_TEMPLATE/config.yml
- Create: .github/ISSUE_TEMPLATE/feature.yml
- Create: .github/ISSUE_TEMPLATE/beta-feedback.yml

1. Put Arabic before English in visible labels and guidance.
2. Add explicit warnings against credentials, personal data, exact locations, documents, messages,
   and payment information.
3. Capture beta necessity, scope, privacy/security impact, validation, human inputs, and rollback.
4. Keep security reports private through SECURITY.md and GitHub advisories.

## Task 4: Add deterministic documentation validation

**Files:**

- Create: scripts/check-docs.mjs
- Create: scripts/check-docs.test.mjs
- Modify: package.json
- Modify: .github/workflows/ci.yml

1. Write failing Node tests for missing required bilingual files, missing root language links,
   broken relative Markdown links, missing index entries, invalid gateway pairs, and current links
   into archived evidence.
2. Implement the dependency-free validator.
3. Add docs:check and docs:check:test scripts.
4. Run the checker from the root validate command and the repository CI job.

## Task 5: Verify and independently review

1. Run documentation validator tests and pnpm docs:check.
2. Run Prettier on affected Markdown, YAML, JSON, and JavaScript.
3. Run relevant package/script tests, git diff --check, and full pnpm validate.
4. Prove no diff under apps/, packages/, supabase/, or protected .agents/.
5. Ask an independent reviewer to check Arabic quality, English parity, links, classification,
   security wording, unsupported claims, and repository cleanliness.
6. Remediate credible findings, rerun affected checks, and leave every change uncommitted and
   unstaged.
