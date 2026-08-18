# RLS matrix

All exposed public tables have RLS enabled. No service-role key is available to clients.

| Resource                               | Customer                  | Matched provider          | Selected provider        | Assigned/granted support                        | Operations / other staff                          | Other user |
| -------------------------------------- | ------------------------- | ------------------------- | ------------------------ | ----------------------------------------------- | ------------------------------------------------- | ---------- |
| Profile/preferences                    | own                       | own                       | own                      | linked-case subjects only                       | operations marketplace / verification permission  | deny       |
| Exact address / job location RPC       | own job only              | deny                      | selected active job only | linked case + `exact_location` + reason + audit | `operations.exact_location.read` + reason + audit | deny       |
| Foreground location-sharing sessions   | own job read              | deny                      | own active session       | deny unless separately linked and permissioned  | narrowly permissioned                             | deny       |
| Request core/answers/clean media brief | own                       | matched, approximate only | participant              | authorized linked case only                     | `operations.marketplace.read`                     | deny       |
| AI sessions/messages/diagnostics       | own                       | deny                      | deny                     | deny                                            | server/service workflow only                      | deny       |
| Offers                                 | offers on own request     | own offer                 | own/selected             | authorized linked case only                     | `operations.marketplace.read`                     | deny       |
| Competing offers                       | customer only             | deny                      | deny other offers        | only when linked case policy explicitly permits | `operations.marketplace.read`                     | deny       |
| Jobs/history/change orders/proofs      | participant               | deny unless selected      | participant              | authorized linked case only                     | `operations.marketplace.read`                     | deny       |
| Conversations/messages/attachments     | member/historical export  | deny unless member        | member                   | case-authorized pathways only                   | operations permission                             | deny       |
| Clean storage objects                  | no direct bucket read     | no direct bucket read     | no direct bucket read    | no direct bucket read                           | no direct bucket read                             | deny       |
| Signed-media broker                    | authorized owned/resource | matched-resource subset   | participant resource     | linked case + evidence/read capability          | explicit operations/provider-document permission  | deny       |
| Provider documents/payout refs         | deny                      | own                       | own                      | deny                                            | verification/finance permission                   | deny       |
| Payments/holds/refunds                 | participant subset        | deny                      | participant subset       | linked case does not grant ledger-wide access   | `finance.read`; mutation via RPC/service          | deny       |
| Support cases/messages/evidence        | opener; visible messages  | opener when applicable    | opener when applicable   | active assignment/grant and capability          | `operations.marketplace.read`                     | deny       |
| Internal support notes                 | deny                      | deny                      | deny                     | active `internal_note` capability only          | deny unless separately assigned/authorized        | deny       |
| Notifications/delivery history         | own                       | own                       | own                      | deny system-wide                                | `operations.notifications.read`                   | deny       |
| Admin audit/config                     | deny                      | deny                      | deny                     | deny unless independently authorized            | exact permission; active roles only               | deny       |

Support access requires an active account and non-revoked `support_agent` role plus either an active
case assignment or a temporary/escalation grant. Grants last at most 24 hours, have explicit
capabilities and reason, and can be revoked immediately. Support resolution commands are guarded by
the same linked-case scope. Analysts remain aggregate-only. Operations-wide marketplace,
notification, and exact-location access are three distinct permissions.

Automated evidence: 12 pgTAP files execute 317 assertions, including
`scoped_support_authorization.test.sql`, `cross_role.test.sql`, `rls.test.sql`,
`schema.test.sql`, and `launch_readiness_p0.test.sql`. They cover assigned/unassigned/expired support,
explicitly ended assignments, revoked roles, unrelated request/job denial, independent exact-location and internal-note access,
analyst denial, operations access, competing offers, unmatched location denial, clean-media
authorization, message attachment ownership, and completion-proof access. Quarantine writes require
the first object-path segment to equal `auth.uid()`; promoted clean buckets have no client read policy
and are accessed only through short broker-issued URLs.
