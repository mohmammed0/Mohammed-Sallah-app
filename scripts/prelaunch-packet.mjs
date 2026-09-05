import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

// Reuse the existing reviewed config dependency; no global/package installation is needed.
const { z } = createRequire(new URL('../packages/config/package.json', import.meta.url))('zod');
const sha = z.string().regex(/^[a-f0-9]{40}$/u);
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const fileRecord = z
  .object({ path: z.string(), sha256: digest, bytes: z.number().int().nonnegative() })
  .strict();
const sourceRecord = fileRecord.extend({ mode: z.enum(['100644', '100755']), gitObject: sha });
const ciSchema = z
  .object({
    event: z.enum(['push', 'pull_request', 'workflow_dispatch']),
    checkoutCommit: sha,
    pullRequestHead: sha.nullable(),
    runId: z.string().regex(/^[1-9]\d{0,19}$/u),
  })
  .strict();
const artifactSchema = z
  .object({
    kind: z.enum(['mobile-export', 'sbom']),
    path: z.string(),
    declaredSourceCommit: sha,
    verification: z.literal('FILE_HASHES_AND_STRUCTURE_ONLY'),
    files: z.array(fileRecord).min(1).max(10000),
  })
  .strict();
const externalReadiness = Object.freeze({
  production: 'NOT_EVALUATED',
  legalApproval: 'NOT_EVALUATED',
  physicalDevices: 'NOT_EVALUATED',
  signing: 'NOT_EVALUATED',
  deployment: 'NOT_PERFORMED',
});
const packetSchema = z
  .object({
    schema: z.literal('sallah-prelaunch-packet/v1'),
    createdAt: z.iso.datetime(),
    source: z
      .object({
        checkoutCommit: sha,
        tree: sha,
        branch: z.string().nullable(),
        fileCount: z.number().int().positive(),
        inventorySha256: digest,
      })
      .strict(),
    sourceInventory: z.literal('source-files.json'),
    templates: z.array(sourceRecord).min(1),
    migrations: z
      .array(
        sourceRecord.extend({
          version: z.string().regex(/^(?:\d{12}|\d{14})$/u),
          versionFormat: z.enum(['legacy-date-sequence', 'utc-timestamp']),
          date: z.iso.date(),
          timestampUtc: z.iso.datetime().nullable(),
        }),
      )
      .min(1),
    artifacts: z.array(artifactSchema).max(2),
    ci: ciSchema.nullable(),
    externalReadiness: z
      .object(
        Object.fromEntries(
          Object.entries(externalReadiness).map(([key, value]) => [key, z.literal(value)]),
        ),
      )
      .strict(),
  })
  .strict();
const optionsSchema = z
  .object({
    repo: z.string().min(1),
    out: z.string().optional(),
    packet: z.string().optional(),
    expectHead: sha.optional(),
    mobileExport: z.string().optional(),
    sbom: z.string().optional(),
    artifactSourceSha: sha.optional(),
    ciEvent: ciSchema.shape.event.optional(),
    ciCheckoutSha: sha.optional(),
    ciPrHeadSha: sha.optional(),
    ciRunId: ciSchema.shape.runId.optional(),
  })
  .strict();
