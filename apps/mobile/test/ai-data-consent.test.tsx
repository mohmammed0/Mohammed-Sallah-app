import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAiDataConsentGate } from '../src/features/request/ai-data-consent';

const fixture = vi.hoisted(() => ({
  invoke: vi.fn(),
  upload: vi.fn(),
  load: vi.fn(),
  push: vi.fn(),
  media: [] as unknown[],
  params: {},
  recordingState: { isRecording: false, durationMillis: 0 },
  permission: vi.fn(),
  catalog: { data: { categories: [], subcategories: [] }, isPending: false, isError: false },
  location: {
    activeLocation: null,
    addresses: [],
    loading: false,
    selectSavedAddress: vi.fn(),
    selectTransientLocation: vi.fn(),
  },
  recorder: { record: vi.fn(), stop: vi.fn(), prepareToRecordAsync: vi.fn() },
}));
vi.mock('react-native', () => ({
  Alert: { alert: vi.fn() },
  Platform: { OS: 'android' },
  Text: 'Text',
  View: 'View',
  ScrollView: 'ScrollView',
  Pressable: 'Pressable',
  StyleSheet: { create: (value: unknown) => value },
}));
vi.mock('expo-router', () => ({
  router: { push: fixture.push, replace: vi.fn() },
  useLocalSearchParams: () => fixture.params,
}));
vi.mock('expo-network', () => ({
  useNetworkState: () => ({ isConnected: true, isInternetReachable: true }),
}));
vi.mock('expo-image-picker', () => ({}));
vi.mock('expo-audio', () => ({
  AudioModule: { requestRecordingPermissionsAsync: fixture.permission },
  RecordingPresets: { HIGH_QUALITY: {} },
  setAudioModeAsync: vi.fn().mockResolvedValue(undefined),
  useAudioRecorder: () => fixture.recorder,
  useAudioRecorderState: () => fixture.recordingState,
}));
vi.mock('expo-file-system/legacy', () => ({}));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => fixture.catalog }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: { id: '11111111-1111-4111-8111-111111111111' } } }),
    },
    rpc: async () => ({ data: null, error: null }),
    functions: { invoke: fixture.invoke },
  },
}));
vi.mock('@/lib/secure-upload', () => ({ secureUpload: fixture.upload }));
vi.mock('../src/lib/secure-storage', () => ({
  chunkedSecureStorage: { getItem: async () => null, setItem: vi.fn(), removeItem: vi.fn() },
}));
vi.mock('@/lib/durable-media', async () => ({
  ...(await import('../src/lib/durable-media')),
  listRetainedMedia: async () => fixture.media,
}));
vi.mock('@/lib/mutation-journal', () => ({ executeJournaledMutation: vi.fn() }));
vi.mock('../src/features/request/conversation-recovery', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/features/request/conversation-recovery')>()),
  loadAiIntakeSnapshot: fixture.load,
  saveAiIntakeSnapshot: vi.fn(),
}));
vi.mock(
  '@/features/connectivity/network-state',
  async () => import('../src/features/connectivity/network-state'),
);
vi.mock('@/features/location/location-provider', () => ({
  useCustomerLocation: () => fixture.location,
}));
vi.mock('@/features/location/location-editor-state', () => ({
  shouldOfferTransientSave: () => false,
}));
vi.mock('@/features/location/location-service', () => ({ resolveServiceLocation: vi.fn() }));
vi.mock('@/providers/locale-provider', () => ({
  useLocale: () => ({ locale: 'en', dir: 'ltr', t: (key: string) => key }),
}));
vi.mock('@/design-system/primitives', () => ({
  ActionButton: 'ActionButton',
  CustomerScreen: 'CustomerScreen',
  Field: 'Field',
  LoadingBlock: 'LoadingBlock',
  Notice: 'Notice',
  Pill: 'Pill',
  StepHeader: 'StepHeader',
  Surface: 'Surface',
  customerStyles: {},
}));
vi.mock('@/design-system/icon', () => ({ AppIcon: 'AppIcon', categoryIconName: () => 'tools' }));
vi.mock('@/design-system/tokens', async () => import('../src/design-system/tokens'));
vi.mock('@/design-system/rtl', async () => import('../src/design-system/rtl'));
vi.mock('@/design-system/customer-components', () => ({
  ChatComposer: 'ChatComposer',
  MediaPreview: 'MediaPreview',
  QuickReplyChip: 'QuickReplyChip',
}));
vi.mock('../src/features/request/conversation-timeline', () => ({
  ConversationTimeline: 'ConversationTimeline',
}));

