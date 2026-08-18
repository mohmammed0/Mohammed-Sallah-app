import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import {
  appendConversationTurn,
  canPublishRequest,
  categorySelectionSource,
  conversationOriginalText,
  type ConversationMessage,
} from '../src/features/request/conversation-state';

vi.mock('react-native', () => ({ Text: 'Text', View: 'View' }));
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
        <ConversationTimeline messages={messages} userLabel="You" assistantLabel="Assistant" />,
      );
    });
    const text = renderer?.root.findAllByType('Text').map((node) => node.children.join(' '));
    expect(text).toEqual([
      'You',
      'The kitchen sink is leaking.',
      'Assistant',
      'When did it start?',
      'You',
      'Last night.',
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
