import { assertEquals, assertRejects, assertThrows } from 'jsr:@std/assert@1';
import {
  classifyExpoDeliveryError,
  openPushToken,
  parsePushRuntimeConfig,
  pushDeviceRequestSchema,
  safePushMessage,
  sealPushToken,
} from './push.ts';

const encryptionKey = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
const expoToken = 'ExponentPushToken[0123456789abcdefghij]';

Deno.test('push device requests accept only bounded Expo device lifecycle inputs', () => {
  assertEquals(
    pushDeviceRequestSchema.parse({
      action: 'register',
      installationId: '11111111-1111-4111-8111-111111111111',
      platform: 'android',
      appVersion: '0.1.0',
      token: expoToken,
    }).action,
    'register',
  );
  for (
    const invalid of [
      { action: 'register', installationId: 'not-a-uuid', platform: 'android', token: expoToken },
      {
        action: 'register',
        installationId: '11111111-1111-4111-8111-111111111111',
        platform: 'web',
        token: expoToken,
      },
      {
        action: 'register',
        installationId: '11111111-1111-4111-8111-111111111111',
        platform: 'ios',
        token: 'private-fcm-token',
      },
      { action: 'revoke', installationId: '11111111-1111-4111-8111-111111111111', extra: true },
      { action: 'revoke_all', userId: '22222222-2222-4222-8222-222222222222' },
    ]
  ) {
    assertEquals(pushDeviceRequestSchema.safeParse(invalid).success, false);
  }
});

Deno.test('push tokens are authenticated-encrypted at rest and wrong keys fail closed', async () => {
  const sealed = await sealPushToken(expoToken, encryptionKey);
  assertEquals(sealed.startsWith('v1.'), true);
  assertEquals(sealed.includes(expoToken), false);
  assertEquals(await openPushToken(sealed, encryptionKey), expoToken);
  await assertRejects(
    () => openPushToken(sealed, 'Hh8dHBsaGRgXFhUUExIREA8ODQwLCgkIBwYFBAMCAQA'),
    Error,
    'PUSH_TOKEN_DECRYPTION_FAILED',
  );
});

Deno.test('preview push configuration fails closed while local test mode stays explicit', () => {
  assertThrows(
    () => parsePushRuntimeConfig({ APP_ENV: 'preview', PUSH_TOKEN_ENCRYPTION_KEY: encryptionKey }),
    Error,
    'PUSH_CONFIG_INVALID',
  );
  assertEquals(
    parsePushRuntimeConfig({
      APP_ENV: 'preview',
      PUSH_TOKEN_ENCRYPTION_KEY: encryptionKey,
      NOTIFICATION_WORKER_SECRET: '0123456789abcdef0123456789abcdef',
      EXPO_ACCESS_TOKEN: 'configured-but-never-logged',
    }).environment,
    'preview',
  );
});

Deno.test('push content is generic, localized and contains only a fixed destination envelope', () => {
  const message = safePushMessage('message_created', 'ur', 'messages');
  assertEquals(Object.keys(message.data).sort(), ['destination', 'schema']);
  assertEquals(message.data, { schema: 'sallah.push.v1', destination: 'messages' });
  const serialized = JSON.stringify(message);
  for (const forbidden of ['message body', 'exact address', 'storage/path', 'signed-url']) {
    assertEquals(serialized.includes(forbidden), false);
  }
  assertEquals(message.title.length > 0, true);
  assertEquals(message.body.length > 0, true);
});

Deno.test('Expo delivery errors distinguish terminal device revocation from bounded retries', () => {
  assertEquals(classifyExpoDeliveryError('DeviceNotRegistered'), {
    category: 'device_not_registered',
    retryable: false,
    disableToken: true,
  });
  assertEquals(classifyExpoDeliveryError('MessageRateExceeded'), {
    category: 'rate_limited',
    retryable: true,
    disableToken: false,
  });
  assertEquals(classifyExpoDeliveryError('InvalidCredentials'), {
    category: 'provider_credentials_invalid',
    retryable: false,
    disableToken: false,
  });
});
