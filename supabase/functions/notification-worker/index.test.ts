import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { sealPushToken } from '../_shared/push.ts';
import {
  type NotificationClaim,
  type NotificationWorkerDatabase,
  processNotificationClaim,
} from './index.ts';

const encryptionKey = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';

class FakeDatabase implements NotificationWorkerDatabase {
  calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  rpc(name: string, args: Record<string, unknown>) {
    this.calls.push({ name, args });
    return Promise.resolve({ data: null, error: null });
  }
}

const baseClaim: NotificationClaim = {
  outboxId: '11111111-1111-4111-8111-111111111111',
  stage: 'send',
  eventType: 'new_offer',
  locale: 'ar',
  destination: 'offers',
  attempt: 1,
  targets: [],
  tickets: [],
};

Deno.test('notification worker records disabled delivery when preference or devices suppress push', async () => {
  const db = new FakeDatabase();
  const result = await processNotificationClaim(baseClaim, db, {
    encryptionKey,
    accessToken: 'configured',
    fetch: () => Promise.reject(new Error('network must not run')),
    workerId: 'worker-1',
    leaseToken: 'lease-1',
  });
  assertEquals(result, { delivered: 0, deferred: 0, disabled: 1, failed: 0 });
  assertEquals(db.calls[0]?.name, 'complete_notification_delivery');
  assertEquals(db.calls[0]?.args.p_result, {
    outcome: 'disabled',
    category: 'no_eligible_device',
    tickets: [],
  });
});

Deno.test('notification worker checks Expo receipts and disables only unregistered device targets', async () => {
  const db = new FakeDatabase();
  const receiptClaim: NotificationClaim = {
    ...baseClaim,
    stage: 'receipt',
    targets: [],
    tickets: [
      {
        tokenId: '22222222-2222-4222-8222-222222222222',
        ticketId: 'ticket-1',
      },
    ],
  };
  const result = await processNotificationClaim(receiptClaim, db, {
    encryptionKey,
    accessToken: 'configured',
    fetch: () =>
      Promise.resolve(
        Response.json({
          data: {
            'ticket-1': {
              status: 'error',
              details: { error: 'DeviceNotRegistered' },
            },
          },
        }),
      ),
    workerId: 'worker-1',
    leaseToken: 'lease-1',
  });
  assertEquals(result, { delivered: 0, deferred: 0, disabled: 1, failed: 0 });
  assertEquals(db.calls[0]?.name, 'complete_notification_receipts');
  const serialized = JSON.stringify(db.calls[0]);
  assertEquals(serialized.includes('DeviceNotRegistered'), false);
  assertEquals(serialized.includes('device_not_registered'), true);
});

Deno.test('notification worker sends generic Expo content and records the returned ticket', async () => {
  const db = new FakeDatabase();
  const token = 'ExponentPushToken[0123456789abcdefghij]';
  let requestBody: unknown;
  let requestSignal: AbortSignal | null | undefined;
  const claim: NotificationClaim = {
    ...baseClaim,
    targets: [{
      tokenId: '22222222-2222-4222-8222-222222222222',
      tokenCiphertext: await sealPushToken(token, encryptionKey),
    }],
  };
  const result = await processNotificationClaim(claim, db, {
    encryptionKey,
    accessToken: 'configured',
    fetch: (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      requestSignal = init?.signal;
      return Promise.resolve(Response.json({ data: [{ status: 'ok', id: 'ticket-1' }] }));
    },
    workerId: 'worker-1',
    leaseToken: 'lease-1',
  });
  assertEquals(result, { delivered: 0, deferred: 1, disabled: 0, failed: 0 });
  assertEquals(requestSignal instanceof AbortSignal, true);
  assertEquals(requestBody, [{
    to: token,
    title: 'تحديث جديد في صلّح',
    body: 'افتح التطبيق لمراجعة التحديث بأمان.',
    data: { schema: 'sallah.push.v1', destination: 'offers' },
    sound: 'default',
    channelId: 'service-updates',
  }]);
  assertEquals(db.calls[0]?.args.p_result, {
    outcome: 'deferred',
    category: 'receipt_pending',
    tickets: [{
      tokenId: '22222222-2222-4222-8222-222222222222',
      status: 'ticketed',
      ticketId: 'ticket-1',
    }],
  });
});

Deno.test('notification worker treats invalid Expo credentials as terminal', async () => {
  const db = new FakeDatabase();
  const claim: NotificationClaim = {
    ...baseClaim,
    targets: [{
      tokenId: '22222222-2222-4222-8222-222222222222',
      tokenCiphertext: await sealPushToken(
        'ExponentPushToken[0123456789abcdefghij]',
        encryptionKey,
      ),
    }],
  };
  const result = await processNotificationClaim(claim, db, {
    encryptionKey,
    accessToken: 'configured',
    fetch: () =>
      Promise.resolve(Response.json({
        data: [{ status: 'error', details: { error: 'InvalidCredentials' } }],
      })),
    workerId: 'worker-1',
    leaseToken: 'lease-1',
  });
  assertEquals(result, { delivered: 0, deferred: 0, disabled: 0, failed: 1 });
  assertEquals(db.calls[0]?.args.p_result, {
    outcome: 'terminal',
    category: 'delivery_failed',
    tickets: [{
      tokenId: '22222222-2222-4222-8222-222222222222',
      status: 'terminal_failure',
      category: 'provider_credentials_invalid',
      disableToken: false,
    }],
  });
});

Deno.test('notification worker surfaces temporary Expo outages for bounded database retry', async () => {
  const db = new FakeDatabase();
  const claim: NotificationClaim = {
    ...baseClaim,
    targets: [{
      tokenId: '22222222-2222-4222-8222-222222222222',
      tokenCiphertext: await sealPushToken(
        'ExponentPushToken[0123456789abcdefghij]',
        encryptionKey,
      ),
    }],
  };
  await assertRejects(
    () =>
      processNotificationClaim(claim, db, {
        encryptionKey,
        accessToken: 'configured',
        fetch: () => Promise.resolve(new Response(null, { status: 503 })),
        workerId: 'worker-1',
        leaseToken: 'lease-1',
      }),
    Error,
    'EXPO_TEMPORARY_FAILURE',
  );
  assertEquals(db.calls, []);
});

Deno.test('notification worker preserves pending devices when another receipt is delivered', async () => {
  const db = new FakeDatabase();
  const claim: NotificationClaim = {
    ...baseClaim,
    stage: 'receipt',
    tickets: [
      { tokenId: '22222222-2222-4222-8222-222222222222', ticketId: 'ticket-delivered' },
      { tokenId: '33333333-3333-4333-8333-333333333333', ticketId: 'ticket-pending' },
    ],
  };
  const result = await processNotificationClaim(claim, db, {
    encryptionKey,
    accessToken: 'configured',
    fetch: () =>
      Promise.resolve(Response.json({
        data: { 'ticket-delivered': { status: 'ok' } },
      })),
    workerId: 'worker-1',
    leaseToken: 'lease-1',
  });
  assertEquals(result, { delivered: 0, deferred: 1, disabled: 0, failed: 0 });
  assertEquals(db.calls[0]?.args.p_result, {
    outcome: 'deferred',
    category: 'receipt_pending',
    receipts: [
      {
        tokenId: '22222222-2222-4222-8222-222222222222',
        ticketId: 'ticket-delivered',
        status: 'delivered',
      },
      {
        tokenId: '33333333-3333-4333-8333-333333333333',
        ticketId: 'ticket-pending',
        status: 'pending',
      },
    ],
  });
});
