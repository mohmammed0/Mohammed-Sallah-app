# Dependency risk evaluation

## Metro image parser path

The lockfile previously resolved Metro's transitive `image-size@1.2.1`, affected by GHSA-w3rx-r6r6-pgpr and GHSA-5p2g-fcmc-qvqq. The published `image-size` line has no unaffected registry version: the advisories cover every published release through 2.0.2, and the upstream repository is archived. Independently upgrading Metro is outside Expo's supported dependency set.

`.pnpmfile.mjs` now replaces only Metro's `image-size` edge with the private workspace package `@sallah/image-size-safe`. The replacement implements the synchronous API Metro consumes, rejects unsupported formats, caps input at 1 MiB and dimensions at 100,000 pixels, and bounds JPEG/TIFF/WebP segment iteration. Regression tests include the advisories' zero-dimension samples plus representative PNG, GIF, JPEG, and SVG fixtures. Expo Doctor and an Android production export exercise the actual Metro path.

## xcode UUID path

`xcode` used the vulnerable UUID v7 range only for `uuid.v4()`. A scoped `xcode>uuid: 11.1.1` override supplies the compatible CommonJS `v4` API and removes GHSA-related audit exposure without changing application runtime code.

`pnpm security:scan` and raw `pnpm audit --json` must both remain clean; this is a tested replacement and compatible override, not an audit exception. Re-evaluate when Expo upgrades Metro or the upstream parser situation changes.
