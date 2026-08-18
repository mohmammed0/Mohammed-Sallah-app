import type { CleanUpload } from '@/lib/secure-upload';
import type { RetainedMedia } from '@/lib/durable-media';
import type { TurnMediaBinding } from './conversation-recovery';

export function bindingsForActiveTurn(input: {
  retainedMedia: readonly RetainedMedia[];
  activeImageMediaId: string | null;
  activeVoiceMediaId: string | null;
  imageUpload: CleanUpload | null;
  voiceUpload: CleanUpload | null;
}): TurnMediaBinding[] {
  const active = new Map<string, CleanUpload | null>();
  if (input.activeImageMediaId) active.set(input.activeImageMediaId, input.imageUpload);
  if (input.activeVoiceMediaId) active.set(input.activeVoiceMediaId, input.voiceUpload);
  return input.retainedMedia.flatMap<TurnMediaBinding>((media) => {
    if (!active.has(media.id)) return [];
    return [{ localMediaId: media.id, kind: media.kind, upload: active.get(media.id) ?? null }];
  });
}

export function activeMediaIdsAfterReplacement(input: {
  kind: RetainedMedia['kind'];
  activeImageMediaId: string | null;
  activeVoiceMediaId: string | null;
}): string[] {
  const activeId = input.kind === 'image' ? input.activeImageMediaId : input.activeVoiceMediaId;
  return activeId ? [activeId] : [];
}

export function collectRequestMediaUploadIds(
  current: readonly string[],
  bindings: readonly TurnMediaBinding[],
): string[] {
  return [
    ...new Set([
      ...current,
      ...bindings.flatMap((binding) => (binding.upload ? [binding.upload.uploadId] : [])),
    ]),
  ];
}
