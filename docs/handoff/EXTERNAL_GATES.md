# External gates

The complete authoritative register is
[`docs/release/EXTERNAL_RELEASE_GATES.md`](../release/EXTERNAL_RELEASE_GATES.md).
This short handoff index intentionally does not duplicate gate details.

| Boundary                     | Current classification | Authoritative evidence                                         |
| ---------------------------- | ---------------------- | -------------------------------------------------------------- |
| Physical Android and sensors | NOT RUN                | [External release gates](../release/EXTERNAL_RELEASE_GATES.md) |
| Apple/iOS/TestFlight         | HUMAN INPUT REQUIRED   | [Human inputs](HUMAN_INPUTS_REMAINING.md)                      |
| Legal/privacy/OSS/store      | HUMAN INPUT REQUIRED   | [External release gates](../release/EXTERNAL_RELEASE_GATES.md) |
| Backup/monitoring drills     | NOT RUN                | [Operations documents](../operations/BACKUP_AND_RECOVERY.md)   |
| Production rollout           | HUMAN INPUT REQUIRED   | [Deployment contract](../DEPLOYMENT.md)                        |

Closing GitHub issues, merging an integration PR, or creating the handoff tag does not
convert any row to `PASS`. Only evidence from the named target and approving
owner may change a gate status.
