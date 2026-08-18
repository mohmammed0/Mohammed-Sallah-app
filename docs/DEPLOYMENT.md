# Deployment

## Order

1. Provision separate preview/production Supabase projects and backups.
2. Review migrations in a disposable restored clone; apply forward-only migrations.
3. Configure Auth redirect allowlists, private buckets, Edge secrets, SMTP, rate limits, and least-privileged operator accounts.
4. Run production validation and full CI against the release commit.
5. Deploy Edge Functions, then Next.js, then EAS preview builds; complete smoke/security checks.
6. Promote mobile builds only after device and store-review validation.

Never deploy `seed.sql` demo/test identities, local JWT secrets, or placeholder URLs. Web may be hosted on any Node-compatible platform; do not assume Vercel. Supabase service-role and AI keys belong only in provider secret stores. Online payment and SMS feature flags remain off until real credentials and reconciliation/runbooks are approved.

Rollback application code by redeploying the prior immutable artifact. Do not reverse a production migration destructively: stop writes/disable the affected feature, deploy a compensating migration, or restore to a new project after incident approval. See backup/recovery and release docs.
