# UI denylist

UI/design tools must not modify:

- `supabase/migrations/**`, `supabase/tests/database/**`, RLS or private schemas
- `supabase/functions/**` authorization/provider code and server secrets
- `services/media-scanner/**`, `infra/**`, capability/HMAC/attestation logic
- `packages/domain/**`, `packages/database/**`, privileged API contracts
- `packages/config/src/env.ts` or production validation
- `.github/**`, EAS/signing/deployment credentials, Docker security controls
- exact-location, matching, sealed-offer, moderation, identity/document,
  protected-media, privacy/export/deletion, payment, audit, or job-state logic
- service-role modules, S3/database credentials, worker secrets, environment files

Do not change backend behavior indirectly by adding direct table access,
client-side authorization, new enum strings, mock live success, or hidden skips.
Use the contract-change process instead.
