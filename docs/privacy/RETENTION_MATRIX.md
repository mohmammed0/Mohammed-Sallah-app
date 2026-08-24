# Retention matrix draft

This is an engineering proposal, not legal advice. Final periods require Saudi-qualified review.

| Data                                  | Proposed trigger/period                                  | Action                                                                           |
| ------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Unpublished request drafts/temp voice | 7 days inactivity                                        | delete                                                                           |
| Rejected/failed/quarantined uploads   | 24 hours by the scheduled quarantine cleanup policy      | delete quarantine and non-retained opaque attempt artifacts; audit every attempt |
| Active request/job/messages/evidence  | service lifecycle + support window                       | retain access-controlled                                                         |
| User block current state              | while actor-owned block remains active                   | delete only through audited unblock                                              |
| Block command events                  | support/security review window; legal hold may extend    | retain access-controlled, then minimize                                          |
| Marketplace report workflow           | active case + support/legal review window                | retain private; expose safe projection                                           |
| Report text/attachment snapshot       | report/support lifecycle + approved evidence period      | delete/minimize; never copy media                                                |
| Provider verification evidence        | verification duration + approved legal period            | expire/delete or retain lawful evidence                                          |
| AI messages/diagnostics               | 90 days unless attached to active dispute                | minimize/delete; keep aggregate usage                                            |
| Location updates                      | expire after 4 hours; operational metadata up to 30 days | automatic delete/anonymize                                                       |
| Push tokens/devices                   | until logout/revocation/deletion                         | delete                                                                           |
| Financial/audit/dispute records       | legally required period                                  | retain/anonymize identity where allowed                                          |
| Account export object                 | 1 hour after completion (configurable, bounded)          | expire signed link and delete object                                             |
| Deletion request                      | prompt processing; retained status/audit as lawful       | delete/anonymize matrix                                                          |

The privacy worker implements export expiry/cleanup, retry/dead-letter behavior, Auth soft deletion,
storage cleanup, and transactional anonymization. Scanner request bytes move directly between private
Storage and the scanner worker; the scanning-control Edge path never buffers them, and no component may log object content,
capabilities, secrets, hashes, or private paths. Cleanup is database-authorized and artifact-specific:
rejected, expired, replaced, response-loss, and late-upload attempts can remove only their non-retained
opaque input/output/final-candidate objects. Active attempts and retained clean finals are never cleanup
targets. The 15-minute database schedule autonomously ages eligible scanner artifacts after 24 hours,
even when the scanner is unavailable. Stale cleanup leases are reclaimable; exhausted rows become
dead-letter/manual-attention work and cannot jam later rows. A failed physical deletion stays retryable
and auditable rather than being recorded as success. The
default periods and retained financial/audit classes remain an engineering proposal; legal holds
override ordinary deletion only with documented authority and expiry.

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
