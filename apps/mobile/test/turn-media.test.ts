import { describe, expect, it } from 'vitest';
import {
  activeMediaIdsAfterReplacement,
  bindingsForActiveTurn,
  collectRequestMediaUploadIds,
} from '../src/features/request/turn-media';
import type { RetainedMedia } from '../src/lib/durable-media';

const userId = '11111111-1111-4111-8111-111111111111';
function media(id: string, kind: 'image' | 'voice'): RetainedMedia {
  return {
    id,
    userId,
    kind,
    localUri: `file:///private/${id}`,
    filename: `${id}.bin`,
    mimeType: kind === 'voice' ? 'audio/mp4' : 'image/jpeg',
    sizeBytes: 100,
    createdAt: '2026-08-18T10:00:00.000Z',
    expiresAt: '2026-08-25T10:00:00.000Z',
  };
}

describe('turn-scoped request media', () => {
  it('does not attach a completed voice turn to the next text turn', () => {
    const voice = media('voice-media-0001', 'voice');
    expect(
      bindingsForActiveTurn({
        retainedMedia: [voice],
        activeImageMediaId: null,
        activeVoiceMediaId: voice.id,
        imageUpload: null,
        voiceUpload: null,
      }),
    ).toHaveLength(1);
    expect(
      bindingsForActiveTurn({
        retainedMedia: [voice],
        activeImageMediaId: null,
        activeVoiceMediaId: null,
        imageUpload: null,
        voiceUpload: null,
      }),
    ).toEqual([]);
  });

  it('keeps two offline voice turns bound to different retained files', () => {
    const first = media('voice-media-0001', 'voice');
    const second = media('voice-media-0002', 'voice');
    const firstBindings = bindingsForActiveTurn({
      retainedMedia: [first, second],
      activeImageMediaId: null,
      activeVoiceMediaId: first.id,
      imageUpload: null,
      voiceUpload: null,
    });
    const secondBindings = bindingsForActiveTurn({
      retainedMedia: [first, second],
      activeImageMediaId: null,
      activeVoiceMediaId: second.id,
      imageUpload: null,
      voiceUpload: null,
    });
    expect(firstBindings[0]?.localMediaId).not.toBe(secondBindings[0]?.localMediaId);
  });

  it('replaces only the active recording, never media owned by a pending turn', () => {
    expect(
      activeMediaIdsAfterReplacement({
        kind: 'voice',
        activeImageMediaId: null,
        activeVoiceMediaId: 'active-voice-0002',
      }),
    ).toEqual(['active-voice-0002']);
    expect(
      activeMediaIdsAfterReplacement({
        kind: 'voice',
        activeImageMediaId: null,
        activeVoiceMediaId: null,
      }),
    ).not.toContain('pending-voice-0001');
  });

  it('replaces only the active image, never an image owned by a pending turn', () => {
    expect(
      activeMediaIdsAfterReplacement({
        kind: 'image',
        activeImageMediaId: 'active-image-0002',
        activeVoiceMediaId: null,
      }),
    ).toEqual(['active-image-0002']);
    expect(
      activeMediaIdsAfterReplacement({
        kind: 'image',
        activeImageMediaId: null,
        activeVoiceMediaId: null,
      }),
    ).not.toContain('pending-image-0001');
  });

  it('retains every intended request-level upload for publication', () => {
    const firstUpload = '22222222-2222-4222-8222-222222222222';
    const secondUpload = '33333333-3333-4333-8333-333333333333';
    expect(
      collectRequestMediaUploadIds(
        [firstUpload],
        [
          {
            localMediaId: 'active-image-0002',
            kind: 'image',
            upload: {
              uploadId: secondUpload,
              status: 'clean',
              storagePath: `${userId}/clean.jpg`,
              mimeType: 'image/jpeg',
              sizeBytes: 100,
              contentHash: 'a'.repeat(64),
            },
          },
        ],
      ),
    ).toEqual([firstUpload, secondUpload]);
  });
});
