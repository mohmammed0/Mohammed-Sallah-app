# UI state matrix

The development-only source is `apps/mobile/src/dev/ui-state-catalog.json`.
Run `pnpm ui:catalog` to generate an ignored local HTML catalog; it performs no
network request and contains only synthetic descriptions.

| Family              | Required states                                                         |
| ------------------- | ----------------------------------------------------------------------- |
| Data                | loading, ready, empty, error, slow network, retrying                    |
| Authorization/trust | forbidden, blocked, suspended, expired, conflict                        |
| Providers           | AI unavailable, scanner pending, upload rejected, notification disabled |
| Device              | location denied, keyboard open, small phone, large phone, large text    |
| Content             | long text, missing media                                                |
| Locale              | Arabic RTL, English LTR, Urdu RTL, Hindi LTR                            |

Fixtures must remain synthetic-only and development-only. A design state must
not bypass RLS, create a live user, or represent a deterministic provider as a
live external success.
