# UI allowlist

Claude may modify these paths for an approved visual slice:

- `apps/mobile/src/components/**`
- `apps/mobile/src/design-system/**`
- presentation-only files under `apps/mobile/src/features/**`
- route composition/style/accessibility in `apps/mobile/app/**`, provided data
  access, navigation protection, and commands remain unchanged
- `apps/web/src/components/**`
- presentation markup/style in `apps/web/app/**`, provided server authorization
  and API routes remain unchanged
- `packages/i18n/**` for complete ar/en/ur/hi visible-string parity
- `docs/design/**`, UI tests, snapshots, and approved licensed assets

Existing mixed route/controller files are conditional, not blanket permission.
Extract visual composition without changing queries, RPCs, effects, route guards,
status logic, or error mapping. Run UI boundaries and affected tests.
