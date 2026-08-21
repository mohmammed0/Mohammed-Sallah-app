# Retention matrix draft

This is an engineering proposal, not legal advice. Final periods require Saudi-qualified review.

| Data                                  | Proposed trigger/period                                  | Action                                  |
| ------------------------------------- | -------------------------------------------------------- | --------------------------------------- |
| Unpublished request drafts/temp voice | 7 days inactivity                                        | delete                                  |
| Rejected/failed/quarantined uploads   | 24 hours by the scheduled quarantine cleanup policy      | physically delete and audit outcome     |
| Active request/job/messages/evidence  | service lifecycle + support window                       | retain access-controlled                |
| User block current state              | while actor-owned block remains active                   | delete only through audited unblock     |
| Block command events                  | support/security review window; legal hold may extend    | retain access-controlled, then minimize |
| Marketplace report workflow           | active case + support/legal review window                | retain private; expose safe projection  |
| Report text/attachment snapshot       | report/support lifecycle + approved evidence period      | delete/minimize; never copy media       |
| Provider verification evidence        | verification duration + approved legal period            | expire/delete or retain lawful evidence |
| AI messages/diagnostics               | 90 days unless attached to active dispute                | minimize/delete; keep aggregate usage   |
| Location updates                      | expire after 4 hours; operational metadata up to 30 days | automatic delete/anonymize              |
| Push tokens/devices                   | until logout/revocation/deletion                         | delete                                  |
| Financial/audit/dispute records       | legally required period                                  | retain/anonymize identity where allowed |
| Account export object                 | 1 hour after completion (configurable, bounded)          | expire signed link and delete object    |
| Deletion request                      | prompt processing; retained status/audit as lawful       | delete/anonymize matrix                 |

The privacy worker implements export expiry/cleanup, retry/dead-letter behavior, Auth soft deletion, storage cleanup, and transactional anonymization. Quarantine cleanup is also worker-driven. The default periods and retained financial/audit classes remain an engineering proposal; legal holds override ordinary deletion only with documented authority and expiry.

Marketplace report retention is purpose-limited. A report may retain at most a 2,000-character UGC
snapshot, a 1,000-character reporter explanation, and bounded attachment metadata/content hashes.
For a user-target report, the authoritative conversation, job, and request identifiers are retained
as abuse-context metadata for the linked report/support lifecycle; the server never substitutes a
newer relationship, and separate conversations may retain separate active reports.
It must not retain private object paths, signed URLs, copied message media, exact locations, competing
offers, secrets, or payment data. Message-media broker tokens are short-lived transport credentials,
expire within two minutes, are never written into report evidence, disable response caching, stream
without retaining a broker copy, and reauthorize on every delivery.
The linked support case governs workflow access; report and block events are append-only audit
evidence. Concrete deletion periods remain a Saudi-qualified legal input.
