# M1 Marketplace Trust and UGC Safety Design

**Status:** Approved by the M1 task specification
**Scope:** Local closed-beta implementation only
**Authority:** `sallah-marketplace-trust`, `sallah-release-orchestrator`, repository engineering contract

## Safety contract

Sallah keeps a directional `blocked_users` record so the blocker owns unblock, but treats either direction as mutual for communication. While either block exists, neither party can create messages, use an old conversation identifier to send, insert messages directly, receive newly inserted messages through Realtime, or obtain signed access to message attachments. Existing text history remains read-only to the two job participants so either party can preserve and report evidence. Staff access remains case-scoped or operations-permission-scoped.

Block and unblock are explicit desired-state commands, never a toggle. Both commands authenticate the actor, reject self-targeting and invalid identities, require a legitimate marketplace relationship, use advisory locking and idempotency reconstruction, apply actor-scoped rate limits, and append immutable block events. Unblock only removes the actor-owned block; it does not change account, provider-verification, or moderation status.

## Report model

`marketplace_reports` is the private workflow root for user, message, and rating reports. The reporting command derives the reporter from `auth.uid()`, derives message sender/conversation/job context on the server, validates any supplied job/request/rating context, rejects unrelated targets, bounds reason category and explanation, and deduplicates by idempotency key plus an active-report uniqueness rule.

The report stores only moderation-safe evidence: identifiers, bounded text snapshot for reported text UGC, hashes/metadata for attachments, lifecycle state, priority, correlation key, and timestamps. It never copies private media, signed URLs, secrets, exact locations, offers, or payment data. `marketplace_report_events` is append-only and records submission and every staff transition. Normal users receive only a safe report acknowledgement and may read only a safe projection of reports they submitted.

Each accepted report creates or links one existing `support_cases` record with a controlled abuse/safety topic. This makes the existing scoped support system the moderation work queue instead of creating a second case-management system.

## Messaging enforcement

One private predicate is the source of truth for communication eligibility. It requires active customer and provider profiles, an active conversation membership, and no block in either direction. The message RPC evaluates it after its idempotency lock but before a replay can return a once-valid result, so a block cannot be bypassed by replay. Direct authenticated message insertion is revoked and the INSERT policy is replaced with default denial.

Conversation and historical text read policies preserve participant evidence. Message attachment RLS and the `media-access` authorization path use the stricter communication predicate so a block denies protected media. Realtime inherits the message RLS policy and cannot introduce a separate mutation path.

Conservative closed-beta limits use the existing atomic rate-limit bucket primitive and privacy-safe actor hashes: 60 messages per UTC minute, 10 reports per UTC hour, and 20 block-state commands per UTC hour. Limits are per actor and operation, return deterministic safe error categories, and do not expose whether an unrelated target exists.

## Moderation and enforcement

The admin queue is a least-privilege RPC projection. Assigned support agents can inspect only reports whose linked support case grants them active `read` access and can add case-scoped notes/escalate. Operations staff can triage, assign priority, dismiss, resolve, or escalate. Account suspension remains separate: customer suspension uses `admin_set_customer_status`; provider suspension uses `review_provider`. The moderation UI never updates profiles or provider state directly.

Moderation commands lock report state, validate an expected version, reconstruct retries by idempotency key, require a bounded reason, append report events and the existing immutable admin audit log, and expose no reporter-private or internal data to normal users. A report escalation links to the existing support case without revealing its identifier in the user acknowledgement.

## Mobile and localization

Both role shells share the existing messages screen, so one trust-control component covers customer and provider flows without role-mode bypass. Message cards expose accessible report and block actions only for the counterparty. The screen loads server-derived trust context, requires confirmation for block/unblock, uses an idempotent mutation journal for report and block commands, and presents loading, success, failure, and safe retry states. Completed-job rating cards expose the same report intake with a rating context.

All visible trust strings live in `@sallah/i18n` for Arabic, English, Urdu, and Hindi. Existing logical-direction primitives provide RTL for Arabic/Urdu and LTR for English/Hindi. Controls use accessible labels, disabled/loading states, a live-region status announcement, and existing minimum touch targets.

## Verification boundaries

Regression-first pgTAP proves cross-role RLS, legitimate and unrelated report contexts, message/reference forgery denial, idempotency, mutual blocks, old-ID/direct-query/replay resistance, attachment denial, rate-limit isolation, staff permission separation, auditable resolution, and immutable evidence. Mobile/domain/web tests prove schemas, four-locale copy, RTL/LTR, accessible controls, durable retries, and least-privilege admin calls. Final review order is specification, quality, marketplace-trust invariants, privileged RPC/RLS, then Codex Security diff scan.

## Explicit non-goals

M1 does not enable external AI, translation, malware scanning, push, maps, backups, monitoring, EAS, store delivery, payments, SMS, or hosted Supabase changes. It does not redesign messaging or ratings beyond the trust controls above.
