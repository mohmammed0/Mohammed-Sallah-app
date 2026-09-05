# Backup and recovery

## Current beta status

- Formal restore drill: **NOT RUN**.
- Approved RPO/RTO and retention: **HUMAN INPUT REQUIRED** from platform, legal, and the incident
  owner. Proposed engineering placeholders are RPO 24 hours and RTO 8 hours.
- Managed-backup/PITR plan and any paid restore-to-new-project capability: **HUMAN INPUT REQUIRED**;
  enabling billing is not authorized by repository work.
- External alert destination and named restore operator/reviewer: **HUMAN INPUT REQUIRED**.

Enable managed daily database backups or PITR only after the owner approves the plan and cost.
Separately preserve private object data, bucket/settings inventory, Edge configuration, migration
history, and an encrypted secret-name/ownership inventory. Supabase database backups include Storage
metadata but not the Storage objects themselves, so a database restore is not object recovery. Never
put raw backups, passwords, connection strings, or service credentials in the repository or evidence.

## Isolated restore process

1. The incident owner records the trusted source project, restore point, data classes, expected loss
   window, approved isolated target, region, and operator. Do not place identifiers or credentials in
   public tickets.
2. Freeze affected writes or isolate clients. Preserve the source; never overwrite the only
   recoverable copy.
3. Prefer the provider's **Restore to a New Project** workflow when it is already authorized and does
   not require unapproved billing. Otherwise use the current pinned Supabase CLI backup/restore guide
   with a secret-provided database URL. Discover exact flags with `supabase db dump --help` and the
   matching restore tool help before execution; do not copy a remembered destructive command.
4. Restore the database into the new isolated target. Restore Storage objects separately from the
   approved object backup, and reconfigure buckets, Auth settings, API keys, Edge Functions, Realtime,
   extensions/settings, schedules, and external integrations.
5. Apply only missing forward migrations. Preserve migration history according to the current
   Supabase restore guide.
6. Validate counts and foreign keys, RLS/role isolation, privileged functions, generated DB types,
   private-object existence/hash sampling, Auth behavior, Edge functions, outboxes/schedulers,
   scanner cleanup, and the affected customer/provider smoke flows.
7. Rotate JWT, database, service, webhook, scanner, AI, push, and other credentials if the source or
   recovery process could have exposed them. Custom database-role passwords may require an explicit
   reset after a physical restore.
8. Record validation evidence and duration. Cut over only after incident-owner, security, and
   platform review; otherwise destroy the isolated target through the approved account process.

## Evidence record

Each drill or incident restore must record:

| Field             | Required value                                                                       |
| ----------------- | ------------------------------------------------------------------------------------ |
| Status            | `PASS`, `FAIL`, `NOT RUN`, or `HUMAN INPUT REQUIRED`                                 |
| Source/target     | Restricted project aliases and regions; no credentials                               |
| Recovery point    | UTC timestamp and backup type                                                        |
| Scope             | Database, Auth, Storage objects, Edge/configuration, integrations                    |
| Artifact identity | Source SHA, migration manifest hash, and build/function identities                   |
| Timing            | Started/completed UTC, measured RPO and RTO                                          |
| Validation        | Commands, counts, RLS results, object samples, and smoke results                     |
| Owners            | Operator, independent reviewer, incident commander, legal/privacy reviewer if needed |
| Residual gaps     | Missing objects/configuration, stale integrations, or human inputs                   |

After launch approval, the proposed cadence is monthly isolated restore and quarterly primary-loss
simulation. This cadence remains a proposal until named owners approve it.

References: Supabase [Database Backups](https://supabase.com/docs/guides/platform/backups),
[Restore to a new project](https://supabase.com/docs/guides/platform/clone-project), and
[CLI backup/restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).
