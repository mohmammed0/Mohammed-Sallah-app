# Customer experience architecture

Status: release-candidate redesign for independent review  
Branch: `codex/customer-experience-redesign-v1`  
Base: `codex/release-candidate-device-validation`

## Product architecture

The customer application remains part of the existing modular monolith. Presentation code
uses shared domain and localization contracts, Supabase remains authoritative, and the
provider experience continues to use its existing routes.

The redesign separates the customer journey into focused states:

```text
Customer tabs
├── Home
│   ├── active location
│   ├── notifications
│   ├── Supabase service catalog
│   ├── active request / new offers
│   ├── recent and common services
│   └── safety and support
├── My Requests
├── Messages
└── Account
    └── role switching

Home → category → optional subcategory → AI chat → location → timing → review
     → explicit approval → idempotent publication → success
```

The focused states are restored from the encrypted/chunked intake snapshot. The route is
protected by the existing session policy; the persisted `journeyStep` determines the
restored screen. Publication never happens as a side effect of AI completion.

## Design system

The mobile design system lives under `apps/mobile/src/design-system`:

- `tokens.ts`: semantic light and dark color schemes, typography, spacing, radii,
  elevation, icon sizes, touch targets, focus states, state opacity and motion durations.
- `rtl.ts`: deterministic Arabic/Urdu RTL and English/Hindi LTR helpers.
- `icon.tsx`: the maintained Lucide icon boundary and original service-icon mapping.
- `primitives.tsx`: safe-area and keyboard-aware screens plus low-level surfaces,
  actions, fields, notices, skeletons and progress.
- `customer-components.tsx`: consumer components including headers, tabs, service cards,
  chat, location, media, review and active-request patterns.

Visible strings use `@sallah/i18n` in Arabic, English, Urdu and Hindi. Android/iOS font
scaling remains enabled. Interactive controls use at least a 48-point touch target,
focus styling and semantic accessibility roles. Reduced motion resolves design-system
durations to zero.

## Catalog and category-first intake

Enabled categories and subcategories are queried from Supabase and localized by locale.
No hardcoded category list is authoritative. Selecting a category records a manual
customer choice and passes the confirmed category and optional subcategory through every
durable pending turn to the AI trust boundary. The AI may suggest a correction; it cannot
silently replace or publish the customer selection.

The AI conversation preserves:

- server-authoritative session history;
- `clientMessageId` across offline replay;
- turn-scoped image and voice bindings;
- one-time transcription claims;
- deterministic fallback and a best-available summary;
- explicit retry for failed transcription;
- explicit customer review and approval.

Camera, gallery and voice are separate intents. Quick replies can fill the composer, while
free text remains available.

## Location architecture

`CustomerLocationProvider` scopes the active saved-address identifier by authenticated
user. Exact coordinates are never logged. A transient, unsaved location can be active in
memory; only a saved address identifier is persisted locally.

The location picker:

1. explains foreground-only location use;
2. optionally uses a recent last-known position for a fast camera;
3. requests an accurate foreground position;
4. lets the customer move a fixed map pin;
5. reverse-geocodes only on explicit confirmation/current-location actions;
6. supports manual normalized address details;
7. selects, saves, defaults or archives owned addresses.

Publication copies the chosen address into an immutable `request_snapshot` row. Editing
or archiving a saved address cannot mutate an active or historical request. Exact
coordinates continue to use the existing request/location RLS boundaries and are not
available to unmatched providers.

### Maps configuration

- Android uses `react-native-maps` and requires a restricted preview Google Maps key
  outside Git for package `com.mohmammed0.sallah.preview`, restricted to the actual
  Preview certificate SHA-1.
- iOS uses Apple Maps by default for Preview.
- No background customer-location permission is requested.
- No paid Maps API or EAS build is activated by this pull request.

## Database and RLS

Migration `20260819123353_customer_saved_locations.sql` is forward-only. It adds
`addresses.address_kind` with `saved` and `request_snapshot`, normalizes the single
default-address invariant, and adds owner-authorized RPCs:

- `list_my_saved_addresses`
- `upsert_my_saved_address`
- `archive_my_saved_address`

The publication RPC resolves a saved address server-side, validates ownership, and creates
the immutable request snapshot in the same transaction as category, subcategory, timing,
media and approval state. Anonymous access is denied and authenticated users can operate
only on their own saved addresses. Existing provider location restrictions are unchanged.

## Provider impact

Provider routes and workflows are intentionally not redesigned. Shared changes are
additive and keep the existing provider screens on their prior components. Provider
visual redesign is tracked separately.

## Validation boundaries

Repository-controlled checks run in GitHub Actions. Physical GPS, real map rendering,
camera, microphone, keyboard, permission-settings round trips and screen-reader behavior
remain device gates. They must be recorded as NOT RUN until evidence exists. This work
does not start EAS, produce an APK, deploy Supabase or modify production secrets.
