# Third-party notices

SALLAH uses open-source packages under their original licenses. Copyright remains with each project and contributor. Source, license text, and security information are linked from `oss-inventory.json`; the exact transitive graph and versions are available in the generated CycloneDX SBOM.

Principal notices: Expo, Expo Network, Expo FileSystem, React/React Native, React Native Maps, React Native SVG, Lucide (ISC), Next.js, Turborepo, TanStack Query, React Hook Form, Zod, i18next, Vitest, React Native Testing Library, noble-hashes, and UUID are MIT-licensed. Supabase platform/CLI, Playwright, OpenAI Node, and Maestro are Apache-2.0 (individual Supabase JS packages are MIT). These licenses include warranty disclaimers and require preservation of notices where applicable.

Package-scoped exceptions:

- `lightningcss` 1.33.0 and its platform binaries are MPL-2.0 Next.js build tooling. Unmodified upstream source/license is available from the Parcel project.
- `caniuse-lite` (CC-BY-4.0) and `spdx-exceptions` (CC-BY-3.0) are build/license-data packages; attribution is retained here and in package metadata.
- Multi-license expressions select a permissive branch where offered (for example BSD over GPL).

`sharp` and `@img/sharp-*` are excluded optional Next.js dependencies. The web application explicitly disables the built-in image optimizer, and pnpm does not install or ship libvips.

Grafana k6 is AGPL-3.0. Validation may use a separately installed user-local official CLI, but no k6 binary, library, or source is copied into, linked with, or shipped from this repository. Maestro is likewise an external user-local validation tool. Consult counsel; this inventory is engineering evidence, not legal advice.
