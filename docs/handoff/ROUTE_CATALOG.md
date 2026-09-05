# Route catalog

## Expo Router

- Shared: `/`, `/auth`, `/auth-recovery`, `/auth-callback`, `/notifications`,
  `/support`, `/account`, `/locations`, `/messages`, `/jobs`, `/offers`, `/requests`.
- Customer tabs: `/(customer)/customer-home`, `customer-requests`,
  `customer-messages`, `customer-account`.
- Provider tabs: `/(provider)/provider-home`, `provider-feed`, `provider-jobs`,
  `provider-messages`, `provider-account`.
- Focused flows: `/request/new`, `/flow/[screen]`, `/provider/onboarding`,
  `/provider/feed`, `/provider/offer`, `/provider/earnings`.

The root layout owns product-area protection. Tab trees stay static while
mounted. Deep links still require session, role, and server authorization.

## Next.js

- Public: `/`, `/[locale]`, `/[locale]/[slug]`, `/[locale]/account-deletion`,
  `/login`, `/forbidden`.
- Admin: `/admin`, `/admin/customers`, `/admin/providers`, `/admin/requests`,
  `/admin/jobs`, `/admin/catalog`, `/admin/moderation`, `/admin/support`,
  `/admin/finance`, `/admin/audit`, `/admin/enforcement/customers/[reportId]`.
- Server routes: `/api/health`, `/api/account/deletion`.

Route names are contracts. Visual work may change composition, not protection,
ownership, or deep-link authorization.
