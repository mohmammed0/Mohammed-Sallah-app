import { act, create } from 'react-test-renderer';
vi.mock('@/features/jobs/customer-job-status', () => ({ CustomerJobStatus: 'CustomerJobStatus' }));
vi.mock('@/features/connectivity/use-active-screen', () => ({ useActiveScreen: () => true }));
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ids = {
  user: '11111111-1111-4111-8111-111111111111',
  counterparty: '22222222-2222-4222-8222-222222222222',
  conversation: '33333333-3333-4333-8333-333333333333',
  incomingMessage: '44444444-4444-4444-8444-444444444444',
  ownMessage: '55555555-5555-4555-8555-555555555555',
  job: '66666666-6666-4666-8666-666666666666',
  rating: '77777777-7777-4777-8777-777777777777',
  attachment: '88888888-8888-4888-8888-888888888888',
  upload: '99999999-9999-4999-8999-999999999999',
  secondAttachment: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  secondUpload: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  secondConversation: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  secondCounterparty: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  secondMessage: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
} as const;

const state = vi.hoisted(() => ({
  trustContext: {
    conversationId: '33333333-3333-4333-8333-333333333333',
    counterpartyUserId: '22222222-2222-4222-8222-222222222222',
    blockedByMe: false,
    canCommunicate: true,
    restriction: null as null | 'blocked' | 'communication_unavailable',
  },
  messages: [] as Array<Record<string, unknown>>,
}));
const mediaInvoke = vi.hoisted(() => vi.fn(async () => ({ data: null, error: null })));
const loadTrustContext = vi.hoisted(() => vi.fn(async () => state.trustContext));
const submitReport = vi.hoisted(() => vi.fn(async () => undefined));
const setBlocked = vi.hoisted(() =>
  vi.fn(async (_client: unknown, input: { targetUserId: string; blocked: boolean }) => ({
    targetUserId: input.targetUserId,
    blocked: input.blocked,
    changed: true,
    canCommunicate: !input.blocked,
  })),
);
const loadMessages = vi.hoisted(() =>
  vi.fn(async (_conversationId: string) => ({ data: state.messages, error: null })),
);
const loadExactMessage = vi.hoisted(() =>
  vi.fn(async (_conversationId: string, _messageId: string) => ({ data: null, error: null })),
);
const sendMessage = vi.hoisted(() => vi.fn(async () => ({ data: null, error: null })));
const pickImage = vi.hoisted(() => vi.fn(async () => ({ canceled: true })));
const uploadAttachment = vi.hoisted(() => vi.fn());
const readLocalMedia = vi.hoisted(() =>
  vi.fn(async () => ({
    ok: true,
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  })),
);
const routeState = vi.hoisted(() => ({
  conversationId: '33333333-3333-4333-8333-333333333333',
}));
const realtimeState = vi.hoisted(() => ({
  channels: [] as Array<{
    name: string;
    event?: string;
    config?: Record<string, unknown>;
    callback?: (payload: { new: Record<string, unknown> }) => void;
    statusCallback?: (status: string) => void;
    instance?: unknown;
    subscribed?: boolean;
  }>,
  removed: [] as unknown[],
}));
const translate = vi.hoisted(
  () => (key: string, variables?: Readonly<Record<string, string | number>>) =>
    variables
      ? Object.entries(variables).reduce(
          (value, [name, replacement]) => value.replace(`{{${name}}}`, String(replacement)),
          key,
        )
      : key,
);

vi.mock('react-native', async () => {
  const { createElement } = await import('react');
  return {
    AccessibilityInfo: { setAccessibilityFocus: vi.fn() },
    ActivityIndicator: 'ActivityIndicator',
    Alert: { alert: vi.fn() },
    FlatList: ({ data, renderItem, ListEmptyComponent }: any) =>
      data.length
        ? data.map((item: { id?: string }, index: number) =>
            createElement('View', { key: item.id ?? String(index) }, renderItem({ item, index })),
          )
        : ListEmptyComponent,
    Image: 'Image',
    findNodeHandle: vi.fn(() => 1),
    Linking: {
      canOpenURL: vi.fn(async () => false),
      openURL: vi.fn(async () => undefined),
    },
    Modal: 'Modal',
    Platform: { OS: 'android' },
    Pressable: 'Pressable',
    ScrollView: 'ScrollView',
    StyleSheet: { create: (styles: Record<string, unknown>) => styles },
    Text: 'Text',
    TextInput: 'TextInput',
    View: 'View',
  };
});
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));
vi.mock('expo-router', () => ({
  Link: 'Link',
  useLocalSearchParams: () => ({ conversationId: routeState.conversationId }),
}));
vi.mock('expo-image-picker', () => ({ launchImageLibraryAsync: pickImage }));
vi.mock('expo-location', () => ({
  Accuracy: { Balanced: 1 },
  requestForegroundPermissionsAsync: vi.fn(),
  watchPositionAsync: vi.fn(),
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn(async () => undefined) }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQuery: () => ({
    data: {
      userId: ids.counterparty,
      jobs: [
        {
          id: ids.job,
          customer_id: ids.user,
          provider_id: ids.counterparty,
          status: 'completed',
          approved_total_minor: 10_000,
          version: 4,
          created_at: '2026-08-20T12:00:00.000Z',
          payments: [],
          conversations: [{ id: ids.conversation }],
          job_location_updates: [],
          change_orders: [],
          cancellation_requests: [],
          disputes: [],
          ratings: [
            {
              id: ids.rating,
              customer_id: ids.user,
              provider_id: ids.counterparty,
              score: 1,
              review: 'The review text is visible to the participant.',
              moderation_status: 'published',
            },
          ],
        },
      ],
    },
    isPending: false,
    isError: false,
    refetch: vi.fn(async () => undefined),
  }),
}));
vi.mock('@sallah/api', () => ({ MarketplaceApi: class MarketplaceApi {} }));
vi.mock('@/components/ui', () => ({
  Button: 'Button',
  Card: 'Card',
  LoadingSkeleton: 'LoadingSkeleton',
  Screen: 'Screen',
  styles: { badge: {}, error: {}, input: {}, lead: {}, row: {}, title: {} },
}));
vi.mock('@/design-system/customer-components', () => ({
  ProgressTimeline: 'ProgressTimeline',
  resolveTimelineIndex: () => 0,
}));
vi.mock('@/providers/locale-provider', () => ({
  useLocale: () => ({
    locale: 'en',
    t: translate,
  }),
}));
vi.mock('../src/providers/locale-provider', () => ({
  useLocale: () => ({
    locale: 'en',
    t: translate,
  }),
}));
vi.mock('@/lib/secure-upload', () => ({ secureUpload: uploadAttachment }));
vi.mock('@/features/jobs/location-sharing', () => ({ reduceLocationSharing: vi.fn() }));
vi.mock('@/features/jobs/job-tracking-map', () => ({ JobTrackingMap: 'JobTrackingMap' }));
vi.mock(
  '@/features/jobs/completion-evidence',
  async () => import('../src/features/jobs/completion-evidence'),
);
vi.mock('@/lib/mutation-journal', () => ({ executeJournaledMutation: vi.fn() }));
vi.mock('../src/lib/secure-storage', () => ({
  chunkedSecureStorage: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  },
}));
vi.mock('../src/features/trust/trust-client', () => ({
  createTrustRpcClient: (client: unknown) => client,
  TrustClientError: class TrustClientError extends Error {
    category = 'unknown';
  },
  loadMarketplaceTrustContext: loadTrustContext,
  submitMarketplaceReport: submitReport,
  setMarketplaceUserBlocked: setBlocked,
}));
vi.mock('@/lib/supabase', () => {
  const from = vi.fn((table: string) => {
    const chain: Record<string, any> = {};
    let conversationFilter = '';
    let messageFilter = '';
    chain.select = () => chain;
    chain.eq = (column: string, value: string) => {
      if (table === 'messages' && column === 'conversation_id') conversationFilter = value;
      if (table === 'messages' && column === 'id') messageFilter = value;
      return chain;
    };
    chain.order = () => chain;
    chain.limit = () =>
      table === 'messages'
        ? loadMessages(conversationFilter)
        : Promise.resolve({ data: [], error: null });
    chain.maybeSingle = () => loadExactMessage(conversationFilter, messageFilter);
    return chain;
  });
  return {
    supabase: {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: ids.user } }, error: null })) },
      channel: vi.fn((name: string) => {
        const record: (typeof realtimeState.channels)[number] = { name };
        const channel = {
          on(
            event: string,
            config: Record<string, unknown>,
            callback: (payload: { new: Record<string, unknown> }) => void,
          ) {
            record.event = event;
            record.config = config;
            record.callback = callback;
            return channel;
          },
          subscribe(callback?: (status: string) => void) {
            record.subscribed = true;
            record.statusCallback = callback;
            return channel;
          },
        };
        record.instance = channel;
        realtimeState.channels.push(record);
        return channel;
      }),
      from,
      functions: { invoke: mediaInvoke },
      removeChannel: vi.fn(async (channel: unknown) => {
        realtimeState.removed.push(channel);
      }),
      rpc: sendMessage,
    },
  };
});

vi.stubGlobal('fetch', readLocalMedia);

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

