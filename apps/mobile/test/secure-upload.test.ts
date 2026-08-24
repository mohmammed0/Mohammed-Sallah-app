import { beforeEach, describe, expect, it, vi } from 'vitest';

const stored = vi.hoisted(() => new Map<string, string>());
const rpc = vi.hoisted(() => vi.fn());
const invoke = vi.hoisted(() => vi.fn());
const upload = vi.hoisted(() => vi.fn());
const getUser = vi.hoisted(() => vi.fn());
const setStoredItem = vi.hoisted(() => vi.fn());
const removeStoredItem = vi.hoisted(() => vi.fn());

vi.mock('../src/lib/secure-storage', () => ({
  chunkedSecureStorage: {
    getItem: vi.fn(async (key: string) => stored.get(key) ?? null),
    setItem: setStoredItem,
    removeItem: removeStoredItem,
  },
}));
vi.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: { getUser },
    rpc,
    functions: { invoke },
    storage: { from: () => ({ upload }) },
  },
}));

import {
  discardCompletedSecureUploads,
  listPendingSecureUploads,
  recoverPendingSecureUploads,
  resumeSecureUpload,
  retryPendingSecureUpload,
  secureUpload,
} from '../src/lib/secure-upload';

const uploadId = '11111111-1111-4111-8111-111111111111';
const ownerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const recoveryKey = 'request-media:local-image-1';
const secondUploadId = '99999999-9999-4999-8999-999999999999';
const firstMediaFingerprint = '9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a';
const requestBinding = {
  purpose: 'request_media',
  resourceId: null,
  mediaFingerprint: firstMediaFingerprint,
} as const;
const clean = {
  uploadId,
  status: 'clean',
  sanitized: true,
  mimeType: 'image/png',
  sizeBytes: 4,
};