import { RequestComposer } from '../src/features/request/request-composer';
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
const cleanUpload = {
  uploadId: '22222222-2222-4222-8222-222222222222',
  status: 'clean',
  sanitized: true,
  mimeType: 'audio/mp4',
  sizeBytes: 20,
};
const turn = {
  clientMessageId: 'turn-0000001',
  text: 'Synthetic leaking tap request',
  inputKind: 'text',
  mediaUploadIds: [],
  localMediaIds: [],
  mediaBindings: [],
  transcript: null,
  transcriptionStatus: 'none',
  confirmedCategorySlug: 'plumbing',
  confirmedSubcategorySlug: null,
  summaryRequested: false,
  createdAt: '2026-09-05T00:00:00Z',
};
const draft = {
  description: '',
  title: '',
  summary: '',
  suggestedCategorySlug: '',
  selectedCategorySlug: 'plumbing',
  selectedSubcategorySlug: '',
  categoryConfirmedByUser: true,
  categorySelectionSource: 'manual',
  urgency: 'normal',
  schedule: 'asap',
  coordinates: null,
  requestedStart: null,
  requestedEnd: null,
  journeyStep: 'chat',
  imageUpload: null,
  voiceUpload: null,
  retainedMedia: [],
  activeImageMediaId: null,
  activeVoiceMediaId: null,
  requestMediaUploadIds: [],
  diagnostic: null,
};
let renderer: ReactTestRenderer;
async function open(pendingTurns: unknown[] = [turn]) {
  fixture.load.mockResolvedValue({
    version: 2,
    sessionId: null,
    conversation: [],
    pendingTurns,
    draft,
  });
  await act(async () => {
    renderer = create(<RequestComposer />);
  });
}
function button(label: string) {
  return renderer.root.findAllByType('ActionButton').find((node) => node.props.label === label)!;
}
beforeEach(() => {
  fixture.recordingState.isRecording = false;
  fixture.permission.mockReset().mockResolvedValue({ granted: true });
  fixture.recorder.record.mockReset();
  fixture.recorder.stop.mockReset();
  fixture.recorder.prepareToRecordAsync.mockReset();
  fixture.invoke
    .mockReset()
    .mockResolvedValue({ data: null, error: { message: 'Synthetic unavailable AI' } });
  fixture.upload.mockReset().mockResolvedValue(cleanUpload);
  fixture.push.mockReset();
  fixture.media = [];
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(20) }),
  );
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  vi.unstubAllGlobals();
});

describe('AI transfer permission', () => {
  it('starts every gate without permission and withdrawal blocks a subsequent transfer', () => {
    const gate = createAiDataConsentGate();
    expect(() => gate.assertAllowed()).toThrow('AI_DATA_CONSENT_REQUIRED');
    gate.grant();
    expect(() => gate.assertAllowed()).not.toThrow();
    gate.withdraw();
    expect(() => gate.assertAllowed()).toThrow();
    expect(() => createAiDataConsentGate().assertAllowed()).toThrow();
  });
  it('does not automatically replay a restored text turn before permission', async () => {
    await open();
    expect(fixture.invoke).not.toHaveBeenCalled();
    expect(fixture.upload).not.toHaveBeenCalled();
    expect(renderer.root.findByType('ChatComposer').props.disabled).toBe(true);
    await act(async () => button('aiDataConsentAllow').props.onPress());
    expect(fixture.invoke).toHaveBeenCalledTimes(1);
    expect(fixture.invoke).toHaveBeenCalledWith('ai-diagnostic', expect.any(Object));
    await act(async () => button('reportAiSuggestion').props.onPress());
    expect(fixture.push).toHaveBeenCalledWith('/support');
    expect(fixture.invoke).toHaveBeenCalledTimes(1);
  });
  it('blocks restored audio upload before permission and blocks transcription if permission is withdrawn while upload finishes', async () => {
    fixture.media = [
      {
        id: 'local-voice-0001',
        kind: 'voice',
        localUri: 'file:///synthetic.m4a',
        filename: 'synthetic.m4a',
        mimeType: 'audio/mp4',
      },
    ];
    let finishUpload!: (value: typeof cleanUpload) => void;
    fixture.upload.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishUpload = resolve;
        }),
    );
    await open([
      {
        ...turn,
        inputKind: 'voice',
        transcriptionStatus: 'pending',
        localMediaIds: ['local-voice-0001'],
        mediaBindings: [{ localMediaId: 'local-voice-0001', kind: 'voice', upload: null }],
      },
    ]);
    expect(fetch).not.toHaveBeenCalled();
    expect(fixture.upload).not.toHaveBeenCalled();
    await act(async () => button('aiDataConsentAllow').props.onPress());
    expect(fixture.upload).toHaveBeenCalledTimes(1);
    await act(async () => button('aiDataConsentWithdraw').props.onPress());
    await act(async () => finishUpload(cleanUpload));
    expect(fixture.invoke).not.toHaveBeenCalled();
    expect(button('aiDataConsentAllow')).toBeDefined();
  });
  it('offers manual title/description entry without any AI transfer', async () => {
    await open([]);
    await act(async () => button('aiContinueManually').props.onPress());
    await act(async () =>
      renderer.root
        .findByProps({ label: 'requestTitlePlaceholder' })
        .props.onChangeText('Synthetic manual request'),
    );
    await act(async () =>
      renderer.root
        .findByProps({ label: 'aiManualDescription' })
        .props.onChangeText('Synthetic description of a leaking tap.'),
    );
    expect(button('continueToLocation').props.disabled).toBe(false);
    expect(renderer.root.findAllByType('ChatComposer')).toHaveLength(0);
    expect(fixture.invoke).not.toHaveBeenCalled();
    expect(fixture.upload).not.toHaveBeenCalled();
  });
  it('stops active local recording when AI permission is withdrawn', async () => {
    await open([]);
    await act(async () => button('aiDataConsentAllow').props.onPress());
    await act(async () => renderer.root.findByType('ChatComposer').props.onVoice());
    expect(fixture.recorder.record).toHaveBeenCalledTimes(1);
    await act(async () => button('aiDataConsentWithdraw').props.onPress());
    expect(fixture.recorder.stop).toHaveBeenCalledTimes(1);
    expect(fixture.invoke).not.toHaveBeenCalled();
  });
  it('does not start recording if permission is withdrawn during the OS permission dialog', async () => {
    let resolvePermission!: (value: { granted: boolean }) => void;
    fixture.permission.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePermission = resolve;
        }),
    );
    await open([]);
    await act(async () => button('aiDataConsentAllow').props.onPress());
    await act(async () => renderer.root.findByType('ChatComposer').props.onVoice());
    await act(async () => button('aiDataConsentWithdraw').props.onPress());
    await act(async () => resolvePermission({ granted: true }));
    expect(fixture.recorder.record).not.toHaveBeenCalled();
  });
});
