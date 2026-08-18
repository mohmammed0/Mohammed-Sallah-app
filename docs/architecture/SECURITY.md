# Security architecture

```mermaid
flowchart TB
  Anonymous --> Public["Public pages + published legal docs"]
  Authenticated --> Own["Own profile/addresses/requests"]
  MatchedProvider --> Approx["Matched brief + approximate area"]
  SelectedProvider --> Exact["Selected job + exact address"]
  Operator --> Role["Role-specific admin queues"]
  Role --> Audit[("append-only admin audit")]
  Secret["Service/AI secrets"] --> Server["Edge/server only"]
  Server --> DB[("RLS + RPC command boundary")]
```

```mermaid
sequenceDiagram
  User->>App: password reauthentication
  App->>Edge: reauthenticate
  Edge->>DB: record session-scoped reauthentication
  App->>DB: request_account_deletion
  DB->>DB: mark deletion_pending + revoke push tokens
  DB->>Queue: schedule deletion workflow
  Queue->>Storage: delete eligible private objects
  Queue->>DB: delete or anonymize by retention matrix
  DB->>Audit: completion/failure category
  DB-->>User: private status/export reference
```

Controls combine TLS/provider infrastructure, Supabase Auth, RLS, private buckets, owner-prefixed paths, short signed URLs, security-definer functions with fixed search paths, append-only event triggers, structured validation, CSP/security headers, rate limits, audit trails, dependency/secret scans, and cross-role tests. Residual production risks are documented in the threat model.

High-risk privacy commands require a recent server-recorded reauthentication bound to the current Auth session; JWT issue time alone is insufficient. Blocked deletion requests retain a blocker snapshot, notify the account owner, and are reconciled under row locks until blockers clear. The privacy worker paginates storage ownership to exhaustion and cannot mark completion while any owned object remains.

Admin authorization is permission-based and evaluated on every server loader/action against an active profile plus non-revoked role assignments. Aggregate analysts receive no PII, exact-location access is a separate permission, and role revocation takes effect without relying on a stale client claim.
