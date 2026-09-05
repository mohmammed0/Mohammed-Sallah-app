import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { TrustClientError } from '../src/features/trust/trust-client';

const localeState = vi.hoisted(() => ({ locale: 'ar' as 'ar' | 'en' }));
const setAccessibilityFocus = vi.hoisted(() => vi.fn());
const findNodeHandle = vi.hoisted(() => vi.fn(() => 73));

vi.mock('../src/lib/secure-storage', () => ({
  chunkedSecureStorage: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  },
}));
vi.mock('react-native', () => ({
  AccessibilityInfo: { setAccessibilityFocus },
  ActivityIndicator: 'ActivityIndicator',
  findNodeHandle,
  Modal: 'Modal',
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  StyleSheet: { create: (styles: Record<string, unknown>) => styles },
  Text: 'Text',
  TextInput: 'TextInput',
  View: 'View',
}));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 34, left: 0, right: 0, top: 20 }),
}));
vi.mock('../src/providers/locale-provider', () => ({
  useLocale: () => ({
    locale: localeState.locale,
    t: (key: string, variables?: Readonly<Record<string, string | number>>) =>
      variables
        ? Object.entries(variables).reduce(
            (value, [name, replacement]) => value.replace(`{{${name}}}`, String(replacement)),
            key,
          )
        : key,
  }),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const messageId = '11111111-1111-4111-8111-111111111111';
const targetUserId = '22222222-2222-4222-8222-222222222222';
const conversationId = '33333333-3333-4333-8333-333333333333';

function pressable(
  renderer: ReturnType<typeof create>,
  accessibilityLabel: string,
): ReturnType<typeof renderer.root.findByType> {
  return renderer.root.find(
    (node) => node.type === 'Pressable' && node.props.accessibilityLabel === accessibilityLabel,
  );
}

describe('marketplace trust controls', () => {
  it('uses logical direction and submits a selected bounded reason through accessible controls', async () => {
    const onSubmitReport = vi.fn(async () => undefined);
    const { TrustControls } = await import('../src/features/trust/trust-controls');
    let renderer: ReturnType<typeof create> | undefined;
    await act(() => {
      renderer = create(
        <TrustControls
          blockTargetUserId={targetUserId}
          blockedByMe={false}
          onSetBlocked={async () => undefined}
          onSubmitReport={onSubmitReport}
          target={{ targetType: 'message', targetId: messageId }}
        />,
      );
    });
    if (!renderer) throw new Error('renderer missing');
    expect(
      renderer.root
        .findAllByType('View')
        .some((node) => JSON.stringify(node.props.style).includes('"direction":"rtl"')),
    ).toBe(true);

    await act(() => pressable(renderer, 'trustReportMessage').props.onPress());
    const reasons = renderer.root.findAll(
      (node) => node.type === 'Pressable' && node.props.accessibilityRole === 'radio',
    );
    expect(reasons).toHaveLength(7);
    expect(
      renderer.root
        .findAll((node) => node.type === 'Pressable' && node.props.accessibilityRole === 'button')
        .every((node) => JSON.stringify(node.props.style).includes('minHeight')),
    ).toBe(true);

    await act(() => pressable(renderer, 'trustReasonHarassment').props.onPress());
    const explanation = renderer.root.findByType('TextInput');
    await act(() => explanation.props.onChangeText('  Useful context  '));
    await act(async () => pressable(renderer, 'trustSubmitReport').props.onPress());

    expect(onSubmitReport).toHaveBeenCalledWith({
      targetType: 'message',
      targetId: messageId,
      reasonCategory: 'harassment',
      explanation: '  Useful context  ',
    });
    const liveText = renderer.root
      .findAll((node) => node.props.accessibilityLiveRegion === 'polite')
      .flatMap((node) => node.findAllByType('Text'))
      .flatMap((node) => node.children)
      .join(' ');
    expect(liveText).toContain('trustReportSuccess');

    localeState.locale = 'en';
    await act(() => {
      renderer?.update(
        <TrustControls
          blockTargetUserId={targetUserId}
          blockedByMe={false}
          onSetBlocked={async () => undefined}
          onSubmitReport={onSubmitReport}
          target={{ targetType: 'message', targetId: messageId }}
        />,
      );
    });
    expect(
      renderer.root
        .findAllByType('View')
        .some((node) => JSON.stringify(node.props.style).includes('"direction":"ltr"')),
    ).toBe(true);
  });

  it('disables actions while pending and retries the exact failed report intent safely', async () => {
    let resolveFirst: (() => void) | undefined;
    let attempt = 0;
    const onSubmitReport = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) {
        await new Promise<void>((resolve) => {
          resolveFirst = resolve;
        });
        throw new TrustClientError('network');
      }
    });
    const { TrustControls } = await import('../src/features/trust/trust-controls');
    let renderer: ReturnType<typeof create> | undefined;
    await act(() => {
      renderer = create(
        <TrustControls
          onSubmitReport={onSubmitReport}
          target={{ targetType: 'message', targetId: messageId }}
        />,
      );
    });
    if (!renderer) throw new Error('renderer missing');
    await act(() => pressable(renderer, 'trustReportMessage').props.onPress());
    await act(() => pressable(renderer, 'trustReasonSafety').props.onPress());
    await act(() => {
      pressable(renderer, 'trustSubmitReport').props.onPress();
    });
    expect(pressable(renderer, 'trustSubmitReport').props.disabled).toBe(true);

    await act(async () => resolveFirst?.());
    const liveText = renderer.root
      .findAll((node) => node.props.accessibilityLiveRegion === 'polite')
      .flatMap((node) => node.findAllByType('Text'))
      .flatMap((node) => node.children)
      .join(' ');
    expect(liveText).toContain('trustErrorNetwork');
    const activeModal = renderer.root.findByType('Modal');
    expect(
      activeModal.findAll(
        (node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'retry',
      ),
    ).toHaveLength(1);

    await act(async () => pressable(renderer, 'retry').props.onPress());
    expect(onSubmitReport).toHaveBeenCalledTimes(2);
    expect(onSubmitReport.mock.calls[1]?.[0]).toEqual(onSubmitReport.mock.calls[0]?.[0]);
  });

  it('requires confirmation and sends explicit block then unblock states', async () => {
    const onSetBlocked = vi.fn(async () => undefined);
    const { TrustControls } = await import('../src/features/trust/trust-controls');
    let renderer: ReturnType<typeof create> | undefined;
    await act(() => {
      renderer = create(
        <TrustControls
          blockTargetUserId={targetUserId}
          blockedByMe={false}
          onSetBlocked={onSetBlocked}
          onSubmitReport={async () => undefined}
          target={{
            targetType: 'user',
            targetId: targetUserId,
            contextConversationId: conversationId,
          }}
        />,
      );
    });
    if (!renderer) throw new Error('renderer missing');
    await act(() => pressable(renderer, 'trustBlock').props.onPress());
    expect(onSetBlocked).not.toHaveBeenCalled();
    await act(async () => pressable(renderer, 'trustConfirmBlock').props.onPress());
    expect(onSetBlocked).toHaveBeenLastCalledWith(true);

    await act(() => {
      renderer?.update(
        <TrustControls
          blockTargetUserId={targetUserId}
          blockedByMe
          onSetBlocked={onSetBlocked}
          onSubmitReport={async () => undefined}
          target={{
            targetType: 'user',
            targetId: targetUserId,
            contextConversationId: conversationId,
          }}
        />,
      );
    });
    await act(() => pressable(renderer, 'trustUnblock').props.onPress());
    await act(async () => pressable(renderer, 'trustConfirmUnblock').props.onPress());
    expect(onSetBlocked).toHaveBeenLastCalledWith(false);
  });

  it('routes a counterparty user report separately from a message report', async () => {
    const onSubmitReport = vi.fn(async () => undefined);
    const { TrustControls } = await import('../src/features/trust/trust-controls');
    let renderer: ReturnType<typeof create> | undefined;
    await act(() => {
      renderer = create(
        <TrustControls
          blockTargetUserId={targetUserId}
          onSetBlocked={async () => undefined}
          onSubmitReport={onSubmitReport}
          target={{ targetType: 'message', targetId: messageId }}
          userReportTarget={{
            targetType: 'user',
            targetId: targetUserId,
            contextConversationId: conversationId,
          }}
        />,
      );
    });
    if (!renderer) throw new Error('renderer missing');
    await act(() => pressable(renderer, 'trustReportUser').props.onPress());
    await act(() => pressable(renderer, 'trustReasonSpam').props.onPress());
    await act(async () => pressable(renderer, 'trustSubmitReport').props.onPress());
    expect(onSubmitReport).toHaveBeenCalledWith({
      targetType: 'user',
      targetId: targetUserId,
      contextConversationId: conversationId,
      reasonCategory: 'spam',
      explanation: '',
    });
  });

  it('keeps a successful report successful when the follow-up screen refresh fails', async () => {
    const onSubmitReport = vi.fn(async () => undefined);
    const { TrustControls } = await import('../src/features/trust/trust-controls');
    let renderer: ReturnType<typeof create> | undefined;
    await act(() => {
      renderer = create(
        <TrustControls
          onCompleted={async () => {
            throw new Error('refresh transport failed');
          }}
          onSubmitReport={onSubmitReport}
          target={{ targetType: 'rating', targetId: messageId }}
        />,
      );
    });
    if (!renderer) throw new Error('renderer missing');
    await act(() => pressable(renderer, 'trustReportRating').props.onPress());
    await act(() => pressable(renderer, 'trustReasonRatingAbuse').props.onPress());
    await act(async () => pressable(renderer, 'trustSubmitReport').props.onPress());
    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).toContain('trustReportSuccess');
    expect(rendered).not.toContain('trustErrorUnknown');
    expect(
      renderer.root.findAll(
        (node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'retry',
      ),
    ).toHaveLength(0);
    expect(onSubmitReport).toHaveBeenCalledOnce();
  });

  it('labels rating intake without rendering raw target identifiers or internal errors', async () => {
    const { TrustControls } = await import('../src/features/trust/trust-controls');
    let renderer: ReturnType<typeof create> | undefined;
    await act(() => {
      renderer = create(
        <TrustControls
          onSubmitReport={async () => {
            throw new Error('internal audit row 987');
          }}
          target={{ targetType: 'rating', targetId: messageId }}
        />,
      );
    });
    if (!renderer) throw new Error('renderer missing');
    expect(pressable(renderer, 'trustReportRating')).toBeTruthy();
    await act(() => pressable(renderer, 'trustReportRating').props.onPress());
    await act(() => pressable(renderer, 'trustReasonRatingAbuse').props.onPress());
    await act(async () => pressable(renderer, 'trustSubmitReport').props.onPress());
    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).not.toContain(messageId);
    expect(rendered).not.toContain('internal audit row 987');
    expect(rendered).toContain('trustErrorUnknown');
  });

  it.each([
    ['report', 'trustReportMessage'],
    ['block', 'trustBlock'],
  ] as const)(
    'keeps the %s modal safe-area aware and scrollable, focuses it, and supports escape dismissal',
    async (_mode, actionLabel) => {
      setAccessibilityFocus.mockClear();
      findNodeHandle.mockClear();
      const { TrustControls } = await import('../src/features/trust/trust-controls');
      let renderer: ReturnType<typeof create> | undefined;
      await act(() => {
        renderer = create(
          <TrustControls
            blockTargetUserId={targetUserId}
            onSetBlocked={async () => undefined}
            onSubmitReport={async () => undefined}
            target={{ targetType: 'message', targetId: messageId }}
          />,
          { createNodeMock: () => ({ native: true }) },
        );
      });
      if (!renderer) throw new Error('renderer missing');
      await act(() => pressable(renderer, actionLabel).props.onPress());

      const modal = renderer.root.findByType('Modal');
      const scroll = modal.findByType('ScrollView');
      expect(scroll.props.contentInsetAdjustmentBehavior).toBe('automatic');
      expect(JSON.stringify(scroll.props.contentContainerStyle)).toContain('"paddingBottom":34');
      await act(() => modal.props.onShow());
      expect(findNodeHandle).toHaveBeenCalled();
      expect(setAccessibilityFocus).toHaveBeenCalledWith(73);

      const modalScope = modal.find(
        (node) => node.type === 'View' && node.props.accessibilityViewIsModal === true,
      );
      await act(() => modalScope.props.onAccessibilityEscape());
      expect(renderer.root.findAllByType('Modal')).toHaveLength(0);

      await act(() => pressable(renderer, actionLabel).props.onPress());
      await act(() => renderer.root.findByType('Modal').props.onRequestClose());
      expect(renderer.root.findAllByType('Modal')).toHaveLength(0);
    },
  );
});
