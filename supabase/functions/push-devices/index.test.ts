import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { applyPushDeviceCommand, type PushDeviceDatabase } from './index.ts';

const encryptionKey = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
const userId = 'f8000000-0000-4000-8000-000000000001';
const installationId = '11111111-1111-4111-8111-111111111111';
const token = 'ExponentPushToken[0123456789abcdefghij]';

class FakeDatabase implements PushDeviceDatabase {
  calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  failure = false;
  rpc(name: string, args: Record<string, unknown>) {
    this.calls.push({ name, args });
    return Promise.resolve({ data: this.failure ? null : { ok: true }, error: this.failure });
  }
}

Deno.test('authenticated push registration stores only a hash and encrypted routing token', async () => {
  const db = new FakeDatabase();
  assertEquals(
    await applyPushDeviceCommand(
      { action: 'register', installationId, platform: 'android', appVersion: '0.1.0', token },
      userId,
      db,
      encryptionKey,
    ),
    { status: 'registered' },
  );
  assertEquals(db.calls[0]?.name, 'register_push_device');
  const args = db.calls[0]?.args ?? {};
  assertEquals(String(args.p_token_hash).length, 64);
  assertEquals(String(args.p_token_ciphertext).startsWith('v1.'), true);
  assertEquals(JSON.stringify(args).includes(token), false);
});

Deno.test('push device revocation is scoped to the authenticated owner', async () => {
  const db = new FakeDatabase();
  assertEquals(
    await applyPushDeviceCommand({ action: 'revoke', installationId }, userId, db, encryptionKey),
    { status: 'revoked' },
  );
  assertEquals(db.calls[0], {
    name: 'revoke_push_devices',
    args: { p_user_id: userId, p_installation_id: installationId },
  });
  assertEquals(
    await applyPushDeviceCommand({ action: 'revoke_all' }, userId, db, encryptionKey),
    { status: 'revoked' },
  );
  assertEquals(db.calls[1], {
    name: 'revoke_push_devices',
    args: { p_user_id: userId, p_installation_id: null },
  });
});

Deno.test('push registration failure returns no credential or database detail', async () => {
  const db = new FakeDatabase();
  db.failure = true;
  await assertRejects(
    () =>
      applyPushDeviceCommand(
        { action: 'register', installationId, platform: 'ios', appVersion: '0.1.0', token },
        userId,
        db,
        encryptionKey,
      ),
    Error,
    'PUSH_DEVICE_COMMAND_FAILED',
  );
});

Deno.test('push device Edge authentication is mandatory while the worker stays secret-authenticated', async () => {
  const config = await Deno.readTextFile(new URL('../../config.toml', import.meta.url));
  assertEquals(
    config.includes('[functions.push-devices]\nverify_jwt = true'),
    true,
  );
  assertEquals(
    config.includes('[functions.notification-worker]\nverify_jwt = false'),
    true,
  );
});
