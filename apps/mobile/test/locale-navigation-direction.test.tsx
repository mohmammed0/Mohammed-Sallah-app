import { useContext, useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupportedLocale } from '@sallah/i18n';

vi.mock('react-native', () => ({ I18nManager: { allowRTL: vi.fn() } }));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('expo-router/react-navigation', async () => {
  const { createContext } = await import('react');
  return { LocaleDirContext: createContext<'rtl' | 'ltr'>('ltr') };
});

import { LocaleDirContext } from 'expo-router/react-navigation';
import { LocaleProvider, useLocale } from '../src/providers/locale-provider';
import { NavigationDirectionProvider } from '../src/providers/navigation-direction-provider';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

describe('app locale and native navigation direction', () => {
  let renderer: ReactTestRenderer | undefined;
  afterEach(async () => {
    await act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('keeps native navigation in the selected direction through warm language changes', async () => {
    let selectLocale: ((locale: SupportedLocale) => void) | undefined;
    let observed = { locale: '', navigationDirection: '' };
    let mounts = 0;
    function NavigationScreen() {
      const { locale, setLocale } = useLocale();
      const navigationDirection = useContext(LocaleDirContext);
      selectLocale = setLocale;
      observed = { locale, navigationDirection };
      useEffect(() => {
        mounts += 1;
      }, []);
      return null;
    }
    await act(() => {
      renderer = create(
        <LocaleProvider>
          <NavigationDirectionProvider>
            <NavigationScreen />
          </NavigationDirectionProvider>
        </LocaleProvider>,
      );
    });
    for (const [locale, expectedDirection] of [
      ['ar', 'rtl'],
      ['en', 'ltr'],
      ['ur', 'rtl'],
      ['hi', 'ltr'],
      ['ar', 'rtl'],
    ] as const) {
      await act(() => selectLocale?.(locale));
      expect(observed).toEqual({ locale, navigationDirection: expectedDirection });
    }
    expect(mounts).toBe(1);
  });
});
