---
name: sallah-marketplace-trust
description: "Use when Sallah work affects customer/provider separation, onboarding or qualification, matching, sealed offers, selection, exact-location privacy, service areas, messaging or media abuse, reports, blocks, moderation, support, disputes, cancellations, change orders, completion, ratings, suspension, fraud, Saudi geography, or AI-assisted publication trust."
---

# Sallah Marketplace Trust

Protect Sallah marketplace invariants. UI convenience never overrides authorization, privacy, qualification, secrecy, moderation, or auditability.

## Establish authority

Read the repository-root `AGENTS.md`, then the relevant contracts and current documentation rather than duplicating them:

- `packages/domain/` and generated database types
- `docs/security/RLS_MATRIX.md` and `docs/architecture/SECURITY.md`
- `docs/architecture/MATCHING.md`, `COMPLETION_LIFECYCLE.md`, and `AI_ARCHITECTURE.md`
- `docs/operations/PROVIDER_VERIFICATION_RUNBOOK.md` and `SUPPORT_RUNBOOK.md`
- `docs/privacy/` for purpose, retention, and disclosure boundaries

Transactional database commands and authenticated Edge Functions are authoritative for critical state changes. Presentation state is never authorization.

## Marketplace invariants

| Area | Required invariant |
| --- | --- |
| Roles | Customer, provider, and staff capabilities stay separate. A staff role alone never grants customer/provider navigation or marketplace ownership. |
| Provider eligibility | Account verification, per-service approval, restricted qualification, capacity, availability, blocks, and service area must pass where applicable. Revalidate at matching, brief, offer, and selection. |
| Offers | Competing offers remain sealed from providers. Selection is customer-authorized, versioned, idempotent, transactional, and revalidates eligibility. |
| Location | Matching uses approximate geography. Exact location reaches only the selected active provider or a separately authorized, audited operator. City and service-area claims must agree with coordinates. |
| Messaging and media | Only conversation members access content. Enforce ownership, private storage, scan state, short-lived access, rate limits, reporting, and block/unblock semantics. |
| Lifecycle | Cancellations, disputes, change orders, completion evidence, ratings, and support decisions follow explicit server states with immutable history. Providers cannot approve their own change orders; ratings remain post-completion and non-duplicative. |
| Enforcement | Service removal, qualification or verification loss, suspension, fraud, or abuse invalidates only affected eligibility where policy permits. Selected jobs route to review. |
| AI | Diagnostic output is advisory and cannot publish, authorize, set a guaranteed price, or override the customer. Preserve original input, authoritative replies, explicit customer confirmation, fallback truth, audit provenance, and human review for high-risk outcomes. |
| Saudi UX | Validate Saudi geography and service areas server-side. Trust/safety UI is Arabic-first and accessible in Arabic, English, Urdu, and Hindi. |

## Review method

1. Name each actor, resource, transition, sensitive field, and trust boundary.
2. Put domain rules in `packages/domain` or one transactional server command; keep clients as projections.
3. Begin exposed data with deny-by-default RLS. Critical commands require authentication, authorization, idempotency, version checks, transactions, and audit events.
4. Add positive and negative tests for owner, participant, unrelated customer, unrelated provider, blocked party, suspended/unqualified provider, and each relevant staff permission.
5. Require evidence-backed human review for identity, restricted qualifications, safety, abuse, fraud, disputes, privacy access, and high-risk decisions.

Use official Expo, Supabase, OpenAI, Codex Security, and OWASP skills for their generic technology details. Those skills may strengthen this contract but never weaken it.
