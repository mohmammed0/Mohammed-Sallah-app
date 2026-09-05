# Mock and fixture guide

Use deterministic synthetic data only. The UI catalog source is
`apps/mobile/src/dev/ui-state-catalog.json`; generate the ignored local catalog
with `pnpm ui:catalog`.

Allowed mocks isolate external providers (OpenAI, Expo delivery, Maps renderer)
or narrow error branches. They may not replace the final authorization,
database, scanner, Storage, or marketplace integration evidence.

Fixtures must not contain real names, emails, passwords, coordinates, addresses,
documents, media, tokens, signed URLs, or customer content. Clearly label
provider-disabled, scanner-pending, offline, and deterministic results; never
call a mock live success. Production code must not import the dev catalog.
