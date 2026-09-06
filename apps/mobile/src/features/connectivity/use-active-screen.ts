import { useCallback, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';

/** A mounted screen may still be behind another route or an inactive app. */
export function useActiveScreen(): boolean {
  const [focused, setFocused] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [windowFocused, setWindowFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setForeground(state === 'active');
    });
    const blur =
      Platform.OS === 'android'
        ? AppState.addEventListener('blur', () => setWindowFocused(false))
        : undefined;
    const focus =
      Platform.OS === 'android'
        ? AppState.addEventListener('focus', () => setWindowFocused(true))
        : undefined;
    setForeground(AppState.currentState === 'active');
    return () => {
      subscription.remove();
      blur?.remove();
      focus?.remove();
    };
  }, []);
  return focused && foreground && windowFocused;
}
