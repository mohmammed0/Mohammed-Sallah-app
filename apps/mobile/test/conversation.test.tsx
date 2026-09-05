import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import {
  appendConversationTurn,
  canPublishRequest,
  categorySelectionSource,
  conversationOriginalText,
  markConversationMessageRetryable,
  updateConversationTranscript,
  upsertPendingCustomerMessage,
  type ConversationMessage,
} from '../src/features/request/conversation-state';

vi.mock('react-native', () => ({
  StyleSheet: { create: (styles: unknown) => styles },
  Text: 'Text',
  View: 'View',
}));
vi.mock('../src/design-system/icon', () => ({ AppIcon: 'AppIcon' }));
vi.mock('../src/design-system/customer-components', () => ({
  ChatBubble: 'ChatBubble',
}));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

describe('multi-turn request conversation', () => {
  it('renders customer answers and assistant follow-ups in order', async () => {
    const { ConversationTimeline } = await import('../src/features/request/conversation-timeline');
    const messages: ConversationMessage[] = [
      { role: 'user', text: 'The kitchen sink is leaking.' },
      { role: 'assistant', text: 'When did it start?' },
      { role: 'user', text: 'Last night.' },
    ];
    let renderer: ReturnType<typeof create> | undefined;
    await act(() => {
      renderer = create(
        <ConversationTimeline
          assistantLabel="Assistant"
          messages={messages}
          offlineLabel="Offline"
          onRetry={() => undefined}
          pendingLabel="Sending"
          retryLabel="Retry"
          userLabel="You"
        />,
      );
    });
    const bubbles = renderer?.root.findAllByType('ChatBubble') ?? [];
    expect(bubbles.map((node) => [node.props.label, node.props.message])).toEqual([
      ['You', 'The kitchen sink is leaking.'],
      ['Assistant', 'When did it start?'],
      ['You', 'Last night.'],
    ]);
  });

  it('preserves long histories without a synthetic turn cap', () => {
    let history: ConversationMessage[] = [];
    for (let turn = 1; turn <= 75; turn += 1) {
      history = appendConversationTurn(history, `answer-${turn}`, `question-${turn + 1}`);
    }
    expect(history).toHaveLength(150);
    expect(conversationOriginalText(history)).toContain('answer-1');
    expect(conversationOriginalText(history)).toContain('answer-75');
  });

  it('binds pending, offline, and retry state to the exact client message', () => {
    const first = upsertPendingCustomerMessage([], {
      clientMessageId: 'client-message-0001',
      text: 'First answer',
      offline: true,
      mediaUploadIds: [],
      inputKind: 'text',
    });
    const second = upsertPendingCustomerMessage(first, {
      clientMessageId: 'client-message-0002',
      text: 'Second answer',
      offline: false,
      mediaUploadIds: [],
      inputKind: 'text',
    });
    const retryable = markConversationMessageRetryable(second, 'client-message-0002');
    expect(retryable[0]?.delivery).toBe('offline');
    expect(retryable[1]?.delivery).toBe('retryable');
  });

  it('updates only the matching voice message while transcript review is edited and confirmed', () => {
    const history: ConversationMessage[] = [
      {
        role: 'user',
        text: 'Voice recording',
        clientMessageId: 'client-message-voice-0001',
        inputKind: 'voice',
        delivery: 'pending',
        transcriptStatus: 'pending',
      },
      { role: 'assistant', text: 'Previous reply', clientMessageId: 'client-message-old-0001' },
    ];

    const reviewing = updateConversationTranscript(
      history,
      'client-message-voice-0001',
      'The tap leaks slowly.',
      'review',
    );
    expect(reviewing[0]).toMatchObject({
      text: 'The tap leaks slowly.',
      delivery: 'pending',
      transcriptStatus: 'review',
    });
    expect(reviewing[1]).toEqual(history[1]);

    const confirmed = updateConversationTranscript(
      reviewing,
      'client-message-voice-0001',
      'The kitchen tap leaks slowly.',
      'completed',
    );
    expect(confirmed[0]).toMatchObject({
      text: 'The kitchen tap leaks slowly.',
      transcriptStatus: 'completed',
    });
  });

  it('requires explicit approval even for an editable fallback summary', () => {
    const fallbackDraft = {
      title: 'Plumbing request',
      summary: 'Best-effort summary preserved after provider failure.',
      categorySlug: 'plumbing',
      categoryConfirmedByUser: false,
      cityCode: 'riyadh',
      coordinates: { latitude: 24.7136, longitude: 46.6753 },
      approved: false,
    };
    expect(canPublishRequest(fallbackDraft)).toBe(false);
    expect(canPublishRequest({ ...fallbackDraft, approved: true })).toBe(false);
    expect(
      canPublishRequest({
        ...fallbackDraft,
        approved: true,
        categoryConfirmedByUser: true,
      }),
    ).toBe(true);
  });

  it('attributes category choices only to an authoritative AI suggestion', () => {
    expect(categorySelectionSource('plumbing', null)).toBe('manual');
    expect(categorySelectionSource('plumbing', 'plumbing')).toBe('ai_suggestion');
    expect(categorySelectionSource('electrical', 'plumbing')).toBe('customer_correction');
    expect(categorySelectionSource('general-handyman', null)).toBe('manual');
  });
});
