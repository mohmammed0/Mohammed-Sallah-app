import { createRandomId } from './random-id';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { z } from 'zod';
import { chunkedSecureStorage } from './secure-storage';

const MAX_ITEM_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const MAX_ITEMS = 4;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export const retainedMediaSchema = z.object({
  id: z.string().min(8).max(128),
  userId: z.uuid(),
  kind: z.enum(['image', 'voice']),
  localUri: z.string().min(1),
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  sizeBytes: z.number().int().positive().max(MAX_ITEM_BYTES),
  createdAt: z.string(),
  expiresAt: z.string(),
});
export type RetainedMedia = z.infer<typeof retainedMediaSchema>;

function indexKey(userId: string): string {
  return `sallah:durable-media:v1:${userId}`;
}

async function loadIndex(userId: string): Promise<RetainedMedia[]> {
  const raw = await chunkedSecureStorage.getItem(indexKey(userId));
  if (!raw) return [];
  const parsed = z.array(retainedMediaSchema).safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data.filter((item) => item.userId === userId) : [];
}

async function saveIndex(userId: string, items: readonly RetainedMedia[]): Promise<void> {
  await chunkedSecureStorage.setItem(indexKey(userId), JSON.stringify(items));
}

export async function cleanupRetainedMedia(userId: string): Promise<RetainedMedia[]> {
  const now = Date.now();
  const items = await loadIndex(userId);
  const retained: RetainedMedia[] = [];
  for (const item of items) {
    if (Date.parse(item.expiresAt) <= now) {
      if (Platform.OS !== 'web') {
        await FileSystem.deleteAsync(item.localUri, { idempotent: true }).catch(() => undefined);
      }
    } else {
      retained.push(item);
    }
  }
  await saveIndex(userId, retained);
  return retained;
}

export async function listRetainedMedia(userId: string): Promise<RetainedMedia[]> {
  return cleanupRetainedMedia(userId);
}

export async function retainPrivateMedia(input: {
  userId: string;
  kind: RetainedMedia['kind'];
  sourceUri: string;
  filename: string;
  mimeType: string;
  sizeBytes?: number | undefined;
}): Promise<RetainedMedia> {
  const items = await cleanupRetainedMedia(input.userId);
  const sourceInfo = await FileSystem.getInfoAsync(input.sourceUri);
  if (!sourceInfo.exists) throw new Error('LOCAL_MEDIA_MISSING');
  const sizeBytes = input.sizeBytes ?? sourceInfo.size ?? 0;
  if (sizeBytes < 1 || sizeBytes > MAX_ITEM_BYTES) throw new Error('LOCAL_MEDIA_SIZE_INVALID');
  if (items.length >= MAX_ITEMS) throw new Error('LOCAL_MEDIA_ITEM_LIMIT');
  if (items.reduce((sum, item) => sum + item.sizeBytes, 0) + sizeBytes > MAX_TOTAL_BYTES) {
    throw new Error('LOCAL_MEDIA_TOTAL_LIMIT');
  }
  const id = createRandomId();
  const extension =
    input.filename
      .split('.')
      .pop()
      ?.replace(/[^a-zA-Z0-9]/g, '') || 'bin';
  const root = FileSystem.documentDirectory;
  if (!root) throw new Error('APP_PRIVATE_STORAGE_UNAVAILABLE');
  const directory = `${root}sallah-request-media/${input.userId}/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const localUri = `${directory}${id}.${extension}`;
  await FileSystem.copyAsync({ from: input.sourceUri, to: localUri });
  const createdAt = new Date().toISOString();
  const retainedMedia = retainedMediaSchema.parse({
    id,
    userId: input.userId,
    kind: input.kind,
    localUri,
    filename: input.filename,
    mimeType: input.mimeType,
    sizeBytes,
    createdAt,
    expiresAt: new Date(Date.now() + RETENTION_MS).toISOString(),
  });
  await saveIndex(input.userId, [...items, retainedMedia]);
  return retainedMedia;
}

export async function removeRetainedMedia(userId: string, ids: readonly string[]): Promise<void> {
  const idSet = new Set(ids);
  const items = await loadIndex(userId);
  await Promise.all(
    items
      .filter((item) => idSet.has(item.id))
      .map(async (item) => {
        if (Platform.OS !== 'web') {
          await FileSystem.deleteAsync(item.localUri, { idempotent: true }).catch(() => undefined);
        }
      }),
  );
  await saveIndex(
    userId,
    items.filter((item) => !idSet.has(item.id)),
  );
}

export async function clearRetainedMedia(userId: string): Promise<void> {
  const items = await loadIndex(userId);
  await removeRetainedMedia(
    userId,
    items.map((item) => item.id),
  );
  await chunkedSecureStorage.removeItem(indexKey(userId));
}
