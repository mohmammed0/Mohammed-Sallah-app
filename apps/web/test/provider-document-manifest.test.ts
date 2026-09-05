import { describe, expect, it } from 'vitest';
import {
  parseProviderDocumentManifest,
  parseProviderDocumentAccess,
} from '../src/lib/provider-document-manifest';

const providerId = '11111111-1111-4111-8111-111111111111';
const documentId = '22222222-2222-4222-8222-222222222222';
const uploadId = '33333333-3333-4333-8333-333333333333';

describe('provider document manifest', () => {
  it('accepts only the bounded metadata needed by an authorized reviewer', () => {
    expect(
      parseProviderDocumentManifest(
        {
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
        },
        providerId,
      ),
    ).toMatchObject({ providerId, documents: [{ id: documentId, uploadId }] });
  });

  it.each(['storagePath', 'contentHash', 'signedUrl', 'ownerId'])(
    'rejects private field %s from the manifest projection',
    (privateField) => {
      expect(() =>
        parseProviderDocumentManifest(
          {
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
                [privateField]: 'private-value',
              },
            ],
          },
          providerId,
        ),
      ).toThrow();
    },
  );

  it('rejects a valid manifest that belongs to another provider', () => {
    expect(() =>
      parseProviderDocumentManifest(
        { providerId: '55555555-5555-4555-8555-555555555555', documents: [] },
        providerId,
      ),
    ).toThrow();
  });

  it('accepts only an expiring HTTPS media-access result', () => {
    expect(
      parseProviderDocumentAccess(
        {
          uploadId,
          mimeType: 'image/jpeg',
          sizeBytes: 1024,
          deliveryMode: 'signed_url',
          signedUrl: 'https://storage.example.invalid/object/sign/reviewer?token=redacted',
          expiresAt: '2026-08-25T12:05:00.000Z',
          correlationId: '44444444-4444-4444-8444-444444444444',
        },
        { uploadId, mimeType: 'image/jpeg', sizeBytes: 1024 },
      ),
    ).toEqual({
      signedUrl: 'https://storage.example.invalid/object/sign/reviewer?token=redacted',
      expiresAt: '2026-08-25T12:05:00.000Z',
    });
    expect(() =>
      parseProviderDocumentAccess(
        {
          uploadId,
          mimeType: 'image/jpeg',
          sizeBytes: 1024,
          deliveryMode: 'signed_url',
          signedUrl: 'http://storage.example.invalid/private',
          expiresAt: '2026-08-25T12:05:00.000Z',
          correlationId: '44444444-4444-4444-8444-444444444444',
        },
        { uploadId, mimeType: 'image/jpeg', sizeBytes: 1024 },
      ),
    ).toThrow();
    expect(() =>
      parseProviderDocumentAccess(
        {
          uploadId: '55555555-5555-4555-8555-555555555555',
          mimeType: 'image/jpeg',
          sizeBytes: 1024,
          deliveryMode: 'signed_url',
          signedUrl: 'https://storage.example.invalid/object/sign/reviewer?token=redacted',
          expiresAt: '2026-08-25T12:05:00.000Z',
          correlationId: '44444444-4444-4444-8444-444444444444',
        },
        { uploadId, mimeType: 'image/jpeg', sizeBytes: 1024 },
      ),
    ).toThrow();
  });
});
