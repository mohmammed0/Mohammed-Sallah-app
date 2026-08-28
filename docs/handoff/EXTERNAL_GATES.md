# External gates

| Gate                         | Status               | Required evidence                                                            |
| ---------------------------- | -------------------- | ---------------------------------------------------------------------------- |
| Production Supabase/Edge     | NOT RUN              | approved project, domains, secrets, migration plan, rollback, smoke          |
| Production scanner           | NOT RUN              | region/TLS/private network, secrets, monitoring, load/canary, legal approval |
| Physical Android device      | NOT RUN              | install, Push receipt/tap, GPS, camera/audio/media, restart/offline matrix   |
| iOS build/device             | HUMAN INPUT REQUIRED | active Apple team/signing and available device/TestFlight access             |
| Google Play / App Store      | NOT RUN              | legal/privacy/store metadata, screenshots, review accounts, owner submission |
| Legal/privacy                | HUMAN INPUT REQUIRED | entity, terms/privacy, retention, subprocessors, GPL and store disclosures   |
| Production monitoring/backup | HUMAN INPUT REQUIRED | destinations, ownership, RPO/RTO approval, restore and alert drills          |

No engineering check may convert these gates to PASS without the named external evidence.
