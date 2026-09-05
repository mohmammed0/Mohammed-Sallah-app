# Architecture summary

Sallah is a modular monolith. Expo and Next.js consume shared contracts;
Supabase Postgres is authoritative. RLS starts deny-by-default. Critical writes
use authenticated RPCs or Edge Functions with authorization, transactions,
idempotency/version checks, and audit events.

```text
Mobile / Web presentation
        ↓ typed controllers and view models
Shared API, domain, config, i18n contracts
        ↓ publishable client or authenticated request
Supabase RLS + transactional RPCs + Edge Functions
        ↓ short-lived capabilities only
Storage / OpenAI / outbound scanner / Expo push
```

Private media enters quarantine, is claimed by one outbound worker, scanned and
sanitized, read back and verified, attested, then promoted server-side. The
worker receives no service-role, database, S3, or user credentials.

See the authoritative architecture documents under `docs/architecture`, the
[domain invariants](DOMAIN_INVARIANTS.md), and [security boundaries](SECURITY_BOUNDARIES.md).
