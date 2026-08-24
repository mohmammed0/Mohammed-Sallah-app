const digestPattern = /^sha256:[a-f0-9]{64}$/iu;

function normalizeDigest(value, errorCode) {
  if (typeof value !== 'string' || !digestPattern.test(value)) throw new Error(errorCode);
  return value.toLowerCase();
}

function canonicalRepository(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('CONTAINER_IMAGE_REPOSITORY_INVALID');
  }
  let repository = value.trim().toLowerCase();
  for (const prefix of ['docker.io/', 'index.docker.io/', 'registry-1.docker.io/']) {
    if (repository.startsWith(prefix)) {
      repository = repository.slice(prefix.length);
      break;
    }
  }
  if (!repository.includes('/')) repository = `library/${repository}`;
  if (!/^[a-z0-9._/-]+$/u.test(repository)) {
    throw new Error('CONTAINER_IMAGE_REPOSITORY_INVALID');
  }
  return `docker.io/${repository}`;
}

function parseImmutableReference(reference) {
  if (typeof reference !== 'string' || !reference.includes('@')) {
    throw new Error('CONTAINER_IMAGE_REFERENCE_IMMUTABLE_REQUIRED');
  }
  const separator = reference.lastIndexOf('@');
  const named = reference.slice(0, separator);
  const digestValue = reference.slice(separator + 1);
  const slash = named.lastIndexOf('/');
  const tag = named.lastIndexOf(':');
  if (!named || tag <= slash || !named.slice(tag + 1)) {
    throw new Error('CONTAINER_IMAGE_REFERENCE_INVALID');
  }
  let digest;
  try {
    digest = normalizeDigest(digestValue, 'CONTAINER_IMAGE_REFERENCE_INVALID');
  } catch {
    throw new Error('CONTAINER_IMAGE_REFERENCE_INVALID');
  }
  return { repository: canonicalRepository(named.slice(0, tag)), digest };
}

function parseRepositoryDigest(value) {
  if (typeof value !== 'string' || !value.includes('@')) return null;
  const separator = value.lastIndexOf('@');
  try {
    return {
      repository: canonicalRepository(value.slice(0, separator)),
      digest: normalizeDigest(
        value.slice(separator + 1),
        'CONTAINER_IMAGE_REPOSITORY_DIGEST_INVALID',
      ),
    };
  } catch {
    return null;
  }
}

export function verifyExternalContainerIdentity({
  reference,
  inventoryEntry,
  inspection,
  savedImageEvidence,
}) {
  const source = parseImmutableReference(reference);
  const inventoryDigest = normalizeDigest(
    inventoryEntry?.digest,
    'CONTAINER_IMAGE_INVENTORY_DIGEST_INVALID',
  );
  const configDigest = normalizeDigest(
    inventoryEntry?.configDigest,
    'CONTAINER_IMAGE_CONFIG_DIGEST_INVALID',
  );
  if (inventoryEntry?.digestType !== 'oci-image-manifest') {
    throw new Error('CONTAINER_IMAGE_DIGEST_TYPE_INVALID');
  }
  if (inventoryEntry?.configDigestType !== 'oci-manifest-config-descriptor') {
    throw new Error('CONTAINER_IMAGE_CONFIG_DIGEST_TYPE_INVALID');
  }
  if (source.repository !== canonicalRepository(inventoryEntry?.component)) {
    throw new Error('CONTAINER_IMAGE_REPOSITORY_MISMATCH');
  }
  if (source.digest !== inventoryDigest) {
    throw new Error('CONTAINER_IMAGE_SOURCE_DIGEST_MISMATCH');
  }

  if (
    !savedImageEvidence ||
    savedImageEvidence.manifestMediaType !== 'application/vnd.oci.image.manifest.v1+json'
  ) {
    throw new Error('CONTAINER_IMAGE_SAVED_EVIDENCE_INVALID');
  }
  const savedManifestDigest = normalizeDigest(
    savedImageEvidence.manifestDigest,
    'CONTAINER_IMAGE_SAVED_EVIDENCE_INVALID',
  );
  const savedConfigDigest = normalizeDigest(
    savedImageEvidence.configDigest,
    'CONTAINER_IMAGE_SAVED_EVIDENCE_INVALID',
  );
  if (savedManifestDigest !== source.digest) {
    throw new Error('CONTAINER_IMAGE_MANIFEST_DIGEST_MISMATCH');
  }
  if (savedConfigDigest !== configDigest) {
    throw new Error('CONTAINER_IMAGE_CONFIG_DIGEST_MISMATCH');
  }

  const platform = `${inspection?.Os ?? ''}/${inspection?.Architecture ?? ''}`;
  if (inventoryEntry?.platform !== platform) {
    throw new Error('CONTAINER_IMAGE_PLATFORM_MISMATCH');
  }
  const matchingRepositoryDigest = inspection?.RepoDigests?.map(parseRepositoryDigest).find(
    (candidate) =>
      candidate?.repository === source.repository && candidate.digest === source.digest,
  );
  if (!matchingRepositoryDigest) {
    throw new Error('CONTAINER_IMAGE_REPOSITORY_DIGEST_MISSING');
  }

  if (inspection?.Descriptor) {
    const descriptorDigest = normalizeDigest(
      inspection.Descriptor.digest,
      'CONTAINER_IMAGE_DESCRIPTOR_INVALID',
    );
    if (
      descriptorDigest !== source.digest ||
      inspection.Descriptor.mediaType !== savedImageEvidence.manifestMediaType
    ) {
      throw new Error('CONTAINER_IMAGE_DESCRIPTOR_MISMATCH');
    }
  }

  const localImageId = normalizeDigest(inspection?.Id, 'CONTAINER_IMAGE_LOCAL_ID_INVALID');
  if (localImageId !== source.digest && localImageId !== configDigest) {
    throw new Error('CONTAINER_IMAGE_LOCAL_ID_MISMATCH');
  }
  return {
    sourceManifestDigest: source.digest,
    resolvedConfigDigest: savedConfigDigest,
    localImageId,
    repositoryDigest: `${source.repository}@${source.digest}`,
    platform,
  };
}
