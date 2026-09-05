# Security boundaries

## Client boundary

Mobile/browser code may contain only publishable Supabase configuration and
restricted public Maps/Firebase app configuration. It must never receive
service-role, OpenAI, scanner HMAC/attestation, S3, database, signing, or worker
credentials.

## Backend boundary

RLS is deny-by-default. Privileged functions use fixed safe search paths,
authenticated identity, role/ownership checks, transactions, idempotency,
version checks, and audit events. UI hiding is not authorization.

## Scanner/storage boundary

The worker is outbound-only and receives short-lived exact capabilities. HMAC,
nonce, lease, deadline, worker binding, readback verification, attestation, and
server-side promotion must remain intact. Redirects and arbitrary origins/paths
remain denied.

## UI-tool boundary

Run `pnpm ui:boundaries`. Claude/Figma must follow the allowlist and denylist.
Functional contract changes use a separate reviewed request.
