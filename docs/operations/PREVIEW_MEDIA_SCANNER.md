# Preview media-scanner host contract

Status: **PREVIEW_SCANNER_HOST_REQUIRED**. This repository prepares a provider-neutral deployment
contract; it does not select, purchase, provision, or prove a hosted scanner.

## Required nonproduction resource

- Linux `amd64` host capacity must reserve at least 1 GiB for one pull worker, 4 GiB for ClamD, and
  separate operating-system/signature-updater headroom. Start with at least 6 GiB total host memory
  and no worker swap; measure before changing the one-job limit.
- Deploy the reviewed worker image by immutable registry digest through
  `SALLAH_SCANNER_WORKER_IMAGE`. The ClamAV image is already pinned in
  `infra/media-scanner/compose.preview.yaml`.
- Provision the signature volume for the container's fixed ClamAV identity (`100:101`) so only the
  updater can write it; ClamD mounts the same volume read-only.
- Persist only the ClamAV signature database. Worker inputs, remuxes, readbacks, and outputs stay on
  the private `0700` tmpfs and must be absent after every attempt or container stop.
- Put ClamD and the worker on `scanner-private`. It is an internal network and publishes no host
  port. Never expose TCP 3310.
- Pre-provision two external, deny-by-default egress networks: one allows only the reviewed DNS,
  TLS/CA, exact Preview scanner-control and Storage destinations; the other allows only the
  approved ClamAV signature-update destinations. Network-policy evidence must come from the chosen
  host; a Docker network name is not firewall proof.
- The pull worker has no inbound API or gateway. The exact scanner-control and Storage origins must
  be HTTPS, terminate at an approved TLS gateway, present the reviewed identity, and address the
  same nonproduction Supabase Preview project. Do not rewrite signed paths or queries.
- Generate distinct 32-256-byte control and attestation HMAC secrets in an approved external secret
  store. The host/orchestrator may stage them in a root-only directory, but must mount each file for
  only the fixed worker identity (`65532:65532`) at mode `0400`. They must not be Supabase
  publishable, service-role, S3, user, or database credentials.
- Keep `APP_ENV=preview`, external scanner mode, one active job, the 120-second attempt deadline,
  the five-second metadata timeout, and a maximum 24-hour signature age. Missing readiness or stale
  signatures must prevent claims.
- Continuous `freshclam` updates and a persistent signature-only volume are mandatory. Alert on
  update failure, ClamD readiness/freshness failure, repeated worker retries, cleanup failure, and
  the Supabase privacy-cleanup scheduler state.

## Activation sequence

1. Confirm the chosen project is nonproduction and record its region, operator, source SHA, worker
   image digest, rollback digest, and UTC activation window.
2. Provision the private signature volume and the two policy-enforced external egress networks.
   Prove private DNS, routes, firewall rules, TLS identity, and that no service/ClamD port is public.
3. Generate the two distinct HMAC secrets in the host secret store and configure the matching
   server-only Supabase Preview values. Never place values in Git, Compose environment, tickets, or
   logs.
4. Set the exact HTTPS Preview control/Storage origins and an opaque worker ID. Render
   `infra/media-scanner/compose.preview.yaml` and verify the resolved worker image contains an
   immutable digest before starting it.
5. Start signature bootstrap/update and require a successful ClamD `VERSION` readiness response.
   The worker independently validates signature freshness before every claim.
6. Enable the existing 15-minute privacy cleanup scheduler only after its separate Vault URL and
   secret are configured for Preview. Verify worker tmpfs, Storage staging, and database residue are
   empty after each bounded canary.
7. With synthetic non-user content only, run one EICAR denial, one clean image lifecycle, and one
   short clean audio lifecycle. Confirm scan, remux, attestation, server-side promotion, and cleanup.
8. Record PASS/FAIL honestly. A running container, PING-only response, deterministic scanner, or
   repository test is not hosted Preview activation evidence.

## Rollback

Stop new claims, keep quarantine fail-closed, roll back to the previously recorded immutable worker
digest, and retain only the signature database. Do not promote quarantined objects manually. Rotate
the dedicated HMAC secrets if their confidentiality is uncertain, then verify stale-worker and stale
attestation denial before resuming.
