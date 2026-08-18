# Backup and recovery

Proposed controlled-launch targets (require owner approval): RPO 24 hours and RTO 8 hours. Enable managed daily database backups/PITR if the chosen plan supports it; separately preserve private object storage metadata/objects, Edge configuration, migration history, and encrypted secret inventory. Never put raw backups in the repository.

Monthly: restore the latest backup into a new isolated project, apply any missing forward migrations, validate row counts/FKs/RLS, sample private objects, run pgTAP, and record duration/evidence. Quarterly: simulate loss of the primary project and rotate recovery credentials.

During recovery, freeze writes/disable clients, identify a trusted recovery point, restore into a new project, validate before DNS/client cutover, rotate JWT/service/webhook credentials, reconcile outbox/payment events, and communicate scope. Never overwrite the only recoverable copy. Account for PostGIS, auth schema, storage metadata, and encrypted provider references.
