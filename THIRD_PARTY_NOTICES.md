# Third-party notices

SALLAH uses open-source packages under their original licenses. Copyright remains with each project and contributor. Source, license text, and security information are linked from `oss-inventory.json`; the exact transitive graph and versions are available in the generated CycloneDX SBOM.

The September 6, 2026 native identifier fix adds `expo-crypto` 57.0.2 under the [Expo MIT license](https://github.com/expo/expo/blob/main/packages/expo-crypto/LICENSE), copyright 2015-present 650 Industries, Inc. Its pinned package has no package dependencies. Android/iOS identifiers use its native UUIDv4 implementation; no random-number fallback is introduced. The exact archive integrity is recorded in `pnpm-lock.yaml`.

Principal notices: Expo, Expo Network, Expo FileSystem, Expo Splash Screen, React/React Native, React Native Maps, React Native SVG, Lucide (ISC), Next.js, Turborepo, TanStack Query, React Hook Form, Zod, `@napi-rs/image` and its platform binaries, i18next, Vitest, React Native Testing Library, noble-hashes, and UUID are MIT-licensed. Supabase platform/CLI, Playwright, OpenAI Node, and Maestro are Apache-2.0 (individual Supabase JS packages are MIT). These licenses include warranty disclaimers and require preservation of notices where applicable.

The reviewed CI Actions `actions/upload-artifact` 7.0.1 ([MIT license](https://github.com/actions/upload-artifact/blob/043fb46d1a93c77aae656e7c1c64a875d1fc6a0a/LICENSE)), `actions/setup-node` 7.0.0 ([MIT license](https://github.com/actions/setup-node/blob/820762786026740c76f36085b0efc47a31fe5020/LICENSE)), and `supabase/setup-cli` 3.0.0 ([MIT license](https://github.com/supabase/setup-cli/blob/46f7f98c7f948ad727d22c1e67fab04c223a0520/LICENSE)) retain their upstream copyrights and license terms. Full commit pins and workflow scopes are recorded in `oss-inventory.json` under `ciActions`. These are CI tooling notices; they do not classify every hosted-runner component or replace the separate Apache-2.0 notice for the unchanged Supabase CLI 2.114.0. No application package or pnpm lockfile version changes accompany these Action updates.

The September 5, 2026 SDK 57 alignment uses Expo 57.0.20 and Router 57.0.19 with the native module versions in `oss-inventory.json`. The reviewed changed Expo packages retain their upstream MIT notices. `query-string` 7.1.3 ([source and MIT license](https://github.com/sindresorhus/query-string/tree/v7.1.3)), `decode-uri-component` 0.5.0 ([source and MIT license](https://github.com/SamVerschueren/decode-uri-component/tree/v0.5.0)), and `@xmldom/xmldom` 0.8.15/0.9.12 ([source and MIT license](https://github.com/xmldom/xmldom)) also retain their original copyrights and license texts. The repository's small `query-string` patch only adapts its decoder import to the fixed upstream decoder's default export; the installed upstream license remains intact.

The scanner container uses OCI-manifest-digest-pinned Linux amd64 Node.js 24.19.0 Bookworm slim (Node.js is MIT; included Debian packages retain their individual notices) and the separate official ClamAV 1.4.6 image. ClamAV is GPL-2.0-only and runs only as the private malware-detection daemon/signature updater; it is not linked into application code. Exact source manifest and OCI manifest config-descriptor digests, Docker's separate runtime-local identity, and the Linux `@napi-rs/image` native integrity are recorded in `oss-inventory.json` and `artifacts/container-sbom.cdx.json`; these digest types are verified and labeled separately.

ClamAV hosted activation and image distribution are **NOT RUN**. The local repository integration requires separate legal and operator approval before either action, including confirmation of applicable GPL source-offer and notice compliance; this evidence does not call ClamAV permissive or production-approved.

The scanner worker installs the exact Debian FFmpeg 5.1.9-0+deb12u1 package from the immutable Debian snapshot dated 2026-08-23. The reviewed Debian build reports GPL-2.0-or-later and its codec libraries retain their own package notices. Sallah invokes fixed `/opt/sallah-media/bin/ffmpeg` and `ffprobe` paths only for bounded stream-copy remux of approved M4A/MP4 audio and completion MP4 video; PDF, WebM, unsupported codecs, and malformed containers remain fail-closed.

FFmpeg hosted activation and worker-image distribution are **NOT RUN**. Separate legal and operator approval is required before either action, including confirmation of applicable GPL source, notice, and offer obligations. This repository/local evidence does not classify FFmpeg as permissive or production-approved.

Package-scoped exceptions:

- `lightningcss` 1.33.0 and its platform binaries are MPL-2.0 Next.js build tooling. Unmodified upstream source/license is available from the Parcel project.
- `caniuse-lite` (CC-BY-4.0) and `spdx-exceptions` (CC-BY-3.0) are build/license-data packages; attribution is retained here and in package metadata.
- Multi-license expressions select a permissive branch where offered (for example BSD over GPL).

`sharp` and `@img/sharp-*` are excluded optional Next.js dependencies. The web application explicitly disables the built-in image optimizer, and pnpm does not install or ship libvips.

Grafana k6 is AGPL-3.0. Validation may use a separately installed user-local official CLI, but no k6 binary, library, or source is copied into, linked with, or shipped from this repository. Maestro is likewise an external user-local validation tool. Consult counsel; this inventory is engineering evidence, not legal advice.

The Next.js security update uses Next, `@next/env` and the recorded optional `@next/swc` platform packages at 16.3.4, retaining their upstream MIT licenses. No new package family was added. See the [pinned upstream license](https://github.com/vercel/next.js/blob/v16.3.4/license.md), [upstream security release](https://github.com/vercel/next.js/releases/tag/v16.3.3), and [bounded dependency decisions](docs/oss/DEPENDENCY_REVIEW_2026-09-05.md).
