# User journeys

## Customer

`authenticate → select service → AI text/image/voice intake → confirm transcript
→ choose location/timing → review → publish → compare sealed offers → select
provider → message → track job/change orders → accept or dispute completion → rate`

Recovery paths include persisted drafts, session refresh, offline/retry states,
safe provider-unavailable projection, support, export, and account deletion.

## Provider

`authenticate → onboard → upload scanned documents → verification/service review
→ availability/area → eligible feed → authorized translated brief → submit offer
→ selection → message → authorized location → job transitions → completion evidence`

Exact customer location remains hidden until the authorized job state.

## Operations

`authenticate with staff role → permission-scoped queue → review evidence →
execute audited command → observe categorical result/retry/dead-letter state`.

UI tools must preserve these transitions and may not invent new status values.
