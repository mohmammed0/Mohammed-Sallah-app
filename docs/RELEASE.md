# Release process

Create a signed/reviewed release commit, freeze migrations, and complete `docs/store/RELEASE_CHECKLIST.md`. Run every command in the final validation report from a clean clone with frozen lockfile. Produce SBOM, web artifact, EAS preview artifacts, migration manifest, and screenshots tied to the commit SHA.

Use EAS channels `development`, `preview`, and `production`; runtime version uses the Expo fingerprint policy and build numbers auto-increment remotely. Promotion requires a release owner, security sign-off for high-risk changes, legal approval for policies/store disclosures, operations review of provider verification/support, and finance approval if payment mode changes.

No store submission, production deployment, paid-service activation, or database restore is authorized by code alone. Roll back with the prior app/web artifact and compensating migrations; feature flags keep online payment, phone OTP, background location, and push disabled until configured.
