import { describe, expect, it, vi } from 'vitest';
import { aiIntakeSnapshotSchema } from '../src/features/request/conversation-recovery';

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

const legacyDraft = {
  version: 2 as const,
  sessionId: null,
  conversation: [],
  pendingTurns: [],
  draft: {
    description: '',
    title: '',
    summary: '',
    suggestedCategorySlug: null,
    selectedCategorySlug: 'plumbing',
    categoryConfirmedByUser: true,
    categorySelectionSource: 'manual' as const,
    cityCode: 'riyadh',
    urgency: 'normal' as const,
    schedule: 'flexible' as const,
    coordinates: { latitude: 24.7136, longitude: 46.6753 },
    diagnostic: null,
    imageUpload: null,
    voiceUpload: null,
    retainedMedia: [],
  },
};

describe('customer journey recovery contract', () => {
  it('opens a legacy draft safely without fabricating a saved address', () => {
    const parsed = aiIntakeSnapshotSchema.parse(legacyDraft);
    expect(parsed.draft.journeyStep).toBe('category');
    expect(parsed.draft.selectedSubcategorySlug).toBe('');
    expect(parsed.draft.selectedAddressId).toBeNull();
    expect(parsed.draft.formattedAddress).toBe('');
  });

  it('preserves category, location, timing and review step across restart', () => {
    const parsed = aiIntakeSnapshotSchema.parse({
      ...legacyDraft,
      draft: {
        ...legacyDraft.draft,
        selectedSubcategorySlug: 'tap-repair',
        selectedAddressId: 'a8100000-0000-4000-8000-000000000001',
        formattedAddress: 'Synthetic Riyadh address',
        addressLabel: 'Home',
        building: '12',
        unit: '4',
        accessNotes: 'Call on arrival',
        requestedStart: '2026-08-20T06:00:00.000Z',
        requestedEnd: '2026-08-20T08:00:00.000Z',
        schedule: 'scheduled',
        journeyStep: 'review',
      },
    });
    const restarted = aiIntakeSnapshotSchema.parse(JSON.parse(JSON.stringify(parsed)));
    expect(restarted.draft).toMatchObject({
      selectedCategorySlug: 'plumbing',
      selectedSubcategorySlug: 'tap-repair',
      selectedAddressId: 'a8100000-0000-4000-8000-000000000001',
      formattedAddress: 'Synthetic Riyadh address',
      schedule: 'scheduled',
      journeyStep: 'review',
    });
  });
});
