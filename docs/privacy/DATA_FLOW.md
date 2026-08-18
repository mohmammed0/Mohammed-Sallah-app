# Data flow

```mermaid
flowchart LR
  User --> Client["Expo / browser"]
  Client --> Auth["Supabase Auth"]
  Client --> DB[("RLS database")]
  Client --> Private["Private object storage"]
  Client --> Edge["Authenticated Edge Functions"]
  Edge --> AI["Approved AI provider"]
  DB --> Outbox["Notification outbox"]
  Outbox --> Channels["Configured push/email only"]
  Operator --> Admin["Server-authorized admin"]
  Admin --> DB
  DB --> Export["Private expiring export"]
  DB --> Delete["Deletion/anonymization workflow"]
```

The AI path receives only needed diagnostic content; original data is not overwritten. Exact location bypasses matching/provider briefs and becomes readable only after offer selection. Private objects use owner-prefixed keys and temporary access. Production subprocessors and regional transfer decisions are human/legal inputs.
