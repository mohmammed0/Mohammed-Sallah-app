# API contracts

The database and Edge implementation are authoritative; this catalog is an
orientation map, not a replacement schema.

## Transactional RPC families

- Session/profile: `get_session_context`, `set_active_role`, saved-address and
  service-location commands.
- Marketplace: `publish_service_request`, `run_matching`,
  `get_provider_request_brief`, `submit_offer`, `get_customer_offers`,
  `select_offer`.
- Job: `transition_job`, `create_change_order`, `decide_change_order`,
  cancellation/dispute commands, `submit_completion`, `accept_completion`.
- Communication/trust: `send_message_with_attachments`, support, report/block
  contracts, clean-media authorization.
- Privacy/operations: export/deletion claims, provider review, health, financial
  confirmation, notification delivery claims/completion.

## Edge Functions

`ai-diagnostic`, `transcribe`, `translate-provider-brief`, `scan-upload`,
`scanner-control`, `media-access`, `notification-worker`, `push-devices`,
`privacy-worker`, and `reauthenticate`.

Callers must use generated database types and shared Zod schemas. Never infer
authorization from a successful UI transition or use a private table as a
replacement for an RPC.
