import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadPublicLegalDocument } from '../src/lib/public-legal';

const document = {
  id: '11111111-1111-4111-8111-111111111111',
  documentType: 'privacy',
  locale: 'ar',
  version: 'reviewed-fixture-v1',
  title: 'Reviewed fixture',
  body: 'Reviewed text\n\nSecond paragraph.',
  contentHash: 'a'.repeat(64),
  requiresAcceptance: true,
  accepted: false,
};
const context = {
  status: 'required',
  documents: [document],
  missingRequiredTypes: ['terms', 'community'],
};

describe('public legal document boundary', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('uses only the anonymous RPC with bounded no-store requests and no visitor session', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'test');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_fixture');
    const transport = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(context), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', transport);
    expect(await loadPublicLegalDocument('ar', 'privacy')).toEqual(document);
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, init] = transport.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:54321/rest/v1/rpc/get_legal_consent_context');
    expect(init.method).toBe('POST');
    expect(init.cache).toBe('no-store');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.body).toBe(JSON.stringify({ p_locale: 'ar' }));
    expect(new Headers(init.headers).get('apikey')).toBe('sb_publishable_fixture');
    expect(new Headers(init.headers).has('cookie')).toBe(false);
  });

  it('reads the approved RPC projection without requiring sign-in or agreement', async () => {
    const request = vi.fn().mockResolvedValue({ data: context, error: null });
    expect(await loadPublicLegalDocument('ar', 'privacy', request)).toEqual(document);
    expect(request).toHaveBeenCalledWith('ar', expect.any(AbortSignal));
  });

  it('can display an available policy while a different policy is missing', async () => {
    expect(
      await loadPublicLegalDocument('ar', 'privacy', async () => ({
        data: { ...context, status: 'unavailable' },
        error: null,
      })),
    ).toEqual(document);
  });

  it.each([
    null,
    { ...context, documents: [] },
    { ...context, documents: [{ ...document, locale: 'en' }] },
    { ...context, documents: [{ ...document, body: '' }] },
    { ...context, documents: [{ ...document, contentHash: 'invalid' }] },
    { ...context, documents: [document, document] },
    { ...context, missingRequiredTypes: ['privacy'] },
  ])('fails closed on unavailable, wrong-language or invalid documents', async (data) => {
    expect(
      await loadPublicLegalDocument('ar', 'privacy', async () => ({ data, error: null })),
    ).toBeNull();
  });

  it('discards transport errors without disclosing their messages', async () => {
    expect(
      await loadPublicLegalDocument('ar', 'privacy', async () => ({
        data: context,
        error: { message: 'private backend detail' },
      })),
    ).toBeNull();
    expect(
      await loadPublicLegalDocument('ar', 'privacy', () => {
        throw new Error('token=private');
      }),
    ).toBeNull();
  });
});