const requiredFiles = [
  '.env.example',
  '.github/workflows/ci.yml',
  '.github/workflows/release-readiness.yml',
  'apps/mobile/app.config.ts',
  'apps/mobile/eas.json',
  'packages/config/src/release.ts',
  'pnpm-lock.yaml',
  'oss-inventory.json',
  'THIRD_PARTY_NOTICES.md',
  'docs/RELEASE.md',
  'docs/DEPLOYMENT.md',
  'docs/release/EXTERNAL_RELEASE_GATES.md',
  'docs/operations/LEGAL_PUBLICATION.md',
  'docs/operations/EAS_NATIVE_BUILDS.md',
  'docs/store/RELEASE_CHECKLIST.md',
  'docs/store/STORE_LISTING_DRAFTS.md',
  'docs/store/DATA_DISCLOSURE_WORKSHEET.md',
];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const encoded = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
function fail(code) {
  throw new Error(`PRELAUNCH_${code}`);
}
function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) fail('INVALID_CONTRACT');
  return result.data;
}
function git(repo, args, input) {
  const result = spawnSync('git', ['--no-optional-locks', '--no-replace-objects', ...args], {
    cwd: repo,
    input,
    windowsHide: true,
    maxBuffer: 128 * 1024 * 1024,
  });
  if (result.status !== 0) fail('GIT_UNAVAILABLE_OR_INVALID_REF');
  return result.stdout;
}
const gitText = (repo, ...args) => git(repo, args).toString('utf8').trim();
function pathName(value) {
  if (typeof value !== 'string' || !value || value.length > 1024 || /[\x00-\x1f\x7f:]/u.test(value))
    fail('INVALID_PATH');
  const normalized = value.replaceAll('\\', '/');
  if (
    isAbsolute(normalized) ||
    normalized.split('/').some((part) => !part || part === '.' || part === '..')
  )
    fail('PATH_ESCAPE');
  return normalized;
}
function contained(root, candidate) {
  const child = relative(root, candidate);
  if (child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child)) fail('PATH_ESCAPE');
}
function safePath(root, value, allowMissing = false) {
  const name = pathName(value);
  let current = root;
  for (const component of name.split('/')) {
    current = join(current, component);
    let stat;
    try {
      stat = lstatSync(current);
    } catch (error) {
      if (allowMissing && error.code === 'ENOENT') continue;
      fail('MISSING_PATH');
    }
    if (stat.isSymbolicLink()) fail('SYMLINK');
    contained(root, realpathSync(current));
  }
  return current;
}
function rootDirectory(value) {
  const candidate = resolve(value);
  if (lstatSync(candidate).isSymbolicLink()) fail('SYMLINK');
  const root = realpathSync(candidate);
  if (realpathSync(gitText(root, 'rev-parse', '--show-toplevel')) !== root)
    fail('REPOSITORY_ROOT_REQUIRED');
  return root;
}
function readBounded(root, path, limit = 256 * 1024 * 1024) {
  const absolute = safePath(root, path);
  const descriptor = openSync(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || stat.size > limit) fail('INVALID_FILE_SIZE_OR_TYPE');
    const chunks = [];
    let size = 0;
    // Bound allocations and reads even when a selected artifact grows after fstat.
    while (size <= limit) {
      const buffer = Buffer.allocUnsafe(Math.min(65536, limit - size + 1));
      const count = readSync(descriptor, buffer, 0, buffer.length, null);
      if (!count) break;
      size += count;
      if (size > limit) fail('INVALID_FILE_SIZE_OR_TYPE');
      chunks.push(buffer.subarray(0, count));
    }
    return Buffer.concat(chunks, size);
  } finally {
    closeSync(descriptor);
  }
}
function jsonBytes(data) {
  try {
    return JSON.parse(data.toString('utf8'));
  } catch {
    fail('INVALID_JSON');
  }
}
function readJson(root, path, limit) {
  return jsonBytes(readBounded(root, path, limit));
}
function clean(repo, expectedHead) {
  if (gitText(repo, 'rev-parse', 'HEAD') !== expectedHead) fail('STALE_HEAD');
  if (git(repo, ['status', '--porcelain=v1', '-z', '--untracked-files=no']).length)
    fail('DIRTY_TRACKED_CHECKOUT');
}
function sourceSnapshot(repo, expected) {
  const head = gitText(repo, 'rev-parse', 'HEAD');
  parse(sha, head);
  if (expected && expected !== head) fail('STALE_HEAD');
  clean(repo, head);
  const entries = git(repo, ['ls-tree', '-r', '-z', head])
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map((line) => {
      const match = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/u.exec(line);
      if (!match) fail('UNSUPPORTED_TRACKED_FILE');
      return { mode: match[1], gitObject: match[2], path: pathName(match[3]) };
    })
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  if (!entries.length || entries.length > 20000) fail('SOURCE_INVENTORY_SIZE');
  // Inspect every working path even when index flags hide changes from git status.
  for (const entry of entries) readBounded(repo, entry.path);
  const workingObjects = git(
    repo,
    ['hash-object', '--stdin-paths'],
    entries.map((entry) => `${JSON.stringify(entry.path)}\n`).join(''),
  )
    .toString('ascii')
    .trim()
    .split('\n');
  if (
    workingObjects.length !== entries.length ||
    entries.some((entry, index) => workingObjects[index].trim() !== entry.gitObject)
  )
    fail('TRACKED_BYTE_DRIFT');
  const blobs = git(
    repo,
    ['cat-file', '--batch'],
    entries.map((entry) => `${entry.gitObject}\n`).join(''),
  );
  let offset = 0;
  const files = entries.map((entry) => {
    const newline = blobs.indexOf(10, offset);
    const header = blobs.subarray(offset, newline).toString('ascii');
    const match = /^([a-f0-9]{40}) blob (\d+)$/u.exec(header);
    if (!match || match[1] !== entry.gitObject) fail('GIT_BLOB_INVALID');
    const size = Number(match[2]);
    offset = newline + 1;
    const data = blobs.subarray(offset, offset + size);
    offset += size + 1;
    if (data.length !== size || blobs[offset - 1] !== 10) fail('GIT_BLOB_INVALID');
    // Fingerprints describe immutable Git blob bytes, including Git text normalization.
    return { ...entry, bytes: size, sha256: hash(data) };
  });
  const branch = spawnSync(
    'git',
    ['--no-optional-locks', '--no-replace-objects', 'symbolic-ref', '--quiet', '--short', 'HEAD'],
    { cwd: repo, encoding: 'utf8', windowsHide: true },
  );
  if (![0, 1].includes(branch.status)) fail('GIT_BRANCH_INVALID');
  const identity = {
    checkoutCommit: head,
    tree: gitText(repo, 'rev-parse', `${head}^{tree}`),
    branch: branch.status === 0 ? branch.stdout.trim() : null,
    fileCount: files.length,
    inventorySha256: hash(encoded(files)),
  };
  const templates = requiredFiles.map((path) => {
    const entry = files.find((file) => file.path === path);
    if (!entry) fail('REQUIRED_TEMPLATE_MISSING');
    return entry;
  });
  // Preserve the established first nine IDs. Future migrations require full UTC timestamps.
  const legacyVersions = new Set(
    Array.from({ length: 9 }, (_, index) => `20260817${String(index + 1).padStart(4, '0')}`),
  );
  const versions = new Set();
  const migrations = files
    .filter((file) => file.path.startsWith('supabase/migrations/'))
    .map((file) => {
      const match = /^supabase\/migrations\/(\d{12}|\d{14})_[a-z0-9_]+\.sql$/u.exec(file.path);
      if (!match) fail('INVALID_MIGRATION_NAME');
      const version = match[1];
      const date = `${version.slice(0, 4)}-${version.slice(4, 6)}-${version.slice(6, 8)}`;
      const legacy = version.length === 12;
      if (legacy && !legacyVersions.has(version)) fail('UNKNOWN_LEGACY_MIGRATION_VERSION');
      const stamp = legacy
        ? null
        : `${date}T${version.slice(8, 10)}:${version.slice(10, 12)}:${version.slice(12, 14)}.000Z`;
      const dateCheck = stamp ?? `${date}T00:00:00.000Z`;
      if (
        !Number.isFinite(Date.parse(dateCheck)) ||
        new Date(dateCheck).toISOString() !== dateCheck ||
        versions.has(version)
      )
        fail('INVALID_OR_DUPLICATE_MIGRATION_TIMESTAMP');
      versions.add(version);
      return {
        ...file,
        version,
        versionFormat: legacy ? 'legacy-date-sequence' : 'utc-timestamp',
        date,
        timestampUtc: stamp,
      };
    });
  if (!migrations.length) fail('MIGRATIONS_MISSING');
  clean(repo, head);
  return { files, identity, templates, migrations };
}
function directoryFiles(repo, path) {
  const root = safePath(repo, path);
  if (!lstatSync(root).isDirectory()) fail('EXPORT_DIRECTORY_REQUIRED');
  const files = [];
  let bytes = 0;
  function visit(prefix) {
    for (const entry of readdirSync(safePath(repo, prefix), { withFileTypes: true })) {
      const name = `${prefix}/${entry.name}`;
      const absolute = safePath(repo, name);
      const stat = lstatSync(absolute);
      if (stat.isDirectory()) visit(name);
      else {
        const data = readBounded(repo, name);
        bytes += data.length;
        if (files.length >= 10000 || bytes > 1024 * 1024 * 1024) fail('EXPORT_SIZE_LIMIT');
        files.push({ path: name, bytes: data.length, sha256: hash(data) });
      }
    }
  }
  visit(path);
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
function mobileArtifact(repo, input, head) {
  const path = pathName(input);
  const platform = z.object({
    bundle: z.string().min(1),
    assets: z
      .array(z.object({ path: z.string().min(1), ext: z.string().min(1).max(16) }))
      .max(10000),
  });
  const metadataBytes = readBounded(repo, `${path}/metadata.json`, 1024 * 1024);
  const metadata = parse(
    z.object({
      version: z.literal(0),
      bundler: z.literal('metro'),
      fileMetadata: z.object({ android: platform, ios: platform }),
    }),
    jsonBytes(metadataBytes),
  );
  const files = directoryFiles(repo, path);
  if (files.find((file) => file.path === `${path}/metadata.json`)?.sha256 !== hash(metadataBytes))
    fail('EXPORT_METADATA_CHANGED');
  for (const [name, value] of Object.entries(metadata.fileMetadata)) {
    const bundle = pathName(value.bundle);
    if (!/\.(?:hbc|js)$/u.test(bundle)) fail('EXPORT_BUNDLE_INVALID');
    for (const item of [bundle, ...value.assets.map((asset) => pathName(asset.path))]) {
      const found = files.find((file) => file.path === `${path}/${item}`);
      if (!found || found.bytes === 0) fail('EXPORT_REFERENCED_FILE_MISSING');
    }
    if (!['android', 'ios'].includes(name)) fail('EXPORT_PLATFORM_INVALID');
  }
  return {
    kind: 'mobile-export',
    path,
    declaredSourceCommit: head,
    verification: 'FILE_HASHES_AND_STRUCTURE_ONLY',
    files,
  };
}
function sbomArtifact(repo, input, head) {
  const path = pathName(input);
  const data = readBounded(repo, path, 16 * 1024 * 1024);
  parse(
    z.object({
      bomFormat: z.literal('CycloneDX'),
      specVersion: z.string().regex(/^1\.[4-7]$/u),
      version: z.number().int().positive(),
      components: z
        .array(
          z.object({
            type: z.string().min(1),
            name: z.string().min(1),
            version: z.string().min(1).optional(),
          }),
        )
        .min(1)
        .max(100000),
    }),
    jsonBytes(data),
  );
  return {
    kind: 'sbom',
    path,
    declaredSourceCommit: head,
    verification: 'FILE_HASHES_AND_STRUCTURE_ONLY',
    files: [{ path, bytes: data.length, sha256: hash(data) }],
  };
}
function ciMetadata(repo, options, head) {
  if (![options.ciEvent, options.ciCheckoutSha, options.ciPrHeadSha, options.ciRunId].some(Boolean))
    return null;
  const ci = parse(ciSchema, {
    event: options.ciEvent,
    checkoutCommit: options.ciCheckoutSha,
    pullRequestHead: options.ciPrHeadSha ?? null,
    runId: options.ciRunId,
  });
  if (ci.checkoutCommit !== head || (ci.event === 'pull_request') !== Boolean(ci.pullRequestHead))
    fail('CI_IDENTITY_MISMATCH');
  if (ci.pullRequestHead) git(repo, ['merge-base', '--is-ancestor', ci.pullRequestHead, head]);
  return ci;
}
function ignoredPacketPath(repo, input) {
  const path = pathName(input);
  if (!path.startsWith('artifacts/prelaunch/')) fail('OUTPUT_MUST_BE_IGNORED_PRELAUNCH_PATH');
  safePath(repo, path, true);
  git(repo, ['check-ignore', '-q', '--', path]);
  return path;
}
export function generatePacket(rawOptions) {
  const options = parse(optionsSchema, rawOptions);
  if (!options.out || options.packet) fail('INVALID_OPTIONS');
  const repo = rootDirectory(options.repo);
  const output = ignoredPacketPath(repo, options.out);
  const snapshot = sourceSnapshot(repo, options.expectHead);
  const head = snapshot.identity.checkoutCommit;
  const selected = Boolean(options.mobileExport || options.sbom);
  if (selected && options.artifactSourceSha !== head) fail('ARTIFACT_SOURCE_REQUIRED_OR_STALE');
  if (!selected && options.artifactSourceSha) fail('UNUSED_ARTIFACT_SOURCE');
  const artifacts = [];
  if (options.mobileExport) artifacts.push(mobileArtifact(repo, options.mobileExport, head));
  if (options.sbom) artifacts.push(sbomArtifact(repo, options.sbom, head));
  const packet = parse(packetSchema, {
    schema: 'sallah-prelaunch-packet/v1',
    createdAt: new Date().toISOString(),
    source: snapshot.identity,
    sourceInventory: 'source-files.json',
    templates: snapshot.templates,
    migrations: snapshot.migrations,
    artifacts,
    ci: ciMetadata(repo, options, head),
    externalReadiness,
  });
  clean(repo, head);
  const target = safePath(repo, output, true);
  mkdirSync(dirname(target), { recursive: true });
  safePath(repo, output, true);
  mkdirSync(target); // Never overwrite a previous packet or an existing directory.
  writeFileSync(join(target, 'source-files.json'), encoded(snapshot.files), {
    flag: 'wx',
    mode: 0o600,
  });
  writeFileSync(join(target, 'packet.json'), encoded(packet), { flag: 'wx', mode: 0o600 });
  return { packetPath: `${output}/packet.json`, packet };
}
export function verifyPacket(rawOptions) {
  const options = parse(optionsSchema, rawOptions);
  if (
    !options.packet ||
    options.out ||
    options.mobileExport ||
    options.sbom ||
    options.artifactSourceSha ||
    options.ciEvent ||
    options.ciCheckoutSha ||
    options.ciPrHeadSha ||
    options.ciRunId
  )
    fail('INVALID_OPTIONS');
  const repo = rootDirectory(options.repo);
  const path = ignoredPacketPath(repo, options.packet);
  const packet = parse(packetSchema, readJson(repo, path, 16 * 1024 * 1024));
  const snapshot = sourceSnapshot(repo, options.expectHead ?? packet.source.checkoutCommit);
  const inventoryPath = `${path.slice(0, path.lastIndexOf('/'))}/${packet.sourceInventory}`;
  const inventoryBytes = readBounded(repo, inventoryPath, 16 * 1024 * 1024);
  parse(z.array(sourceRecord).max(20000), JSON.parse(inventoryBytes.toString('utf8')));
  if (
    hash(inventoryBytes) !== packet.source.inventorySha256 ||
    !inventoryBytes.equals(encoded(snapshot.files))
  )
    fail('SOURCE_INVENTORY_CHANGED');
  // Branch records the generating checkout; commit/tree/file fingerprints are portable.
  const expectedSource = { ...snapshot.identity, branch: packet.source.branch };
  for (const [actual, expected] of [
    [packet.source, expectedSource],
    [packet.templates, snapshot.templates],
    [packet.migrations, snapshot.migrations],
  ]) {
    if (!isDeepStrictEqual(actual, expected)) fail('PACKET_SOURCE_MISMATCH');
  }
  if (packet.ci)
    ciMetadata(
      repo,
      {
        ciEvent: packet.ci.event,
        ciCheckoutSha: packet.ci.checkoutCommit,
        ciPrHeadSha: packet.ci.pullRequestHead ?? undefined,
        ciRunId: packet.ci.runId,
      },
      snapshot.identity.checkoutCommit,
    );
  const kinds = new Set();
  for (const artifact of packet.artifacts) {
    if (
      kinds.has(artifact.kind) ||
      artifact.declaredSourceCommit !== snapshot.identity.checkoutCommit
    )
      fail('ARTIFACT_IDENTITY_MISMATCH');
    kinds.add(artifact.kind);
    const actual =
      artifact.kind === 'mobile-export'
        ? mobileArtifact(repo, artifact.path, artifact.declaredSourceCommit)
        : sbomArtifact(repo, artifact.path, artifact.declaredSourceCommit);
    if (!isDeepStrictEqual(actual, artifact)) fail('ARTIFACT_CHANGED');
  }
  clean(repo, snapshot.identity.checkoutCommit);
  return packet;
}
function main(args) {
  const [command, ...flags] = args;
  if (!['generate', 'verify'].includes(command) || flags.length % 2 !== 0) fail('INVALID_COMMAND');
  const options = { repo: process.cwd() };
  const names = {
    '--repo': 'repo',
    '--out': 'out',
    '--packet': 'packet',
    '--expect-head': 'expectHead',
    '--mobile-export': 'mobileExport',
    '--sbom': 'sbom',
    '--artifact-source-sha': 'artifactSourceSha',
    '--ci-event': 'ciEvent',
    '--ci-checkout-sha': 'ciCheckoutSha',
    '--ci-pr-head-sha': 'ciPrHeadSha',
    '--ci-run-id': 'ciRunId',
  };
  const seen = new Set();
  for (let i = 0; i < flags.length; i += 2) {
    const key = names[flags[i]];
    if (!key || seen.has(key) || flags[i + 1]?.startsWith('--')) fail('INVALID_OPTIONS');
    seen.add(key);
    options[key] = flags[i + 1];
  }
  if (command === 'generate') {
    const result = generatePacket(options);
    console.log(`Prelaunch packet generated: ${result.packetPath}`);
  } else {
    verifyPacket(options);
    console.log(
      'Prelaunch packet source and selected file evidence verified; external readiness is not evaluated.',
    );
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(/^PRELAUNCH_[A-Z_]+$/u.test(error.message) ? error.message : 'PRELAUNCH_FAILED');
    process.exitCode = 1;
  }
}
