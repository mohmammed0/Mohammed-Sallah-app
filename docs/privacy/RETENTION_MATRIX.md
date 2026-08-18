# Retention matrix draft

This is an engineering proposal, not legal advice. Final periods require Saudi-qualified review.

| Data                                  | Proposed trigger/period                                  | Action                                  |
| ------------------------------------- | -------------------------------------------------------- | --------------------------------------- |
| Unpublished request drafts/temp voice | 7 days inactivity                                        | delete                                  |
| Failed/incomplete uploads             | 24 hours                                                 | delete                                  |
| Active request/job/messages/evidence  | service lifecycle + support window                       | retain access-controlled                |
| Provider verification evidence        | verification duration + approved legal period            | expire/delete or retain lawful evidence |
| AI messages/diagnostics               | 90 days unless attached to active dispute                | minimize/delete; keep aggregate usage   |
| Location updates                      | expire after 4 hours; operational metadata up to 30 days | automatic delete/anonymize              |
| Push tokens/devices                   | until logout/revocation/deletion                         | delete                                  |
| Financial/audit/dispute records       | legally required period                                  | retain/anonymize identity where allowed |
| Account export object                 | 7 days after completion                                  | delete object                           |
| Deletion request                      | prompt processing; retained status/audit as lawful       | delete/anonymize matrix                 |

A scheduled worker must implement approved periods before production. Legal holds override ordinary deletion with documented authority and expiry.
