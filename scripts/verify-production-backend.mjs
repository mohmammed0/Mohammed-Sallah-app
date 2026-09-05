import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  legalReleaseReadinessSchema,
  validateProductionBackendEnvironment,
} from '../packages/config/src/release.ts';

export async function verifyProductionBackend(environment, request = fetch) {
  const env = validateProductionBackendEnvironment(environment);
  try {
    const response = await request(
      new URL('/rest/v1/rpc/get_legal_release_readiness', env.SUPABASE_URL),
      {
        method: 'POST',
        headers: {
          apikey: env.SUPABASE_SECRET_KEY,
          Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
        signal: AbortSignal.timeout(10_000),
        redirect: 'error',
      },
    );
    if (!response.ok)
      return { ok: false, message: `Backend readiness unavailable (HTTP ${response.status})` };
    const parsed = legalReleaseReadinessSchema.safeParse(await response.json());
    if (!parsed.success)
      return { ok: false, message: 'Backend readiness returned an invalid contract' };
    const state = parsed.data;
    if (
      !state.ready ||
      !state.consentEnabled ||
      !state.versionsAligned ||
      state.missingDocuments.length > 0
    ) {
      return {
        ok: false,
        message:
          'Production blocked: enable consent and publish reviewed, aligned privacy, terms and community documents in Arabic, English, Urdu and Hindi',
      };
    }
    return {
      ok: true,
      message:
        'PASS: database requires consent and has current reviewed policies in all four locales',
    };
  } catch {
    return {
      ok: false,
      message: 'Backend readiness request failed; no credentials or response body are logged',
    };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await verifyProductionBackend(process.env);
    console.log(result.message);
    process.exitCode = result.ok ? 0 : 1;
  } catch {
    console.error('Production backend requires valid SUPABASE_URL and SUPABASE_SECRET_KEY');
    process.exitCode = 1;
  }
}
