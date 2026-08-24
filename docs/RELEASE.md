# Release process

Create a signed/reviewed release commit, freeze migrations, and complete `docs/store/RELEASE_CHECKLIST.md`. Run every command in the final validation report from a clean clone with frozen lockfile. Produce SBOM, web artifact, EAS preview artifacts, migration manifest, and screenshots tied to the commit SHA.

Use EAS channels `development`, `preview`, and `production`; runtime version uses the Expo fingerprint policy and build numbers auto-increment remotely. Promotion requires a release owner, security sign-off for high-risk changes, legal approval for policies/store disclosures, operations review of provider verification/support, and finance approval if payment mode changes.

No store submission, production deployment, paid-service activation, or database restore is authorized by code alone. Roll back with the prior app/web artifact and compensating migrations; feature flags keep online payment, phone OTP, background location, and push disabled until configured.

## M2 media-scanner release gate

Repository/local PASS requires the real local Supabase + Storage + Edge + pull worker + ClamD
integration to prove metadata-only Edge control, exact signed input/output/readback capabilities,
clean two-pass promotion, EICAR rejection, current-attempt authority, response-loss replay, retry/orphan
isolation, protected-broker authorization, and cleanup without deleting active or clean objects. The
integration must pass on the final bytes with equal before/after residue. Deterministic contract
tests remain local/test evidence and are not production sanitization or malware evidence.

Production remains blocked until operators provide the approved external HTTPS endpoint and secret,
private DNS/routes/firewalls/TLS proof, signature freshness monitoring, continuous ClamD readiness,
capacity evidence, alerts, deny-by-default egress, a minimized reviewed runtime image, region/legal
approval, and incident/rollback runbooks. ClamAV is malware detection rather than CDR. Static
JPEG/PNG/WebP require full decode/re-encode and reopened validation. Approved M4A/MP4 audio and
completion MP4 video require bounded actual remux plus FFprobe reopen; WebM and PDFs fail closed.
ClamAV's GPL-2.0-only container and the Debian FFmpeg GPL-2.0-or-later runtime are
local repository evidence only until legal/operator approval and source-offer obligations are resolved.
Hosted provisioning/deployment, hosted Actions, EAS, emulator, and physical-device validation are
**NOT RUN**.

The release gate also requires autonomous 24-hour aging through the Vault-backed privacy-worker
schedule, bounded cleanup dead-letter handling, owner-isolated journal pruning, capability lifetimes
clipped to the current attempt deadline minus the finalization margin, and authoritative single-use
attestation nonces.

The metadata-only assertion applies only to scanning control. M1 `media-access` remains a
live-authorized streaming broker; `ai-diagnostic` and `transcribe` provider media transport remains a
separate M3 activation gate.
