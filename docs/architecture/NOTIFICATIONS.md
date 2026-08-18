# Notifications

Business transactions insert deduplicated rows into `notification_outbox`. A worker claims pending rows, applies preferences/quiet hours, dispatches configured channels, and appends attempts/delivery results. Missing push/email credentials disable the channel rather than fabricate success.

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

Provider match, new offer, selection, schedule/state, message, change order, completion, support, and dispute events use deterministic deduplication keys. Push tokens are private, revocable, and removed during deletion processing.
