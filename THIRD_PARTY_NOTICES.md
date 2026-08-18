# Third-party notices

SALLAH uses open-source packages under their original licenses. Copyright remains with each project and contributor. Source, license text, and security information are linked from `oss-inventory.json`; the exact transitive graph and versions are available in the generated CycloneDX SBOM.

Principal notices: Expo, React/React Native, Next.js, Turborepo, TanStack Query, React Hook Form, Zod, i18next, Vitest, React Native Testing Library, and noble-hashes are MIT-licensed. Supabase platform/CLI, Playwright, OpenAI Node, and Maestro are Apache-2.0 (individual Supabase JS packages are MIT). These licenses include warranty disclaimers and require preservation of notices where applicable.

Package-scoped exceptions:

- `lightningcss` 1.33.0 and its platform binaries are MPL-2.0 Next.js build tooling. Unmodified upstream source/license is available from the Parcel project.
- `sharp`/`@img/sharp-*` 0.35.3 is a Next.js dependency; platform packages declare Apache-2.0 and LGPL-3.0-or-later due to libvips. Preserve license/source/relinking notices and complete distribution review before production binaries.
- `caniuse-lite` (CC-BY-4.0) and `spdx-exceptions` (CC-BY-3.0) are build/license-data packages; attribution is retained here and in package metadata.
- Multi-license expressions select a permissive branch where offered (for example BSD over GPL).

Grafana k6 is AGPL-3.0 and is not installed, linked, copied, or shipped. An original JavaScript smoke scenario may be executed by a separately installed k6 CLI. Consult counsel; this inventory is engineering evidence, not legal advice.
