# Reviewed policy publication and consent

Status: CURRENT SUPPORTING DOCUMENT. Audience: release owner, privacy reviewer and database operator.

The launch requires readable, reviewed **privacy**, **terms** and **community** documents in Arabic,
English, Urdu and Hindi. Repository seed documents are hash-only drafts; they are never promoted or
treated as accepted automatically. Obtain approved operator identity, contact details, data purposes,
processors, retention, cross-border treatment and moderation rules before publication.

## Publication packet

Prepare one UTF-8 document per type and locale, with these reviewed fields:

| Field                          | Requirement                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------- |
| `document_type`                | `privacy`, `terms`, or `community`                                              |
| `version`                      | New immutable version, 1–100 characters; same version for the four translations |
| `locale`                       | `ar`, `en`, `ur`, or `hi`                                                       |
| `title`                        | Reviewed localized title, 1–240 characters                                      |
| `body`                         | Reviewed plain text, at most 131,072 UTF-8 bytes; do not inject HTML            |
| `content_hash`                 | Lowercase SHA-256 of the exact UTF-8 body                                       |
| `published_at`, `effective_at` | Explicit UTC times; future documents cannot satisfy current consent             |
| `approved_at`                  | Actual review approval timestamp, supplied only after review                    |
| `approval_reference`           | Internal review record; excluded from public projections                        |
| `requires_acceptance`          | `true` for all three required types                                             |

The operator inserts new document versions through the controlled database administration path.
Clients cannot publish, approve, edit or withdraw policies. Preserve the reviewed packet and operator
evidence. An approved row cannot be edited or deleted; publish a new version to change its content.
Withdrawal is explicit and irreversible for that row. Verify the intended current versions after a
withdrawal because an earlier approved version can become current again.

## Deployment order

1. Review the migration mapping before touching an existing database. The audited Preview ledger
   matched historical filenames but used different version numbers; never run an unreviewed bulk
   `db push` against it.
2. Apply the forward migrations `20260905070000_reviewed_legal_consent.sql` and
   `20260905073000_isolate_legal_publication_trigger_records.sql` after existing migrations
   have been reconciled. They enable enforcement by default and leave drafts unapproved. Missing
   policies intentionally block content creation. Account/privacy controls and support remain available.
3. Deploy the matching Edge Functions. Diagnostic and transcription endpoints check authoritative
   consent before external processing. Deploy mobile/web readers from the same reviewed release.
4. Publish the reviewed twelve-document packet, keeping each type's version aligned across locales.
5. Verify `system_settings['legal.consent'].value.enabled` is boolean `true`. Only the disposable
   local/test seed uses boolean `false`; never use that seed as a production deployment procedure.
6. Run `pnpm config:validate:production` and the read-only `pnpm config:validate:backend` with the
   approved production environment. The latter requires current reviewed documents in all locales,
   aligned versions and enabled enforcement. A successful static environment check alone is insufficient.

## Acceptance and recovery

The anonymous reader exposes only current approved text. Authenticated acceptance submits the exact
three document IDs and hashes the user reviewed, with an idempotency key. The transaction verifies
the current set, stores hash/version/locale snapshots and appends privacy audit events. Legacy rows
without snapshots do not count; a fresh explicit acceptance upgrades them with new audit evidence.
Changing interface language does not repeat acceptance of the same current policy version.

Publication and content/acceptance commands share a database lock. Their time reference is captured
after obtaining the lock, so a waiting request cannot accept an outdated set after publication.
Content guards cover requests, provider profiles/portfolios, offers, messages, uploads, completion,
ratings and scope changes. Service-only account cleanup can scrub content for inactive accounts;
the same exception is unavailable to a retained client session.

If the reader reports unavailable, restore the approved packet or publish a corrected new version.
Do not disable production enforcement, approve a draft, forge an acceptance or bypass RLS to recover.
Roll forward with a reviewed database fix; do not edit an applied migration. Keep external AI paused
if matching consent functions are unavailable. Re-run the release preflight and cross-role scenarios
before resuming launch work.

Owner export already includes legal acceptances and privacy events. The new acceptance snapshots
follow that same retention/export scope; no IP address or user-agent collection was added.