describe('asynchronous secure upload recovery', () => {
  beforeEach(() => {
    stored.clear();
    rpc.mockReset();
    getUser.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: ownerId } }, error: null });
    invoke.mockReset();
    upload.mockReset();
    setStoredItem.mockReset();
    setStoredItem.mockImplementation(async (key: string, value: string) => stored.set(key, value));
    removeStoredItem.mockReset();
    removeStoredItem.mockImplementation(async (key: string) => stored.delete(key));
  });

  it('persists a pre-upload recovery record before quarantine transfer', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        uploadId,
        bucket: 'quarantine',
        path: 'owner/upload/file.png',
        contentType: 'image/png',
        expiresAt: '2026-08-21T12:10:00.000Z',
      },
      error: null,
    });
    upload.mockImplementationOnce(async () => {
      expect(await listPendingSecureUploads(ownerId)).toEqual([
        expect.objectContaining({
          uploadId,
          state: 'quarantine_pending',
          purpose: 'request_media',
          resourceId: null,
          mediaFingerprint: firstMediaFingerprint,
        }),
      ]);
      return { error: { message: 'network interrupted' } };
    });

    await expect(
      secureUpload({
        bytes: new Uint8Array([1, 2, 3, 4]),
        filename: 'file.png',
        mimeType: 'image/png',
        purpose: 'request_media',
        recoveryKey,
      }),
    ).rejects.toThrow('QUARANTINE_UPLOAD_FAILED');
    expect(invoke).not.toHaveBeenCalled();
    await expect(resumeSecureUpload(ownerId, uploadId)).rejects.toThrow(
      'QUARANTINE_UPLOAD_INCOMPLETE',
    );
    expect(invoke).not.toHaveBeenCalled();
  });

  it('retains the pre-upload state when the uploaded-state write is interrupted', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        uploadId,
        bucket: 'quarantine',
        path: 'owner/upload/file.png',
        contentType: 'image/png',
        expiresAt: '2026-08-21T12:10:00.000Z',
      },
      error: null,
    });
    upload.mockResolvedValueOnce({ error: null });
    setStoredItem
      .mockImplementationOnce(async (key: string, value: string) => stored.set(key, value))
      .mockImplementationOnce(async (key: string) => {
        stored.delete(key);
        throw new Error('process terminated');
      });

    await expect(
      secureUpload({
        bytes: new Uint8Array([1, 2, 3, 4]),
        filename: 'file.png',
        mimeType: 'image/png',
        purpose: 'request_media',
        recoveryKey,
      }),
    ).rejects.toThrow('process terminated');
    expect(upload).toHaveBeenCalledTimes(1);
    expect(await listPendingSecureUploads(ownerId)).toEqual([
      expect.objectContaining({ uploadId, state: 'quarantine_pending' }),
    ]);
    await expect(resumeSecureUpload(ownerId, uploadId)).rejects.toThrow(
      'QUARANTINE_UPLOAD_INCOMPLETE',
    );
    expect(invoke).not.toHaveBeenCalled();
  });

  it('uses the other valid generation when one journal slot contains malformed JSON', async () => {
    const record = {
      uploadId,
      operationId: '22222222-2222-4222-8222-222222222222',
      ownerId,
      recoveryKey,
      ...requestBinding,
      createdAt: '2026-08-21T12:00:00.000Z',
      state: 'uploaded',
    };
    stored.set(
      'sallah.media.scan.pending.v2.a',
      JSON.stringify({ schemaVersion: 1, revision: 3, records: [record] }),
    );
    stored.set('sallah.media.scan.pending.v2.b', '{"schemaVersion":1,"revision":4');

    await expect(listPendingSecureUploads(ownerId)).resolves.toEqual([record]);
  });

  it('records uploaded state before the first queue request', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        uploadId,
        bucket: 'quarantine',
        path: 'owner/upload/file.png',
        contentType: 'image/png',
        expiresAt: '2026-08-21T12:10:00.000Z',
      },
      error: null,
    });
    upload.mockResolvedValueOnce({ error: null });
    invoke.mockImplementationOnce(async () => {
      expect(await listPendingSecureUploads(ownerId)).toEqual([
        expect.objectContaining({ uploadId, state: 'uploaded' }),
      ]);
      return { data: clean, error: null };
    });

    await expect(
      secureUpload({
        bytes: new Uint8Array([1, 2, 3, 4]),
        filename: 'file.png',
        mimeType: 'image/png',
        purpose: 'request_media',
        recoveryKey,
      }),
    ).resolves.toEqual(clean);
  });

  it('rejects a ninth active recovery record before creating another ticket', async () => {
    stored.set(
      'sallah.media.scan.pending.v1',
      JSON.stringify(
        Array.from({ length: 8 }, (_, index) => ({
          uploadId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
          operationId: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
          ownerId,
          recoveryKey: `request-media:capacity-${index + 1}`,
          ...requestBinding,
          createdAt: '2026-08-21T12:00:00.000Z',
          state: index % 2 === 0 ? 'uploaded' : 'started',
        })),
      ),
    );

    await expect(
      secureUpload({
        bytes: new Uint8Array([1, 2, 3, 4]),
        filename: 'file.png',
        mimeType: 'image/png',
        purpose: 'request_media',
        recoveryKey: 'request-media:capacity-new',
      }),
    ).rejects.toThrow('UPLOAD_RECOVERY_CAPACITY_EXCEEDED');
    expect(rpc).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect(await listPendingSecureUploads(ownerId)).toHaveLength(8);
  });

  it('does not let 256 terminal completed records block a new upload', async () => {
    const completedRecords = Array.from({ length: 256 }, (_, index) => {
      const suffix = String(index + 1).padStart(12, '0');
      const completedUploadId = `00000000-0000-4000-8000-${suffix}`;
      return {
        uploadId: completedUploadId,
        operationId: `10000000-0000-4000-8000-${suffix}`,
        ownerId,
        recoveryKey: `request-media:completed-${index + 1}`,
        ...requestBinding,
        createdAt: new Date(Date.UTC(2026, 7, 1, 0, 0, index)).toISOString(),
        state: 'completed',
        result: { ...clean, uploadId: completedUploadId },
      };
    });
    stored.set(
      'sallah.media.scan.pending.v2.a',
      JSON.stringify({ schemaVersion: 1, revision: 7, records: completedRecords }),
    );
    rpc.mockResolvedValueOnce({
      data: {
        uploadId: secondUploadId,
        bucket: 'quarantine',
        path: 'owner/upload/new-file.png',
        contentType: 'image/png',
        expiresAt: '2026-08-24T12:10:00.000Z',
      },
      error: null,
    });
    upload.mockResolvedValueOnce({ error: null });
    invoke.mockResolvedValueOnce({
      data: { ...clean, uploadId: secondUploadId },
      error: null,
    });

    await expect(
      secureUpload({
        bytes: new Uint8Array([9, 9, 9, 9]),
        filename: 'new-file.png',
        mimeType: 'image/png',
        purpose: 'request_media',
        recoveryKey: 'request-media:new-after-terminal-capacity',
      }),
    ).resolves.toEqual({ ...clean, uploadId: secondUploadId });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it('prunes the oldest completed record, preserves active work, and replays without a duplicate job', async () => {
    const activeUploadId = '77777777-7777-4777-8777-777777777777';
    const now = Date.now();
    const completedRecords = Array.from({ length: 255 }, (_, index) => {
      const suffix = String(index + 1).padStart(12, '0');
      const completedUploadId = `00000000-0000-4000-8000-${suffix}`;
      return {
        uploadId: completedUploadId,
        operationId: `10000000-0000-4000-8000-${suffix}`,
        ownerId: index === 254 ? 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' : ownerId,
        recoveryKey: `request-media:recent-completed-${index + 1}`,
        ...requestBinding,
        createdAt: new Date(now - (255 - index) * 1_000).toISOString(),
        state: 'completed',
        result: { ...clean, uploadId: completedUploadId },
      };
    });
    const activeRecord = {
      uploadId: activeUploadId,
      operationId: '66666666-6666-4666-8666-666666666666',
      ownerId,
      recoveryKey: 'request-media:active-preserved',
      ...requestBinding,
      createdAt: new Date(now).toISOString(),
      state: 'started',
    };
    stored.set(
      'sallah.media.scan.pending.v2.a',
      JSON.stringify({
        schemaVersion: 1,
        revision: 9,
        records: [...completedRecords, activeRecord],
      }),
    );
    rpc.mockResolvedValueOnce({
      data: {
        uploadId: secondUploadId,
        bucket: 'quarantine',
        path: 'owner/upload/pruned-replay.png',
        contentType: 'image/png',
        expiresAt: '2026-08-24T12:10:00.000Z',
      },
      error: null,
    });
    upload.mockResolvedValueOnce({ error: null });
    invoke.mockRejectedValueOnce(new Error('response lost'));
    const input = {
      bytes: new Uint8Array([9, 9, 9, 9]),
      filename: 'pruned-replay.png',
      mimeType: 'image/png' as const,
      purpose: 'request_media' as const,
      recoveryKey: 'request-media:pruned-response-loss',
    };

    await expect(secureUpload(input, { sleep: async () => undefined })).rejects.toThrow(
      'UPLOAD_SCAN_PENDING',
    );
    const afterPrune = await listPendingSecureUploads(ownerId);
    expect(afterPrune.some((record) => record.uploadId === activeUploadId)).toBe(true);
    expect(afterPrune.some((record) => record.uploadId === completedRecords[0]?.uploadId)).toBe(
      false,
    );
    expect(afterPrune.some((record) => record.uploadId === completedRecords[1]?.uploadId)).toBe(
      true,
    );
    await expect(
      listPendingSecureUploads('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
    ).resolves.toHaveLength(1);

    invoke.mockResolvedValueOnce({ data: { ...clean, uploadId: secondUploadId }, error: null });
    await expect(secureUpload(input, { sleep: async () => undefined })).resolves.toEqual({
      ...clean,
      uploadId: secondUploadId,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('explicitly discards only the requested owner completed records', async () => {
    const otherOwnerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const records = [
      {
        uploadId,
        operationId: '22222222-2222-4222-8222-222222222222',
        ownerId,
        recoveryKey,
        ...requestBinding,
        createdAt: '2026-08-21T12:00:00.000Z',
        state: 'completed',
        result: clean,
      },
      {
        uploadId: secondUploadId,
        operationId: '88888888-8888-4888-8888-888888888888',
        ownerId: otherOwnerId,
        recoveryKey: 'request-media:other-owner',
        ...requestBinding,
        createdAt: '2026-08-21T12:00:00.000Z',
        state: 'completed',
        result: { ...clean, uploadId: secondUploadId },
      },
    ];
    stored.set(
      'sallah.media.scan.pending.v2.a',
      JSON.stringify({ schemaVersion: 1, revision: 8, records }),
    );

    await expect(discardCompletedSecureUploads(ownerId)).resolves.toBe(1);
    await expect(listPendingSecureUploads(ownerId)).resolves.toEqual([]);
    await expect(listPendingSecureUploads(otherOwnerId)).resolves.toHaveLength(1);
  });

  it('persists one queue operation before start and reuses it after response loss', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        uploadId,
        bucket: 'quarantine',
        path: 'owner/upload/file.png',
        contentType: 'image/png',
        expiresAt: '2026-08-21T12:10:00.000Z',
      },
      error: null,
    });
    upload.mockResolvedValue({ error: null });
    invoke.mockRejectedValueOnce(new Error('response lost'));

    await expect(
      secureUpload(
        {
          bytes: new Uint8Array([1, 2, 3, 4]),
          filename: 'file.png',
          mimeType: 'image/png',
          purpose: 'request_media',
          recoveryKey,
        },
        { sleep: async () => undefined },
      ),
    ).rejects.toThrow('UPLOAD_SCAN_PENDING');

    const pending = await listPendingSecureUploads(ownerId);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.uploadId).toBe(uploadId);
    expect(pending[0]?.operationId).toMatch(/^[0-9a-f-]{36}$/i);

    invoke.mockResolvedValueOnce({ data: clean, error: null });
    await expect(
      resumeSecureUpload(ownerId, uploadId, { sleep: async () => undefined }),
    ).resolves.toEqual(clean);
    expect(invoke.mock.calls[1]?.[1]?.body.operationId).toBe(pending[0]?.operationId);
    expect(await listPendingSecureUploads(ownerId)).toEqual([]);
  });

  it('polls queued/scanning with bounded backoff and never creates a second ticket', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        uploadId,
        bucket: 'quarantine',
        path: 'owner/upload/file.png',
        contentType: 'image/png',
        expiresAt: '2026-08-21T12:10:00.000Z',
      },
      error: null,
    });
    upload.mockResolvedValue({ error: null });
    invoke
      .mockResolvedValueOnce({ data: { uploadId, status: 'queued' }, error: null })
      .mockResolvedValueOnce({ data: { uploadId, status: 'scanning' }, error: null })
      .mockResolvedValueOnce({ data: clean, error: null });
    const delays: number[] = [];

    await expect(
      secureUpload(
        {
          bytes: new Uint8Array([1, 2, 3, 4]),
          filename: 'file.png',
          mimeType: 'image/png',
          purpose: 'request_media',
          recoveryKey,
        },
        { sleep: async (ms) => delays.push(ms) },
      ),
    ).resolves.toEqual(clean);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(delays).toEqual([500, 1_000]);
    expect(invoke.mock.calls.map((call) => call[1].body.uploadId)).toEqual([
      uploadId,
      uploadId,
      uploadId,
    ]);
  });

  it.each(['rejected', 'terminal_failure'] as const)(
    'stops and clears journal on %s',
    async (status) => {
      stored.set(
        'sallah.media.scan.pending.v1',
        JSON.stringify([
          {
            uploadId,
            operationId: '22222222-2222-4222-8222-222222222222',
            ownerId,
            recoveryKey,
            ...requestBinding,
            createdAt: '2026-08-21T12:00:00.000Z',
            state: 'started',
          },
        ]),
      );
      invoke.mockResolvedValueOnce({
        data: { uploadId, status, terminalCategory: 'policy_rejected' },
        error: null,
      });
      await expect(
        resumeSecureUpload(ownerId, uploadId, { sleep: async () => undefined }),
      ).rejects.toThrow(status === 'rejected' ? 'UPLOAD_REJECTED' : 'UPLOAD_SCAN_TERMINAL_FAILURE');
      expect(await listPendingSecureUploads(ownerId)).toEqual([]);
    },
  );

  it.each([
    ['audio/mp4', 'request_audio'],
    ['video/mp4', 'completion_proof'],
  ] as const)('queues, scans, and returns clean %s', async (mimeType, purpose) => {
    const cleanMedia = { ...clean, mimeType };
    rpc.mockResolvedValueOnce({
      data: {
        uploadId,
        bucket: 'quarantine',
        path: `opaque/${uploadId}`,
        contentType: mimeType,
        expiresAt: '2026-08-21T12:10:00.000Z',
      },
      error: null,
    });
    upload.mockResolvedValueOnce({ error: null });
    invoke.mockResolvedValueOnce({ data: cleanMedia, error: null });
    const input =
      purpose === 'completion_proof'
        ? {
            bytes: new Uint8Array([1, 2, 3, 4]),
            filename: 'completion.mp4',
            mimeType,
            purpose,
            resourceId: '33333333-3333-4333-8333-333333333333',
            recoveryKey: 'completion-video',
          }
        : {
            bytes: new Uint8Array([1, 2, 3, 4]),
            filename: 'voice.m4a',
            mimeType,
            purpose,
            recoveryKey: 'request-audio',
          };
    await expect(secureUpload(input)).resolves.toEqual(cleanMedia);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('reuses the same upload and operation when an entry surface retries after restart', async () => {
    stored.set(
      'sallah.media.scan.pending.v2.a',
      JSON.stringify({
        schemaVersion: 1,
        revision: 4,
        records: [
          {
            uploadId,
            operationId: '22222222-2222-4222-8222-222222222222',
            ownerId,
            recoveryKey,
            ...requestBinding,
            createdAt: '2026-08-21T12:00:00.000Z',
            state: 'uploaded',
          },
        ],
      }),
    );
    invoke.mockResolvedValueOnce({ data: clean, error: null });

    await expect(
      secureUpload({
        bytes: new Uint8Array([1, 2, 3, 4]),
        filename: 'retry.png',
        mimeType: 'image/png',
        purpose: 'request_media',
        recoveryKey,
      }),
    ).resolves.toEqual(clean);

    expect(rpc).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith('scan-upload', {
      body: {
        uploadId,
        action: 'start',
        operationId: '22222222-2222-4222-8222-222222222222',
      },
    });
  });

  it('startup preserves a clean result until the matching entry surface consumes it', async () => {
    stored.set(
      'sallah.media.scan.pending.v2.a',
      JSON.stringify({
        schemaVersion: 1,
        revision: 4,
        records: [
          {
            uploadId,
            operationId: '22222222-2222-4222-8222-222222222222',
            ownerId,
            recoveryKey,
            ...requestBinding,
            createdAt: '2026-08-21T12:00:00.000Z',
            state: 'started',
          },
        ],
      }),
    );
    invoke.mockResolvedValueOnce({ data: clean, error: null });

    await expect(recoverPendingSecureUploads(ownerId, { maxAttempts: 1 })).resolves.toEqual({
      ambiguous: [],
      completed: [clean],
      active: [],
    });
    expect(await listPendingSecureUploads(ownerId)).toEqual([
      expect.objectContaining({ uploadId, state: 'completed', result: clean }),
    ]);

    await expect(
      secureUpload({
        bytes: new Uint8Array([1, 2, 3, 4]),
        filename: 'retry.png',
        mimeType: 'image/png',
        purpose: 'request_media',
        recoveryKey,
      }),
    ).resolves.toEqual(clean);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect(await listPendingSecureUploads(ownerId)).toEqual([]);
  });

  it('never consumes an older clean result for newly selected unrelated bytes', async () => {
    stored.set(
      'sallah.media.scan.pending.v2.a',
      JSON.stringify({
        schemaVersion: 1,
        revision: 4,
        records: [
          {
            uploadId,
            operationId: '22222222-2222-4222-8222-222222222222',
            ownerId,
            recoveryKey: 'message-attachment:33333333-3333-4333-8333-333333333333',
            purpose: 'message_attachment',
            resourceId: '33333333-3333-4333-8333-333333333333',
            mediaFingerprint: firstMediaFingerprint,
            createdAt: '2026-08-21T12:00:00.000Z',
            state: 'completed',
            result: clean,
          },
        ],
      }),
    );
    rpc.mockResolvedValueOnce({
      data: {
        uploadId: secondUploadId,
        bucket: 'quarantine',
        path: 'owner/upload/new-file.png',
        contentType: 'image/png',
        expiresAt: '2026-08-21T12:10:00.000Z',
      },
      error: null,
    });
    upload.mockResolvedValueOnce({ error: null });
    invoke.mockResolvedValueOnce({
      data: { ...clean, uploadId: secondUploadId },
      error: null,
    });

    await expect(
      secureUpload({
        bytes: new Uint8Array([9, 9, 9, 9]),
        filename: 'new-file.png',
        mimeType: 'image/png',
        purpose: 'message_attachment',
        resourceId: '33333333-3333-4333-8333-333333333333',
        recoveryKey: 'message-attachment:33333333-3333-4333-8333-333333333333',
      }),
    ).resolves.toEqual({ ...clean, uploadId: secondUploadId });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(await listPendingSecureUploads(ownerId)).toEqual([
      expect.objectContaining({ uploadId, state: 'completed' }),
    ]);
  });

  it('keeps an ambiguous upload until explicit retry reuses its original operation', async () => {
    stored.set(
      'sallah.media.scan.pending.v2.a',
      JSON.stringify({
        schemaVersion: 1,
        revision: 4,
        records: [
          {
            uploadId,
            operationId: '22222222-2222-4222-8222-222222222222',
            ownerId,
            recoveryKey,
            ...requestBinding,
            createdAt: '2026-08-21T12:00:00.000Z',
            state: 'quarantine_pending',
          },
        ],
      }),
    );
    invoke.mockResolvedValueOnce({ data: clean, error: null });

    await expect(
      secureUpload({
        bytes: new Uint8Array([1, 2, 3, 4]),
        filename: 'retry.png',
        mimeType: 'image/png',
        purpose: 'request_media',
        recoveryKey,
      }),
    ).rejects.toThrow('UPLOAD_RECOVERY_ACTION_REQUIRED');
    expect(rpc).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();

    await expect(
      retryPendingSecureUpload(ownerId, uploadId, { sleep: async () => undefined }),
    ).resolves.toEqual(clean);
    expect(invoke).toHaveBeenCalledWith('scan-upload', {
      body: {
        uploadId,
        action: 'start',
        operationId: '22222222-2222-4222-8222-222222222222',
      },
    });
  });

  it('discards an absent quarantine object when authoritative start rejects recovery', async () => {
    stored.set(
      'sallah.media.scan.pending.v2.a',
      JSON.stringify({
        schemaVersion: 1,
        revision: 4,
        records: [
          {
            uploadId,
            operationId: '22222222-2222-4222-8222-222222222222',
            ownerId,
            recoveryKey,
            ...requestBinding,
            createdAt: '2026-08-21T12:00:00.000Z',
            state: 'quarantine_pending',
          },
        ],
      }),
    );
    invoke.mockResolvedValueOnce({
      data: {
        uploadId,
        status: 'terminal_failure',
        terminalCategory: 'quarantine_upload_incomplete',
      },
      error: null,
    });

    await expect(
      retryPendingSecureUpload(ownerId, uploadId, { sleep: async () => undefined }),
    ).rejects.toThrow('UPLOAD_SCAN_TERMINAL_FAILURE');
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(await listPendingSecureUploads(ownerId)).toEqual([]);
  });

  it('retains the original operation when explicit retry loses the start response', async () => {
    stored.set(
      'sallah.media.scan.pending.v2.a',
      JSON.stringify({
        schemaVersion: 1,
        revision: 4,
        records: [
          {
            uploadId,
            operationId: '22222222-2222-4222-8222-222222222222',
            ownerId,
            recoveryKey,
            ...requestBinding,
            createdAt: '2026-08-21T12:00:00.000Z',
            state: 'quarantine_pending',
          },
        ],
      }),
    );
    invoke.mockRejectedValueOnce(new Error('response lost'));

    await expect(
      retryPendingSecureUpload(ownerId, uploadId, { sleep: async () => undefined }),
    ).rejects.toThrow('UPLOAD_SCAN_PENDING');
    expect(await listPendingSecureUploads(ownerId)).toEqual([
      expect.objectContaining({
        uploadId,
        operationId: '22222222-2222-4222-8222-222222222222',
        state: 'quarantine_pending',
      }),
    ]);
  });

  it('startup recovery isolates accounts and clears terminal records to release capacity', async () => {
    const otherOwner = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    stored.set(
      'sallah.media.scan.pending.v2.a',
      JSON.stringify({
        schemaVersion: 1,
        revision: 4,
        records: [
          ...Array.from({ length: 8 }, (_, index) => ({
            uploadId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
            operationId: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
            ownerId,
            recoveryKey: `request-media:terminal-${index + 1}`,
            ...requestBinding,
            createdAt: '2026-08-21T12:00:00.000Z',
            state: 'started',
          })),
          {
            uploadId: '99999999-9999-4999-8999-999999999999',
            operationId: '88888888-8888-4888-8888-888888888888',
            ownerId: otherOwner,
            recoveryKey: 'request-media:other-owner',
            ...requestBinding,
            createdAt: '2026-08-21T12:00:00.000Z',
            state: 'started',
          },
        ],
      }),
    );
    invoke.mockImplementation(async (_name: string, options: { body: { uploadId: string } }) => ({
      data: {
        uploadId: options.body.uploadId,
        status: 'terminal_failure',
        terminalCategory: 'scan_attempt_limit',
      },
      error: null,
    }));

    const recovered = await recoverPendingSecureUploads(ownerId, {
      sleep: async () => undefined,
      maxAttempts: 1,
    });

    expect(recovered.ambiguous).toEqual([]);
    expect(invoke).toHaveBeenCalledTimes(8);
    expect(await listPendingSecureUploads(ownerId)).toEqual([]);
    expect(await listPendingSecureUploads(otherOwner)).toHaveLength(1);
  });
});
