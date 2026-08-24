# M2V media-scanning V2 architecture design

> M2R addendum (2026-08-24): the closed-beta upload contract retains approved M4A/MP4 audio and
> completion MP4 video. They now use bounded actual FFmpeg remux plus FFprobe reopen validation.
> WebM and PDF remain fail-closed. The scanning control plane remains metadata-only. See the
> [focused remediation plan](../plans/2026-08-24-media-scanning-focused-remediation.md).

## Status, source, and authority

This design supersedes the uncommitted synchronous M2B media data plane. It starts from D1 SHA
`bc8afd939a532021dd5a6a975894b2cee4842a87`, remains repository/local-only, and does not provision or
activate hosted infrastructure. The existing private upload quarantine and protected-media broker
remain authoritative.

M2V makes Supabase Edge Functions a metadata/control plane. No hosted Edge path may download, hash,
encode, decode, sanitize, upload, or otherwise buffer a media body. The scanner worker never receives
a Supabase service-role key, S3 credential, user JWT, user identity, filename, or business-resource
identifier.

## Authoritative V2 flow

```text
authenticated client
  -> purpose-bound upload ticket and private quarantine upload
  -> scan-upload Edge start/status/replay (bounded metadata only)
  -> private media-scan job
  -> scanner worker pulls one job through scanner-control Edge
  -> server-side Storage copy to opaque scan-input object
  -> short-lived exact signed input read capability
  -> original ClamAV scan
  -> decode/re-encode image sanitizer
  -> final ClamAV scan and full output validation
  -> scanner requests exact output capability after clean processing
  -> direct no-upsert upload to opaque scan-output object
  -> newly issued signed read capability and scanner read-after-write hash
  -> signed canonical manifest/attestation
  -> scanner-control verifies HMAC, nonce, lease, manifest, signature freshness, and Storage metadata
  -> server-side Storage copy to an attempt-specific final private object
  -> transactional database completion/audit
  -> asynchronous cleanup of quarantine and non-retained attempt artifacts
  -> existing protected-media broker
```

## Accepted media policy

The initial V2 accepted clean-output set is static JPEG, PNG, and WebP only. These formats are fully
decoded and re-encoded, reopened, structurally validated through exact EOF, scanned again, uploaded,
read back, and hashed.

PDF, archives, Office documents, executables, scripts, unknown formats, animated/multipage images,
WebM, M4A/MP4 audio, and MP4 video fail closed. The repository permits reviewed permissive OSS; a
reviewed, exact, reproducible FFmpeg build is not currently present and common FFmpeg distributions
carry LGPL/GPL obligations. The approved M2V contract explicitly permits failing an otherwise
accepted audio/video type closed when safe remux cannot be implemented in the reviewed container.
Structural pass-through is removed and is never described as sanitization or remux.

Image inputs reject APNG animation chunks, animated WebP flags/chunks, JPEG MPO/multiple-frame data,
concatenated images, and trailing archive/PDF/executable data. Re-encoding strips ICC, EXIF, and XMP;
the result must contain none of them. Native decode/re-encode runs one job at a time within the worker
cgroup, with bounded pixels, cache, temporary storage, output size, and deadline. The output is
reopened by the native decoder and rechecked by a strict container parser before its second ClamAV
scan.

## User control contract

`scan-upload` accepts an authenticated upload identifier and never media bytes. It calls an
owner-authorized start/status RPC and returns exactly one safe state:

- `queued`;
- `scanning`;
- `clean` with safe result MIME and size;
- `rejected`;
- `retryable_failure` with safe retry timing;
- `terminal_failure`.

The first authorized request queues exactly one job. Active replay returns the same active state.
Committed clean replay reconstructs the persisted clean result without a new attempt, object,
promotion, or event. Terminal replay is stable. Mobile persists pending upload IDs locally and polls
with bounded exponential backoff; a restart resumes the same identifier rather than creating a new
job.

## Private database model

The single uncommitted M2 migration is rewritten to create deny-by-default private structures:

- `private.media_scan_jobs`: one job per upload, safe state, attempt count, current attempt, result;
- `private.media_scan_attempts`: ordinal, token hash, worker, 120-second deadline, stage, terminal data;
- `private.media_scan_artifacts`: exact opaque quarantine/input/output/final references and cleanup
  lifecycle;
- `private.media_scan_attestations`: bounded canonical manifest fingerprint and operational evidence;
- `private.media_scan_events`: immutable operation/idempotency/audit events;
- `private.media_scanner_nonces`: consumed HMAC nonces with expiry.

There are no direct client or service-role table grants. Fixed-search-path `SECURITY DEFINER` RPCs are
the only interface. Scanner operational evidence remains private. Owners receive only an exact safe
projection: status, safe terminal category, sanitized flag, resulting MIME/size, retry time, and
timestamps. They cannot read token hashes, attempts, paths, scanner/signature/sanitizer versions,
fingerprints, nonces, or stack/error detail.

Each retry creates a distinct opaque input, output, manifest, and final-candidate path. Paths contain
only random fan-out and UUID material; they contain no user/upload/job/resource/support identifier,
purpose, or original filename. The winning candidate becomes `file_uploads.final_path`; a losing or
late candidate is cleanup-eligible and cannot block attempt N+1.

Each attempt receives one fixed 120-second processing deadline. Its lease may be heartbeated only up
to that deadline. A manifest recorded by the processing deadline receives at most a fixed 15-second
metadata-only finalization margin. Retries receive a fresh attempt/deadline, up to three attempts.
No stale attempt may prepare, upload, attest, reject, fail, or finalize a current attempt.

All mutations take a caller-created operation UUID and use row locks plus canonical fingerprints.
Exact operation replay returns the saved response; changed payload replay fails. Lock-time decisions
use `clock_timestamp()` captured after the lock.

