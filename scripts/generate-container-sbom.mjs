import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifyExternalContainerIdentity } from './container-image-identity.mjs';
import { inspectSavedImageArchive } from './container-image-archive.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workerImage = 'sallah-media-scanner-worker:m2v-node24.19.0-image1.13.0';
const clamavImage =
  'clamav/clamav:1.4.6@sha256:e6444f72de025a3d57e2820dd1ad9f8734d1d4d6ab0e3336cdeb09fa2ba2f122';

function windowsToWslPath(value) {
  const match = /^([A-Za-z]):\\(.*)$/u.exec(value);
  if (!match?.[1] || match[2] === undefined) return null;
  return `/mnt/${match[1].toLowerCase()}/${match[2].replaceAll('\\', '/')}`;
}

function probe(command, args) {
  return (
    spawnSync(command, args, {
      cwd: root,
      shell: false,
      stdio: 'ignore',
      windowsHide: true,
    }).status === 0
  );
}

function resolveDockerCommand() {
  if (probe('docker', ['image', 'inspect', workerImage])) {
    return (args) => ({ command: 'docker', args });
  }
  if (process.platform === 'win32') {
    const wslRoot = windowsToWslPath(root);
    if (
      wslRoot &&
      probe('wsl.exe', ['--cd', wslRoot, '-e', 'docker', 'image', 'inspect', workerImage])
    ) {
      return (args) => ({
        command: 'wsl.exe',
        args: ['--cd', wslRoot, '-e', 'docker', ...args],
      });
    }
  }
  throw new Error('CONTAINER_SBOM_DOCKER_IMAGE_REQUIRED');
}

const dockerCommand = resolveDockerCommand();

