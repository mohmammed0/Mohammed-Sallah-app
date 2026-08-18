# AI architecture

The mobile client sends bounded customer turns to the authenticated `ai-diagnostic` Edge Function.
The server ignores client-authored assistant messages as authority, restores the ordered server history,
and persists each authoritative assistant reply under an owned `ai_session`. Stable
`clientMessageId` values make customer turns replay-safe. The client encrypts the active draft,
pending turns, temporary fallback messages, and media bindings locally; after reconnect or restart it
restores the server session, replays missing customer turns sequentially, and reconciles temporary
messages with server replies without duplicating turns.

For clean `request_media` images, the function verifies ownership/status, downloads the private
object server-side, rechecks the byte limit and detected MIME signature, and passes base64 image
content through a provider-neutral multimodal contract. Private storage URLs and quarantine objects
never enter the provider request. The OpenAI adapter uses Responses API `input_image` content, has
an explicit vision-capability switch, and keeps production credentials server-only. At most four
images, 10 MiB each and 20 MiB total, are accepted. A configured text-only model produces the
deterministic editable fallback instead of silently dropping images.

```mermaid
sequenceDiagram
  Customer->>Mobile: text / clean photo context
  Mobile->>Mobile: encrypt pending turn + stable clientMessageId
  Mobile->>Edge: authenticated customer turn + media IDs
  Edge->>DB: lock/restore owned session + deduplicate customer turn
  Edge->>Storage: authorize + download clean private images
  Edge->>Edge: recheck image bytes and MIME signature
  Edge->>DB: consume rate limit + prompt version
  alt configured model supports supplied modality
    Edge->>AI: text + inline image content + structured schema
    AI-->>Edge: JSON output
  else unavailable/invalid/budget/text-only model
    Edge->>Edge: deterministic safe fallback
  end
  Edge->>DB: usage + prompt/vision/fallback metadata
  Edge->>DB: append authoritative assistant reply
  Edge-->>Mobile: schema-validated editable draft
  Mobile->>Mobile: reconcile temporary reply + clear pending turn
  Customer->>Mobile: edit + explicit approval
  Mobile->>DB: publish_service_request
```

`confirmedCategorySlug` and `summaryRequested` are explicit prompt inputs, not metadata-only hints.
The active database prompt declaration and diagnostic metadata use `diagnostic-v3`. AI never
publishes, quotes a guaranteed price, diagnoses with certainty, or replaces emergency guidance.
Publishing requires a separate customer-owned request command with explicit approval; successful
publication then links the AI session to that request. Invalid provider output, provider failure,
network interruption, and unsupported vision produce a schema-validated deterministic fallback that
remains editable and manually publishable. Safety flags show conservative immediate guidance and
escalate to manual review. Original content, translations, customer edits, media bindings, and
provider-generated output remain separate.

## Provider brief translation

`translate-provider-brief` authorizes the current provider against an unexpired match and derives the target locale from that provider profile. It translates only local test data today: the deterministic adapter is visibly marked and disabled in production. The original brief is always shown; category/city identifiers, urgency, requested time, and request version are copied from the source after translation and cannot be translation-authored. Results and failures are stored with a content hash, locale pair, adapter version, and status. Connecting any external translation processor is intentionally blocked until the data-processing terms, payload fields, retention, region, and customer/provider notices receive human approval.
