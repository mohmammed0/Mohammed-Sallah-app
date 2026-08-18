# RLS matrix

All exposed public tables have RLS enabled. No service-role key is available to clients.

| Resource                          | Customer              | Matched provider          | Selected provider  | Relevant staff             | Other user |
| --------------------------------- | --------------------- | ------------------------- | ------------------ | -------------------------- | ---------- |
| Profile/preferences               | own                   | own                       | own                | admin by role              | deny       |
| Exact address                     | own                   | deny                      | selected job only  | authorized admin           | deny       |
| Request core/answers/media        | own                   | matched brief/read policy | participant        | admin                      | deny       |
| Offers                            | offers on own request | own offer                 | own/selected       | admin                      | deny       |
| Competing offers                  | customer only         | deny                      | deny other offers  | admin                      | deny       |
| Jobs/history/change orders/proofs | participant           | deny unless selected      | participant        | admin                      | deny       |
| Conversations/messages            | member                | deny                      | member             | authorized admin pathway   | deny       |
| Provider documents/payout refs    | deny                  | own                       | own                | verification/finance roles | deny       |
| Payments/holds/refunds            | participant subset    | deny                      | participant subset | finance/super              | deny       |
| Support/disputes                  | opener/participant    | participant               | participant        | support/ops                | deny       |
| Admin audit/config                | deny                  | deny                      | deny               | specific admin roles       | deny       |

Automated evidence: `supabase/tests/database/cross_role.test.sql`, `rls.test.sql`, and `schema.test.sql` (35 assertions). Storage policies require the first object-path segment to equal `auth.uid()`.
