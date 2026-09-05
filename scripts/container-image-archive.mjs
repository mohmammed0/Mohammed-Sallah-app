import { spawn } from 'node:child_process';

const maximumEvidenceBytes = 1024 * 1024;

function tarText(header, start, length) {
  return header
    .subarray(start, start + length)
    .toString('utf8')
    .replace(/\0.*$/u, '');
}

function tarSize(header) {
  const value = tarText(header, 124, 12).trim();
  if (!/^[0-7]+$/u.test(value)) throw new Error('CONTAINER_SBOM_IMAGE_ARCHIVE_INVALID');
  return Number.parseInt(value, 8);
}

export async function inspectSavedImageArchive({
  command,
  args,
  manifestDigest,
  timeoutMs = 30_000,
}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120_000) {
    throw new Error('CONTAINER_SBOM_IMAGE_ARCHIVE_TIMEOUT_INVALID');
  }
  const child = spawn(command, args, {
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const desiredManifest = `blobs/sha256/${manifestDigest.replace(/^sha256:/u, '')}`;
  const captured = new Map();
  let buffer = Buffer.alloc(0);
  let current = null;
  let stderr = '';
  let timedOut = false;
  let closed = false;
  const completion = new Promise((resolveStatus, reject) => {
    child.once('error', reject);
    child.once('close', (status) => {
      closed = true;
      resolveStatus(status);
    });
  });
  const deadline = setTimeout(() => {
    timedOut = true;
    child.kill('SIGKILL');
  }, timeoutMs);
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-8192);
  });

  let parsingError;
  try {
    for await (const chunk of child.stdout) {
      buffer = Buffer.concat([buffer, chunk]);
      while (true) {
        if (!current) {
          if (buffer.length < 512) break;
          const header = buffer.subarray(0, 512);
          buffer = buffer.subarray(512);
          if (header.every((value) => value === 0)) continue;
          const name = tarText(header, 0, 100);
          const size = tarSize(header);
          const capture = name === desiredManifest || name === 'manifest.json';
          if (capture && size > maximumEvidenceBytes) {
            throw new Error('CONTAINER_SBOM_IMAGE_ARCHIVE_INVALID');
          }
          current = {
            name,
            remaining: size,
            padding: (512 - (size % 512)) % 512,
            capture,
            parts: [],
          };
        }

        if (current.remaining > 0) {
          if (buffer.length === 0) break;
          const length = Math.min(buffer.length, current.remaining);
          if (current.capture) current.parts.push(buffer.subarray(0, length));
          buffer = buffer.subarray(length);
          current.remaining -= length;
          if (current.remaining > 0) break;
        }
        if (buffer.length < current.padding) break;
        buffer = buffer.subarray(current.padding);
        if (current.capture) {
          captured.set(current.name, Buffer.concat(current.parts).toString('utf8'));
        }
        current = null;
      }
    }
  } catch (error) {
    parsingError = error;
  } finally {
    clearTimeout(deadline);
    if (!closed) child.kill('SIGKILL');
  }

  let status;
  try {
    status = await completion;
  } catch (error) {
    if (!parsingError) parsingError = error;
  }
  if (timedOut) throw new Error('CONTAINER_SBOM_IMAGE_ARCHIVE_TIMEOUT');
  if (parsingError) throw parsingError;
  if (status !== 0 || current || (buffer.length !== 0 && !buffer.every((value) => value === 0))) {
    throw new Error(`CONTAINER_SBOM_IMAGE_ARCHIVE_FAILED:${stderr.trim()}`);
  }

  const manifestBlob = captured.get(desiredManifest);
  if (manifestBlob) {
    const manifest = JSON.parse(manifestBlob);
    return {
      manifestDigest,
      manifestMediaType: manifest.mediaType,
      configDigest: manifest.config?.digest,
    };
  }

  const archiveManifestText = captured.get('manifest.json');
  const archiveManifest = archiveManifestText ? JSON.parse(archiveManifestText) : null;
  const configPath = archiveManifest?.[0]?.Config;
  const configMatch = /^(?:blobs\/sha256\/)?(?<digest>[a-f0-9]{64})(?:\.json)?$/u.exec(configPath);
  if (!configMatch?.groups?.digest) throw new Error('CONTAINER_SBOM_IMAGE_ARCHIVE_INVALID');
  return {
    manifestDigest,
    manifestMediaType: 'application/vnd.oci.image.manifest.v1+json',
    configDigest: `sha256:${configMatch.groups.digest}`,
  };
}
