# Local development

Prerequisites: Node 24 LTS, Corepack/pnpm 11.19.0, Docker Desktop, Supabase CLI 2.114.0, and Android Studio/Xcode only for native device work. k6 and Maestro are external validation CLIs and are never shipped with the application.

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
supabase start
supabase db reset
supabase status
pnpm dev
```

Use the local publishable key printed by `supabase status`; never copy its local secret key into `NEXT_PUBLIC_*` or `EXPO_PUBLIC_*`. The web app runs through Next.js and the mobile app through Expo. Local email is captured by Mailpit. Seed data includes catalog configuration plus deterministic local demo scenarios from `supabase/seed.demo.sql`; it must never be deployed as production data.

After migrations, run `supabase db reset`, `supabase test db`, regenerate types with `supabase gen types typescript --local`, and verify no diff remains. Stop with `supabase stop` when desired. Windows/WSL path issues are avoided by running all repository commands from one shell/runtime consistently.

## Local demo accounts

`supabase db reset` loads deterministic data from `supabase/seed.demo.sql`; that file is local-only and must never be applied to production. Seeded accounts use the `.invalid` domain. All passwords are non-recoverable random values except the operations admin, which has the explicitly local-only Playwright password `LocalE2E-Only!2026`. Never reuse that fixture outside the local reset database. For other interactive local sign-in, issue a local email OTP or set a temporary password through Supabase Studio:

| Role                                | Email                                |
| ----------------------------------- | ------------------------------------ |
| Customer                            | `customer.demo@example.invalid`      |
| Authorization-test customer         | `customer2.demo@example.invalid`     |
| Urdu-preference provider            | `provider.demo@example.invalid`      |
| Competing Hindi-preference provider | `provider2.demo@example.invalid`     |
| Suspended provider                  | `provider.suspended@example.invalid` |
| Operations admin                    | `admin.demo@example.invalid`         |
| Support agent                       | `support.demo@example.invalid`       |
| Verification reviewer               | `reviewer.demo@example.invalid`      |

The seed includes a sealed-offer request, active job with pending change order, pending cancellation, completed/rated job, conversation, offline payment record, support case, dispute/financial hold, and in-app notifications. Set `TRANSLATION_PROVIDER=deterministic` only for local translation-contract testing; its output is visibly marked as test content.
