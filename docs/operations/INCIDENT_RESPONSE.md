# Incident response

Severity: SEV-1 active cross-tenant/secret/financial compromise; SEV-2 material outage or bounded sensitive exposure; SEV-3 degraded/non-sensitive issue. The incident commander owns containment; security owns evidence; operations/support own communication; finance owns ledger reconciliation; legal decides notifications.

1. Detect and open a restricted incident record with UTC timeline/correlation IDs.
2. Contain: disable feature/provider, revoke sessions/tokens, rotate keys, block actors, hold settlements, preserve logs/backups.
3. Determine affected users, rows, objects, commands, time window, and data classes without copying sensitive values into tickets.
4. Eradicate via code/config/credential fix; review related RLS and idempotency boundaries.
5. Recover progressively, run security/DB/smoke/reconciliation tests, and monitor.
6. Notify users/regulators only under approved legal process; complete blameless review and tracked actions.

For location/offer/document leakage, immediately disable affected reads and signed URLs. For AI incidents, disable the real provider and use the deterministic fallback. For payment uncertainty, freeze financial automation; never infer capture from client state.
