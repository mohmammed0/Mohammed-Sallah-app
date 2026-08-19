import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon, type AppIconName } from './icon';
import { customerTokens as tokens } from './tokens';

export function InteractivePressable({
  children,
  style,
  onBlur,
  onFocus,
  onPressIn,
  onPressOut,
  ...props
}: Omit<PressableProps, 'children' | 'style'> & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      {...props}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onPressIn={(event) => {
        setPressed(true);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        setPressed(false);
        onPressOut?.(event);
      }}
      style={[style, pressed && styles.pressed, focused && styles.focused]}
    >
      {children}
    </Pressable>
  );
}

export function CustomerScreen({
  children,
  scroll = true,
  keyboardAware = true,
  testID,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  keyboardAware?: boolean;
  testID?: string;
}) {
  const content = <View style={styles.content}>{children}</View>;
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {content}
    </ScrollView>
  ) : (
    content
  );
  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safe} testID={testID}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        enabled={keyboardAware}
        style={styles.flex}
      >
        {body}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Surface({
  children,
  tone = 'default',
  ...props
}: ViewProps & {
  children: React.ReactNode;
  tone?: 'default' | 'muted' | 'accent' | 'success' | 'danger';
}) {
  return (
    <View
      {...props}
      style={[
        styles.surface,
        tone === 'muted' && styles.surfaceMuted,
        tone === 'accent' && styles.surfaceAccent,
        tone === 'success' && styles.surfaceSuccess,
        tone === 'danger' && styles.surfaceDanger,
        props.style,
      ]}
    >
      {children}
    </View>
  );
}

export function ActionButton({
  label,
  icon,
  variant = 'primary',
  loading = false,
  ...props
}: PressableProps & {
  label: string;
  icon?: AppIconName;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
}) {
  const disabled = Boolean(props.disabled || loading);
  const { style: suppliedStyleValue, ...pressableProps } = props;
  const suppliedStyle = typeof suppliedStyleValue === 'function' ? undefined : suppliedStyleValue;
  const foreground =
    variant === 'primary' || variant === 'danger'
      ? tokens.colors.white
      : tokens.colors.primaryStrong;
  return (
    <InteractivePressable
      {...pressableProps}
      accessibilityRole="button"
      disabled={disabled}
      style={[
        styles.action,
        variant === 'secondary' && styles.actionSecondary,
        variant === 'ghost' && styles.actionGhost,
        variant === 'danger' && styles.actionDanger,
        disabled && styles.disabled,
        suppliedStyle,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <>
          {icon ? <AppIcon color={foreground} name={icon} size={20} /> : null}
          <Text
            style={[
              styles.actionText,
              (variant === 'secondary' || variant === 'ghost') && styles.actionTextSecondary,
            ]}
          >
            {label}
          </Text>
        </>
      )}
    </InteractivePressable>
  );
}

export function IconButton({
  label,
  icon,
  badge,
  ...props
}: PressableProps & {
  label: string;
  icon: AppIconName;
  badge?: number;
}) {
  const { style: suppliedStyleValue, ...pressableProps } = props;
  const suppliedStyle = typeof suppliedStyleValue === 'function' ? undefined : suppliedStyleValue;
  return (
    <InteractivePressable
      {...pressableProps}
      accessibilityLabel={label}
      accessibilityRole="button"
      style={[styles.iconButton, suppliedStyle]}
    >
      <AppIcon color={tokens.colors.ink} name={icon} />
      {badge && badge > 0 ? (
        <View style={styles.iconBadge}>
          <Text style={styles.iconBadgeText}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      ) : null}
    </InteractivePressable>
  );
}

export function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction}>
          <Text style={styles.sectionAction}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Field({
  label,
  icon,
  ...props
}: TextInputProps & { label: string; icon?: AppIconName }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldShell}>
        {icon ? <AppIcon color={tokens.colors.textMuted} name={icon} size={20} /> : null}
        <TextInput
          {...props}
          accessibilityLabel={label}
          placeholderTextColor={tokens.colors.textMuted}
          style={[styles.field, props.multiline && styles.multiline, props.style]}
        />
      </View>
    </View>
  );
}

