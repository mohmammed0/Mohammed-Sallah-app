# Notifications

Business transactions insert deduplicated rows into `notification_outbox`. The push worker claims
leased rows, applies preferences, sends a fixed privacy-safe route envelope through Expo, verifies
receipts, and records bounded attempts or dead letters. Missing credentials fail closed rather than
fabricating delivery.

```mermaid
flowchart LR
  Event["Committed domain event"] --> Outbox[("notification_outbox")]
  Outbox --> Claim["Worker claim/lease"]
  Claim --> Prefs["Preferences + quiet hours"]
  Prefs --> InApp["In-app"]
  Prefs --> Push["Expo/APNs/FCM if configured"]
  Prefs --> Email["SMTP if configured"]
  InApp --> Result[("attempts + delivery events")]
  Push --> Result
  Email --> Result
  Result --> Retry["bounded retry / dead letter"]
```

Provider match, new offer, selection, schedule/state, message, change order, completion, support, and
moderation events use deterministic deduplication keys. Payloads contain no message text, address,
document, user identity, or arbitrary URL. Push tokens are AES-256-GCM encrypted, hash-indexed,
limited to ten active installations, rotated atomically, revocable per device or account, and removed
during deletion processing. Notification opens map only to fixed routes and are authorized again
against the current session and role.
