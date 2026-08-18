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
  User->>App: recent authenticated deletion request
  App->>DB: request_account_deletion
  DB->>DB: mark deletion_pending + revoke push tokens
  DB->>Queue: schedule deletion workflow
  Queue->>Storage: delete eligible private objects
  Queue->>DB: delete or anonymize by retention matrix
  DB->>Audit: completion/failure category
  DB-->>User: private status/export reference
```

Controls combine TLS/provider infrastructure, Supabase Auth, RLS, private buckets, owner-prefixed paths, short signed URLs, security-definer functions with fixed search paths, append-only event triggers, structured validation, CSP/security headers, rate limits, audit trails, dependency/secret scans, and cross-role tests. Residual production risks are documented in the threat model.
