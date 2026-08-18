# Idempotency contract

Critical marketplace commands canonicalize the request JSON, acquire a transaction-scoped advisory
lock over actor/command/key, and store the request hash and authoritative response in
`idempotency_keys`. Same key plus same completed payload returns the original entity. Same key plus a
different hash raises `IDEMPOTENCY_KEY_CONFLICT`. A visible processing row returns
`IDEMPOTENCY_COMMAND_IN_PROGRESS`; the mutation is not executed twice.

Database command failure follows **rollback and safe retry**. Business writes and a newly created
processing idempotency row are in the same PostgreSQL transaction, so an exception rolls both back.
The caller retries the original payload and key. The repository does not claim that an ordinary
failing command persists a `failed` row outside its rolled-back transaction; the legacy failed-row
fields are not part of the production retry guarantee.

Mobile creates a secure, user-scoped mutation journal before its first network request. Every entry
has an explicit `pending`, `retryable`, `terminal_failed`, `completed`, or `abandoned` lifecycle.
Only pending/retryable response-loss scenarios preserve the original UUID key and canonical payload.
Network failures, timeouts, and `IDEMPOTENCY_COMMAND_IN_PROGRESS` are retryable; validation,
authorization, version, expiry, and business-rule failures are terminal. A terminal/abandoned entry
may be replaced by a new logical mutation and key, while a different payload presented during a
pending operation is rejected visibly rather than silently replaying stale input. The confirmed
server result is durably recorded before cleanup. Journals are encrypted, isolated by authenticated
user, bounded to 64 entries, and cleaned after seven days.

Every browser mutation form renders a fresh `commandIntentId`. Browser duplicate submission and
response-loss replay retain that form-instance ID, while a later form render receives a new ID even
when the business payload is identical. Server actions hash the intent ID with the fully normalized
payload. Defaults such as support-assignment expiry are calculated before hashing, then the exact
same value is sent to PostgreSQL on every retry.

Concurrent local integration scenarios deliberately discard responses and issue parallel
publication, offer-selection, and completion-rejection calls. They assert one request, one job, one
completion attempt/decision, and one dispute respectively, with append-only events retained.