## Storage boundaries and capabilities

`scan-input` and `scan-output` are private, server-controlled buckets with no anonymous/authenticated
read, list, insert, update, copy, or delete policy. Storage mutation uses only Storage APIs; the
Storage schema is not modified directly.

Scanner-control copies quarantine to an opaque input path through the Storage server-side copy API,
then creates an exact signed read URL. Output upload authorization is issued only after the worker has
proved both scans and sanitization succeeded and the attempt is current. It is exact path,
`upsert:false`, one attempt, and never user-visible. Platform signed-upload TTL may exceed the lease;
the database lease remains authoritative, so a late upload can only create an unreferenced cleanup
artifact.

The scanner accepts only exact configured Storage and scanner-control origins. Outside explicit
`local`/`test`, both are HTTPS with default ports, no userinfo, query injection, fragments, IP literals,
or redirects. Signed URLs may contain their platform-generated query, but their origin and expected
opaque object path must match the claimed contract. No client URL is ever fetched.

## Scanner-control authentication

`scanner-control` uses `verify_jwt = false` only because it implements a complete custom server
boundary. The worker holds two dedicated secrets: one request-control HMAC secret and one attestation
HMAC secret. Neither is a Supabase key.

Request canonicalization is cross-runtime and versioned:

```text
sallah-scanner-control-v1
POST
/functions/v1/scanner-control
<action>
<attempt-id-or-dash>
<unix-seconds>
<uuid-nonce>
<lowercase-body-sha256>
```

The Edge function bounds the raw JSON body to 64 KiB, hashes it, verifies action/timestamp/nonce/body
and HMAC in constant time before privilege, then atomically consumes the nonce in PostgreSQL. The
window is 30 seconds and nonce retention exceeds the job deadline plus skew. Supported actions are
`claim`, `heartbeat`, `prepare_output`, `authorize_readback`, `complete`, `reject`, and `fail`.

## Canonical output attestation

The scanner signs a strict fixed-key-order manifest containing schema version, attempt ID, opaque
input/output references, purpose, detected input/output MIME, input/output size and SHA-256, both
ClamAV verdicts, sanitized flag, sanitizer/version, ClamAV engine and signature versions, signature
timestamp/age, processing duration, job deadline, nonce/correlation ID, and read-back SHA-256.

The output upload is followed by a newly issued exact signed read. The scanner re-downloads with
redirects disabled and recomputes size/hash. Edge verifies the attestation signature, canonical
encoding, current attempt/deadline, nonce, exact database paths, purpose, MIME/size policy, signature
freshness, and Storage object metadata. It never treats a media prefix as a content-security boundary.

## Promotion, replay, and cleanup

After attestation, scanner-control performs a Storage server-side copy from the opaque output object
to the DB-selected attempt-specific final path with non-overwrite semantics. It reconciles an exact
same-attempt copy response loss from metadata; unrelated/stale objects fail closed. Database
completion follows the copy. If completion is uncertain, exact manifest replay rechecks Storage and
finishes one-winner. If completion definitely fails, the final candidate is recorded for cleanup.

Committed clean replay returns the saved safe result. Prepared/uploaded/attested replay reuses the
same attempt paths and manifest without rescanning. Active status creates no duplicate job. Old
attempt artifacts never share a path with a new attempt. Cleanup token-leases one artifact at a time,
re-locks before deletion completion, preserves the retained final, and removes stale input/output/
candidate/quarantine artifacts through Storage APIs.

## Signature freshness and resource budgets

ClamD readiness parses VERSION/signature evidence and requires an existing, parseable timestamp no
older than configured `UPLOAD_SCANNER_SIGNATURE_MAX_AGE_HOURS`. Missing, future, stale, or unparsable
evidence prevents job claim. The manifest repeats timestamp/age and Edge independently rejects stale
or inconsistent evidence. Tests inject fresh/stale/missing/unparseable/reload-window states; local
real EICAR uses pinned offline evidence and an explicit local maximum age.

Budgets are separate:

- hosted Edge: metadata only, official 256 MiB limit, required measured/calculated peak <=128 MiB and
  size-independent for 10/20 MiB metadata;
- worker: one job, measured cgroup sized for one 40-million-pixel image plus input/output/temp/native
  overhead, bounded cache and tmpfs;
- ClamD: 4 GiB local baseline with reload headroom, private network, bounded CPU/PIDs;
- processing: one monotonic 120-second attempt budget plus 15-second metadata finalization margin;
- Edge control calls: short metadata-only deadlines, never waiting for the full scan.

## CI, OSS, and release gates

Mandatory CI adds scanner unit/type/lint/build, container hardening, real ClamAV/EICAR, image
sanitization/polyglot, actual approved audio/video remux, rejected WebM/PDF, local Supabase/Storage/Edge, state/replay/orphan real
concurrency, signature freshness, Edge metadata-memory, licenses, dependency/security scan, and SBOM.
Release readiness forwards and requires all scanner variables. No live external API or production
secret is used.

Machine and human OSS evidence includes exact ClamAV and Node image digests/licenses, Debian/container
packages, native image binaries and optional targets, the immutable Debian FFmpeg runtime, and any
other image. GPL activation/distribution remains an explicit legal/operator gate.

## Non-goals and stop conditions

No hosted deployment, provisioning, EAS, device validation, M3, commit, push, or PR occurs. M2V stops
as architecture variance still present if Edge handles media bytes, Edge memory scales with media
size, scanner needs broad credentials, identity/path leaks to the scanner, stale attempts finalize,
accepted 20 MiB images miss the deadline, protected-media authorization weakens, or an accepted media
type lacks its required safe sanitizer.