export function Notice({
  children,
  tone = 'info',
  live = false,
}: {
  children: React.ReactNode;
  tone?: 'info' | 'warning' | 'danger' | 'success';
  live?: boolean;
}) {
  const icon =
    tone === 'warning' || tone === 'danger' ? 'alert' : tone === 'success' ? 'check' : 'shield';
  const color =
    tone === 'danger'
      ? tokens.colors.danger
      : tone === 'warning'
        ? tokens.colors.warning
        : tone === 'success'
          ? tokens.colors.success
          : tokens.colors.primaryStrong;
  return (
    <View
      accessibilityLiveRegion={live ? 'polite' : 'none'}
      style={[
        styles.notice,
        tone === 'warning' && styles.noticeWarning,
        tone === 'danger' && styles.noticeDanger,
        tone === 'success' && styles.noticeSuccess,
      ]}
    >
      <AppIcon color={color} name={icon} size={20} />
      <Text style={[styles.noticeText, { color }]}>{children}</Text>
    </View>
  );
}

export function Pill({
  label,
  selected = false,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityState={{ selected }}
      disabled={!onPress}
      onPress={onPress}
      style={[styles.pill, selected && styles.pillSelected]}
    >
      <Text style={[styles.pillText, selected && styles.pillTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon: AppIconName;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <Surface style={styles.empty}>
      <View style={styles.emptyIcon}>
        <AppIcon color={tokens.colors.primaryStrong} name={icon} size={28} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.bodyMuted}>{body}</Text>
      {actionLabel && onAction ? <ActionButton label={actionLabel} onPress={onAction} /> : null}
    </Surface>
  );
}

export function LoadingBlock({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <View accessibilityLabel={label} accessibilityRole="progressbar" style={styles.loadingBlock}>
      {Array.from({ length: rows }, (_, index) => (
        <View key={index} style={[styles.skeleton, index % 2 === 1 && { width: '72%' }]} />
      ))}
    </View>
  );
}

export function StepHeader({
  eyebrow,
  title,
  body,
  current,
  total,
}: {
  eyebrow: string;
  title: string;
  body?: string;
  current: number;
  total: number;
}) {
  return (
    <View style={styles.stepHeader}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text accessibilityRole="header" style={styles.display}>
        {title}
      </Text>
      {body ? <Text style={styles.bodyMuted}>{body}</Text> : null}
      <View
        accessibilityLabel={`${current}/${total}`}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 1, max: total, now: current }}
        style={styles.progressTrack}
      >
        <View style={[styles.progressFill, { width: `${Math.round((current / total) * 100)}%` }]} />
      </View>
    </View>
  );
}

