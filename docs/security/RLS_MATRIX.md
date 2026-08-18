# RLS matrix

All exposed public tables have RLS enabled. No service-role key is available to clients.

| Resource                               | Customer                  | Matched provider            | Selected provider        | Relevant staff                           | Other user |
| -------------------------------------- | ------------------------- | --------------------------- | ------------------------ | ---------------------------------------- | ---------- |
| Profile/preferences                    | own                       | own                         | own                      | permission-scoped                        | deny       |
| Exact address / job location RPC       | own job only              | deny                        | selected active job only | `job.exact_location.read`                | deny       |
| Foreground location-sharing sessions   | own job read              | deny                        | own active session       | narrowly permissioned read               | deny       |
| Request core/answers/clean media brief | own                       | matched, approximate only   | participant              | permission-scoped                        | deny       |
| AI sessions/messages/diagnostics       | own                       | deny                        | deny                     | server/service workflow only             | deny       |
| Offers                                 | offers on own request     | own offer                   | own/selected             | permission-scoped                        | deny       |
| Competing offers                       | customer only             | deny                        | deny other offers        | permission-scoped                        | deny       |
| Jobs/history/change orders/proofs      | participant               | deny unless selected        | participant              | support/operations permission            | deny       |
| Conversations/messages/attachments     | member                    | deny unless active member   | active member            | explicit support pathway only            | deny       |
| Clean storage objects                  | no direct bucket read     | no direct bucket read       | no direct bucket read    | no direct bucket read                    | deny       |
| Signed-media broker                    | authorized owned/resource | matched-resource subset     | participant resource     | support/provider-document permission     | deny       |
| Provider documents/payout refs         | deny                      | own                         | own                      | verification/finance permission          | deny       |
| Payments/holds/refunds                 | participant subset        | deny                        | participant subset       | `finance.read`; mutation via RPC/service | deny       |
| Support/disputes                       | opener/participant        | participant when applicable | participant              | support/operations permission            | deny       |
| Admin audit/config                     | deny                      | deny                        | deny                     | exact permission; active roles only      | deny       |

Automated evidence: eight pgTAP files currently execute 232 assertions, including `cross_role.test.sql`, `rls.test.sql`, `schema.test.sql`, and `launch_readiness_p0.test.sql`. They cover competing offers, unmatched/exact-location denial, revoked staff roles, analyst PII denial, clean-media authorization, message attachment ownership, and completion-proof access. Quarantine writes require the first object-path segment to equal `auth.uid()`; promoted clean buckets have no client read policy and are accessed only through short broker-issued URLs.