function dockerOutput(args, maxBuffer = 16 * 1024 * 1024) {
  const command = dockerCommand(args);
  const result = spawnSync(command.command, command.args, {
    cwd: root,
    shell: false,
    encoding: 'utf8',
    maxBuffer,
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error('CONTAINER_SBOM_IMAGE_INSPECTION_FAILED');
  return result.stdout;
}

function inspectImage(reference) {
  const parsed = JSON.parse(dockerOutput(['image', 'inspect', reference]));
  const image = parsed[0];
  if (!image || !/^sha256:[a-f0-9]{64}$/u.test(image.Id)) {
    throw new Error('CONTAINER_SBOM_IMAGE_DIGEST_INVALID');
  }
  return image;
}

async function inspectSavedImage(reference, manifestDigest) {
  const command = dockerCommand(['image', 'save', reference]);
  return await inspectSavedImageArchive({
    command: command.command,
    args: command.args,
    manifestDigest,
  });
}

function license(value) {
  return /^[A-Za-z0-9.+-]+$/u.test(value)
    ? [{ license: { id: value } }]
    : [{ license: { name: value || 'NOASSERTION' } }];
}

function property(name, value) {
  return { name, value: String(value) };
}

function baseComponent(entry) {
  return {
    type: entry.kind === 'native-binary' ? 'library' : 'container',
    'bom-ref': `sallah:reviewed:${entry.component}@${entry.version}`,
    name: entry.component,
    version: entry.version,
    licenses: license(entry.license),
    ...(entry.digest
      ? { hashes: [{ alg: 'SHA-256', content: entry.digest.replace(/^sha256:/u, '') }] }
      : {}),
    properties: [
      property('sallah:source', entry.source),
      property('sallah:runtime-use', entry.use),
      ...(entry.status ? [property('sallah:release-status', entry.status)] : []),
      ...(entry.integrity ? [property('sallah:package-integrity', entry.integrity)] : []),
      ...(entry.digestType ? [property('sallah:digest-type', entry.digestType)] : []),
      ...(entry.platform ? [property('sallah:platform', entry.platform)] : []),
      ...(entry.configDigest
        ? [property('sallah:source-manifest-config-digest', entry.configDigest)]
        : []),
      ...(entry.configDigestType
        ? [property('sallah:config-digest-type', entry.configDigestType)]
        : []),
    ],
  };
}

function debianComponents(output) {
  return output
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => {
      const [name, version, architecture] = line.split('\t');
      if (!name || !version || !architecture) throw new Error('CONTAINER_SBOM_DEBIAN_INVALID');
      const purl = `pkg:deb/debian/${encodeURIComponent(name)}@${encodeURIComponent(version)}?arch=${encodeURIComponent(architecture)}`;
      return {
        type: 'library',
        'bom-ref': purl,
        group: 'debian',
        name,
        version,
        purl,
        licenses: license('NOASSERTION'),
        properties: [
          property('sallah:image-scope', 'worker'),
          property('sallah:package-manager', 'dpkg'),
          property('sallah:license-evidence', 'image /usr/share/doc package metadata'),
        ],
      };
    });
}

function alpineComponents(output) {
  return output
    .split(/\n\n+/u)
    .map((block) =>
      Object.fromEntries(
        block
          .split(/\r?\n/u)
          .map((line) => /^([A-Z]):(.*)$/u.exec(line))
          .filter(Boolean)
          .map((match) => [match[1], match[2]]),
      ),
    )
    .filter((entry) => entry.P && entry.V)
    .map((entry) => {
      const architecture = entry.A ?? 'unknown';
      const purl = `pkg:apk/alpine/${encodeURIComponent(entry.P)}@${encodeURIComponent(entry.V)}?arch=${encodeURIComponent(architecture)}`;
      return {
        type: 'library',
        'bom-ref': purl,
        group: 'alpine',
        name: entry.P,
        version: entry.V,
        purl,
        licenses: license(entry.L ?? 'NOASSERTION'),
        properties: [
          property('sallah:image-scope', 'clamav'),
          property('sallah:package-manager', 'apk'),
        ],
      };
    });
}

const deployedPackageProbe = String.raw`
const fs = require('node:fs');
const path = require('node:path');
const root = '/opt/media-scanner/node_modules/.pnpm';
const found = new Map();
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(candidate);
    else if (entry.isFile() && entry.name === 'package.json') {
      const value = JSON.parse(fs.readFileSync(candidate, 'utf8'));
      if (typeof value.name === 'string' && typeof value.version === 'string') {
        found.set(value.name + '@' + value.version, {
          name: value.name,
          version: value.version,
          license: typeof value.license === 'string' ? value.license : 'NOASSERTION'
        });
      }
    }
  }
}
walk(root);
process.stdout.write(JSON.stringify([...found.values()].sort((a, b) => a.name.localeCompare(b.name))));
`;

function applicationComponents(output) {
  return JSON.parse(output).map((entry) => {
    const purl = `pkg:npm/${encodeURIComponent(entry.name)}@${encodeURIComponent(entry.version)}`;
    return {
      type: 'library',
      'bom-ref': purl,
      group: 'npm',
      name: entry.name,
      version: entry.version,
      purl,
      licenses: license(entry.license),
      properties: [
        property('sallah:image-scope', 'worker'),
        property('sallah:package-manager', 'pnpm-deploy'),
      ],
    };
  });
}

const inventory = JSON.parse(await readFile(resolve(root, 'oss-inventory.json'), 'utf8'));
const workerInspection = inspectImage(workerImage);
const clamavInspection = inspectImage(clamavImage);
const clamavInventoryEntry = inventory.containerComponents.find(
  (entry) => entry.component === 'clamav/clamav',
);
let clamavIdentity;
try {
  const savedImageEvidence = await inspectSavedImage(clamavImage, clamavInventoryEntry?.digest);
  clamavIdentity = verifyExternalContainerIdentity({
    reference: clamavImage,
    inventoryEntry: clamavInventoryEntry,
    inspection: clamavInspection,
    savedImageEvidence,
  });
} catch (error) {
  const reason = error instanceof Error ? error.message : 'CONTAINER_IMAGE_IDENTITY_INVALID';
  throw new Error(`CONTAINER_SBOM_CLAMAV_DIGEST_MISMATCH:${reason}`);
}

const debian = dockerOutput([
  'run',
  '--rm',
  '--network',
  'none',
  '--entrypoint',
  'dpkg-query',
  workerImage,
  '-W',
  '-f=${binary:Package}\t${Version}\t${Architecture}\n',
]);
const alpine = dockerOutput([
  'run',
  '--rm',
  '--network',
  'none',
  '--entrypoint',
  'cat',
  clamavImage,
  '/lib/apk/db/installed',
]);
const application = dockerOutput([
  'run',
  '--rm',
  '--network',
  'none',
  '--entrypoint',
  'node',
  workerImage,
  '-e',
  deployedPackageProbe,
]);

const components = [
  ...(inventory.containerComponents ?? []).map(baseComponent),
  ...(inventory.nativeComponents ?? []).map(baseComponent),
  ...debianComponents(debian),
  ...alpineComponents(alpine),
  ...applicationComponents(application),
].sort((left, right) => left['bom-ref'].localeCompare(right['bom-ref']));
const counts = components.reduce(
  (result, component) => {
    const scope = component.properties?.find((entry) => entry.name === 'sallah:image-scope')?.value;
    if (component.group === 'debian') result.workerOs += 1;
    else if (component.group === 'alpine') result.clamavOs += 1;
    else if (component.group === 'npm' && scope === 'worker') result.workerApplication += 1;
    else result.reviewedTopLevel += 1;
    return result;
  },
  { reviewedTopLevel: 0, workerOs: 0, clamavOs: 0, workerApplication: 0 },
);

const workerDigest = workerInspection.Id.replace(/^sha256:/u, '');
const workerReference = `sallah:worker-image:${workerInspection.Id}`;
const sbom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.6',
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    component: {
      type: 'container',
      'bom-ref': workerReference,
      name: 'sallah-media-scanner-worker',
      version: 'm2v',
      hashes: [{ alg: 'SHA-256', content: workerDigest }],
      properties: [
        property('sallah:worker-image-id', workerInspection.Id),
        property('sallah:worker-image-tag', workerImage),
        property('sallah:clamav-source-reference', clamavImage),
        property('sallah:clamav-source-manifest-digest', clamavIdentity.sourceManifestDigest),
        property('sallah:clamav-resolved-config-digest', clamavIdentity.resolvedConfigDigest),
        property('sallah:clamav-local-image-id', clamavIdentity.localImageId),
        property('sallah:clamav-repository-digest', clamavIdentity.repositoryDigest),
        property('sallah:clamav-platform', clamavIdentity.platform),
        property('sallah:inventory-coverage', JSON.stringify(counts)),
      ],
    },
  },
  components,
  dependencies: [{ ref: workerReference, dependsOn: components.map((entry) => entry['bom-ref']) }],
};
await mkdir(resolve(root, 'artifacts'), { recursive: true });
await writeFile(
  resolve(root, 'artifacts', 'container-sbom.cdx.json'),
  `${JSON.stringify(sbom, null, 2)}\n`,
  { encoding: 'utf8' },
);
console.log(
  `Container SBOM generated for ${workerInspection.Id}: ${components.length} components (${counts.workerOs} Debian, ${counts.clamavOs} Alpine, ${counts.workerApplication} deployed npm).`,
);
