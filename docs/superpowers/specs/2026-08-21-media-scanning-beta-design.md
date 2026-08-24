# M2B media scanning beta design

## Status and scope

This design implements only the repository and local-validation portion of M2B. It starts from D1
SHA `bc8afd939a532021dd5a6a975894b2cee4842a87`, keeps the existing private quarantine and protected
media broker authoritative, and does not provision or activate hosted infrastructure.

M2B adds a Sallah-owned scanner gateway, a forward-only database contract, Edge orchestration,
physical cleanup, local containers, and evidence. It does not change client-visible upload purposes,
application features, Expo/React versions, payments, AI, push, or any M3 surface.

## Authoritative flow

```text
authenticated client
  -> server-issued purpose-bound upload ticket
  -> private quarantine bucket
  -> authenticated scan-upload Edge Function
  -> authenticated HTTPS scanner gateway
  -> clamd INSTREAM on a private container network
  -> purpose-specific decode/re-encode or structural validation
  -> final clamd INSTREAM scan
  -> strict versioned scanner result
  -> independent Edge MIME, size, hash, and policy validation
  -> private clean-bucket upload
  -> attempt-bound database completion plus immutable event
  -> existing protected media broker
```

## Trust boundaries

- The publishable client can create only an authorized purpose/resource ticket and upload exactly to
  its private quarantine path. It cannot read quarantine, choose the clean destination, claim scan
  work, or mark a file clean.
- `scan-upload` authenticates the end user before creating a service client, claims the exact upload,
  and sends only the claimed immutable metadata and bytes to the gateway.
- The gateway accepts one bounded `application/octet-stream` request, requires a constant-time
  bearer-secret match, validates every metadata header, and never receives a Supabase key or Storage
  credential.
- ClamD is reachable only on the private Compose network. The gateway uses framed `INSTREAM`, bounded
  chunks, exact response parsing, connection and total timeouts, and a stream limit above the 20 MiB
  product cap but below an operator-controlled hard ceiling.
- The gateway is not authoritative for promotion. Edge independently validates the returned schema,
  input/output SHA-256 values, output byte count, detected signature, extension, purpose policy,
  sanitizer requirement, and scanner contract version.
- Only a service-role attempt-bound RPC can complete, reject, or retry an upload. A stale scanner
  attempt cannot complete a newer claim. Database completion and the immutable security event are one
  transaction.
- Failed/rejected/expired uploads remain unreadable. The privacy worker removes quarantine objects
  and any orphan clean-destination object without deleting a valid clean object.

## Gateway contract

### Request

`POST /v1/scan` with:

- `Authorization: Bearer <gateway secret>`;
- `Content-Type: application/octet-stream`;
- `Content-Length` present and bounded by the claimed ticket;
- exact upload ID, purpose, declared MIME, extension, and expected input-size headers.

Unknown headers are harmless, but missing, duplicated through comma-joining, malformed, or
contradictory contract headers fail closed. Requests use connection/body deadlines and abort on early
disconnect.

### Result

The strict JSON response is versioned and contains only bounded values:

- contract version and scan ID;
- `clean` or `malicious` verdict;
- detected MIME and category;
- whether sanitization occurred and the sanitizer identifier;
- ClamAV engine and signature versions;
- input and output SHA-256 values;
- output size and, only for a clean result, base64 output bytes.

Unavailable, timeout, malformed, oversized, hash-mismatched, or policy-incomplete results are
retryable scanner failures. Malware, unsupported content, spoofed MIME/extension, malformed content,
and initial-beta PDF input are terminal rejection categories. Raw engine errors, filenames, content,
secrets, and private paths are never returned or logged.

## Sanitization policy

- JPEG, PNG, and WebP are fully decoded and re-encoded in the same format. Dimensions and decoded
  pixel count are bounded before encoding. Metadata and trailing/polyglot bytes are not copied.
- MP4 video, MP4 audio, and WebM audio undergo bounded container parsing. Required top-level/container
  structure, declared family, track presence, duration, dimensions/sample metadata, element/box sizes,
  nesting, and total traversal work are bounded. Accepted bytes may be passed through when the
  structural validator establishes the initial-beta policy; the sanitizer identifier records that
  no transcode/CDR occurred.
- PDF promotion fails closed during the initial beta. ClamAV detection is not represented as CDR.
- Every accepted output receives a second ClamAV scan after sanitization/validation.

## Local infrastructure

Local Compose contains an official version-pinned ClamAV image and the repository-owned gateway on an
internal network. Only the gateway health/scan port is exposed to the host; ClamD is not. The gateway
runs as a non-root user with a read-only root filesystem, no added capabilities, bounded temporary
storage, health checks, and explicit resource limits where Compose supports them. Test secrets are
local `.invalid` fixtures only.

The local integration suite proves clean image promotion, EICAR rejection, PDF fail-closed behavior,
malformed media rejection, timeout/unavailable handling, authentication denial, final-scan behavior,
and cleanup/retry behavior. It does not claim hosted, emulator, physical-device, EAS, or production
validation.

## Operational and privacy contract

Production remains blocked until operators supply and approve the private scanner URL, secret,
network path, region, ClamAV signature-update policy, alerting, capacity, retention, backup/restore,
and incident runbooks. Quarantine remains 24-hour fail-closed cleanup by default. Scanner temporary
bytes are request-scoped and deleted immediately; the scanner stores no media or content logs.

Metrics use bounded categories and identifiers only: health, latency bucket, byte count, verdict,
engine/signature age, sanitizer, and error category. Exact filenames, Storage paths, file content,
messages, addresses, documents, tokens, and secrets are excluded.

## Verification and non-goals

Required evidence includes service unit/integration tests, real local ClamAV EICAR tests, Edge tests,
pgTAP, clean reset, local Supabase end-to-end promotion, cleanup tests, container hardening inspection,
license/audit/SBOM checks, and full `pnpm validate`.

Non-goals are hosted provisioning, deployment, EAS, device validation, production secrets, public
launch, a PDF CDR implementation, full video transcoding, M3, publishing, commits, and pull requests.