describe('trust screen insertion', () => {
  afterEach(() => vi.useRealTimers());

  beforeEach(() => {
    mediaInvoke.mockClear();
    loadTrustContext.mockClear();
    submitReport.mockReset();
    submitReport.mockResolvedValue(undefined);
    setBlocked.mockReset();
    loadMessages.mockReset();
    loadExactMessage.mockReset();
    sendMessage.mockReset();
    pickImage.mockReset();
    uploadAttachment.mockReset();
    readLocalMedia.mockClear();
    realtimeState.channels.length = 0;
    realtimeState.removed.length = 0;
    routeState.conversationId = ids.conversation;
    state.trustContext = {
      conversationId: ids.conversation,
      counterpartyUserId: ids.counterparty,
      blockedByMe: false,
      canCommunicate: true,
      restriction: null,
    };
    state.messages = [
      {
        id: ids.incomingMessage,
        body: 'Incoming message',
        sender_id: ids.counterparty,
        created_at: '2026-08-20T12:00:00.000Z',
        message_attachments: [],
      },
      {
        id: ids.ownMessage,
        body: 'Own message',
        sender_id: ids.user,
        created_at: '2026-08-20T12:01:00.000Z',
        message_attachments: [],
      },
    ];
    loadTrustContext.mockImplementation(async () => state.trustContext);
    setBlocked.mockImplementation(async (_client, input) => ({
      targetUserId: input.targetUserId,
      blocked: input.blocked,
      changed: true,
      canCommunicate: !input.blocked,
    }));
    loadMessages.mockImplementation(async () => ({ data: state.messages, error: null }));
    loadExactMessage.mockImplementation(async (_conversationId, messageId) => ({
      data: state.messages.find((message) => message.id === messageId) ?? null,
      error: null,
    }));
    sendMessage.mockResolvedValue({ data: null, error: null });
    pickImage.mockResolvedValue({ canceled: true });
  });

  it('adds report and block controls only to counterparty message cards', async () => {
    const { default: Messages } = await import('../app/messages');
    let renderer: ReturnType<typeof create> | undefined;
    await act(async () => {
      renderer = create(<Messages />);
      await Promise.resolve();
      await Promise.resolve();
    });
    if (!renderer) throw new Error('renderer missing');
    const reportActions = renderer.root.findAll(
      (node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'trustReportMessage',
    );
    expect(reportActions).toHaveLength(1);
    expect(
      renderer.root.findAll(
        (node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'trustReportUser',
      ),
    ).toHaveLength(1);
    expect(
      renderer.root.findAll(
        (node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'trustBlock',
      ),
    ).toHaveLength(1);
    expect(loadTrustContext).toHaveBeenCalledWith(expect.anything(), ids.conversation);

    const press = (label: string) =>
      renderer.root.find(
        (node) => node.type === 'Pressable' && node.props.accessibilityLabel === label,
      );
    await act(() => press('trustReportMessage').props.onPress());
    await act(() => press('trustReasonHarassment').props.onPress());
    await act(async () => press('trustSubmitReport').props.onPress());
    expect(submitReport).toHaveBeenCalledWith(expect.anything(), {
      targetType: 'message',
      targetId: ids.incomingMessage,
      reasonCategory: 'harassment',
      explanation: '',
    });
  });

  it('hydrates an attachment-bearing realtime insert before rendering or requesting media', async () => {
    state.messages = [];
    loadMessages.mockResolvedValue({ data: [], error: null });
    loadExactMessage.mockResolvedValue({
      data: {
        id: ids.incomingMessage,
        body: 'Realtime message with protected media',
        sender_id: ids.counterparty,
        created_at: '2026-08-20T12:02:00.000Z',
        message_attachments: [
          {
            id: ids.attachment,
            file_upload_id: ids.upload,
            mime_type: 'image/jpeg',
            size_bytes: 512,
          },
        ],
      },
      error: null,
    });
    mediaInvoke.mockResolvedValue({
      data: {
        signedUrl: 'https://example.test/realtime-attachment.jpg',
        deliveryMode: 'authenticated_proxy',
        expiresAt: '2099-08-20T12:05:00.000Z',
      },
      error: null,
    });
    const { default: Messages } = await import('../app/messages');
    let renderer: ReturnType<typeof create> | undefined;
    await act(async () => {
      renderer = create(<Messages />);
      await Promise.resolve();
      await Promise.resolve();
    });
    if (!renderer) throw new Error('renderer missing');

    await act(async () => {
      realtimeState.channels[0]?.callback?.({ new: { id: ids.incomingMessage } });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(loadExactMessage).toHaveBeenCalledWith(ids.conversation, ids.incomingMessage);
    expect(mediaInvoke).toHaveBeenCalledWith('media-access', {
      body: { uploadId: ids.upload, expiresInSeconds: 300 },
    });
    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).toContain('Realtime message with protected media');
    expect(rendered).toContain('https://example.test/realtime-attachment.jpg');
  });

  it('does not render a raw row or retry when exact realtime hydration is definitively denied', async () => {
    state.messages = [];
    loadMessages.mockResolvedValue({ data: [], error: null });
    loadExactMessage.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'unsafe backend detail' },
    });
    const { default: Messages } = await import('../app/messages');
    let renderer: ReturnType<typeof create> | undefined;
    await act(async () => {
      renderer = create(<Messages />);
      await Promise.resolve();
      await Promise.resolve();
    });
    if (!renderer) throw new Error('renderer missing');

    await act(async () => {
      realtimeState.channels[0]?.callback?.({
        new: {
          id: ids.incomingMessage,
          body: 'Raw row must never render',
          sender_id: ids.counterparty,
          created_at: '2026-08-20T12:02:00.000Z',
        },
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).not.toContain('Raw row must never render');
    expect(rendered).not.toContain('unsafe backend detail');
    expect(mediaInvoke).not.toHaveBeenCalled();
    expect(loadMessages).toHaveBeenCalledOnce();
  });

  it('recovers a committed realtime message exactly once after a recoverable exact-load failure', async () => {
    const recoveredMessage = {
      id: ids.incomingMessage,
      body: 'Recovered committed message',
      sender_id: ids.counterparty,
      created_at: '2026-08-20T12:02:00.000Z',
      message_attachments: [],
    };
    state.messages = [];
    loadMessages
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValue({ data: [recoveredMessage], error: null });
    loadExactMessage.mockResolvedValue({
      data: null,
      error: { code: 'PGRST000', message: 'transient connection failure' },
    });
    const { default: Messages } = await import('../app/messages');
    let renderer: ReturnType<typeof create> | undefined;
    await act(async () => {
      renderer = create(<Messages />);
      await Promise.resolve();
      await Promise.resolve();
    });
    if (!renderer) throw new Error('renderer missing');

    await act(async () => {
      realtimeState.channels[0]?.callback?.({ new: { id: ids.incomingMessage } });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered.split(recoveredMessage.body)).toHaveLength(2);
    expect(rendered).not.toContain('transient connection failure');
    expect(loadExactMessage).toHaveBeenCalledOnce();
    expect(loadMessages).toHaveBeenCalledTimes(2);
  });

  it('recovers through the snapshot without rendering a malformed exact-load response', async () => {
    const recoveredMessage = {
      id: ids.incomingMessage,
      body: 'Recovered after malformed hydration',
      sender_id: ids.counterparty,
      created_at: '2026-08-20T12:02:00.000Z',
      message_attachments: [],
    };
    state.messages = [];
    loadMessages
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValue({ data: [recoveredMessage], error: null });
    loadExactMessage.mockResolvedValue({
      data: {
        id: ids.incomingMessage,
        body: 'Malformed row must not render',
        sender_id: ids.counterparty,
        created_at: '2026-08-20T12:02:00.000Z',
      },
      error: null,
    });
    const { default: Messages } = await import('../app/messages');
    let renderer: ReturnType<typeof create> | undefined;
    await act(async () => {
      renderer = create(<Messages />);
      await Promise.resolve();
      await Promise.resolve();
    });
    if (!renderer) throw new Error('renderer missing');

    await act(async () => {
      realtimeState.channels[0]?.callback?.({ new: { id: ids.incomingMessage } });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).not.toContain('Malformed row must not render');
    expect(rendered.split(recoveredMessage.body)).toHaveLength(2);
    expect(loadMessages).toHaveBeenCalledTimes(2);
  });

  it('recovers a thrown transient exact-load failure without leaking its error', async () => {
    const recoveredMessage = {
      id: ids.incomingMessage,
      body: 'Recovered after thrown network failure',
      sender_id: ids.counterparty,
      created_at: '2026-08-20T12:02:00.000Z',
      message_attachments: [],
    };
    state.messages = [];
    loadMessages
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValue({ data: [recoveredMessage], error: null });
    loadExactMessage.mockRejectedValueOnce(new Error('unsafe thrown network detail'));
    const { default: Messages } = await import('../app/messages');
    let renderer: ReturnType<typeof create> | undefined;
    await act(async () => {
      renderer = create(<Messages />);
      await Promise.resolve();
      await Promise.resolve();
    });
    if (!renderer) throw new Error('renderer missing');

    await act(async () => {
      realtimeState.channels[0]?.callback?.({ new: { id: ids.incomingMessage } });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).not.toContain('unsafe thrown network detail');
    expect(rendered.split(recoveredMessage.body)).toHaveLength(2);
    expect(loadMessages).toHaveBeenCalledTimes(2);
  });

  it('clears an initial snapshot load failure after a successful empty reconciliation', async () => {
    state.messages = [];
    loadMessages
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST000', message: 'unsafe initial snapshot detail' },
      })
      .mockResolvedValue({ data: [], error: null });
    const { default: Messages } = await import('../app/messages');
    let renderer: ReturnType<typeof create> | undefined;
    await act(async () => {
      renderer = create(<Messages />);
      await Promise.resolve();
      await Promise.resolve();
    });
    if (!renderer) throw new Error('renderer missing');
    expect(JSON.stringify(renderer.toJSON())).toContain('messagesLoadFailed');

    await act(async () => {
      realtimeState.channels[0]?.statusCallback?.('SUBSCRIBED');
      await Promise.resolve();
      await Promise.resolve();
    });

    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).toContain('noMessages');
    expect(rendered).not.toContain('messagesLoadFailed');
    expect(rendered).not.toContain('unsafe initial snapshot detail');
  });

  it('clears an invalid snapshot failure after a successful empty reconciliation', async () => {
    state.messages = [];
    loadMessages
      .mockResolvedValueOnce({
        data: [
          {
            id: ids.incomingMessage,
            body: 'Malformed snapshot must not render',
            sender_id: ids.counterparty,
            created_at: '2026-08-20T12:02:00.000Z',
          },
        ],
        error: null,
      })
      .mockResolvedValue({ data: [], error: null });
    const { default: Messages } = await import('../app/messages');
    let renderer: ReturnType<typeof create> | undefined;
    await act(async () => {
      renderer = create(<Messages />);
      await Promise.resolve();
      await Promise.resolve();
    });
    if (!renderer) throw new Error('renderer missing');
    expect(JSON.stringify(renderer.toJSON())).toContain('messagesInvalid');

    await act(async () => {
      realtimeState.channels[0]?.statusCallback?.('SUBSCRIBED');
      await Promise.resolve();
      await Promise.resolve();
    });

    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).toContain('noMessages');
    expect(rendered).not.toContain('messagesInvalid');
    expect(rendered).not.toContain('Malformed snapshot must not render');
  });

  it('preserves a send failure across an overlapping failed then successful snapshot', async () => {
    state.messages = [];
    let resolveInitialSnapshot:
      ((value: { data: null; error: { code: string; message: string } }) => void) | undefined;
    loadMessages
      .mockImplementationOnce(
        async () =>
          await new Promise((resolve) => {
            resolveInitialSnapshot = resolve;
          }),
      )
      .mockResolvedValue({ data: [], error: null });
    sendMessage.mockResolvedValueOnce({ data: null, error: { message: 'unsafe send detail' } });
    const { default: Messages } = await import('../app/messages');
    let renderer: ReturnType<typeof create> | undefined;
    await act(async () => {
      renderer = create(<Messages />);
      await Promise.resolve();
    });
    if (!renderer) throw new Error('renderer missing');
    const composer = renderer.root.find(
      (node) => node.type === 'TextInput' && node.props.placeholder === 'messagePlaceholder',
    );
    const send = renderer.root.find(
      (node) => node.type === 'Button' && node.props.label === 'send',
    );
    await act(() => composer.props.onChangeText('message that fails safely'));
    await act(async () => {
      send.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(JSON.stringify(renderer.toJSON())).toContain('messageSendFailed');

    await act(async () => {
      realtimeState.channels[0]?.statusCallback?.('SUBSCRIBED');
      resolveInitialSnapshot?.({
        data: null,
        error: { code: 'PGRST000', message: 'unsafe overlapping snapshot detail' },
      });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).toContain('messageSendFailed');
    expect(rendered).not.toContain('messagesLoadFailed');
    expect(rendered).not.toContain('unsafe send detail');
    expect(rendered).not.toContain('unsafe overlapping snapshot detail');
  });

  it('preserves an upload failure across an overlapping failed then successful snapshot', async () => {
    state.messages = [];
    let resolveInitialSnapshot:
      ((value: { data: null; error: { code: string; message: string } }) => void) | undefined;
    loadMessages
      .mockImplementationOnce(
        async () =>
          await new Promise((resolve) => {
            resolveInitialSnapshot = resolve;
          }),
      )
      .mockResolvedValue({ data: [], error: null });
    pickImage.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///failed-upload.jpg',
          fileName: 'failed-upload.jpg',
          mimeType: 'image/jpeg',
        },
      ],
    });
    uploadAttachment.mockRejectedValueOnce(new Error('unsafe upload detail'));
    const { default: Messages } = await import('../app/messages');
    let renderer: ReturnType<typeof create> | undefined;
    await act(async () => {
      renderer = create(<Messages />);
      await Promise.resolve();
    });
    if (!renderer) throw new Error('renderer missing');
    const addAttachment = renderer.root.find(
      (node) => node.type === 'Button' && node.props.label === 'addAttachment',
    );
    await act(async () => {
      addAttachment.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(JSON.stringify(renderer.toJSON())).toContain('messageAttachmentFailed');

    await act(async () => {
      realtimeState.channels[0]?.statusCallback?.('SUBSCRIBED');
      resolveInitialSnapshot?.({
        data: null,
        error: { code: 'PGRST000', message: 'unsafe overlapping snapshot detail' },
      });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).toContain('messageAttachmentFailed');
    expect(rendered).not.toContain('messagesLoadFailed');
    expect(rendered).not.toContain('unsafe upload detail');
    expect(rendered).not.toContain('unsafe overlapping snapshot detail');
  });

  it('shows an accessible retryable snapshot warning over an existing message', async () => {
    const existingMessage = state.messages[0];
    if (!existingMessage) throw new Error('existing message fixture missing');
    loadMessages
      .mockResolvedValueOnce({ data: [existingMessage], error: null })
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST000', message: 'unsafe reconnect snapshot detail' },
      });
    const { default: Messages } = await import('../app/messages');
    let renderer: ReturnType<typeof create> | undefined;
    await act(async () => {
      renderer = create(<Messages />);
      await Promise.resolve();
      await Promise.resolve();
    });
    if (!renderer) throw new Error('renderer missing');

    await act(async () => {
      realtimeState.channels[0]?.statusCallback?.('SUBSCRIBED');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      renderer.root.find(
        (node) =>
          node.type === 'Text' &&
          node.props.accessibilityLiveRegion === 'polite' &&
          node.children.includes('messagesLoadFailed'),
      ),
    ).toBeTruthy();
    expect(
      renderer.root.find((node) => node.type === 'Button' && node.props.label === 'retry'),
    ).toBeTruthy();
    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).toContain(existingMessage.body);
    expect(rendered).not.toContain('unsafe reconnect snapshot detail');
  });

  it('retries through the shared snapshot controller and hydrates a missed row exactly once', async () => {
    const existingMessage = state.messages[0];
    if (!existingMessage) throw new Error('existing message fixture missing');
    const missedMessage = {
      id: ids.secondMessage,
      body: 'Recovered by explicit snapshot retry',
      sender_id: ids.counterparty,
      created_at: '2026-08-20T12:03:00.000Z',
      message_attachments: [],
    };
    loadMessages
      .mockResolvedValueOnce({ data: [existingMessage], error: null })
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST000', message: 'unsafe reconnect snapshot detail' },
      })
      .mockResolvedValueOnce({
        data: [missedMessage, existingMessage, missedMessage],
        error: null,
      });
    const { default: Messages } = await import('../app/messages');
    let renderer: ReturnType<typeof create> | undefined;
    await act(async () => {
      renderer = create(<Messages />);
      await Promise.resolve();
      await Promise.resolve();
    });
    if (!renderer) throw new Error('renderer missing');
    await act(async () => {
      realtimeState.channels[0]?.statusCallback?.('SUBSCRIBED');
      await Promise.resolve();
      await Promise.resolve();
    });
    const retry = renderer.root.find(
      (node) => node.type === 'Button' && node.props.label === 'retry',
    );

    await act(async () => {
      retry.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered.split(missedMessage.body)).toHaveLength(2);
    expect(rendered.split(String(existingMessage.body))).toHaveLength(2);
    expect(rendered).not.toContain('messagesLoadFailed');
    expect(rendered).not.toContain('unsafe reconnect snapshot detail');
    expect(loadMessages).toHaveBeenCalledTimes(3);
  });

  it('keeps a safe send failure visible over existing messages after reconciliation', async () => {
    const existingMessage = state.messages[0];
    if (!existingMessage) throw new Error('existing message fixture missing');
    loadMessages.mockResolvedValue({ data: [existingMessage], error: null });
    sendMessage.mockResolvedValueOnce({ data: null, error: { message: 'unsafe send detail' } });
    const { default: Messages } = await import('../app/messages');
    let renderer: ReturnType<typeof create> | undefined;
    await act(async () => {
      renderer = create(<Messages />);
      await Promise.resolve();
      await Promise.resolve();
    });
    if (!renderer) throw new Error('renderer missing');
    const composer = renderer.root.find(
      (node) => node.type === 'TextInput' && node.props.placeholder === 'messagePlaceholder',
    );
    const send = renderer.root.find(
      (node) => node.type === 'Button' && node.props.label === 'send',
    );
    await act(() => composer.props.onChangeText('message that fails safely'));
    await act(async () => {
      send.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
      realtimeState.channels[0]?.statusCallback?.('SUBSCRIBED');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      renderer.root.find(
        (node) =>
          node.type === 'Text' &&
          node.props.accessibilityLiveRegion === 'polite' &&
          node.children.includes('messageSendFailed'),
      ),
    ).toBeTruthy();
    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).toContain(existingMessage.body);
    expect(rendered).not.toContain('unsafe send detail');
  });

  it('keeps a safe upload failure visible over existing messages after reconciliation', async () => {
    const existingMessage = state.messages[0];
    if (!existingMessage) throw new Error('existing message fixture missing');
    loadMessages.mockResolvedValue({ data: [existingMessage], error: null });
    pickImage.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///failed-upload.jpg',
          fileName: 'failed-upload.jpg',
          mimeType: 'image/jpeg',
        },
      ],
    });
    uploadAttachment.mockRejectedValueOnce(new Error('unsafe upload detail'));
    const { default: Messages } = await import('../app/messages');
    let renderer: ReturnType<typeof create> | undefined;
    await act(async () => {
      renderer = create(<Messages />);
      await Promise.resolve();
      await Promise.resolve();
    });
    if (!renderer) throw new Error('renderer missing');
    const addAttachment = renderer.root.find(
      (node) => node.type === 'Button' && node.props.label === 'addAttachment',
    );
    await act(async () => {
      addAttachment.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      realtimeState.channels[0]?.statusCallback?.('SUBSCRIBED');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      renderer.root.find(
        (node) =>
          node.type === 'Text' &&
          node.props.accessibilityLiveRegion === 'polite' &&
          node.children.includes('messageAttachmentFailed'),
      ),
    ).toBeTruthy();
    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).toContain(existingMessage.body);
    expect(rendered).not.toContain('unsafe upload detail');
  });

  it('clears only the prior send warning after a successful send retry', async () => {
    const existingMessage = state.messages[0];
    if (!existingMessage) throw new Error('existing message fixture missing');
    loadMessages.mockResolvedValue({ data: [existingMessage], error: null });
    sendMessage
      .mockResolvedValueOnce({ data: null, error: { message: 'unsafe first send detail' } })
      .mockResolvedValueOnce({ data: null, error: null });
    const { default: Messages } = await import('../app/messages');
    let renderer: ReturnType<typeof create> | undefined;
    await act(async () => {
      renderer = create(<Messages />);
      await Promise.resolve();
      await Promise.resolve();
    });
    if (!renderer) throw new Error('renderer missing');
    const composer = renderer.root.find(
      (node) => node.type === 'TextInput' && node.props.placeholder === 'messagePlaceholder',
    );
    const send = renderer.root.find(
      (node) => node.type === 'Button' && node.props.label === 'send',
    );
    await act(() => composer.props.onChangeText('retryable send'));
    await act(async () => {
      send.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(JSON.stringify(renderer.toJSON())).toContain('messageSendFailed');

    await act(async () => {
      send.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).not.toContain('messageSendFailed');
    expect(rendered).not.toContain('unsafe first send detail');
    expect(rendered).toContain(existingMessage.body);
  });

  it('clears only the prior upload warning after a successful upload retry', async () => {
    const existingMessage = state.messages[0];
    if (!existingMessage) throw new Error('existing message fixture missing');
    loadMessages.mockResolvedValue({ data: [existingMessage], error: null });
    pickImage.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///retry-upload.jpg',
          fileName: 'retry-upload.jpg',
          mimeType: 'image/jpeg',
        },
      ],
    });
    uploadAttachment
      .mockRejectedValueOnce(new Error('unsafe first upload detail'))
      .mockResolvedValueOnce({
        uploadId: ids.upload,
        status: 'clean',
        sanitized: true,
        mimeType: 'image/jpeg',
        sizeBytes: 3,
      });
    const { default: Messages } = await import('../app/messages');
    let renderer: ReturnType<typeof create> | undefined;
    await act(async () => {
      renderer = create(<Messages />);
      await Promise.resolve();
      await Promise.resolve();
    });
    if (!renderer) throw new Error('renderer missing');
    const button = (label: string) =>
      renderer.root.find((node) => node.type === 'Button' && node.props.label === label);
    await act(async () => {
      button('addAttachment').props.onPress();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(JSON.stringify(renderer.toJSON())).toContain('messageAttachmentFailed');

    await act(async () => {
      button('addAttachment').props.onPress();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).not.toContain('messageAttachmentFailed');
    expect(rendered).not.toContain('unsafe first upload detail');
    expect(button('attachmentReady')).toBeTruthy();
  });

  it('does not clear an upload warning when an overlapping send succeeds', async () => {
    const existingMessage = state.messages[0];
    if (!existingMessage) throw new Error('existing message fixture missing');
    loadMessages.mockResolvedValue({ data: [existingMessage], error: null });
    let resolveSend: ((value: { data: null; error: null }) => void) | undefined;
    sendMessage.mockImplementationOnce(
      async () =>
        await new Promise((resolve) => {
          resolveSend = resolve;
        }),
    );
    pickImage.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///overlap-upload.jpg',
          fileName: 'overlap-upload.jpg',
          mimeType: 'image/jpeg',
        },
      ],
    });
    uploadAttachment.mockRejectedValueOnce(new Error('unsafe overlap upload detail'));
    const { default: Messages } = await import('../app/messages');
    let renderer: ReturnType<typeof create> | undefined;
    await act(async () => {
      renderer = create(<Messages />);
      await Promise.resolve();
      await Promise.resolve();
    });
    if (!renderer) throw new Error('renderer missing');
    const composer = renderer.root.find(
      (node) => node.type === 'TextInput' && node.props.placeholder === 'messagePlaceholder',
    );
    const button = (label: string) =>
      renderer.root.find((node) => node.type === 'Button' && node.props.label === label);
    await act(() => composer.props.onChangeText('overlapping send'));
    await act(async () => {
      button('send').props.onPress();
      await Promise.resolve();
      button('addAttachment').props.onPress();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(JSON.stringify(renderer.toJSON())).toContain('messageAttachmentFailed');

    await act(async () => {
      resolveSend?.({ data: null, error: null });
      await Promise.resolve();
      await Promise.resolve();
    });

    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).toContain('messageAttachmentFailed');
    expect(rendered).not.toContain('messageSendFailed');
    expect(rendered).not.toContain('unsafe overlap upload detail');
  });

  it('does not clear a send warning when an overlapping upload succeeds', async () => {
    const existingMessage = state.messages[0];
    if (!existingMessage) throw new Error('existing message fixture missing');
    loadMessages.mockResolvedValue({ data: [existingMessage], error: null });
    pickImage.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///overlap-success.jpg',
          fileName: 'overlap-success.jpg',
          mimeType: 'image/jpeg',
        },
      ],
    });
    let resolveUpload:
      | ((value: {
          uploadId: string;
          status: 'clean';
          sanitized: true;
          mimeType: string;
          sizeBytes: number;
        }) => void)
      | undefined;
    uploadAttachment.mockImplementationOnce(
      async () =>
        await new Promise((resolve) => {
          resolveUpload = resolve;
        }),
    );
    sendMessage.mockResolvedValueOnce({ data: null, error: { message: 'unsafe send detail' } });
    const { default: Messages } = await import('../app/messages');
    let renderer: ReturnType<typeof create> | undefined;
    await act(async () => {
      renderer = create(<Messages />);
      await Promise.resolve();
      await Promise.resolve();
    });
    if (!renderer) throw new Error('renderer missing');
    const composer = renderer.root.find(
      (node) => node.type === 'TextInput' && node.props.placeholder === 'messagePlaceholder',
    );
    const button = (label: string) =>
      renderer.root.find((node) => node.type === 'Button' && node.props.label === label);
    await act(async () => {
      button('addAttachment').props.onPress();
      await Promise.resolve();
    });
    await act(() => composer.props.onChangeText('overlapping failed send'));
    await act(async () => {
      button('send').props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(JSON.stringify(renderer.toJSON())).toContain('messageSendFailed');

    await act(async () => {
      resolveUpload?.({
        uploadId: ids.upload,
        status: 'clean',
        sanitized: true,
        mimeType: 'image/jpeg',
        sizeBytes: 3,
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).toContain('messageSendFailed');
    expect(rendered).not.toContain('messageAttachmentFailed');
    expect(rendered).not.toContain('unsafe send detail');
    expect(button('attachmentReady')).toBeTruthy();
  });

  it('does not let a stale send success clear a newer send failure', async () => {
    const existingMessage = state.messages[0];
    if (!existingMessage) throw new Error('existing message fixture missing');
    loadMessages.mockResolvedValue({ data: [existingMessage], error: null });
    let resolveFirstSend: ((value: { data: null; error: null }) => void) | undefined;
    sendMessage
      .mockImplementationOnce(
        async () =>
          await new Promise((resolve) => {
            resolveFirstSend = resolve;
          }),
      )
      .mockResolvedValueOnce({ data: null, error: { message: 'unsafe newer send detail' } });
    const { default: Messages } = await import('../app/messages');
    let renderer: ReturnType<typeof create> | undefined;
    await act(async () => {
      renderer = create(<Messages />);
      await Promise.resolve();
      await Promise.resolve();
    });
    if (!renderer) throw new Error('renderer missing');
    const composer = renderer.root.find(
      (node) => node.type === 'TextInput' && node.props.placeholder === 'messagePlaceholder',
    );
    const send = renderer.root.find(
      (node) => node.type === 'Button' && node.props.label === 'send',
    );
    await act(() => composer.props.onChangeText('concurrent sends'));
    await act(async () => {
      send.props.onPress();
      await Promise.resolve();
      send.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(JSON.stringify(renderer.toJSON())).toContain('messageSendFailed');

    await act(async () => {
      resolveFirstSend?.({ data: null, error: null });
      await Promise.resolve();
      await Promise.resolve();
    });

    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).toContain('messageSendFailed');
    expect(rendered).not.toContain('unsafe newer send detail');
  });

  it('rejects a captured snapshot retry after same-instance navigation', async () => {
    const existingMessage = state.messages[0];
    if (!existingMessage) throw new Error('existing message fixture missing');
    loadMessages
      .mockResolvedValueOnce({ data: [existingMessage], error: null })
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST000', message: 'unsafe old-route snapshot detail' },
      })
      .mockResolvedValue({ data: [], error: null });
    const { default: Messages } = await import('../app/messages');
    let renderer: ReturnType<typeof create> | undefined;
    await act(async () => {
      renderer = create(<Messages />);
      await Promise.resolve();
      await Promise.resolve();
    });
    if (!renderer) throw new Error('renderer missing');
    await act(async () => {
      realtimeState.channels[0]?.statusCallback?.('SUBSCRIBED');
      await Promise.resolve();
      await Promise.resolve();
    });
    const oldRetry = renderer.root.find(
      (node) => node.type === 'Button' && node.props.label === 'retry',
    ).props.onPress as () => void;

    routeState.conversationId = ids.secondConversation;
    state.trustContext = {
      ...state.trustContext,
      conversationId: ids.secondConversation,
      counterpartyUserId: ids.secondCounterparty,
    };
    await act(async () => {
      renderer?.update(<Messages />);
      await Promise.resolve();
      await Promise.resolve();
    });
    const loadsBeforeStaleRetry = loadMessages.mock.calls.length;
    await act(async () => {
      oldRetry();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(loadMessages).toHaveBeenCalledTimes(loadsBeforeStaleRetry);
    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).not.toContain(String(existingMessage.body));
    expect(rendered).not.toContain('unsafe old-route snapshot detail');
  });

  it('reconciles after every SUBSCRIBED status so startup and reconnect gaps appear exactly once', async () => {
    const startupGapMessage = {
      id: ids.incomingMessage,
      body: 'Committed during subscription handoff',
      sender_id: ids.counterparty,
      created_at: '2026-08-20T12:02:00.000Z',
      message_attachments: [],
    };
    const reconnectGapMessage = {
      id: ids.secondMessage,
      body: 'Committed during reconnect gap',
      sender_id: ids.counterparty,
      created_at: '2026-08-20T12:03:00.000Z',
      message_attachments: [],
    };
    state.messages = [];
    loadMessages
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [startupGapMessage], error: null })
      .mockResolvedValue({ data: [reconnectGapMessage, startupGapMessage], error: null });
    const { default: Messages } = await import('../app/messages');
    let renderer: ReturnType<typeof create> | undefined;
    await act(async () => {
      renderer = create(<Messages />);
      await Promise.resolve();
      await Promise.resolve();
    });
    if (!renderer) throw new Error('renderer missing');
    expect(JSON.stringify(renderer.toJSON())).not.toContain(startupGapMessage.body);

    await act(async () => {
      realtimeState.channels[0]?.statusCallback?.('SUBSCRIBED');
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(JSON.stringify(renderer.toJSON()).split(startupGapMessage.body)).toHaveLength(2);
    expect(loadMessages).toHaveBeenCalledTimes(2);

    await act(async () => {
      realtimeState.channels[0]?.statusCallback?.('SUBSCRIBED');
      await Promise.resolve();
      await Promise.resolve();
    });
    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered.split(startupGapMessage.body)).toHaveLength(2);
    expect(rendered.split(reconnectGapMessage.body)).toHaveLength(2);
    expect(loadMessages).toHaveBeenCalledTimes(3);
  });

  it('serializes repeated SUBSCRIBED statuses into at most one trailing reconciliation', async () => {
    const coalescedMessage = {
      id: ids.incomingMessage,
      body: 'Coalesced reconnect message',
      sender_id: ids.counterparty,
      created_at: '2026-08-20T12:02:00.000Z',
      message_attachments: [],
    };
    const pending: Array<(value: { data: Array<Record<string, unknown>>; error: null }) => void> =
      [];
    loadMessages.mockImplementation(
      async () =>
        await new Promise((resolve) => {
          pending.push(resolve);
        }),
    );
    const { default: Messages } = await import('../app/messages');
    let renderer: ReturnType<typeof create> | undefined;
    await act(async () => {
      renderer = create(<Messages />);
      await Promise.resolve();
    });
    if (!renderer) throw new Error('renderer missing');

    await act(async () => {
      realtimeState.channels[0]?.statusCallback?.('SUBSCRIBED');
      realtimeState.channels[0]?.statusCallback?.('SUBSCRIBED');
      realtimeState.channels[0]?.statusCallback?.('SUBSCRIBED');
      await Promise.resolve();
    });
    expect(loadMessages).toHaveBeenCalledOnce();

    await act(async () => {
      pending[0]?.({ data: [], error: null });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(loadMessages).toHaveBeenCalledTimes(2);

    await act(async () => {
      pending[1]?.({ data: [coalescedMessage, coalescedMessage], error: null });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(JSON.stringify(renderer.toJSON()).split(coalescedMessage.body)).toHaveLength(2);
    expect(loadMessages).toHaveBeenCalledTimes(2);
  });

  it('deduplicates a message delivered by realtime and the overlapping startup snapshot', async () => {
    const duplicateMessage = {
      id: ids.incomingMessage,
      body: 'Realtime and snapshot duplicate',
      sender_id: ids.counterparty,
      created_at: '2026-08-20T12:02:00.000Z',
      message_attachments: [],
    };
    let resolveSnapshot:
      ((value: { data: Array<Record<string, unknown>>; error: null }) => void) | undefined;
    loadMessages.mockImplementation(
      async () =>
        await new Promise((resolve) => {
          resolveSnapshot = resolve;
        }),
    );
    loadExactMessage.mockResolvedValue({ data: duplicateMessage, error: null });
    const { default: Messages } = await import('../app/messages');
    let renderer: ReturnType<typeof create> | undefined;
    await act(async () => {
      renderer = create(<Messages />);
      await Promise.resolve();
    });
    if (!renderer) throw new Error('renderer missing');

    await act(async () => {
      realtimeState.channels[0]?.callback?.({ new: { id: ids.incomingMessage } });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(loadExactMessage).toHaveBeenCalledWith(ids.conversation, ids.incomingMessage);
    await act(async () => {
      resolveSnapshot?.({ data: [duplicateMessage], error: null });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(JSON.stringify(renderer.toJSON()).split(duplicateMessage.body)).toHaveLength(2);
  });

  it('subscribes to exact conversation message inserts and discards late old-route hydration', async () => {
    state.messages = [];
    loadMessages.mockResolvedValue({ data: [], error: null });
    let resolveOldMessage:
      | ((value: {
          data: Record<string, unknown> | null;
          error: null | { code: string; message: string };
        }) => void)
      | undefined;
    loadExactMessage.mockImplementation(async (activeConversationId, messageId) => {
      if (activeConversationId === ids.conversation) {
        return await new Promise((resolve) => {
          resolveOldMessage = resolve;
        });
      }
      return {
        data: {
          id: messageId,
          body: 'Current realtime row',
          sender_id: ids.secondCounterparty,
          created_at: '2026-08-20T12:03:00.000Z',
          message_attachments: [],
        },
        error: null,
      };
    });
    const { default: Messages } = await import('../app/messages');
    let renderer: ReturnType<typeof create> | undefined;
    await act(async () => {
      renderer = create(<Messages />);
      await Promise.resolve();
      await Promise.resolve();
    });
    if (!renderer) throw new Error('renderer missing');
    const firstChannel = realtimeState.channels[0];
    expect(firstChannel).toMatchObject({
      name: `conversation:${ids.conversation}`,
      event: 'postgres_changes',
      config: {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${ids.conversation}`,
      },
      subscribed: true,
    });

    await act(async () => {
      firstChannel?.callback?.({ new: { id: ids.incomingMessage } });
      await Promise.resolve();
    });
    expect(loadExactMessage).toHaveBeenCalledWith(ids.conversation, ids.incomingMessage);

    routeState.conversationId = ids.secondConversation;
    state.trustContext = {
      ...state.trustContext,
      conversationId: ids.secondConversation,
      counterpartyUserId: ids.secondCounterparty,
    };
    await act(async () => {
      renderer?.update(<Messages />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(realtimeState.removed).toContain(firstChannel?.instance);
    const secondChannel = realtimeState.channels[1];
    expect(secondChannel?.config).toEqual({
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `conversation_id=eq.${ids.secondConversation}`,
    });

    const loadsBeforeOldSubscribed = loadMessages.mock.calls.length;
    await act(async () => {
      firstChannel?.statusCallback?.('SUBSCRIBED');
      resolveOldMessage?.({
        data: null,
        error: { code: 'PGRST000', message: 'late recoverable old-route failure' },
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(loadMessages).toHaveBeenCalledTimes(loadsBeforeOldSubscribed);

    await act(async () => {
      secondChannel?.callback?.({
        new: { id: ids.secondMessage },
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).not.toContain('late recoverable old-route failure');
    expect(rendered).toContain('Current realtime row');
  });

  it('fails closed for blocked communication and does not request protected message media', async () => {
    state.trustContext = {
      ...state.trustContext,
      blockedByMe: true,
      canCommunicate: false,
      restriction: 'blocked',
    };
    state.messages = [
      {
        id: ids.incomingMessage,
        body: 'Evidence text remains visible',
        sender_id: ids.counterparty,
        created_at: '2026-08-20T12:00:00.000Z',
        message_attachments: [
          {
            id: ids.attachment,
            file_upload_id: ids.upload,
            mime_type: 'image/jpeg',
            size_bytes: 512,
          },
        ],
      },
    ];
    const { default: Messages } = await import('../app/messages');
    let renderer: ReturnType<typeof create> | undefined;
    await act(async () => {
      renderer = create(<Messages />);
      await Promise.resolve();
      await Promise.resolve();
    });
    if (!renderer) throw new Error('renderer missing');
    const composer = renderer.root.find(
      (node) => node.type === 'TextInput' && node.props.placeholder === 'messagePlaceholder',
    );
    expect(composer.props.editable).toBe(false);
    expect(mediaInvoke).not.toHaveBeenCalled();
    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).toContain('trustCommunicationBlockedByMe');
    expect(rendered).not.toContain('trustCommunicationBlockedByThem');
    expect(
      renderer.root.findAll(
        (node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'trustUnblock',
      ),
    ).toHaveLength(1);
  });

  it.each(['counterparty block', 'other unavailable condition'])(
    'renders %s through the same generic unavailable projection',
    async () => {
      state.trustContext = {
        ...state.trustContext,
        blockedByMe: false,
        canCommunicate: false,
        restriction: 'communication_unavailable',
      };
      state.messages = [];
      const { default: Messages } = await import('../app/messages');
      let renderer: ReturnType<typeof create> | undefined;
      await act(async () => {
        renderer = create(<Messages />);
        await Promise.resolve();
        await Promise.resolve();
      });
      if (!renderer) throw new Error('renderer missing');
      const rendered = JSON.stringify(renderer.toJSON());
      expect(rendered).toContain('trustCommunicationUnavailable');
      expect(rendered).not.toContain('trustCommunicationBlockedByThem');
      expect(
        renderer.root.findAll(
          (node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'trustBlock',
        ),
      ).toHaveLength(1);
      expect(
        renderer.root.findAll(
          (node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'trustUnblock',
        ),
      ).toHaveLength(0);
    },
  );

  it.each([
    ['empty', []],
    [
      'outbound-only',
      [
        {
          id: ids.ownMessage,
          body: 'Own message only',
          sender_id: ids.user,
          created_at: '2026-08-20T12:01:00.000Z',
          message_attachments: [],
        },
      ],
    ],
  ] as const)(
    'keeps conversation-level user report and block controls in an %s conversation',
    async (_case, messages) => {
      state.messages = [...messages];
      const { default: Messages } = await import('../app/messages');
      let renderer: ReturnType<typeof create> | undefined;
      await act(async () => {
        renderer = create(<Messages />);
        await Promise.resolve();
        await Promise.resolve();
      });
      if (!renderer) throw new Error('renderer missing');
      expect(
        renderer.root.findAll(
          (node) =>
            node.type === 'Pressable' && node.props.accessibilityLabel === 'trustReportUser',
        ),
      ).toHaveLength(1);
      expect(
        renderer.root.findAll(
          (node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'trustBlock',
        ),
      ).toHaveLength(1);
      expect(
        renderer.root.findAll(
          (node) =>
            node.type === 'Pressable' && node.props.accessibilityLabel === 'trustReportMessage',
        ),
      ).toHaveLength(0);
    },
  );

  it('uses the authoritative unblock communication result when refresh fails', async () => {
    state.trustContext = {
      ...state.trustContext,
      blockedByMe: true,
      canCommunicate: false,
      restriction: 'blocked',
    };
    let contextAttempt = 0;
    loadTrustContext.mockImplementation(async () => {
      contextAttempt += 1;
      if (contextAttempt === 1) return state.trustContext;
      throw new Error('refresh failed after committed unblock');
    });
    setBlocked.mockResolvedValue({
      targetUserId: ids.counterparty,
      blocked: false,
      changed: true,
      canCommunicate: true,
    });
    state.messages = [];
    const { default: Messages } = await import('../app/messages');
    let renderer: ReturnType<typeof create> | undefined;
    await act(async () => {
      renderer = create(<Messages />);
      await Promise.resolve();
      await Promise.resolve();
    });
    if (!renderer) throw new Error('renderer missing');
    const press = (label: string) =>
      renderer.root.find(
        (node) => node.type === 'Pressable' && node.props.accessibilityLabel === label,
      );
    await act(() => press('trustUnblock').props.onPress());
    await act(async () => {
      press('trustConfirmUnblock').props.onPress();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).toContain('trustUnblockSuccess');
    expect(rendered).toContain('trustRefreshWarning');
    expect(rendered).not.toContain('trustCommunicationBlockedByThem');
    expect(press('trustBlock')).toBeTruthy();
    expect(
      renderer.root.find(
        (node) => node.type === 'TextInput' && node.props.placeholder === 'messagePlaceholder',
      ).props.editable,
    ).toBe(true);
  });

  it('ignores out-of-order context responses and never blocks a stale counterparty', async () => {
    const pending = new Map<string, (value: typeof state.trustContext) => void>();
    loadTrustContext.mockImplementation(
      async (_client, activeConversationId: string) =>
        await new Promise<typeof state.trustContext>((resolve) => {
          pending.set(activeConversationId, resolve);
        }),
    );
    state.messages = [];
    const { default: Messages } = await import('../app/messages');
    let renderer: ReturnType<typeof create> | undefined;
    await act(async () => {
      renderer = create(<Messages />);
      await Promise.resolve();
    });
    if (!renderer) throw new Error('renderer missing');

    routeState.conversationId = ids.secondConversation;
    await act(async () => {
      renderer?.update(<Messages />);
      await Promise.resolve();
    });
    expect(
      renderer.root.findAll(
        (node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'trustBlock',
      ),
    ).toHaveLength(0);

    await act(async () => {
      pending.get(ids.secondConversation)?.({
        ...state.trustContext,
        conversationId: ids.secondConversation,
        counterpartyUserId: ids.secondCounterparty,
      });
      await Promise.resolve();
    });
    await act(async () => {
      pending.get(ids.conversation)?.(state.trustContext);
      await Promise.resolve();
    });
    const block = renderer.root.find(
      (node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'trustBlock',
    );
    await act(() => block.props.onPress());
    const confirm = renderer.root.find(
      (node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'trustConfirmBlock',
    );
    await act(async () => confirm.props.onPress());
    expect(setBlocked).toHaveBeenCalledWith(expect.anything(), {
      targetUserId: ids.secondCounterparty,
      blocked: true,
    });
  });

  it('ignores a report completion from the previous conversation after the new context is active', async () => {
    let resolveSecondContext: ((value: typeof state.trustContext) => void) | undefined;
    let resolveReport: (() => void) | undefined;
    loadTrustContext.mockImplementation(async (_client, activeConversationId: string) => {
      if (activeConversationId === ids.conversation) return state.trustContext;
      return await new Promise<typeof state.trustContext>((resolve) => {
        resolveSecondContext = resolve;
      });
    });
    submitReport.mockImplementation(async (_client, intent) => {
      if (intent.contextConversationId !== ids.conversation) return;
      return await new Promise<void>((resolve) => {
        resolveReport = resolve;
      });
    });
    state.messages = [];
    const { default: Messages } = await import('../app/messages');
    let renderer: ReturnType<typeof create> | undefined;
    await act(async () => {
      renderer = create(<Messages />);
      await Promise.resolve();
      await Promise.resolve();
    });
    if (!renderer) throw new Error('renderer missing');
    const press = (label: string) =>
      renderer.root.find(
        (node) => node.type === 'Pressable' && node.props.accessibilityLabel === label,
      );
    await act(() => press('trustReportUser').props.onPress());
    await act(() => press('trustReasonSpam').props.onPress());
    await act(() => press('trustSubmitReport').props.onPress());
    expect(submitReport).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({
        targetType: 'user',
        targetId: ids.counterparty,
        contextConversationId: ids.conversation,
      }),
    );

    routeState.conversationId = ids.secondConversation;
    await act(async () => {
      renderer?.update(<Messages />);
      await Promise.resolve();
    });
    await act(async () => {
      resolveSecondContext?.({
        ...state.trustContext,
        conversationId: ids.secondConversation,
        counterpartyUserId: ids.secondCounterparty,
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(press('trustBlock')).toBeTruthy();

    await act(() => press('trustReportUser').props.onPress());
    await act(() => press('trustReasonSpam').props.onPress());
    await act(async () => press('trustSubmitReport').props.onPress());
    expect(submitReport).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({
        targetType: 'user',
        targetId: ids.secondCounterparty,
        contextConversationId: ids.secondConversation,
      }),
    );

    await act(async () => {
      resolveReport?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(press('trustBlock')).toBeTruthy();
    expect(loadTrustContext.mock.calls.filter((call) => call[1] === ids.conversation)).toHaveLength(
      1,
    );
  });

  it('ignores a block completion from the previous conversation after the new context is active', async () => {
    let resolveSecondContext: ((value: typeof state.trustContext) => void) | undefined;
    let resolveBlock:
      | ((value: {
          targetUserId: string;
          blocked: boolean;
          changed: boolean;
          canCommunicate: boolean;
        }) => void)
      | undefined;
    loadTrustContext.mockImplementation(async (_client, activeConversationId: string) => {
      if (activeConversationId === ids.conversation) return state.trustContext;
      return await new Promise<typeof state.trustContext>((resolve) => {
        resolveSecondContext = resolve;
      });
    });
    setBlocked.mockImplementation(
      async () =>
        await new Promise((resolve) => {
          resolveBlock = resolve;
        }),
    );
    state.messages = [];
    const { default: Messages } = await import('../app/messages');
    let renderer: ReturnType<typeof create> | undefined;
    await act(async () => {
      renderer = create(<Messages />);
      await Promise.resolve();
      await Promise.resolve();
    });
    if (!renderer) throw new Error('renderer missing');
    const press = (label: string) =>
      renderer.root.find(
        (node) => node.type === 'Pressable' && node.props.accessibilityLabel === label,
      );
    await act(() => press('trustBlock').props.onPress());
    await act(() => press('trustConfirmBlock').props.onPress());

    routeState.conversationId = ids.secondConversation;
    await act(async () => {
      renderer?.update(<Messages />);
      await Promise.resolve();
    });
    await act(async () => {
      resolveSecondContext?.({
        ...state.trustContext,
        conversationId: ids.secondConversation,
        counterpartyUserId: ids.secondCounterparty,
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(press('trustBlock')).toBeTruthy();

    await act(async () => {
      resolveBlock?.({
        targetUserId: ids.counterparty,
        blocked: true,
        changed: true,
        canCommunicate: false,
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(press('trustBlock')).toBeTruthy();
    expect(loadTrustContext.mock.calls.filter((call) => call[1] === ids.conversation)).toHaveLength(
      1,
    );
  });

  it('rejects a trust context whose conversation does not match the active route', async () => {
    loadTrustContext.mockResolvedValue({
      ...state.trustContext,
      conversationId: ids.secondConversation,
      counterpartyUserId: ids.secondCounterparty,
    });
    state.messages = [];
    const { default: Messages } = await import('../app/messages');
    let renderer: ReturnType<typeof create> | undefined;
    await act(async () => {
      renderer = create(<Messages />);
      await Promise.resolve();
      await Promise.resolve();
    });
    if (!renderer) throw new Error('renderer missing');
    expect(
      renderer.root.findAll(
        (node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'trustBlock',
      ),
    ).toHaveLength(0);
    expect(JSON.stringify(renderer.toJSON())).toContain('trustErrorUnknown');
  });

  it('retains a committed conversation report success when its context refresh fails', async () => {
    let contextAttempt = 0;
    let rejectRefresh: ((reason?: unknown) => void) | undefined;
    loadTrustContext.mockImplementation(async () => {
      contextAttempt += 1;
      if (contextAttempt === 1) return state.trustContext;
      return await new Promise<typeof state.trustContext>((_resolve, reject) => {
        rejectRefresh = reject;
      });
    });
    state.messages = [];
    const { default: Messages } = await import('../app/messages');
    let renderer: ReturnType<typeof create> | undefined;
    await act(async () => {
      renderer = create(<Messages />);
      await Promise.resolve();
      await Promise.resolve();
    });
    if (!renderer) throw new Error('renderer missing');
    const press = (label: string) =>
      renderer.root.find(
        (node) => node.type === 'Pressable' && node.props.accessibilityLabel === label,
      );
    await act(() => press('trustReportUser').props.onPress());
    await act(() => press('trustReasonSpam').props.onPress());
    await act(async () => {
      press('trustSubmitReport').props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(rejectRefresh).toBeTypeOf('function');
    await act(async () => {
      rejectRefresh?.(new Error('refresh failed after commit'));
      await Promise.resolve();
      await Promise.resolve();
    });

    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).toContain('trustReportSuccess');
    expect(rendered).toContain('trustRefreshWarning');
    expect(rendered).not.toContain('trustErrorUnknown');
    expect(press('trustReportUser')).toBeTruthy();
    expect(submitReport).toHaveBeenCalledOnce();
  });

  it('retains block success while a successful context refresh replaces the local result', async () => {
    let contextAttempt = 0;
    loadTrustContext.mockImplementation(async () => {
      contextAttempt += 1;
      return contextAttempt === 1
        ? state.trustContext
        : {
            ...state.trustContext,
            blockedByMe: true,
            canCommunicate: false,
            restriction: 'blocked',
          };
    });
    state.messages = [];
    const { default: Messages } = await import('../app/messages');
    let renderer: ReturnType<typeof create> | undefined;
    await act(async () => {
      renderer = create(<Messages />);
      await Promise.resolve();
      await Promise.resolve();
    });
    if (!renderer) throw new Error('renderer missing');
    const press = (label: string) =>
      renderer.root.find(
        (node) => node.type === 'Pressable' && node.props.accessibilityLabel === label,
      );
    await act(() => press('trustBlock').props.onPress());
    await act(async () => {
      press('trustConfirmBlock').props.onPress();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).toContain('trustBlockSuccess');
    expect(rendered).not.toContain('trustRefreshWarning');
    expect(press('trustUnblock')).toBeTruthy();
  });

  it.each([
    {
      action: 'block',
      initiallyBlocked: false,
      actionLabel: 'trustBlock',
      confirmLabel: 'trustConfirmBlock',
      successKey: 'trustBlockSuccess',
      nextActionLabel: 'trustUnblock',
      resultBlocked: true,
      resultCanCommunicate: false,
      noticeKey: 'trustCommunicationBlockedByMe',
    },
    {
      action: 'unblock',
      initiallyBlocked: true,
      actionLabel: 'trustUnblock',
      confirmLabel: 'trustConfirmUnblock',
      successKey: 'trustUnblockSuccess',
      nextActionLabel: 'trustBlock',
      resultBlocked: false,
      resultCanCommunicate: false,
      noticeKey: 'trustCommunicationUnavailable',
    },
  ])(
    'retains committed $action success and fails closed when its context refresh fails',
    async ({
      initiallyBlocked,
      actionLabel,
      confirmLabel,
      successKey,
      nextActionLabel,
      resultBlocked,
      resultCanCommunicate,
      noticeKey,
    }) => {
      state.trustContext = initiallyBlocked
        ? {
            ...state.trustContext,
            blockedByMe: true,
            canCommunicate: false,
            restriction: 'blocked',
          }
        : state.trustContext;
      let contextAttempt = 0;
      loadTrustContext.mockImplementation(async () => {
        contextAttempt += 1;
        if (contextAttempt === 1) return state.trustContext;
        throw new Error('refresh failed after commit');
      });
      setBlocked.mockResolvedValue({
        targetUserId: ids.counterparty,
        blocked: resultBlocked,
        changed: true,
        canCommunicate: resultCanCommunicate,
      });
      state.messages = [];
      const { default: Messages } = await import('../app/messages');
      let renderer: ReturnType<typeof create> | undefined;
      await act(async () => {
        renderer = create(<Messages />);
        await Promise.resolve();
        await Promise.resolve();
      });
      if (!renderer) throw new Error('renderer missing');
      const press = (label: string) =>
        renderer.root.find(
          (node) => node.type === 'Pressable' && node.props.accessibilityLabel === label,
        );
      await act(() => press(actionLabel).props.onPress());
      await act(async () => {
        press(confirmLabel).props.onPress();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      const rendered = JSON.stringify(renderer.toJSON());
      expect(rendered).toContain(successKey);
      expect(rendered).toContain('trustRefreshWarning');
      expect(rendered).not.toContain('trustErrorUnknown');
      expect(rendered).toContain(noticeKey);
      expect(rendered).not.toContain('trustCommunicationBlockedByThem');
      expect(press(nextActionLabel)).toBeTruthy();
      expect(
        renderer.root.find(
          (node) => node.type === 'TextInput' && node.props.placeholder === 'messagePlaceholder',
        ).props.editable,
      ).toBe(false);
    },
  );

  it('synchronously isolates draft, attachment, and errors on a same-instance route change', async () => {
    state.messages = [];
    loadMessages.mockImplementation(async (activeConversationId) => ({
      data: activeConversationId === ids.conversation ? state.messages : [],
      error: null,
    }));
    pickImage.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///old-conversation.jpg',
          fileName: 'old-conversation.jpg',
          mimeType: 'image/jpeg',
        },
      ],
    });
    uploadAttachment.mockResolvedValue({
      uploadId: ids.upload,
      status: 'clean',
      sanitized: true,
      mimeType: 'image/jpeg',
      sizeBytes: 3,
    });
    const { default: Messages } = await import('../app/messages');
    let renderer: ReturnType<typeof create> | undefined;
    await act(async () => {
      renderer = create(<Messages />);
      await Promise.resolve();
      await Promise.resolve();
    });
    if (!renderer) throw new Error('renderer missing');
    const composer = () =>
      renderer.root.find(
        (node) => node.type === 'TextInput' && node.props.placeholder === 'messagePlaceholder',
      );
    const button = (label: string) =>
      renderer.root.find((node) => node.type === 'Button' && node.props.label === label);
    await act(() => composer().props.onChangeText('old draft'));
    await act(async () => button('addAttachment').props.onPress());
    expect(button('attachmentReady')).toBeTruthy();
    sendMessage.mockResolvedValueOnce({ data: null, error: { message: 'send failed' } });
    await act(async () => {
      button('send').props.onPress();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(JSON.stringify(renderer.toJSON())).toContain('messageSendFailed');

    routeState.conversationId = ids.secondConversation;
    state.trustContext = {
      ...state.trustContext,
      conversationId: ids.secondConversation,
      counterpartyUserId: ids.secondCounterparty,
    };
    await act(async () => {
      renderer?.update(<Messages />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).not.toContain('Incoming message');
    expect(rendered).not.toContain('messageSendFailed');
    expect(composer().props.value).toBe('');
    expect(button('addAttachment')).toBeTruthy();
    const callsBeforeEmptySend = sendMessage.mock.calls.length;
    await act(async () => button('send').props.onPress());
    expect(sendMessage).toHaveBeenCalledTimes(callsBeforeEmptySend);
  });

  it('does not start a delayed picker upload after block then unblock restores the composer', async () => {
    state.messages = [];
    const unblockedContext = { ...state.trustContext };
    const blockedContext = {
      ...state.trustContext,
      blockedByMe: true,
      canCommunicate: false,
      restriction: 'blocked' as const,
    };
    let contextAttempt = 0;
    loadTrustContext.mockImplementation(async () => {
      contextAttempt += 1;
      if (contextAttempt === 1) return unblockedContext;
      if (contextAttempt === 2) return blockedContext;
      return unblockedContext;
    });
    let resolvePicker:
      | ((value: {
          canceled: false;
          assets: Array<{ uri: string; fileName: string; mimeType: string }>;
        }) => void)
      | undefined;
    pickImage.mockImplementation(
      async () =>
        await new Promise((resolve) => {
          resolvePicker = resolve;
        }),
    );
    const { default: Messages } = await import('../app/messages');
    let renderer: ReturnType<typeof create> | undefined;
    await act(async () => {
      renderer = create(<Messages />);
      await Promise.resolve();
      await Promise.resolve();
    });
    if (!renderer) throw new Error('renderer missing');
    const button = (label: string) =>
      renderer.root.find((node) => node.type === 'Button' && node.props.label === label);
    const press = (label: string) =>
      renderer.root.find(
        (node) => node.type === 'Pressable' && node.props.accessibilityLabel === label,
      );

    await act(() => button('addAttachment').props.onPress());
    await act(() => press('trustBlock').props.onPress());
    await act(async () => {
      press('trustConfirmBlock').props.onPress();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(press('trustUnblock')).toBeTruthy();
    await act(() => press('trustUnblock').props.onPress());
    await act(async () => {
      press('trustConfirmUnblock').props.onPress();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(press('trustBlock')).toBeTruthy();

    await act(async () => {
      resolvePicker?.({
        canceled: false,
        assets: [
          {
            uri: 'file:///stale-picker.jpg',
            fileName: 'stale-picker.jpg',
            mimeType: 'image/jpeg',
          },
        ],
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(uploadAttachment).not.toHaveBeenCalled();
    expect(button('addAttachment')).toBeTruthy();
    expect(JSON.stringify(renderer.toJSON())).not.toContain('attachmentReady');
  });

  it.each([
    ['blocked', false],
    ['blocked then unblocked', true],
  ] as const)(
    'does not attach a pending secure upload after communication becomes %s',
    async (_case, restoreCommunication) => {
      state.messages = [];
      const unblockedContext = { ...state.trustContext };
      const blockedContext = {
        ...state.trustContext,
        blockedByMe: true,
        canCommunicate: false,
        restriction: 'blocked' as const,
      };
      let contextAttempt = 0;
      loadTrustContext.mockImplementation(async () => {
        contextAttempt += 1;
        if (contextAttempt === 1) return unblockedContext;
        if (contextAttempt === 2 || !restoreCommunication) return blockedContext;
        return unblockedContext;
      });
      pickImage.mockResolvedValue({
        canceled: false,
        assets: [
          {
            uri: 'file:///pending-upload.jpg',
            fileName: 'pending-upload.jpg',
            mimeType: 'image/jpeg',
          },
        ],
      });
      let resolveUpload:
        | ((value: {
            uploadId: string;
            status: 'clean';
            sanitized: true;
            mimeType: string;
            sizeBytes: number;
          }) => void)
        | undefined;
      uploadAttachment.mockImplementation(
        async () =>
          await new Promise((resolve) => {
            resolveUpload = resolve;
          }),
      );
      const { default: Messages } = await import('../app/messages');
      let renderer: ReturnType<typeof create> | undefined;
      await act(async () => {
        renderer = create(<Messages />);
        await Promise.resolve();
        await Promise.resolve();
      });
      if (!renderer) throw new Error('renderer missing');
      const button = (label: string) =>
        renderer.root.find((node) => node.type === 'Button' && node.props.label === label);
      const press = (label: string) =>
        renderer.root.find(
          (node) => node.type === 'Pressable' && node.props.accessibilityLabel === label,
        );

      await act(async () => {
        button('addAttachment').props.onPress();
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(uploadAttachment).toHaveBeenCalledOnce();
      await act(() => press('trustBlock').props.onPress());
      await act(async () => {
        press('trustConfirmBlock').props.onPress();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(press('trustUnblock')).toBeTruthy();
      if (restoreCommunication) {
        await act(() => press('trustUnblock').props.onPress());
        await act(async () => {
          press('trustConfirmUnblock').props.onPress();
          await new Promise((resolve) => setTimeout(resolve, 0));
        });
        expect(press('trustBlock')).toBeTruthy();
      }

      await act(async () => {
        resolveUpload?.({
          uploadId: ids.upload,
          status: 'clean',
          sanitized: true,
          mimeType: 'image/jpeg',
          sizeBytes: 3,
        });
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(button('addAttachment')).toBeTruthy();
      expect(JSON.stringify(renderer.toJSON())).not.toContain('attachmentReady');
    },
  );

  it('ignores an old message query after navigation and sends only in the active conversation', async () => {
    const pending = new Map<
      string,
      (response: { data: Array<Record<string, unknown>>; error: null }) => void
    >();
    loadMessages.mockImplementation(
      async (activeConversationId) =>
        await new Promise((resolve) => pending.set(activeConversationId, resolve)),
    );
    loadTrustContext.mockImplementation(async (_client, activeConversationId: string) => ({
      ...state.trustContext,
      conversationId: activeConversationId,
      counterpartyUserId:
        activeConversationId === ids.conversation ? ids.counterparty : ids.secondCounterparty,
    }));
    const { default: Messages } = await import('../app/messages');
    let renderer: ReturnType<typeof create> | undefined;
    await act(async () => {
      renderer = create(<Messages />);
      await Promise.resolve();
    });
    if (!renderer) throw new Error('renderer missing');
    routeState.conversationId = ids.secondConversation;
    await act(async () => {
      renderer?.update(<Messages />);
      await Promise.resolve();
    });
    await act(async () => {
      pending.get(ids.secondConversation)?.({
        data: [
          {
            id: ids.secondMessage,
            body: 'New conversation message',
            sender_id: ids.secondCounterparty,
            created_at: '2026-08-20T12:03:00.000Z',
            message_attachments: [],
          },
        ],
        error: null,
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      pending.get(ids.conversation)?.({ data: state.messages, error: null });
      await Promise.resolve();
      await Promise.resolve();
    });

    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).toContain('New conversation message');
    expect(rendered).not.toContain('Incoming message');
    const composer = renderer.root.find(
      (node) => node.type === 'TextInput' && node.props.placeholder === 'messagePlaceholder',
    );
    await act(() => composer.props.onChangeText('new conversation draft'));
    const send = renderer.root.find(
      (node) => node.type === 'Button' && node.props.label === 'send',
    );
    await act(async () => {
      send.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(sendMessage).toHaveBeenLastCalledWith('send_message_with_attachments', {
      p_conversation_id: ids.secondConversation,
      p_body: 'new conversation draft',
      p_upload_ids: [],
      p_client_message_id: expect.any(String),
    });
  });

  it('removes protected media from the previous conversation on a same-instance route change', async () => {
    state.messages = [
      {
        id: ids.incomingMessage,
        body: 'Old media message',
        sender_id: ids.counterparty,
        created_at: '2026-08-20T12:00:00.000Z',
        message_attachments: [
          {
            id: ids.attachment,
            file_upload_id: ids.upload,
            mime_type: 'image/jpeg',
            size_bytes: 512,
          },
        ],
      },
    ];
    loadMessages.mockImplementation(async (activeConversationId) => ({
      data: activeConversationId === ids.conversation ? state.messages : [],
      error: null,
    }));
    mediaInvoke.mockResolvedValue({
      data: {
        signedUrl: 'https://example.test/old-conversation.jpg',
        deliveryMode: 'authenticated_proxy',
        expiresAt: '2099-08-20T12:05:00.000Z',
      },
      error: null,
    });
    const { default: Messages } = await import('../app/messages');
    let renderer: ReturnType<typeof create> | undefined;
    await act(async () => {
      renderer = create(<Messages />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    if (!renderer) throw new Error('renderer missing');
    expect(JSON.stringify(renderer.toJSON())).toContain(
      'https://example.test/old-conversation.jpg',
    );

    routeState.conversationId = ids.secondConversation;
    state.trustContext = {
      ...state.trustContext,
      conversationId: ids.secondConversation,
      counterpartyUserId: ids.secondCounterparty,
    };
    await act(async () => {
      renderer?.update(<Messages />);
      await Promise.resolve();
      await Promise.resolve();
    });
    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).not.toContain('Old media message');
    expect(rendered).not.toContain('https://example.test/old-conversation.jpg');
  });

  it('deduplicates in-flight access requests while multiple protected attachments settle', async () => {
    state.messages = [
      {
        id: ids.incomingMessage,
        body: 'Two protected attachments',
        sender_id: ids.counterparty,
        created_at: '2026-08-20T12:00:00.000Z',
        message_attachments: [
          {
            id: ids.attachment,
            file_upload_id: ids.upload,
            mime_type: 'image/jpeg',
            size_bytes: 512,
          },
          {
            id: ids.secondAttachment,
            file_upload_id: ids.secondUpload,
            mime_type: 'image/jpeg',
            size_bytes: 768,
          },
        ],
      },
    ];
    const pending = new Map<
      string,
      (value: {
        data: { signedUrl: string; deliveryMode: string; expiresAt: string };
        error: null;
      }) => void
    >();
    mediaInvoke.mockImplementation(
      async (_name, options: { body: { uploadId: string } }) =>
        await new Promise((resolve) => pending.set(options.body.uploadId, resolve)),
    );
    const { default: Messages } = await import('../app/messages');
    let renderer: ReturnType<typeof create> | undefined;
    await act(async () => {
      renderer = create(<Messages />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    if (!renderer) throw new Error('renderer missing');
    expect(mediaInvoke).toHaveBeenCalledTimes(2);

    await act(async () => {
      pending.get(ids.upload)?.({
        data: {
          signedUrl: 'https://example.test/first.jpg',
          deliveryMode: 'authenticated_proxy',
          expiresAt: '2099-08-20T12:05:00.000Z',
        },
        error: null,
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mediaInvoke).toHaveBeenCalledTimes(2);

    await act(async () => {
      pending.get(ids.secondUpload)?.({
        data: {
          signedUrl: 'https://example.test/second.jpg',
          deliveryMode: 'authenticated_proxy',
          expiresAt: '2099-08-20T12:05:00.000Z',
        },
        error: null,
      });
      await Promise.resolve();
    });
    expect(JSON.stringify(renderer.toJSON())).toContain('https://example.test/second.jpg');
  });

  it('reacquires protected media when its access grant expires', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-20T12:00:00.000Z'));
    state.messages = [
      {
        id: ids.incomingMessage,
        body: 'Expiring media',
        sender_id: ids.counterparty,
        created_at: '2026-08-20T12:00:00.000Z',
        message_attachments: [
          {
            id: ids.attachment,
            file_upload_id: ids.upload,
            mime_type: 'image/jpeg',
            size_bytes: 512,
          },
        ],
      },
    ];
    mediaInvoke.mockImplementation(async () => {
      const attempt = mediaInvoke.mock.calls.length;
      return {
        data: {
          signedUrl: `https://example.test/grant-${attempt}.jpg`,
          deliveryMode: 'authenticated_proxy',
          expiresAt: new Date(Date.now() + (attempt === 1 ? 1_000 : 60_000)).toISOString(),
        },
        error: null,
      };
    });
    const { default: Messages } = await import('../app/messages');
    let renderer: ReturnType<typeof create> | undefined;
    await act(async () => {
      renderer = create(<Messages />);
      await Promise.resolve();
      await Promise.resolve();
    });
    if (!renderer) throw new Error('renderer missing');
    expect(JSON.stringify(renderer.toJSON())).toContain('grant-1.jpg');

    await act(async () => {
      vi.advanceTimersByTime(1_001);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mediaInvoke).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(renderer.toJSON())).toContain('grant-2.jpg');
    await act(() => renderer?.unmount());
  });

  it('reacquires protected media after an image load error', async () => {
    state.messages = [
      {
        id: ids.incomingMessage,
        body: 'Retryable media',
        sender_id: ids.counterparty,
        created_at: '2026-08-20T12:00:00.000Z',
        message_attachments: [
          {
            id: ids.attachment,
            file_upload_id: ids.upload,
            mime_type: 'image/jpeg',
            size_bytes: 512,
          },
        ],
      },
    ];
    mediaInvoke.mockImplementation(async () => ({
      data: {
        signedUrl: `https://example.test/image-${mediaInvoke.mock.calls.length}.jpg`,
        deliveryMode: 'authenticated_proxy',
        expiresAt: '2099-08-20T12:05:00.000Z',
      },
      error: null,
    }));
    const { default: Messages } = await import('../app/messages');
    let renderer: ReturnType<typeof create> | undefined;
    await act(async () => {
      renderer = create(<Messages />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    if (!renderer) throw new Error('renderer missing');
    const image = renderer.root.findByType('Image');
    expect(image.props.onError).toBeTypeOf('function');
    await act(async () => {
      image.props.onError();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mediaInvoke).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(renderer.toJSON())).toContain('image-2.jpg');
  });

  it('never restores a pre-block media grant during an overlapping unblock refresh', async () => {
    state.messages = [
      {
        id: ids.incomingMessage,
        body: 'Media denied during request',
        sender_id: ids.counterparty,
        created_at: '2026-08-20T12:00:00.000Z',
        message_attachments: [
          {
            id: ids.attachment,
            file_upload_id: ids.upload,
            mime_type: 'image/jpeg',
            size_bytes: 512,
          },
        ],
      },
    ];
    const unblockedContext = { ...state.trustContext };
    const blockedContext = {
      ...state.trustContext,
      blockedByMe: true,
      canCommunicate: false,
      restriction: 'blocked' as const,
    };
    let contextAttempt = 0;
    let resolveUnblockContext: ((value: typeof state.trustContext) => void) | undefined;
    loadTrustContext.mockImplementation(async () => {
      contextAttempt += 1;
      if (contextAttempt === 1) return unblockedContext;
      if (contextAttempt === 2) return blockedContext;
      return await new Promise<typeof state.trustContext>((resolve) => {
        resolveUnblockContext = resolve;
      });
    });
    let resolveOldMedia:
      | ((value: {
          data: { signedUrl: string; deliveryMode: string; expiresAt: string };
          error: null;
        }) => void)
      | undefined;
    mediaInvoke.mockImplementation(async () => {
      if (mediaInvoke.mock.calls.length > 1) {
        return {
          data: {
            signedUrl: 'https://example.test/new-authorized-grant.jpg',
            deliveryMode: 'authenticated_proxy',
            expiresAt: '2099-08-20T12:05:00.000Z',
          },
          error: null,
        };
      }
      return await new Promise((resolve) => {
        resolveOldMedia = resolve;
      });
    });
    const { default: Messages } = await import('../app/messages');
    let renderer: ReturnType<typeof create> | undefined;
    await act(async () => {
      renderer = create(<Messages />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    if (!renderer) throw new Error('renderer missing');
    const press = (label: string) =>
      renderer.root.find(
        (node) => node.type === 'Pressable' && node.props.accessibilityLabel === label,
      );
    await act(() => press('trustBlock').props.onPress());
    await act(async () => press('trustConfirmBlock').props.onPress());
    expect(press('trustUnblock')).toBeTruthy();
    await act(() => press('trustUnblock').props.onPress());
    await act(async () => {
      press('trustConfirmUnblock').props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(resolveUnblockContext).toBeTypeOf('function');
    await act(async () => {
      resolveOldMedia?.({
        data: {
          signedUrl: 'https://example.test/pre-block-grant.jpg',
          deliveryMode: 'authenticated_proxy',
          expiresAt: '2099-08-20T12:05:00.000Z',
        },
        error: null,
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      resolveUnblockContext?.(unblockedContext);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).not.toContain('pre-block-grant.jpg');
    expect(rendered).toContain('new-authorized-grant.jpg');
    expect(mediaInvoke).toHaveBeenCalledTimes(2);
  });

  it('inserts rating-abuse intake for a provider only when a completed-job rating exists', async () => {
    const { default: Jobs } = await import('../app/jobs');
    let renderer: ReturnType<typeof create> | undefined;
    await act(async () => {
      renderer = create(<Jobs />);
      await Promise.resolve();
    });
    if (!renderer) throw new Error('renderer missing');
    expect(
      renderer.root.findAll(
        (node) =>
          node.type === 'Pressable' && node.props.accessibilityLabel === 'trustReportRating',
      ),
    ).toHaveLength(1);
    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).toContain('trustRatingScore');
    expect(rendered).not.toContain(ids.rating);

    const press = (label: string) =>
      renderer.root.find(
        (node) => node.type === 'Pressable' && node.props.accessibilityLabel === label,
      );
    await act(() => press('trustReportRating').props.onPress());
    await act(() => press('trustReasonRatingAbuse').props.onPress());
    await act(async () => press('trustSubmitReport').props.onPress());
    expect(submitReport).toHaveBeenCalledWith(expect.anything(), {
      targetType: 'rating',
      targetId: ids.rating,
      reasonCategory: 'rating_abuse',
      explanation: '',
    });
  });
});
