/**
 * Exhaustive hosted Edge control-plane surface for M2 media scanning.
 *
 * These modules may process bounded control metadata and exact Storage coordinates only. Unrelated
 * provider transports are intentionally outside this inventory; protected `media-access` is covered
 * separately as a live-authorized streaming broker.
 */
export const mediaScanningControlPlaneModules = [
  'scan-upload/index.ts',
  'scanner-control/index.ts',
  '_shared/s3-capability.ts',
  '_shared/scanner-control.ts',
  '_shared/upload-security.ts',
  '_shared/privacy.ts',
  'privacy-worker/index.ts',
] as const;
