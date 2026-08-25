# Incident response

Severity: SEV-1 active cross-tenant/secret/financial compromise; SEV-2 material outage or bounded
sensitive exposure; SEV-3 degraded/non-sensitive issue. The incident commander owns containment;
security owns evidence; operations/support own communication; finance owns ledger reconciliation;
legal decides notifications.

## Minimum beta status

Use only these public operational states: `healthy`, `degraded`, `blocked`, and `recovering`. A status
record may contain the component, a safe category enum, a bounded correlation ID, attempt number,
duration, last successful UTC timestamp, and owner. It must not contain raw errors, stack traces,
email addresses, user or provider identifiers, URLs, signed queries, Storage paths, filenames,
documents, message content, exact location, media, or secrets.

The beta operator must be able to distinguish at least:

- mobile or web error-boundary activation;
- Edge/provider timeout, quota, unavailable, or invalid-response categories;
- scanner readiness, stale signatures, processing failure, and cleanup failure;
- push retry exhaustion/dead-letter categories;
- scheduler success, delay, and bounded failure.

Structured repository logs are the safe fallback when no monitoring vendor is approved. External
alert routing, on-call recipients, thresholds, and retention remain **HUMAN INPUT REQUIRED** and
must not be represented as active from repository instrumentation alone.

## Response

1. Detect and open a restricted incident record with UTC timeline/correlation IDs.
2. Contain: disable feature/provider, revoke sessions/tokens, rotate keys, block actors, hold settlements, preserve logs/backups.
3. Determine affected users, rows, objects, commands, time window, and data classes without copying sensitive values into tickets.
4. Eradicate via code/config/credential fix; review related RLS and idempotency boundaries.
5. Recover progressively, run security/DB/smoke/reconciliation tests, and monitor.
6. Notify users/regulators only under approved legal process; complete blameless review and tracked actions.

For location/offer/document leakage, immediately disable affected reads and signed URLs. For AI
incidents, disable the provider, preserve the customer's editable input, and show the explicit
provider-unavailable state; deterministic provider behavior is local/test evidence only and must not
be presented as a live result. For payment uncertainty, freeze financial automation; never infer
capture from client state.

## Rollback decision

- Application/web/Edge bytes: redeploy the last reviewed immutable artifact, then run the affected
  smoke checks against its exact SHA.
- Configuration: revert only to a previously approved version and rotate any credential whose
  confidentiality is uncertain.
- Database: stop affected writes and use a reviewed forward compensation migration. Do not edit or
  reverse an applied migration.
- Data loss or corruption: do not restore in place during diagnosis. Follow
  [Backup and recovery](BACKUP_AND_RECOVERY.md), restore into an isolated target, validate it, and
  obtain incident-owner approval before any cutover.

Every rollback record must include the decision owner, UTC decision time, source and target artifact
identity, affected component, expected data impact, validation command/evidence, and final status.
