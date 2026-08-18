import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { I18nManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  direction,
  supportedLocales,
  translate,
  type SupportedLocale,
  type TranslationKey,
} from '@sallah/i18n';
interface LocaleContextValue {
  locale: SupportedLocale;
  dir: 'rtl' | 'ltr';
  setLocale: (locale: SupportedLocale) => void;
  t: (key: TranslationKey) => string;
}
const storageKey = 'sallah.locale.v1';
const LocaleContext = createContext<LocaleContextValue | null>(null);
export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<SupportedLocale>('ar');
  useEffect(() => {
    void AsyncStorage.getItem(storageKey).then((stored) => {
      if (supportedLocales.includes(stored as SupportedLocale)) {
        setLocaleState(stored as SupportedLocale);
        I18nManager.allowRTL(direction(stored as SupportedLocale) === 'rtl');
      }
    });
  }, []);
  const value = useMemo(
    () => ({
      locale,
      dir: direction(locale),
      setLocale: (next: SupportedLocale) => {
        setLocaleState(next);
        I18nManager.allowRTL(direction(next) === 'rtl');
        void AsyncStorage.setItem(storageKey, next);
      },
      t: (key: TranslationKey) => translate(locale, key),
    }),
    [locale],
  );
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
export function useLocale() {
  const value = useContext(LocaleContext);
  if (!value) throw new Error('LocaleProvider missing');
  return value;
}
