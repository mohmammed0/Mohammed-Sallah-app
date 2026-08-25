import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const providerId = '11111111-1111-4111-8111-111111111111';
const documentId = '22222222-2222-4222-8222-222222222222';
const uploadId = '33333333-3333-4333-8333-333333333333';
const state = vi.hoisted(() => ({
  manifest: null as unknown,
  rpcCalls: [] as Array<{ name: string; args: unknown }>,
  functionCalls: [] as Array<{ name: string; body: unknown }>,
}));

function providerQuery() {
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: async () => ({
      data: [
        {
          user_id: providerId,
          kind: 'individual',
          business_name: 'مزود تجريبي',
          verification_status: 'submitted',
          rating_average: 0,
          rating_count: 0,
          completed_jobs: 0,
          created_at: '2026-08-25T12:00:00.000Z',
          provider_services: [],
        },
      ],
      error: null,
    }),
  };
  return builder;
}

const client = {
  from: () => providerQuery(),
  rpc: async (name: string, args: unknown) => {
    state.rpcCalls.push({ name, args });
    return { data: state.manifest, error: null };
  },
  functions: {
    invoke: async (name: string, options: { body: unknown }) => {
      state.functionCalls.push({ name, body: options.body });
      return {
        data: {
          uploadId,
          mimeType: 'image/jpeg',
          sizeBytes: 1024,
          deliveryMode: 'signed_url',
          signedUrl: 'https://storage.example.invalid/object/sign/document?token=test-only',
          expiresAt: '2026-08-25T12:05:00.000Z',
          correlationId: '44444444-4444-4444-8444-444444444444',
        },
        error: null,
      };
    },
  },
};

vi.mock('@/lib/auth', () => ({
  requireAdmin: async () => ({ client, roles: ['verification_reviewer'] }),
}));

describe('provider verification document review', () => {
  beforeEach(() => {
    state.rpcCalls = [];
    state.functionCalls = [];
    state.manifest = {
      providerId,
      documents: [
        {
          id: documentId,
          uploadId,
          documentType: 'identity_or_license',
          mimeType: 'image/jpeg',
          sizeBytes: 1024,
          status: 'submitted',
          expiresAt: null,
          createdAt: '2026-08-25T12:00:00.000Z',
        },
      ],
    };
  });

  it('loads a safe manifest and requests access through the existing protected-media boundary', async () => {
    const { default: ProvidersPage } = await import('../app/admin/providers/page');
    const html = renderToStaticMarkup(
      await ProvidersPage({ searchParams: Promise.resolve({ providerId }) }),
    );

    expect(state.rpcCalls).toEqual([
      { name: 'get_provider_document_manifest', args: { p_provider_id: providerId } },
    ]);
    expect(state.functionCalls).toEqual([
      {
        name: 'media-access',
        body: { uploadId, expiresInSeconds: 300 },
      },
    ]);
    expect(html).toContain('identity_or_license');
    expect(html).toContain('https://storage.example.invalid/object/sign/document?token=test-only');
    expect(html).not.toContain(uploadId);
  });

  it('fails closed and never requests media for a malformed manifest', async () => {
    state.manifest = { providerId, documents: [{ id: documentId, storagePath: 'private/path' }] };
    const { default: ProvidersPage } = await import('../app/admin/providers/page');
    const html = renderToStaticMarkup(
      await ProvidersPage({ searchParams: Promise.resolve({ providerId }) }),
    );

    expect(state.functionCalls).toEqual([]);
    expect(html).toContain('تعذر تحميل مستندات التحقق بأمان');
    expect(html).not.toContain('private/path');
  });
});
