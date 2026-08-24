import { z } from 'npm:zod@4.4.3';

const encoder = new TextEncoder();
const opaquePathSchema = z.string().regex(
  /^[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
);
const outputMimeSchema = z.enum([
  'image/jpeg',
  'image/png',
  'image/webp',
  'audio/mp4',
  'video/mp4',
]);

export const scannerFinalizationMarginSeconds = 15;
export const scannerCapabilityMaximumSeconds = 120;

export function remainingCapabilitySeconds(
  processingDeadline: string,
  at: Date,
  configuredMaximumSeconds: number,
): number {
  const deadlineMs = Date.parse(processingDeadline);
  const maximum = z.number().int().min(1).max(scannerCapabilityMaximumSeconds).parse(
    configuredMaximumSeconds,
  );
  if (!Number.isFinite(deadlineMs) || !Number.isFinite(at.getTime())) {
    throw new Error('SIGNED_CAPABILITY_EXPIRED');
  }
  const remaining = Math.floor((deadlineMs - at.getTime()) / 1_000) -
    scannerFinalizationMarginSeconds;
  if (remaining <= 0) throw new Error('SIGNED_CAPABILITY_EXPIRED');
  return Math.min(maximum, remaining);
}

function exactOrigin(value: string, allowHttp: boolean): URL {
  const parsed = new URL(value);
  if (
    parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash ||
    (parsed.protocol !== 'https:' && !(allowHttp && parsed.protocol === 'http:'))
  ) throw new Error('SIGNED_CAPABILITY_INVALID');
  return parsed;
}

function hex(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(value: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

async function hmac(key: Uint8Array, value: string): Promise<Uint8Array> {
  const ownedKey = new Uint8Array(new ArrayBuffer(key.byteLength));
  ownedKey.set(key);
  const imported = await crypto.subtle.importKey(
    'raw',
    ownedKey,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', imported, encoder.encode(value)));
}

function awsEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/gu,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function timestamp(at: Date): { date: string; datetime: string } {
  if (!Number.isFinite(at.getTime())) throw new Error('SIGNED_CAPABILITY_INVALID');
  const datetime = at.toISOString().replace(/[:-]|\.\d{3}/gu, '');
  return { date: datetime.slice(0, 8), datetime };
}

export type S3PutCapabilityInput = {
  origin: string;
  bucket: 'scan-output';
  path: string;
  contentType: z.infer<typeof outputMimeSchema>;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  expiresInSeconds: number;
  at: Date;
  allowHttp?: boolean;
};

export async function signS3PutCapability(
  input: S3PutCapabilityInput,
): Promise<{
  url: string;
  headers: { 'content-type': z.infer<typeof outputMimeSchema> };
}> {
  const origin = exactOrigin(input.origin, input.allowHttp === true);
  const path = opaquePathSchema.parse(input.path);
  const contentType = outputMimeSchema.parse(input.contentType);
  const accessKeyId = z.string().min(16).max(256).regex(/^[A-Za-z0-9_-]+$/).parse(
    input.accessKeyId,
  );
  const secretAccessKey = z.string().min(32).max(512).parse(input.secretAccessKey);
  const region = z.string().min(1).max(64).regex(/^[a-z0-9-]+$/).parse(input.region);
  const expires = z.number().int().min(1).max(scannerCapabilityMaximumSeconds).parse(
    input.expiresInSeconds,
  );
  const at = timestamp(input.at);
  const scope = `${at.date}/${region}/s3/aws4_request`;
  const canonicalPath = `/storage/v1/s3/${input.bucket}/${
    path.split('/').map(awsEncode).join('/')
  }`;
  const parameters = new Map<string, string>([
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Content-Sha256', 'UNSIGNED-PAYLOAD'],
    ['X-Amz-Credential', `${accessKeyId}/${scope}`],
    ['X-Amz-Date', at.datetime],
    ['X-Amz-Expires', String(expires)],
    ['X-Amz-SignedHeaders', 'content-type;host'],
  ]);
  const canonicalQuery = [...parameters.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${awsEncode(key)}=${awsEncode(value)}`)
    .join('&');
  const canonicalHeaders = `content-type:${contentType}\nhost:${origin.host}\n`;
  const canonicalRequest = [
    'PUT',
    canonicalPath,
    canonicalQuery,
    canonicalHeaders,
    'content-type;host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    at.datetime,
    scope,
    await sha256(canonicalRequest),
  ].join('\n');
  const dateKey = await hmac(encoder.encode(`AWS4${secretAccessKey}`), at.date);
  const regionKey = await hmac(dateKey, region);
  const serviceKey = await hmac(regionKey, 's3');
  const signingKey = await hmac(serviceKey, 'aws4_request');
  const signature = hex(await hmac(signingKey, stringToSign));
  const url = new URL(canonicalPath, origin);
  url.search = `${canonicalQuery}&X-Amz-Signature=${signature}`;
  return {
    url: url.toString(),
    headers: { 'content-type': contentType },
  };
}
