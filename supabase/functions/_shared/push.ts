import { z } from 'npm:zod@4.4.3';
import { parseAppEnvironment } from './scanner-control.ts';

const expoTokenSchema = z.string().regex(
  /^(?:Expo|Exponent)PushToken\[[A-Za-z0-9_-]{10,200}\]$/,
  'INVALID_EXPO_PUSH_TOKEN',
);
const installationIdSchema = z.string().uuid();

export const pushDeviceRequestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('register'),
    installationId: installationIdSchema,
    platform: z.enum(['ios', 'android']),
    appVersion: z.string().trim().min(1).max(64),
    token: expoTokenSchema,
  }).strict(),
  z.object({
    action: z.literal('revoke'),
    installationId: installationIdSchema,
  }).strict(),
  z.object({ action: z.literal('revoke_all') }).strict(),
]);

export const pushDestinationSchema = z.enum([
  'offers',
  'provider_feed',
  'messages',
  'jobs',
  'support',
  'account',
  'notifications',
]);
export type PushDestination = z.infer<typeof pushDestinationSchema>;

export const pushEnvelopeSchema = z.object({
  schema: z.literal('sallah.push.v1'),
  destination: pushDestinationSchema,
}).strict();

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) throw new Error('PUSH_CONFIG_INVALID');
  const padded = `${value.replaceAll('-', '+').replaceAll('_', '/')}=`;
  try {
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  } catch {
    throw new Error('PUSH_CONFIG_INVALID');
  }
}

function ownedBytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(new ArrayBuffer(value.byteLength));
  result.set(value);
  return result;
}

function encodeBase64Url(value: Uint8Array): string {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function importEncryptionKey(encoded: string): Promise<CryptoKey> {
  const bytes = ownedBytes(decodeBase64Url(encoded));
  if (bytes.byteLength !== 32) throw new Error('PUSH_CONFIG_INVALID');
  return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sealPushToken(token: string, encodedKey: string): Promise<string> {
  const parsed = expoTokenSchema.parse(token);
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await importEncryptionKey(encodedKey),
    new TextEncoder().encode(parsed),
  );
  return `v1.${encodeBase64Url(iv)}.${encodeBase64Url(new Uint8Array(ciphertext))}`;
}

export async function openPushToken(ciphertext: string, encodedKey: string): Promise<string> {
  const parts = ciphertext.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1' || !parts[1] || !parts[2]) {
    throw new Error('PUSH_TOKEN_DECRYPTION_FAILED');
  }
  try {
    const iv = ownedBytes(decodeCiphertextPart(parts[1], 12));
    const encrypted = ownedBytes(decodeCiphertextPart(parts[2]));
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      await importEncryptionKey(encodedKey),
      encrypted,
    );
    return expoTokenSchema.parse(new TextDecoder().decode(plaintext));
  } catch {
    throw new Error('PUSH_TOKEN_DECRYPTION_FAILED');
  }
}

function decodeCiphertextPart(value: string, expectedLength?: number): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('PUSH_TOKEN_DECRYPTION_FAILED');
  const remainder = value.length % 4;
  const padding = remainder === 0 ? '' : '='.repeat(4 - remainder);
  const binary = atob(`${value.replaceAll('-', '+').replaceAll('_', '/')}${padding}`);
  const decoded = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (expectedLength !== undefined && decoded.byteLength !== expectedLength) {
    throw new Error('PUSH_TOKEN_DECRYPTION_FAILED');
  }
  return decoded;
}

interface PushEnvironmentSource {
  APP_ENV?: string;
  PUSH_TOKEN_ENCRYPTION_KEY?: string;
  NOTIFICATION_WORKER_SECRET?: string;
  EXPO_ACCESS_TOKEN?: string;
}

export function parsePushRuntimeConfig(source: PushEnvironmentSource) {
  const environment = parseAppEnvironment(source.APP_ENV);
  const encryptionKey = source.PUSH_TOKEN_ENCRYPTION_KEY;
  if (!encryptionKey) throw new Error('PUSH_CONFIG_INVALID');
  decodeBase64Url(encryptionKey);
  const workerSecret = source.NOTIFICATION_WORKER_SECRET;
  const accessToken = source.EXPO_ACCESS_TOKEN;
  if (
    (environment === 'preview' || environment === 'production') &&
    (!workerSecret || workerSecret.length < 32 || !accessToken)
  ) {
    throw new Error('PUSH_CONFIG_INVALID');
  }
  if (workerSecret && workerSecret.length < 32) throw new Error('PUSH_CONFIG_INVALID');
  return {
    environment,
    encryptionKey,
    workerSecret: workerSecret ?? '',
    accessToken: accessToken ?? '',
  };
}

const localizedCopy = {
  ar: { title: 'تحديث جديد في صلّح', body: 'افتح التطبيق لمراجعة التحديث بأمان.' },
  en: { title: 'New Sallah update', body: 'Open the app to review the update securely.' },
  ur: { title: 'صلّح میں نئی اطلاع', body: 'محفوظ طریقے سے تفصیل دیکھنے کے لیے ایپ کھولیں۔' },
  hi: { title: 'صلّح में नया अपडेट', body: 'अपडेट सुरक्षित रूप से देखने के लिए ऐप खोलें।' },
} as const;

export function safePushMessage(
  _eventType: string,
  locale: string,
  destination: PushDestination,
) {
  const selected = locale === 'en' || locale === 'ur' || locale === 'hi' ? locale : 'ar';
  return {
    ...localizedCopy[selected],
    data: { schema: 'sallah.push.v1' as const, destination },
  };
}

export interface ExpoErrorDisposition {
  category: string;
  retryable: boolean;
  disableToken: boolean;
}

export function classifyExpoDeliveryError(error: string | undefined): ExpoErrorDisposition {
  if (error === 'DeviceNotRegistered') {
    return { category: 'device_not_registered', retryable: false, disableToken: true };
  }
  if (error === 'MessageRateExceeded' || error === 'TOO_MANY_REQUESTS') {
    return { category: 'rate_limited', retryable: true, disableToken: false };
  }
  if (error === 'InvalidCredentials') {
    return {
      category: 'provider_credentials_invalid',
      retryable: false,
      disableToken: false,
    };
  }
  if (error === 'MessageTooBig' || error === 'MessageTooManyRequests') {
    return { category: 'invalid_payload', retryable: false, disableToken: false };
  }
  return { category: 'provider_unavailable', retryable: true, disableToken: false };
}
