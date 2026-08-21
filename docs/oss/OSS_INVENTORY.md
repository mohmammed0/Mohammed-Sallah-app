# OSS inventory

The machine-readable direct inventory is `oss-inventory.json`; the complete transitive graph is generated as CycloneDX JSON at `artifacts/sbom.cdx.json` by `pnpm run sbom:generate`. `pnpm licenses:check` evaluates every installed package.

Primary runtime: Expo 57.0.15, React Native 0.86.2/React 19.2.3, Next 16.3.1/React 19.2.8, Supabase JS 2.112.3, TanStack Query 5.101.4, React Hook Form 7.85.0, Zod 4.4.3, i18next 26.3.6, OpenAI Node 7.5.0, noble-hashes 2.3.0. Tooling: pnpm 11.19.0, Turbo 2.10.10, TypeScript 6.0.3, Supabase CLI 2.114.0, Vitest 4.1.10, Playwright 1.62.1.

No third-party source directory, application, brand asset, or binary is vendored. Maestro and k6 are external operator tools. See `OSS_EVALUATION.md` and `THIRD_PARTY_NOTICES.md` for decisions and exceptions.
