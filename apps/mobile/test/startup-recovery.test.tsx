import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  Pressable: 'Pressable',
  StyleSheet: { create: (styles: Record<string, unknown>) => styles },
  Text: 'Text',
  View: 'View',
}));

vi.mock('../src/components/ui', () => ({
  Button: 'Button',
  Card: 'Card',
  Screen: 'Screen',
  styles: { error: {}, lead: {}, title: {} },
}));

vi.mock('../src/providers/locale-provider', () => ({
  useLocale: () => ({
    t: (key: string, variables?: Readonly<Record<string, string | number>>) =>
      variables?.category ? `${key}:${variables.category}` : key,
  }),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

describe('startup recovery screen', () => {
  it('announces a privacy-safe category and exposes Retry and local-clear actions', async () => {
    const onRetry = vi.fn();
    const onClearLocalSession = vi.fn();
    const { StartupRecoveryScreen } = await import('../src/features/auth/startup-recovery-screen');

    let renderer: ReturnType<typeof create> | undefined;
    await act(() => {
      renderer = create(
        <StartupRecoveryScreen
          category="startup_timeout"
          onClearLocalSession={onClearLocalSession}
          onRetry={onRetry}
        />,
      );
    });

    const liveRegions = renderer?.root.findAll(
      (node) => node.props.accessibilityLiveRegion === 'assertive',
    );
    expect(liveRegions).toHaveLength(1);

    const buttons = renderer?.root.findAllByType('Button') ?? [];
    expect(buttons).toHaveLength(2);
    expect(buttons[0]?.props.accessibilityLabel).toBe('startupRetryAccessibility');
    expect(buttons[1]?.props.accessibilityLabel).toBe('clearLocalSessionAccessibility');

    await act(() => {
      buttons[0]?.props.onPress();
      buttons[1]?.props.onPress();
    });
    expect(onRetry).toHaveBeenCalledOnce();
    expect(onClearLocalSession).toHaveBeenCalledOnce();

    const text = renderer?.root.findAllByType('Text').map((node) => node.children.join(' '));
    expect(text).toContain('startupErrorCategory:startupErrorTimeout');
    expect(text?.join(' ')).not.toContain('access_token');
  });
});
