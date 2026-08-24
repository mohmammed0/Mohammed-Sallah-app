# Third-party notices

SALLAH uses open-source packages under their original licenses. Copyright remains with each project and contributor. Source, license text, and security information are linked from `oss-inventory.json`; the exact transitive graph and versions are available in the generated CycloneDX SBOM.

Principal notices: Expo, Expo Network, Expo FileSystem, React/React Native, React Native Maps, React Native SVG, Lucide (ISC), Next.js, Turborepo, TanStack Query, React Hook Form, Zod, `@napi-rs/image` and its platform binaries, i18next, Vitest, React Native Testing Library, noble-hashes, and UUID are MIT-licensed. Supabase platform/CLI, Playwright, OpenAI Node, and Maestro are Apache-2.0 (individual Supabase JS packages are MIT). These licenses include warranty disclaimers and require preservation of notices where applicable.

The scanner container uses digest-pinned Node.js 24.19.0 Bookworm slim (Node.js is MIT; included Debian packages retain their individual notices) and the separate official ClamAV 1.4.6 image. ClamAV is GPL-2.0-only and runs only as the private malware-detection daemon/signature updater; it is not linked into application code. Exact image digests and the Linux `@napi-rs/image` native integrity are recorded in `oss-inventory.json` and `artifacts/container-sbom.cdx.json`.

ClamAV hosted activation and image distribution are **NOT RUN**. The local repository integration requires separate legal and operator approval before either action, including confirmation of applicable GPL source-offer and notice compliance; this evidence does not call ClamAV permissive or production-approved.

The scanner worker installs the exact Debian FFmpeg 5.1.9-0+deb12u1 package from the immutable Debian snapshot dated 2026-08-23. The reviewed Debian build reports GPL-2.0-or-later and its codec libraries retain their own package notices. Sallah invokes fixed `/opt/sallah-media/bin/ffmpeg` and `ffprobe` paths only for bounded stream-copy remux of approved M4A/MP4 audio and completion MP4 video; PDF, WebM, unsupported codecs, and malformed containers remain fail-closed.

FFmpeg hosted activation and worker-image distribution are **NOT RUN**. Separate legal and operator approval is required before either action, including confirmation of applicable GPL source, notice, and offer obligations. This repository/local evidence does not classify FFmpeg as permissive or production-approved.

Package-scoped exceptions:

- `lightningcss` 1.33.0 and its platform binaries are MPL-2.0 Next.js build tooling. Unmodified upstream source/license is available from the Parcel project.
- `caniuse-lite` (CC-BY-4.0) and `spdx-exceptions` (CC-BY-3.0) are build/license-data packages; attribution is retained here and in package metadata.
- Multi-license expressions select a permissive branch where offered (for example BSD over GPL).

`sharp` and `@img/sharp-*` are excluded optional Next.js dependencies. The web application explicitly disables the built-in image optimizer, and pnpm does not install or ship libvips.

Grafana k6 is AGPL-3.0. Validation may use a separately installed user-local official CLI, but no k6 binary, library, or source is copied into, linked with, or shipped from this repository. Maestro is likewise an external user-local validation tool. Consult counsel; this inventory is engineering evidence, not legal advice.
