# Payment architecture

The launch-safe default is payment after physical service, represented as an `offline` payment and immutable ledger events. No gateway capture, escrow, payout, VAT/ZATCA, or settlement success is claimed without real configuration and legal/finance approval.

```mermaid
flowchart LR
  Selection["Offer selected"] --> Payment["Provider-neutral payment record"]
  Payment --> Offline["Offline/post-service mode"]
  Payment -. future configured adapter .-> Gateway["Authorized gateway"]
  Gateway --> Webhook["Signature + idempotent webhook"]
  Offline --> Events[("append-only payment events")]
  Webhook --> Events
  Events --> Fees["versioned fee rule"]
  Fees --> Settlement["settlement cannot exceed capture"]
  Events --> Refund["refund/reversal"]
  Dispute["Dispute"] --> Hold["financial hold"]
```

All values are integer minor units. Settlement guards compare gross settlement with captured-minus-refunded events. Payout tables store provider tokens/references only, never raw card or bank credentials.