export const customerStyles = StyleSheet.create({
  display: { ...tokens.type.display, color: tokens.colors.ink, textAlign: 'left' },
  title: { ...tokens.type.title, color: tokens.colors.ink, textAlign: 'left' },
  section: { ...tokens.type.section, color: tokens.colors.ink, textAlign: 'left' },
  body: { ...tokens.type.body, color: tokens.colors.ink, textAlign: 'left' },
  bodyMuted: { ...tokens.type.body, color: tokens.colors.textMuted, textAlign: 'left' },
  caption: { ...tokens.type.caption, color: tokens.colors.textMuted, textAlign: 'left' },
  row: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: tokens.colors.canvas },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  content: {
    flex: 1,
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.md,
    paddingBottom: 110,
    gap: tokens.spacing.lg,
  },
  surface: {
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.radius.lg,
    borderColor: tokens.colors.border,
    borderWidth: 1,
    padding: tokens.spacing.md,
    gap: tokens.spacing.sm,
    ...tokens.shadow.card,
  },
  surfaceMuted: { backgroundColor: tokens.colors.surfaceMuted, shadowOpacity: 0 },
  surfaceAccent: { backgroundColor: tokens.colors.accentSoft, shadowOpacity: 0 },
  surfaceSuccess: { backgroundColor: tokens.colors.successSoft, shadowOpacity: 0 },
  surfaceDanger: { backgroundColor: tokens.colors.dangerSoft, shadowOpacity: 0 },
  action: {
    minHeight: tokens.touchTarget,
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: tokens.spacing.xs,
    backgroundColor: tokens.colors.primary,
  },
  actionSecondary: {
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.primary,
  },
  actionGhost: { backgroundColor: 'transparent' },
  actionDanger: { backgroundColor: tokens.colors.danger },
  actionText: { ...tokens.type.label, color: tokens.colors.white, textAlign: 'center' },
  actionTextSecondary: { color: tokens.colors.primaryStrong },
  disabled: { opacity: tokens.stateOpacity.disabled },
  pressed: { opacity: tokens.stateOpacity.pressed, transform: [{ scale: 0.99 }] },
  focused: { borderColor: tokens.focusRing.color, borderWidth: tokens.focusRing.width },
  iconButton: {
    width: tokens.touchTarget,
    height: tokens.touchTarget,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBadge: {
    position: 'absolute',
    top: 4,
    end: 3,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 3,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colors.danger,
  },
  iconBadgeText: { color: tokens.colors.white, fontSize: 10, fontWeight: '900' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
  },
  sectionTitle: { ...tokens.type.section, color: tokens.colors.ink, textAlign: 'left' },
  sectionAction: { ...tokens.type.label, color: tokens.colors.primaryStrong },
  fieldGroup: { gap: tokens.spacing.xs },
  fieldLabel: { ...tokens.type.label, color: tokens.colors.ink, textAlign: 'left' },
  fieldShell: {
    minHeight: 54,
    borderWidth: 1,
    borderColor: tokens.colors.borderStrong,
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  field: {
    flex: 1,
    minHeight: 52,
    color: tokens.colors.ink,
    ...tokens.type.body,
    textAlign: 'left',
  },
  multiline: { minHeight: 112, paddingVertical: 12, textAlignVertical: 'top' },
  notice: {
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.sm,
    backgroundColor: tokens.colors.primarySoft,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.spacing.sm,
  },
  noticeWarning: { backgroundColor: tokens.colors.warningSoft },
  noticeDanger: { backgroundColor: tokens.colors.dangerSoft },
  noticeSuccess: { backgroundColor: tokens.colors.successSoft },
  noticeText: { flex: 1, ...tokens.type.caption, textAlign: 'left' },
  pill: {
    minHeight: 40,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: tokens.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: tokens.colors.borderStrong,
    backgroundColor: tokens.colors.surface,
  },
  pillSelected: { backgroundColor: tokens.colors.primary, borderColor: tokens.colors.primary },
  pillText: { ...tokens.type.label, color: tokens.colors.ink },
  pillTextSelected: { color: tokens.colors.white },
  empty: { alignItems: 'center', paddingVertical: tokens.spacing.xl },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colors.primarySoft,
  },
  emptyTitle: { ...tokens.type.section, color: tokens.colors.ink, textAlign: 'center' },
  bodyMuted: { ...tokens.type.body, color: tokens.colors.textMuted, textAlign: 'center' },
  loadingBlock: {
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.lg,
    gap: tokens.spacing.sm,
    backgroundColor: tokens.colors.surface,
  },
  skeleton: { height: 18, width: '100%', borderRadius: 9, backgroundColor: tokens.colors.border },
  stepHeader: { gap: tokens.spacing.xs },
  eyebrow: {
    ...tokens.type.caption,
    color: tokens.colors.primaryStrong,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    textAlign: 'left',
  },
  display: { ...tokens.type.display, color: tokens.colors.ink, textAlign: 'left' },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: tokens.colors.border,
    marginTop: tokens.spacing.xs,
  },
  progressFill: { height: '100%', backgroundColor: tokens.colors.primary, borderRadius: 3 },
});
