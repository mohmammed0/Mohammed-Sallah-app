# Privacy boundaries

- Exact locations are customer-owned and disclosed only at an authorized job state.
- Provider identity documents, completion evidence, messages, support/dispute
  evidence, and private media remain in protected Storage with purpose checks.
- Push payloads contain fixed safe destinations, never message text, exact
  addresses, document paths, or signed capabilities.
- Logs use bounded correlation IDs and categorical errors; they exclude PII,
  media, prompts, tokens, URLs, paths, and secrets.
- AI receives only authorized scanner-clean media and bounded text; raw media is
  not logged.
- Export and deletion use dedicated commands, reviewer scopes, retention rules,
  and audit evidence.
- Fixtures and UI catalogs use synthetic identities and no real coordinates.

See `docs/privacy` for data flow, inventory, retention, and store disclosures.
