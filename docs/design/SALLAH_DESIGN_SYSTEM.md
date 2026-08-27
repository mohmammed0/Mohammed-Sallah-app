# Sallah Design System

## Design direction

Sallah is a **Saudi Premium Service Marketplace**: calm, trustworthy,
considered, and operationally clear. The design should feel premium through
space, typography, surface quality, and consistent behavior—not ornamental
luxury, copied marketplace visuals, or excessive motion.

Arabic is the source design language. English, Urdu, and Hindi use the same
semantic system and component behavior while respecting their reading direction
and font metrics. Every user-visible string is supplied through shared
localization keys.

## Foundations

### Color tokens

Use semantic tokens rather than raw color values in product code. Exact values
are owned by the implementation theme.

| Token group | Tokens                                                                                 | Intended use                                                      |
| ----------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Brand       | `brand.primary`, `brand.onPrimary`, `brand.accent`                                     | Primary action and carefully limited emphasis.                    |
| Surface     | `surface.canvas`, `surface.raised`, `surface.sunken`, `surface.inverse`                | Layering, cards, sheets, and navigation surfaces.                 |
| Content     | `content.primary`, `content.secondary`, `content.tertiary`, `content.inverse`          | Reading hierarchy; never use disabled color for explanatory copy. |
| Border      | `border.subtle`, `border.strong`, `focus.ring`                                         | Grouping and keyboard/focus visibility.                           |
| Feedback    | `status.success`, `status.warning`, `status.danger`, `status.info` and each `onStatus` | State communication paired with text/icon/semantics.              |

Contrast must remain sufficient in normal, selected, disabled, high-text-scale,
and dark-surface contexts. Color never acts as the sole status or validation
signal.

### Type and spacing

- Use a readable Arabic-capable typeface with strong numeral rendering.
- Define semantic roles: `display`, `title`, `section`, `body`, `bodyStrong`,
  `label`, `caption`, and `price`—not screen-specific font sizes.
- Prefer a 4-point spacing scale: `space.1` through `space.12`; favor generous
  section separation over decorative containers.
- Currency, dates, and quantities are localized. Financial values originate as
  integer SAR minor units and are formatted only at the presentation boundary.

### Shape, elevation, and motion

- Use a small, intentional set of radii: compact controls, cards, and sheets.
- Elevation communicates hierarchy; avoid stacking shadows on every card.
- Motion confirms a user action, preserves spatial context, and respects reduce
  motion settings. Never make status comprehension depend on animation.

## Component contract

### Buttons and controls

- One primary action per decision area. Secondary actions are visibly secondary;
  destructive actions require a danger treatment and appropriate confirmation.
- Minimum comfortable hit area is 44 by 44 pt-equivalent where platform
  conventions permit. Icon-only controls require an accessible label.
- Loading buttons retain their label or expose an equivalent accessible busy
  state; prevent duplicate critical submissions with idempotent server commands.

### Cards, lists, and summaries

- Cards group one actionable unit, not arbitrary decoration.
- A service/request card exposes title, key trust signal, status, relevant
  timing, and one next action. Do not show unauthorized price/location/offer
  data.
- Lists use stable ordering and explicit empty, loading, retry, and error states.

### Forms and validation

- Place a persistent label above or adjacent to each input; placeholders are
  examples, not labels.
- Validate at the trust boundary and show safe, localized field-level errors.
- Associate errors, hints, and required state with the input programmatically.
- Do not rely on red borders alone; add text, an icon where helpful, and screen
  reader announcements for significant changes.

### Navigation

- Top-level destinations are stable and use short localized labels.
- Back returns to the expected previous context; modal flows are temporary,
  self-contained tasks with a clear dismissal path.
- Keep transactional actions out of navigation components. Deep links must lead
  to a valid authorized state or a safe explanation.

## Marketplace states

The UI must map backend-authoritative states to user language without inventing
new client-only truth. Names below are presentation categories; the domain model
and authorization rules remain authoritative.

| Category                      | User-facing purpose                                                   | Required treatment                                       |
| ----------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------- |
| Draft / needs input           | Explain what is missing before a request can proceed.                 | Field guidance and a clear continue action.              |
| Submitted / matching          | Confirm receipt and explain the next expected event.                  | Timestamp, contextual reassurance, non-blocking refresh. |
| Offers available              | Invite permitted comparison without revealing competing private data. | Count, selection criteria, accessible offer list.        |
| Provider selected / scheduled | Confirm counterpart, service details, and permitted location/timing.  | Summary, change/cancel policy, support path.             |
| In progress                   | Clarify current responsibility and expected completion.               | Plain-language state and non-map-dependent progress.     |
| Completed                     | Close the service and provide a receipt/review/support route.         | Confirmation plus accessible summary.                    |
| Cancelled / expired / failed  | State what happened and safe recovery options.                        | Reason where authorized, retry/reopen/support action.    |

## RTL and LTR

- Design with logical `start`/`end`, not physical `left`/`right`.
- Mirror directional icons and progress direction when their meaning is spatial;
  do not mirror universally recognized non-directional symbols.
- Use bidi-safe placement for phone numbers, SAR amounts, codes, and mixed
  Arabic/Latin service names. Test truncation and line wrapping in all locales.
- Verify tabs, back affordances, sheets, swipe actions, carousels, and animated
  transitions in both RTL and LTR. Do not force RTL in production.

## Accessibility baseline

- Every control has an accessible name, role, state, and hint when needed.
- Selection, disabled, expanded, busy, and error state are exposed to TalkBack,
  VoiceOver, and keyboard users.
- Dynamic offer/status updates use an appropriate polite announcement; critical
  failures can use assertive treatment sparingly.
- Preserve visible focus indication, logical focus order, keyboard operability,
  and adequate target size/spacing.
- Support dynamic type/text scaling without clipping controls or hiding price,
  status, or confirmation content.
