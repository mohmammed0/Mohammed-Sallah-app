# Deployment

## Order

1. Provision separate preview/production Supabase projects and backups.
2. Review migrations in a disposable restored clone; apply forward-only migrations.
3. Provision the private pull-worker scanner, ClamD, image sanitizer, bounded FFmpeg remux runtime,
   private DNS, TLS,
   deny-by-default egress, continuous readiness, signature updates, and alerts. Do not deploy the
   local Compose topology as production infrastructure.
4. Configure Auth redirect allowlists, private buckets, Edge secrets, SMTP, rate limits, and least-privileged operator accounts.
5. Prove the scanner freshness, capacity, network, outbound-update, minimized-runtime-image, and alert
   gates before enabling upload promotion. The liveness endpoint alone is not ClamD readiness evidence.
6. Run production validation and full CI against the release commit.
7. Deploy Edge Functions only after the scanner is ready, then Next.js, then EAS preview builds; complete smoke/security checks.
8. Promote mobile builds only after device and store-review validation.

Never deploy `seed.sql` demo/test identities, local JWT secrets, or placeholder URLs. Web may be hosted on any Node-compatible platform; do not assume Vercel. Supabase service-role and AI keys belong only in provider secret stores. Online payment and SMS feature flags remain off until real credentials and reconciliation/runbooks are approved.

The repository/local M2V test uses real local Supabase Storage/PostgreSQL/Edge, the repository pull
worker, exact signed capabilities, and ClamD. Edge carries metadata only; the worker downloads and
uploads exact opaque attempt objects directly with Storage. The test proves the local contract but
does not provision a hosted scanner, private network, certificate, signature-update service, alerts,
or capacity. Hosted deployment, EAS, emulator, and physical-device validation remain **NOT RUN**.
Here, "Edge carries metadata only" is scoped to `scan-upload`, `scanner-control`, promotion, and scan
cleanup. `media-access` remains a live-authorized streaming broker. Provider transport in
`ai-diagnostic` and `transcribe` is an explicit M3 review gate before live provider activation.
Static JPEG/PNG/WebP are decoded and re-encoded. Approved M4A/MP4 audio and completion MP4 video are
remuxed with fixed-argument FFmpeg/FFprobe and reopened under codec, stream, duration, dimension, and
size bounds. WebM, PDF, archives, Office files, scripts, executables, and unknown formats remain
fail-closed. ClamAV is malware detection, not CDR.

Hosted activation also requires two Vault entries named
`sallah_media_scan_privacy_worker_url` and `sallah_media_scan_privacy_worker_secret`. The URL must be
the exact HTTPS privacy-worker function and the secret must be a distinct 32–256-byte server value.
The migration installs a 15-minute pg_cron dispatcher that fails closed when those entries are absent;
this repository run did not create the entries or activate the hosted schedule.

Rollback application code by redeploying the prior immutable artifact. Do not reverse a production migration destructively: stop writes/disable the affected feature, deploy a compensating migration, or restore to a new project after incident approval. See backup/recovery and release docs.
