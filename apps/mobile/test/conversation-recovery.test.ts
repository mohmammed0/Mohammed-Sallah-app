import { describe, expect, it, vi } from 'vitest';
import {
  aiIntakeSnapshotSchema,
  appendTemporaryFallback,
  enqueuePendingTurn,
  reconcileAuthoritativeTurn,
  replayPendingTurns,
  type PendingCustomerTurn,
} from '../src/features/request/conversation-recovery';

vi.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'device-only',
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///app-private/',
}));

const first: PendingCustomerTurn = {
  clientMessageId: 'turn-0001',
  text: 'The sink is leaking in Riyadh tomorrow morning.',
  inputKind: 'image',
  mediaUploadIds: ['11111111-1111-4111-8111-111111111111'],
  localMediaIds: [],
  confirmedCategorySlug: 'plumbing',
  summaryRequested: false,
  createdAt: '2026-08-18T10:00:00.000Z',
};
const second: PendingCustomerTurn = {
  ...first,
  clientMessageId: 'turn-0002',
  text: 'The leak started last night.',
  mediaUploadIds: [],
  localMediaIds: [],
  inputKind: 'text',
  createdAt: '2026-08-18T10:01:00.000Z',
};

describe('AI intake recovery', () => {
  it('keeps stable IDs and media bindings when a turn is queued more than once', () => {
    const queue = enqueuePendingTurn(enqueuePendingTurn([], first), first);
    expect(queue).toEqual([first]);
    expect(queue[0]?.mediaUploadIds).toEqual(first.mediaUploadIds);
  });

  it('replays missing turns sequentially and stops at the interrupted turn', async () => {
    const observed: string[] = [];
    const result = await replayPendingTurns([first, second], async (turn) => {
      observed.push(turn.clientMessageId);
      if (turn === second) throw new Error('NETWORK_INTERRUPTED');
      return 'authoritative';
    });
    expect(observed).toEqual(['turn-0001', 'turn-0002']);
    expect(result.completed.map((item) => item.turn.clientMessageId)).toEqual(['turn-0001']);
    expect(result.pending).toEqual([second]);
  });

  it('reconciles a temporary fallback with the authoritative server reply', () => {
    const temporary = appendTemporaryFallback([], first, 'Temporary offline question');
    expect(temporary[1]?.temporary).toBe(true);
    const reconciled = reconcileAuthoritativeTurn(temporary, first, 'Authoritative question');
    expect(reconciled).toHaveLength(2);
    expect(reconciled[1]).toMatchObject({
      text: 'Authoritative question',
      authoritative: true,
    });
    expect(reconciled[1]).not.toHaveProperty('temporary');
  });

  it('restores a session, ordered messages, draft, and pending media after restart', () => {
    const snapshot = aiIntakeSnapshotSchema.parse({
      version: 2,
      sessionId: '22222222-2222-4222-8222-222222222222',
      conversation: appendTemporaryFallback([], first, 'Offline fallback'),
      pendingTurns: [first],
      draft: {
        description: '',
        title: 'Leaking sink',
        summary: 'The kitchen sink is leaking and needs inspection.',
        suggestedCategorySlug: 'plumbing',
        selectedCategorySlug: 'plumbing',
        categoryConfirmedByUser: true,
        categorySelectionSource: 'ai_suggestion',
        cityCode: 'riyadh',
        urgency: 'normal',
        schedule: 'today',
        coordinates: { latitude: 24.7136, longitude: 46.6753 },
        diagnostic: null,
        imageUpload: {
          uploadId: first.mediaUploadIds[0],
          status: 'clean',
          storagePath: 'user/clean.png',
          mimeType: 'image/png',
          sizeBytes: 100,
          contentHash: 'a'.repeat(64),
        },
        voiceUpload: null,
        retainedMedia: [],
      },
    });
    expect(snapshot.sessionId).toMatch(/^2222/);
    expect(snapshot.pendingTurns[0]?.mediaUploadIds).toEqual(first.mediaUploadIds);
    expect(snapshot.conversation.map((message) => message.role)).toEqual(['user', 'assistant']);
  });

  it('restores a selected image before upload without converting the turn to text-only', () => {
    const localImageId = '33333333-3333-4333-8333-333333333333';
    const snapshot = aiIntakeSnapshotSchema.parse({
      version: 2,
      sessionId: null,
      conversation: [],
      pendingTurns: [
        {
          ...first,
          mediaUploadIds: [],
          localMediaIds: [localImageId],
        },
      ],
      draft: {
        description: 'A leaking pipe photographed while offline.',
        title: 'Leaking pipe',
        summary: 'A leaking pipe needs a plumbing inspection.',
        suggestedCategorySlug: 'plumbing',
        selectedCategorySlug: 'plumbing',
        categoryConfirmedByUser: true,
        categorySelectionSource: 'ai_suggestion',
        cityCode: 'riyadh',
        urgency: 'normal',
        schedule: 'asap',
        coordinates: null,
        diagnostic: null,
        imageUpload: null,
        voiceUpload: null,
        retainedMedia: [
          {
            id: localImageId,
            userId: '44444444-4444-4444-8444-444444444444',
            kind: 'image',
            localUri: 'file:///private/image.jpg',
            filename: 'image.jpg',
            mimeType: 'image/jpeg',
            sizeBytes: 1024,
            createdAt: '2026-08-18T10:00:00.000Z',
            expiresAt: '2026-08-25T10:00:00.000Z',
          },
        ],
      },
    });
    expect(snapshot.pendingTurns[0]).toMatchObject({
      inputKind: 'image',
      mediaUploadIds: [],
      localMediaIds: [localImageId],
    });
    expect(snapshot.draft.retainedMedia[0]?.localUri).toContain('/private/image.jpg');
  });
});
