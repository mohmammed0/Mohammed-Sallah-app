# Retention matrix draft

This is an engineering proposal, not legal advice. Final periods require Saudi-qualified review.

| Data                                  | Proposed trigger/period                                  | Action                                  |
| ------------------------------------- | -------------------------------------------------------- | --------------------------------------- |
| Unpublished request drafts/temp voice | 7 days inactivity                                        | delete                                  |
| Rejected/failed/quarantined uploads   | 24 hours by the scheduled quarantine cleanup policy      | physically delete and audit outcome     |
| Active request/job/messages/evidence  | service lifecycle + support window                       | retain access-controlled                |
| Provider verification evidence        | verification duration + approved legal period            | expire/delete or retain lawful evidence |
| AI messages/diagnostics               | 90 days unless attached to active dispute                | minimize/delete; keep aggregate usage   |
| Location updates                      | expire after 4 hours; operational metadata up to 30 days | automatic delete/anonymize              |
| Push tokens/devices                   | until logout/revocation/deletion                         | delete                                  |
| Financial/audit/dispute records       | legally required period                                  | retain/anonymize identity where allowed |
| Account export object                 | 1 hour after completion (configurable, bounded)          | expire signed link and delete object    |
| Deletion request                      | prompt processing; retained status/audit as lawful       | delete/anonymize matrix                 |

The privacy worker implements export expiry/cleanup, retry/dead-letter behavior, Auth soft deletion, storage cleanup, and transactional anonymization. Quarantine cleanup is also worker-driven. The default periods and retained financial/audit classes remain an engineering proposal; legal holds override ordinary deletion only with documented authority and expiry.
