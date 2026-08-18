# Architecture overview

SALLAH is a low-operations modular monolith. Expo and Next.js consume shared TypeScript contracts and one Supabase/PostgreSQL authority. Domain commands remain transactional RPCs or authenticated Edge Functions; no client can bypass RLS.

```mermaid
flowchart LR
  C["Customer / Provider"] --> M["Expo iOS + Android"]
  P["Public visitor / Operator"] --> W["Next.js web + admin"]
  M --> S["Supabase API/Auth/Realtime/Storage"]
  W --> S
  S --> D[("PostgreSQL + PostGIS + RLS")]
  S --> E["Edge Functions"]
  E --> A["Approved AI provider"]
  E --> N["Notification providers"]
```

```mermaid
flowchart TB
  subgraph Clients
    Mobile["apps/mobile"]
    Web["apps/web"]
  end
  subgraph Shared
    Domain["domain + schemas"]
    API["API contracts"]
    DBTypes["generated DB types"]
    I18n["Arabic/English/Urdu/Hindi"]
    Config["brand + environment"]
  end
  subgraph Backend
    Auth["Supabase Auth"]
    DB[("Postgres/PostGIS")]
    Storage["Private Storage"]
    Realtime["Realtime"]
    Functions["Deno Edge Functions"]
  end
  Mobile --> Shared
  Web --> Shared
  Clients --> Auth
  Clients --> DB
  Clients --> Storage
  Clients --> Realtime
  Clients --> Functions
  Functions --> DB
```

Scale for 20,000 registered users comes from indexed relational queries, capped feeds, PostGIS indexes, outbox workers, private object storage, and stateless clients—not microservices. Costly providers remain feature-gated.
