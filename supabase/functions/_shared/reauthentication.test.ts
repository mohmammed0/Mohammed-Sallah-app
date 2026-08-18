import { assertEquals, assertRejects, assertThrows } from 'jsr:@std/assert@1';
import {
  currentSessionId,
  reauthenticationInputSchema,
  verifyOtpReauthentication,
  verifyPasswordReauthentication,
} from './reauthentication.ts';

Deno.test('current session id is taken from the already authenticated bearer session', () => {
  const sessionId = '11111111-1111-4111-8111-111111111111';
  const encoded = btoa(JSON.stringify({ session_id: sessionId }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  const request = new Request('https://local.test', {
    headers: { Authorization: `Bearer header.${encoded}.signature` },
  });
  assertEquals(currentSessionId(request), sessionId);
  assertThrows(
    () => currentSessionId(new Request('https://local.test')),
    Error,
    'AUTH_REQUIRED',
  );
});

Deno.test('incorrect password never records a proof and a successful retry records current session', async () => {
  let attempts = 0;
  let records = 0;
  const input = {
    userId: '11111111-1111-4111-8111-111111111111',
    sessionId: '22222222-2222-4222-8222-222222222222',
    email: 'owner@test.invalid',
    password: 'correct-password',
  };
  const dependencies = {
    verifyCredentials: () => Promise.resolve(++attempts > 1),
    recordProof: (_userId: string, sessionId: string) => {
      records += 1;
      assertEquals(sessionId, input.sessionId);
      return Promise.resolve('2026-08-18T10:10:00.000Z');
    },
  };
  await assertRejects(
    () => verifyPasswordReauthentication(input, dependencies),
    Error,
    'WRONG_PASSWORD',
  );
  assertEquals(records, 0);
  assertEquals(
    await verifyPasswordReauthentication(input, dependencies),
    '2026-08-18T10:10:00.000Z',
  );
  assertEquals(records, 1);
});

Deno.test('OTP provider abstraction fails closed when SMS verification is unavailable', async () => {
  assertEquals(
    reauthenticationInputSchema.safeParse({ method: 'otp', nonce: '123456' }).success,
    true,
  );
  await assertRejects(
    () => verifyOtpReauthentication('123456'),
    Error,
    'OTP_REAUTHENTICATION_NOT_CONFIGURED',
  );
});
