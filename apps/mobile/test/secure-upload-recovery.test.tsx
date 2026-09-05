import { act, create } from 'react-test-renderer';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const recoverPendingSecureUploads = vi.hoisted(() => vi.fn());
const retryPendingSecureUpload = vi.hoisted(() => vi.fn());

vi.mock('react-native', () => ({
  Pressable: 'Pressable',
  Text: 'Text',
  View: 'View',
  StyleSheet: { create: (value: unknown) => value },
}));

vi.mock('../src/lib/secure-upload', () => ({
  recoverPendingSecureUploads,
  retryPendingSecureUpload,
}));

vi.mock('../src/providers/locale-provider', () => ({
  useLocale: () => ({
    locale: 'en',
    t: (key: string) => key,
  }),
}));

import { SecureUploadRecoveryCoordinator } from '../src/features/media/secure-upload-recovery';

const ownerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const uploadId = '11111111-1111-4111-8111-111111111111';
const ambiguous = {
  uploadId,
  operationId: '22222222-2222-4222-8222-222222222222',
  ownerId,
  recoveryKey: 'request-media:local-image-1',
  purpose: 'request_media',
  resourceId: null,
  mediaFingerprint: '9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a',
  createdAt: '2026-08-21T12:00:00.000Z',
  state: 'quarantine_pending',
};
const active = { ...ambiguous, state: 'started' };

describe('production secure-upload restart coordinator', () => {
  beforeEach(() => {
    recoverPendingSecureUploads.mockReset();
    retryPendingSecureUpload.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is mounted by the authenticated production root layout', () => {
    const layout = readFileSync(new URL('../app/_layout.tsx', import.meta.url), 'utf8');
    expect(layout).toContain('SecureUploadRecoveryCoordinator');
    expect(layout).toContain('ownerId={legal.canEnter ? (session?.user.id ?? null) : null}');
  });

  it('resumes the authenticated owner journal when the production coordinator mounts', async () => {
    recoverPendingSecureUploads.mockResolvedValue({ ambiguous: [], completed: [], active: [] });

    await act(async () => {
      create(<SecureUploadRecoveryCoordinator ownerId={ownerId} />);
    });

    expect(recoverPendingSecureUploads).toHaveBeenCalledWith(ownerId, { maxAttempts: 1 });
  });

  it('keeps ambiguous recovery visible until the user explicitly retries the same upload', async () => {
    recoverPendingSecureUploads
      .mockResolvedValueOnce({ ambiguous: [ambiguous], completed: [], active: [] })
      .mockResolvedValueOnce({ ambiguous: [], completed: [], active: [] });
    retryPendingSecureUpload.mockResolvedValue({
      uploadId,
      status: 'clean',
      sanitized: true,
      mimeType: 'image/png',
      sizeBytes: 4,
    });
    let renderer: ReturnType<typeof create>;

    await act(async () => {
      renderer = create(<SecureUploadRecoveryCoordinator ownerId={ownerId} />);
    });
    const retry = renderer!.root.find(
      (node) => node.props.accessibilityRole === 'button' && node.props.children,
    );
    await act(async () => {
      retry.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(retryPendingSecureUpload).toHaveBeenCalledWith(ownerId, uploadId, {
      consumeClean: false,
      maxAttempts: 1,
    });
    expect(recoverPendingSecureUploads).toHaveBeenCalledTimes(2);
    expect(renderer!.root.findAll((node) => node.props.accessibilityRole === 'button')).toEqual([]);
  });

  it('continues bounded background polling from queued/scanning to clean after restart', async () => {
    vi.useFakeTimers();
    recoverPendingSecureUploads
      .mockResolvedValueOnce({ ambiguous: [], completed: [], active: [active] })
      .mockResolvedValueOnce({ ambiguous: [], completed: [], active: [active] })
      .mockResolvedValueOnce({
        ambiguous: [],
        completed: [
          { uploadId, status: 'clean', sanitized: true, mimeType: 'image/png', sizeBytes: 4 },
        ],
        active: [],
      });

    await act(async () => {
      create(<SecureUploadRecoveryCoordinator ownerId={ownerId} />);
    });
    expect(recoverPendingSecureUploads).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(recoverPendingSecureUploads).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(recoverPendingSecureUploads).toHaveBeenCalledTimes(3);
    expect(recoverPendingSecureUploads.mock.calls).toEqual([
      [ownerId, { maxAttempts: 1 }],
      [ownerId, { maxAttempts: 1 }],
      [ownerId, { maxAttempts: 1 }],
    ]);
  });

  it('cannot let an old-owner retry overwrite the new-owner recovery state', async () => {
    const nextOwner = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    let finishRetry: (() => void) | undefined;
    retryPendingSecureUpload.mockReturnValue(
      new Promise((resolve) => {
        finishRetry = () =>
          resolve({
            uploadId,
            status: 'clean',
            sanitized: true,
            mimeType: 'image/png',
            sizeBytes: 4,
          });
      }),
    );
    recoverPendingSecureUploads.mockImplementation(async (requestedOwner: string) =>
      requestedOwner === ownerId
        ? { ambiguous: [ambiguous], completed: [], active: [] }
        : { ambiguous: [], completed: [], active: [] },
    );
    let renderer: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<SecureUploadRecoveryCoordinator ownerId={ownerId} />);
    });
    const retry = renderer!.root.find((node) => node.props.accessibilityRole === 'button');
    await act(async () => {
      retry.props.onPress();
      renderer!.update(<SecureUploadRecoveryCoordinator ownerId={nextOwner} />);
      await Promise.resolve();
    });
    await act(async () => {
      finishRetry?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(renderer!.root.findAll((node) => node.props.accessibilityRole === 'button')).toEqual([]);
    expect(recoverPendingSecureUploads).toHaveBeenCalledWith(nextOwner, { maxAttempts: 1 });
  });
});
