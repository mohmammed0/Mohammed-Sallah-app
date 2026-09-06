import type { ReactNode } from 'react';
import { LocaleDirContext } from 'expo-router/react-navigation';
import { useLocale } from './locale-provider';

export function NavigationDirectionProvider({ children }: { children: ReactNode }) {
  const { dir } = useLocale();
  return <LocaleDirContext.Provider value={dir}>{children}</LocaleDirContext.Provider>;
}
