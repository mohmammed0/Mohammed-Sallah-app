# User roles

| Role                    | Product authority                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------- |
| `customer`              | Own requests, offers addressed to the request, selected job, own support/privacy data. |
| `provider`              | Own profile, approved services, eligible matches, own offers, selected jobs, evidence. |
| `operations_admin`      | Operational queues and bounded marketplace commands.                                   |
| `verification_reviewer` | Provider document and service review.                                                  |
| `support_agent`         | Assigned/scoped support cases only.                                                    |
| `finance_reviewer`      | Offline financial review commands and evidence.                                        |
| `privacy_reviewer`      | Scoped data-subject export/deletion processing.                                        |
| `analyst`               | Redacted/aggregated operational views only.                                            |
| `super_admin`           | Server-authorized exceptional administration with audit.                               |

One account may hold customer and provider roles. Active navigation role is a
preference; it never grants a server role. Revocation, suspension, verification,
matching, and job state remain authoritative on the server.
