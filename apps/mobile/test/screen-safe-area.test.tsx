import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  locale: 'ar',
  insets: { top: 28, bottom: 24, left: 0, right: 0 },
  fontScale: 1,
}));
vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  Platform: { OS: 'android' },
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  StyleSheet: { create: (value: unknown) => value },
  Text: 'Text',
  TextInput: 'TextInput',
  View: 'View',
  useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: state.fontScale }),
}));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => state.insets,
}));
vi.mock('expo-router/react-navigation', async () => ({
  HeaderShownContext: (await import('react')).createContext(false),
}));
vi.mock('expo-router', async () => {
  const { createElement } = await import('react');
  return {
    Tabs: Object.assign((props: Record<string, unknown>) => createElement('Tabs', props), {
      Screen: (props: Record<string, unknown>) => createElement('TabsScreen', props),
    }),
  };
});
vi.mock('@/design-system/tokens', async () => import('../src/design-system/tokens'));
vi.mock(
  '@/design-system/tab-bar-metrics',
  async () => import('../src/design-system/tab-bar-metrics'),
);
vi.mock('../src/design-system/icon', () => ({ AppIcon: 'AppIcon' }));
vi.mock('@/design-system/icon', () => ({ AppIcon: 'AppIcon' }));
vi.mock('../src/providers/locale-provider', () => ({
  useLocale: () => ({
    locale: state.locale,
    dir: ['ar', 'ur'].includes(state.locale) ? 'rtl' : 'ltr',
    t: (key: string) => key,
  }),
}));
vi.mock('@/providers/locale-provider', () => ({
  useLocale: () => ({
    locale: state.locale,
    dir: ['ar', 'ur'].includes(state.locale) ? 'rtl' : 'ltr',
    t: (key: string) => key,
  }),
}));

import { HeaderShownContext } from 'expo-router/react-navigation';
import { CustomerScreen } from '../src/design-system/primitives';
import CustomerTabs from '../app/(customer)/_layout';
import ProviderTabs from '../app/(provider)/_layout';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

describe('screen safe areas and tab system-bar clearance', () => {
  let renderer: ReactTestRenderer | undefined;
  beforeEach(() => {
    state.locale = 'ar';
    state.insets = { top: 28, bottom: 24, left: 0, right: 0 };
    state.fontScale = 1;
  });
  afterEach(async () => {
    await act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('adds the top safe edge on a headerless tab or request route, but removes it below a shown header without remounting content', async () => {
    let mounts = 0;
    function Content() {
      useEffect(() => {
        mounts += 1;
      }, []);
      return null;
    }
    const screen = (headerShown: boolean) => (
      <HeaderShownContext.Provider value={headerShown}>
        <CustomerScreen>
          <Content />
        </CustomerScreen>
      </HeaderShownContext.Provider>
    );
    await act(() => {
      renderer = create(screen(false));
    });
    expect(renderer!.root.findByType('SafeAreaView').props.edges).toContain('top');
    await act(() => {
      renderer!.update(screen(true));
    });
    expect(renderer!.root.findByType('SafeAreaView').props.edges).not.toContain('top');
    expect(renderer!.root.findByType('SafeAreaView').props.edges).toEqual([
      'left',
      'right',
      'bottom',
    ]);
    await act(() => {
      renderer!.update(screen(false));
    });
    expect(renderer!.root.findByType('SafeAreaView').props.edges).toContain('top');
    expect(mounts).toBe(1);
  });

  it('protects a screen without a navigation header context', async () => {
    await act(() => {
      renderer = create(<CustomerScreen scroll={false}>Standalone</CustomerScreen>);
    });
    expect(renderer!.root.findByType('SafeAreaView').props.edges).toContain('top');
  });

  for (const [name, Component] of [
    ['customer', CustomerTabs],
    ['provider', ProviderTabs],
  ] as const) {
    it(`keeps ${name} tab content above changing gesture/button insets and grows for larger text`, async () => {
      const options = () => renderer!.root.findByType('Tabs').props.screenOptions;
      for (const locale of ['ar', 'en', 'ur', 'hi']) {
        state.locale = locale;
        state.insets.bottom = 0;
        state.fontScale = 1;
        await act(() => {
          if (renderer) renderer.update(<Component />);
          else renderer = create(<Component />);
        });
        const baseline = options().tabBarStyle.height;
        for (const bottom of [16, 34, 48]) {
          state.insets.bottom = bottom;
          await act(() => {
            renderer!.update(<Component />);
          });
          expect(options().tabBarStyle.height - bottom).toBe(baseline);
          expect(options().tabBarStyle.paddingBottom).toBe(bottom);
          expect(options().tabBarStyle.direction).toBe(
            ['ar', 'ur'].includes(locale) ? 'rtl' : 'ltr',
          );
        }
        state.fontScale = 2;
        await act(() => {
          renderer!.update(<Component />);
        });
        expect(options().tabBarStyle.height - state.insets.bottom).toBeGreaterThan(baseline);
        expect(options().tabBarLabelStyle.fontSize).toBe(12);
        expect(options().tabBarAllowFontScaling).not.toBe(false);
      }
    });
  }
});
