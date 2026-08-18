import { beforeEach, describe, expect, it, vi } from 'vitest';

const stored = vi.hoisted(() => new Map<string, string>());
const copied = vi.hoisted(() => new Set<string>());
vi.mock('../src/lib/secure-storage', () => ({
  chunkedSecureStorage: {
    getItem: vi.fn(async (key: string) => stored.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      stored.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      stored.delete(key);
    }),
  },
}));
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///app-private/',
  getInfoAsync: vi.fn(async () => ({ exists: true, size: 2048 })),
  makeDirectoryAsync: vi.fn(async () => undefined),
  copyAsync: vi.fn(async ({ to }: { to: string }) => {
    copied.add(to);
  }),
  deleteAsync: vi.fn(async (uri: string) => {
    copied.delete(uri);
  }),
}));

import {
  clearRetainedMedia,
  listRetainedMedia,
  removeRetainedMedia,
  retainPrivateMedia,
} from '../src/lib/durable-media';

describe('durable private request media', () => {
  beforeEach(() => {
    stored.clear();
    copied.clear();
  });

  it('removes a superseded retained recording from both disk and the index', async () => {
    const userId = '44444444-4444-4444-8444-444444444444';
    const first = await retainPrivateMedia({
      userId,
      kind: 'voice',
      sourceUri: 'file:///one.m4a',
      filename: 'one.m4a',
      mimeType: 'audio/mp4',
    });
    const second = await retainPrivateMedia({
      userId,
      kind: 'voice',
      sourceUri: 'file:///two.m4a',
      filename: 'two.m4a',
      mimeType: 'audio/mp4',
    });
    await removeRetainedMedia(userId, [first.id]);
    expect(copied.has(first.localUri)).toBe(false);
    expect(await listRetainedMedia(userId)).toEqual([second]);
  });

  it('copies a selected image into user-scoped app-private storage and restores it', async () => {
    const userId = '44444444-4444-4444-8444-444444444444';
    const retained = await retainPrivateMedia({
      userId,
      kind: 'image',
      sourceUri: 'file:///picker/temporary.jpg',
      filename: 'temporary.jpg',
      mimeType: 'image/jpeg',
    });
    expect(retained.localUri).toContain('/sallah-request-media/' + userId + '/');
    expect(copied.has(retained.localUri)).toBe(true);
    expect(await listRetainedMedia(userId)).toEqual([retained]);
    await clearRetainedMedia(userId);
    expect(copied.size).toBe(0);
    expect(await listRetainedMedia(userId)).toEqual([]);
  });
});
