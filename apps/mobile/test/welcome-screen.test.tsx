import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { direction, localeNativeNames, supportedLocales, translate } from '@sallah/i18n';

const localeState = vi.hoisted(() => ({
  locale: 'ar' as 'ar' | 'en' | 'ur' | 'hi',
  setLocale: vi.fn(),
}));
vi.mock('react-native', () => ({
  StyleSheet: { create: (styles: Record<string, unknown>) => styles },
  SafeAreaView: 'SafeAreaView',
  ScrollView: 'ScrollView',
  Text: 'Text',
  View: 'View',
  Pressable: 'Pressable',
}));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
vi.mock('expo-router', () => ({ Link: 'Link' }));
vi.mock('@/components/ui', async () => import('../src/components/ui'));
vi.mock('@/design-system/tokens', async () => import('../src/design-system/tokens'));
vi.mock('@/design-system/rtl', async () => import('../src/design-system/rtl'));
vi.mock('@/design-system/icon', () => ({ AppIcon: 'AppIcon' }));
vi.mock('@/providers/locale-provider', () => ({
  useLocale: () => ({
    locale: localeState.locale,
    dir: direction(localeState.locale),
    setLocale: localeState.setLocale,
    t: (key: Parameters<typeof translate>[1]) => translate(localeState.locale, key),
  }),
}));

import Welcome from '../app/index';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
let renderer: ReactTestRenderer;
afterEach(async () => {
  if (renderer) await act(() => renderer.unmount());
  localeState.setLocale.mockReset();
});

async function renderWelcome(locale: typeof localeState.locale) {
  localeState.locale = locale;
  await act(() => {
    renderer = create(<Welcome />);
  });
}
function flatten(style: unknown): Record<string, unknown> {
  return Object.assign(
    {},
    ...(Array.isArray(style) ? style.flat(Infinity) : [style]).filter(Boolean),
  );
}

describe('welcome language and navigation access', () => {
  it.each(['ur', 'hi'] as const)(
    'renders %s welcome text without the English fallback',
    async (locale) => {
      await renderWelcome(locale);
      const texts = renderer.root.findAllByType('Text').map((node) => node.props.children);
      for (const key of ['welcomeBadge', 'welcomeLead'] as const) {
        const localized = translate(locale, key);
        expect(localized).not.toBe(translate('en', key));
        expect(localized).toMatch(locale === 'ur' ? /[\u0600-\u06ff]/u : /[\u0900-\u097f]/u);
        expect(texts).toContain(localized);
        expect(texts).not.toContain(translate('en', key));
      }
    },
  );

  it.each(supportedLocales)(
    'renders %s direction and names every language in its own script',
    async (locale) => {
      await renderWelcome(locale);
      expect(
        flatten(renderer.root.findByProps({ testID: 'welcome-content' }).props.style).direction,
      ).toBe(direction(locale));
      for (const option of supportedLocales) {
        const button = renderer.root.findByProps({
          accessibilityRole: 'button',
          accessibilityLabel: localeNativeNames[option],
        });
        expect(button.props.accessibilityState.selected).toBe(option === locale);
        expect(button.findByType('Text').props.children).toBe(localeNativeNames[option]);
      }
    },
  );

  it('switches language through a real option callback and updates selected and RTL state', async () => {
    await renderWelcome('en');
    await act(() =>
      renderer.root.findByProps({ accessibilityLabel: localeNativeNames.ur }).props.onPress(),
    );
    expect(localeState.setLocale).toHaveBeenCalledWith('ur');
    localeState.locale = 'ur';
    await act(() => renderer.update(<Welcome />));
    expect(
      renderer.root.findByProps({ accessibilityLabel: localeNativeNames.ur }).props
        .accessibilityState.selected,
    ).toBe(true);
    expect(
      flatten(renderer.root.findByProps({ testID: 'welcome-content' }).props.style).direction,
    ).toBe('rtl');
  });

  it.each(supportedLocales)(
    'keeps both real routes inside scrollable content with a localized %s sign-in label',
    async (locale) => {
      await renderWelcome(locale);
      const scroll = renderer.root.findByType('ScrollView');
      expect(scroll.findAllByType('Link').map((link) => link.props.href)).toEqual([
        '/home',
        '/auth',
      ]);
      expect(scroll.findByProps({ href: '/auth' }).findByType('Text').props.children).toBe(
        translate(locale, 'signIn'),
      );
      expect(flatten(scroll.props.contentContainerStyle).flexGrow).toBe(1);
    },
  );
});
