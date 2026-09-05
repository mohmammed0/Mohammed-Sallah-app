import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MarketplaceApi, legalConsentContextSchema } from '../src/index';

const documents = (['privacy', 'terms', 'community'] as const).map((documentType, index) => ({
  id: `11111111-1111-4111-8111-11111111111${index}`,
  documentType,
  version: 'test-1',
  locale: 'en' as const,
  title: `Synthetic ${documentType}`,
  body: 'Synthetic local test policy. Not approved for launch.',
  contentHash: 'a'.repeat(64),
  requiresAcceptance: true,
  accepted: false,
}));

describe('legal consent API trust boundary', () => {
  it('loads a supported locale and submits the exact reviewed IDs and hashes', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { status: 'required', documents, missingRequiredTypes: [] },
      error: null,
    });
    const api = new MarketplaceApi({ rpc } as unknown as SupabaseClient);
    await api.getLegalConsentContext('en');
    expect(rpc).toHaveBeenCalledWith('get_legal_consent_context', { p_locale: 'en' });
    const selected = documents.map(({ id, contentHash }) => ({ id, contentHash }));
    const key = '22222222-2222-4222-8222-222222222222';
    await api.acceptCurrentLegalDocuments({
      locale: 'en',
      documents: selected,
      idempotencyKey: key,
    });
    expect(rpc).toHaveBeenLastCalledWith('accept_current_legal_documents', {
      p_locale: 'en',
      p_documents: selected,
      p_idempotency_key: key,
    });
    await expect(api.getLegalConsentContext('xx')).rejects.toThrow();
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it('rejects hash-only drafts, duplicate types, and an incomplete accepted state', () => {
    expect(
      legalConsentContextSchema.safeParse({
        status: 'required',
        documents: [{ ...documents[0], body: '' }],
        missingRequiredTypes: [],
      }).success,
    ).toBe(false);
    expect(
      legalConsentContextSchema.safeParse({
        status: 'required',
        documents: [documents[0], documents[0]],
        missingRequiredTypes: [],
      }).success,
    ).toBe(false);
    expect(
      legalConsentContextSchema.safeParse({
        status: 'accepted',
        documents,
        missingRequiredTypes: [],
      }).success,
    ).toBe(false);
    expect(
      legalConsentContextSchema.safeParse({
        status: 'accepted',
        documents: [],
        missingRequiredTypes: [],
      }).success,
    ).toBe(false);
    expect(
      legalConsentContextSchema.safeParse({
        status: 'not_required',
        documents: [],
        missingRequiredTypes: [],
      }).success,
    ).toBe(true);
  });
  it('propagates a safe RPC failure without treating it as consent', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'private backend details' },
    });
    const api = new MarketplaceApi({ rpc } as unknown as SupabaseClient);
    await expect(api.getLegalConsentContext('ar')).rejects.toThrow(
      'GET_LEGAL_CONSENT_CONTEXT_FAILED:P0001',
    );
  });
});
