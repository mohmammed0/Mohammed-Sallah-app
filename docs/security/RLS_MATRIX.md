# RLS matrix

All exposed public tables have RLS enabled. No service-role key is available to clients.

| Resource                               | Customer                  | Matched provider          | Selected provider        | Assigned/granted support                        | Operations / other staff                                                                 | Other user |
| -------------------------------------- | ------------------------- | ------------------------- | ------------------------ | ----------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------- |
| Raw profile/preferences                | own                       | own                       | own                      | deny; linked safe identity RPC only             | deny; purpose-scoped projection RPCs only                                                | deny       |
| Safe identity / customer PII RPC       | own                       | deny unrelated            | deny unrelated           | assigned-case display identity only             | PII requires `customer.pii.read`; marketplace/verification projections are field-limited | deny       |
| Exact address / job location RPC       | own job only              | deny                      | selected active job only | linked case + `exact_location` + reason + audit | `operations.exact_location.read` + reason + audit                                        | deny       |
| Foreground location-sharing sessions   | own job read              | deny                      | own active session       | deny unless separately linked and permissioned  | narrowly permissioned                                                                    | deny       |
| Request core/answers/clean media brief | own                       | matched, approximate only | participant              | authorized linked case only                     | `operations.marketplace.read`                                                            | deny       |
| AI sessions/messages/diagnostics       | own                       | deny                      | deny                     | deny                                            | server/service workflow only                                                             | deny       |
| Offers                                 | offers on own request     | own offer                 | own/selected             | authorized linked case only                     | `operations.marketplace.read`                                                            | deny       |
| Competing offers                       | customer only             | deny                      | deny other offers        | only when linked case policy explicitly permits | `operations.marketplace.read`                                                            | deny       |
| Jobs/history/change orders/proofs      | participant               | deny unless selected      | participant              | authorized linked case only                     | `operations.marketplace.read`                                                            | deny       |
| Conversations/messages/attachments     | member/historical export  | deny unless member        | member                   | case-authorized pathways only                   | operations permission                                                                    | deny       |
| Clean storage objects                  | no direct bucket read     | no direct bucket read     | no direct bucket read    | no direct bucket read                           | no direct bucket read                                                                    | deny       |
| Signed-media broker                    | authorized owned/resource | matched-resource subset   | participant resource     | linked case + evidence/read capability          | explicit operations/provider-document permission                                         | deny       |
| Provider documents/payout refs         | deny                      | own                       | own                      | deny                                            | verification/finance permission                                                          | deny       |
| Payments/holds/refunds                 | participant subset        | deny                      | participant subset       | linked case does not grant ledger-wide access   | minimal finance queue; mutation/confirmation via RPC/service                             | deny       |
| Support cases/messages/evidence        | opener; visible messages  | opener when applicable    | opener when applicable   | active assignment/grant and capability          | `operations.marketplace.read`                                                            | deny       |
| Internal support notes                 | deny                      | deny                      | deny                     | active `internal_note` capability only          | deny unless separately assigned/authorized                                               | deny       |
| Notifications/delivery history         | own                       | own                       | own                      | deny system-wide                                | `operations.notifications.read`                                                          | deny       |
| Admin audit/config                     | deny                      | deny                      | deny                     | deny unless independently authorized            | exact permission; active roles only                                                      | deny       |

Support access requires an active account and non-revoked `support_agent` role plus either an active
case assignment or a temporary/escalation grant. Grants last at most 24 hours, have explicit
capabilities and reason, and can be revoked immediately. Support resolution commands are guarded by
the same linked-case scope. Analysts remain aggregate-only. Operations-wide marketplace, customer
PII, provider verification, notification, finance, and exact-location access are distinct
permissions. Support agents never inherit raw profile or ledger-wide reads. Customer PII lookup
requires an active privacy-reviewer or super-admin role, a target, and an audited reason.

The authoritative runtime role list is exported by `@sallah/domain` and includes
`privacy_reviewer`. Database-generated types, web authorization, and mobile session parsing consume
the same contract. Staff-only roles never imply customer/provider navigation. An unknown future role
produces a controlled restricted mobile state instead of an endless initialization state.

Automated evidence: 21 pgTAP files execute 492 assertions, including
`scoped_support_authorization.test.sql`, `cross_role.test.sql`, `rls.test.sql`,
`pii_admin_scope.test.sql`, `schema.test.sql`, and `launch_readiness_p0.test.sql`. They cover direct
raw-table PII denial, purpose-scoped projections, assigned/unassigned/expired support,
explicitly ended assignments, revoked roles, unrelated request/job denial, independent exact-location and internal-note access,
analyst denial, operations access, competing offers, unmatched location denial, clean-media
authorization, message attachment ownership, and completion-proof access. Quarantine writes require
the first object-path segment to equal `auth.uid()`; promoted clean buckets have no client read policy
and are accessed only through short broker-issued URLs.

## Preview security-hardening gate

The exposed provider projections use invoker semantics. `provider_request_briefs` reads
`service_requests` through its existing RLS and `private.can_read_request` participant check.
`provider_public_profiles` reads a fixed, eleven-field projection supplied by
`private.provider_public_profile_rows()`; the helper exposes only active, verified providers and
does not grant clients raw-table access. The projection contains no email, phone, customer identity,
exact address, or private-document field.

Every `SECURITY DEFINER` function in `public` and `private` has inherited `PUBLIC` execution
revoked. Anonymous execution is limited to the explicitly reviewed external-deletion intake and the
private helper behind the safe public provider view. Authenticated user, staff, and service-worker
RPCs are granted by exact signature. Staff RPCs retain their server-side role/permission checks;
worker and compatibility helpers remain service-only.

RLS-enabled tables with no policy are classified as internal/service-only and have no direct
`anon` or `authenticated` table privileges. This is intentional deny-by-default behavior, not a
missing allow policy. Public RLS predicates cache `auth.uid()` with scalar subqueries; policy
semantics and role coverage are otherwise unchanged.
