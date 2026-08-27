import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type PressableProps } from 'react-native';
import { customerTokens as tokens } from '@/design-system/tokens';
import { isRtlLocale } from '@/design-system/rtl';
import { useLocale } from '@/providers/locale-provider';

export function Screen({ children }: { children: React.ReactNode }) {
  const { locale } = useLocale();
  return (
    <View style={[styles.screen, { direction: isRtlLocale(locale) ? 'rtl' : 'ltr' }]}>
      {children}
    </View>
  );
}
export function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}
export function LoadingSkeleton({ label }: { label: string }) {
  return (
    <View accessibilityLabel={label} accessibilityRole="progressbar" style={styles.skeletonCard}>
      <View style={[styles.skeletonLine, { width: '42%' }]} />
      <View style={[styles.skeletonLine, { width: '100%' }]} />
      <View style={[styles.skeletonLine, { width: '72%' }]} />
    </View>
  );
}
export function Button({
  label,
  kind = 'primary',
  style,
  disabled,
  onBlur,
  onFocus,
  ...props
}: PressableProps & { label: string; kind?: 'primary' | 'secondary' | 'danger' }) {
  const [focused, setFocused] = useState(false);
  const suppliedStyle = typeof style === 'function' ? undefined : style;
  return (
    <Pressable
      {...props}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      style={({ pressed }) => [
        styles.button,
        kind === 'secondary' && styles.secondary,
        kind === 'danger' && styles.danger,
        pressed && styles.pressed,
        focused && styles.focused,
        disabled && styles.disabled,
        suppliedStyle,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          kind === 'secondary' && styles.secondaryText,
          disabled && styles.disabledText,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
export const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: tokens.colors.canvas,
    padding: tokens.spacing.lg,
    gap: tokens.spacing.md,
  },
  card: {
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.lg,
    gap: tokens.spacing.sm,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    ...tokens.shadow.card,
  },
  button: {
    minHeight: tokens.touchTarget,
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colors.primary,
  },
  secondary: {
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.primary,
  },
  danger: { backgroundColor: tokens.colors.danger },
  pressed: { opacity: tokens.stateOpacity.pressed },
  focused: {
    borderWidth: tokens.focusRing.width,
    borderColor: tokens.focusRing.color,
  },
  disabled: { opacity: tokens.stateOpacity.disabled },
  disabledText: { color: tokens.colors.textMuted },
  buttonText: { color: tokens.colors.white, fontWeight: '800', fontSize: 16 },
  secondaryText: { color: tokens.colors.primaryStrong },
  title: {
    ...tokens.type.display,
    color: tokens.colors.ink,
    textAlign: 'auto',
  },
  lead: {
    ...tokens.type.body,
    color: tokens.colors.textMuted,
    textAlign: 'auto',
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: tokens.colors.borderStrong,
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.sm,
    color: tokens.colors.ink,
    textAlign: 'auto',
  },
  row: { flexDirection: 'row', gap: tokens.spacing.sm, flexWrap: 'wrap' },
  badge: {
    alignSelf: 'flex-start',
    paddingVertical: tokens.spacing.xxs,
    paddingHorizontal: tokens.spacing.sm,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.primarySoft,
    color: tokens.colors.primaryStrong,
    fontWeight: '800',
    overflow: 'hidden',
  },
  error: { color: tokens.colors.danger, textAlign: 'auto' },
  skeletonCard: {
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.lg,
    gap: tokens.spacing.sm,
  },
  skeletonLine: { height: 16, borderRadius: 8, backgroundColor: tokens.colors.border },
  offlineBanner: {
    backgroundColor: tokens.colors.warning,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.sm,
  },
  offlineText: { color: tokens.colors.white, fontWeight: '800', textAlign: 'center' },
});
