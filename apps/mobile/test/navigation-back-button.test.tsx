import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { translate, type SupportedLocale } from '@sallah/i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ locale: 'ar' as SupportedLocale, back: vi.fn() }));
vi.mock('expo-router', () => ({ router: { back: state.back } }));
vi.mock('react-native', () => ({ StyleSheet: { create: (value: unknown) => value } }));
vi.mock('../src/providers/locale-provider', () => ({
  useLocale: () => ({ locale: state.locale, t: (key: 'back') => translate(state.locale, key) }),
}));
vi.mock('../src/design-system/icon', () => ({ AppIcon: 'AppIcon' }));
vi.mock('../src/design-system/primitives', () => ({
  InteractivePressable: 'InteractivePressable',
}));

import { NavigationBackButton } from '../src/design-system/navigation-back-button';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

describe('localized navigation back control', () => {
  let renderer: ReactTestRenderer | undefined;
  afterEach(async () => {
    await act(() => renderer?.unmount());
    renderer = undefined;
    state.back.mockClear();
  });

  it.each([
    ['ar', 'chevron-forward'],
    ['en', 'chevron-back'],
    ['ur', 'chevron-forward'],
    ['hi', 'chevron-back'],
  ] as const)(
    'provides the %s back label and direction with a working action',
    async (locale, icon) => {
      state.locale = locale;
      await act(() => {
        renderer = create(<NavigationBackButton canGoBack />);
      });
      const button = renderer!.root.findByProps({ testID: 'navigation-back' });
      expect(button.props.accessibilityLabel).toBe(translate(locale, 'back'));
      expect(button.props.accessibilityRole).toBe('button');
      expect(renderer!.root.findByType('AppIcon' as never).props.name).toBe(icon);
      await act(() => button.props.onPress());
      expect(state.back).toHaveBeenCalledOnce();
    },
  );

  it('does not expose a back action without a previous route', async () => {
    await act(() => {
      renderer = create(<NavigationBackButton canGoBack={false} />);
    });
    expect(renderer!.toJSON()).toBeNull();
    expect(state.back).not.toHaveBeenCalled();
  });
});
