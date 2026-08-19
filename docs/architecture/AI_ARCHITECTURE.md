# AI architecture

The mobile client sends bounded customer turns to the authenticated `ai-diagnostic` Edge Function.
The server ignores client-authored assistant messages as authority, restores the ordered server history,
and persists each authoritative assistant reply under an owned `ai_session`. Stable
`clientMessageId` values make customer turns replay-safe. The client encrypts the active draft,
pending turns, temporary fallback messages, and media bindings locally; after reconnect or restart it
restores the server session, replays missing customer turns sequentially, and reconciles temporary
messages with server replies without duplicating turns.

Selected image and voice files are copied immediately from picker/cache locations into a
user-scoped app-private directory. The encrypted snapshot stores stable local media IDs and keeps
their association with one exact customer turn across restart. Active composer attachments are
separate from turn-owned and request-level media. Queuing a turn transfers its active media bindings
to that turn and clears the composer, so a following text turn cannot inherit an old voice recording
or transcript. Replacing an active attachment never deletes an object already owned by a pending
turn, and multiple pending offline turns retain distinct objects. The queue permits four retained
items, 10 MiB per item, 20 MiB total, and seven days of retention. Replay uploads and scans every
queued file before submitting its bound turn. Voice replay atomically claims the
`userId`/`clientMessageId` transcription job, uploads/scans, transcribes, persists the transcript,
and only then sends that authoritative transcript to the diagnostic assistant. Simultaneous callers,
timeouts, and restart cannot invoke the external transcription provider twice during the bounded
15-minute claim lease. A hard-crash lease becomes reclaimable rather than blocking the turn forever,
and its ownership token prevents a stale worker from overwriting the retry. Failure releases the
claim and leaves the voice turn queued with an explicit in-session retry
path; it never replays a generic recording label. Successful atomic publication binds the final
transcription jobs and separately retained request attachments, then deletes the snapshot and local
files.
Offline explicit draft deletion removes local state/media immediately and queues server-session
abandonment for the next connection. Replacing retained media deletes the superseded object and index
entry.

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
  Mobile->>Mobile: reconcile reply + consume this turn's active attachment
  Customer->>Mobile: confirm/correct category + approve
  Mobile->>DB: publish_service_request(session, media, approval snapshot)
  DB->>DB: request + clean media + AI/transcription links atomically
```

`confirmedCategorySlug` and `summaryRequested` are explicit prompt inputs, not metadata-only hints.
The active database prompt declaration and diagnostic metadata use `diagnostic-v3`. AI never
publishes, quotes a guaranteed price, diagnoses with certainty, or replaces emergency guidance.
The UI keeps suggested, selected, and customer-confirmed category state separate. The initial AI
suggestion is null; only an authoritative diagnostic can populate it. Selection records `manual`,
`ai_suggestion`, or `customer_correction` truthfully and survives restart. Publishing requires a
separate customer-owned command with explicit category confirmation
and approval. The transaction creates the request, binds clean request media, links diagnostics and
applicable transcriptions, records the approval snapshot, and marks the owned active session
published. Invalid provider output, provider failure,
network interruption, and unsupported vision produce a schema-validated deterministic fallback that
remains editable and manually publishable. Safety flags show conservative immediate guidance and
escalate to manual review. Original content, translations, customer edits, media bindings, and
provider-generated output remain separate.

## Provider brief translation

`translate-provider-brief` authorizes the current provider against an unexpired match and derives the target locale from that provider profile. It translates only local test data today: the deterministic adapter is visibly marked and disabled in production. The original brief is always shown; category/city identifiers, urgency, requested time, and request version are copied from the source after translation and cannot be translation-authored. Results and failures are stored with a content hash, locale pair, adapter version, and status. Connecting any external translation processor is intentionally blocked until the data-processing terms, payload fields, retention, region, and customer/provider notices receive human approval.


## Category-first customer intake

The customer chooses and confirms the broad category before the AI conversation. The optional
subcategory is persisted with the encrypted intake snapshot and every queued turn. Both confirmed
slugs cross the Edge Function schema and are included in the server prompt as trusted application
context outside the untrusted complaint envelope. This prevents the assistant from needlessly
rediscovering the selected service while preserving its ability to recommend a correction.

Camera, gallery and voice remain turn-scoped. Offline replay preserves `clientMessageId`, media
bindings and category/subcategory context. AI completion only makes a best-available structured
summary available for review; it never publishes a request. Location, timing, customer edits and
explicit approval are separate focused states, and publication continues through the durable
idempotent mutation journal.
