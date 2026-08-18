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

Mobile creates a secure, user-scoped journal entry before its first network request. The entry holds
one UUID key and the canonical original payload for up to seven days, is bounded to 64 items, survives
restart/timeout/response loss, and is removed only after an authoritative server response. Retries
execute the persisted payload, not mutable screen state. Browser support and finance forms derive
stable SHA-256 keys from the authenticated action payload so ordinary resubmission reuses the same
logical command.

Concurrent local integration scenarios deliberately discard responses and issue parallel
publication, offer-selection, and completion-rejection calls. They assert one request, one job, one
completion attempt/decision, and one dispute respectively, with append-only events retained.
