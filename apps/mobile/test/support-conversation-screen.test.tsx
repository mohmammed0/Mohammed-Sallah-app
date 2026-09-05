import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  status: 'open',
  messagesError: false,
  messagesPending: false,
  messageRefetch: vi.fn(async () => undefined),
}));

vi.mock('react-native', () => ({
  ScrollView: 'ScrollView',
  Text: 'Text',
  TextInput: 'TextInput',
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly string[] }) =>
    queryKey[0] === 'support-cases'
      ? {
          data: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              subject: 'Support case',
              status: state.status,
              created_at: '2026-08-25T12:00:00.000Z',
            },
          ],
          isPending: false,
          isError: false,
          refetch: vi.fn(async () => undefined),
        }
      : {
          data: [],
          isPending: state.messagesPending,
          isError: state.messagesError,
          refetch: state.messageRefetch,
        },
  useMutation: (options: { onError?: (error: Error) => void }) => ({
    isPending: false,
    mutate: () => options.onError?.(new Error('SUPPORT_MESSAGE_UNAVAILABLE')),
  }),
}));
vi.mock('react-hook-form', () => ({
  Controller: ({ render }: { render: (input: { field: Record<string, unknown> }) => unknown }) =>
    render({ field: { value: '', onBlur: vi.fn(), onChange: vi.fn() } }),
  useForm: () => ({
    control: {},
    handleSubmit: (callback: (value: unknown) => unknown) => () => callback({}),
    reset: vi.fn(),
    setError: vi.fn(),
    formState: { errors: {} },
  }),
}));
vi.mock('@/components/ui', () => ({
  Button: 'Button',
  Card: 'Card',
  LoadingSkeleton: 'LoadingSkeleton',
  Screen: 'Screen',
  styles: { badge: {}, error: {}, input: {}, lead: {}, title: {} },
}));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/providers/locale-provider', () => ({
  useLocale: () => ({ locale: 'ar', t: (key: string) => key }),
}));
vi.mock('@/lib/mutation-journal', () => ({ executeJournaledMutation: vi.fn() }));
vi.mock('@/features/support/open-support-case', () => ({
  openSupportCaseCommand: vi.fn(),
  supportCaseInputSchema: { parse: (value: unknown) => value },
}));
vi.mock('@/features/support/support-conversation', async () => {
  const { z } = await import('zod');
  return {
    canReplyToSupportCase: (status: string) => status !== 'resolved' && status !== 'closed',
    parseSupportMessages: (value: unknown) => value,
    sendSupportCaseMessageCommand: vi.fn(),
    supportCaseStatusSchema: z.enum([
      'open',
      'waiting_customer',
      'waiting_provider',
      'waiting_operations',
      'resolved',
      'closed',
    ]),
  };
});

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

async function openConversation() {
  const { default: Support } = await import('../app/support');
  let renderer: ReturnType<typeof create> | undefined;
  await act(async () => {
    renderer = create(<Support />);
  });
  const open = renderer?.root.find(
    (node) => node.type === 'Button' && node.props.label === 'messages',
  );
  await act(async () => {
    open?.props.onPress();
  });
  return renderer!;
}

describe('support conversation screen', () => {
  beforeEach(() => {
    state.status = 'open';
    state.messagesError = false;
    state.messagesPending = false;
    state.messageRefetch.mockClear();
  });

  it('does not render a reply control for a resolved or closed case', async () => {
    state.status = 'closed';
    const renderer = await openConversation();

    expect(
      renderer.root.findAll(
        (node) => node.type === 'TextInput' && node.props.placeholder === 'messagePlaceholder',
      ),
    ).toHaveLength(0);
    expect(
      renderer.root.findAll((node) => node.type === 'Button' && node.props.label === 'send'),
    ).toHaveLength(0);
  });

  it('shows a safe retry path when the bounded conversation cannot load', async () => {
    state.messagesError = true;
    const renderer = await openConversation();
    expect(renderer.root.findAllByProps({ accessibilityRole: 'alert' })[0]?.children).toContain(
      'messagesLoadFailed',
    );

    const retry = renderer.root.find(
      (node) => node.type === 'Button' && node.props.label === 'retry',
    );
    await act(async () => retry.props.onPress());
    expect(state.messageRefetch).toHaveBeenCalledOnce();
  });

  it('uses the support-specific localized error without exposing a raw failure', async () => {
    const renderer = await openConversation();
    const reply = renderer.root.find(
      (node) => node.type === 'TextInput' && node.props.placeholder === 'messagePlaceholder',
    );
    await act(async () => reply.props.onChangeText('New reply'));
    const send = renderer.root.find(
      (node) => node.type === 'Button' && node.props.label === 'send',
    );
    await act(async () => send.props.onPress());

    const alerts = renderer.root
      .findAllByProps({ accessibilityRole: 'alert' })
      .flatMap((node) => node.children);
    expect(alerts).toContain('supportReplyFailed');
    expect(alerts.join(' ')).not.toContain('SUPPORT_MESSAGE_UNAVAILABLE');
  });
});
