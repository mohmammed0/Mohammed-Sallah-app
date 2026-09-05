import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { assertActorLegalConsent } from './legal-consent.ts';

Deno.test('AI transfer awaits authoritative legal consent before contacting a provider', async () => {
  const effects: string[] = [];
  await assertActorLegalConsent(() => {
    effects.push('database');
    return Promise.resolve({ error: null });
  });
  effects.push('provider');
  assertEquals(effects, ['database', 'provider']);
  for (
    const message of [
      'LEGAL_ACCEPTANCE_REQUIRED',
      'LEGAL_DOCUMENTS_UNAVAILABLE',
      'ACCOUNT_NOT_ACTIVE',
    ]
  ) {
    await assertRejects(
      () => assertActorLegalConsent(() => Promise.resolve({ error: { message } })),
      Error,
      message,
    );
  }
});

Deno.test('legal consent database error details never become a provider or client payload', async () => {
  await assertRejects(
    () =>
      assertActorLegalConsent(() =>
        Promise.resolve({ error: { message: 'synthetic secret or database detail' } })
      ),
    Error,
    'LEGAL_CONSENT_CHECK_FAILED',
  );
});
