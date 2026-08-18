# Data model

The schema is migration-only and uses UUID keys, UTC timestamps, integer SAR minor units, explicit enums/checks/FKs, partial/composite/GiST indexes, version fields, idempotency keys, and append-only sensitive events. Generated TypeScript lives in `packages/database/src/database.types.ts`.

```mermaid
flowchart LR
  Profile --> Address
  Profile --> ProviderProfile
  Profile --> ServiceRequest
  Catalog --> ServiceRequest
  ServiceRequest --> Match
  Match --> Offer
  Offer --> Job
  Job --> Conversation
  Job --> ChangeOrder
  Job --> CompletionProof
  Job --> Payment
  Payment --> Settlement
  Job --> Dispute
```

```mermaid
stateDiagram-v2
  [*] --> draft
  draft --> approved
  approved --> published
  published --> matching
  matching --> receiving_offers
  receiving_offers --> provider_selected
  receiving_offers --> cancelled
  receiving_offers --> expired
  provider_selected --> [*]
```

```mermaid
sequenceDiagram
  Customer->>DB: select_offer(offer, idempotency)
  DB->>DB: lock offer + customer request
  DB->>DB: select one; reject competitors
  DB->>DB: create job + assignment + offline payment
  DB->>DB: create conversation members
  DB-->>Customer: job id
```

Exact address records are separate from approximate PostGIS points. Providers match on rounded/approximate geography and cannot read address rows until selected. Offers are row-sealed; customer-safe provider facts come from a whitelisted RPC.
