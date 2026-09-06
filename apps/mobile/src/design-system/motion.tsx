import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  AppState,
  Easing,
  Platform,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useLocale } from '../providers/locale-provider';
import { AppIcon, type AppIconName } from './icon';
import { logicalRowStyle, logicalTextStyle } from './rtl';
import { customerTokens as tokens } from './tokens';

function useMotionAvailability(active: boolean): {
  enabled: boolean;
  interactable: boolean;
  preferencePending: boolean;
} {
  // Unknown preferences and unknown application state both start without motion.
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [windowFocused, setWindowFocused] = useState(true);

  useEffect(() => {
    let mounted = true;
    let preferenceRevision = 0;
    const preference = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
      preferenceRevision += 1;
      if (mounted) setReduceMotion(value);
    });
    const initialRevision = preferenceRevision;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        // A preference change received while the initial lookup was pending wins.
        if (mounted && preferenceRevision === initialRevision) setReduceMotion(value);
      })
      .catch(() => {
        // Keep the safe default, or the newer native preference event.
      });

    const appState = AppState.addEventListener('change', (value) => {
      if (mounted) setForeground(value === 'active');
    });
    // Android can blur the window without changing AppState (notification shade).
    const blur =
      Platform.OS === 'android'
        ? AppState.addEventListener('blur', () => {
            if (mounted) setWindowFocused(false);
          })
        : undefined;
    const focus =
      Platform.OS === 'android'
        ? AppState.addEventListener('focus', () => {
            if (mounted) setWindowFocused(true);
          })
        : undefined;
    setForeground(AppState.currentState === 'active');

    return () => {
      mounted = false;
      preference.remove();
      appState.remove();
      blur?.remove();
      focus?.remove();
    };
  }, []);

  const interactable = active && foreground && windowFocused;
  return {
    enabled: interactable && reduceMotion === false,
    interactable,
    preferencePending: reduceMotion === null,
  };
}

export type MotionRevealProps = {
  children: ReactNode;
  transitionKey: string | number;
  active?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function MotionReveal({
  children,
  transitionKey,
  active = true,
  style,
  testID,
}: MotionRevealProps) {
  const { enabled } = useMotionAvailability(active);
  const [progress] = useState(() => new Animated.Value(1));
  const previousKey = useRef(transitionKey);

  useLayoutEffect(() => {
    const changed = previousKey.current !== transitionKey;
    previousKey.current = transitionKey;
    progress.setValue(1);
    // Never hide content that was already visible while preference/focus resolved.
    // Consume inactive transitions so they cannot replay on a later focus event.
    if (!enabled || !changed) return;

    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: tokens.motion.slow,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
      isInteraction: false,
    });
    animation.start();
    return () => {
      animation.stop();
      progress.setValue(1);
    };
  }, [enabled, progress, transitionKey]);

  return (
    <Animated.View
      testID={testID}
      style={[
        style,
        {
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

export type StatusMotionVariant = 'sending' | 'waiting' | 'working' | 'success';
export type StatusMotionProps = {
  variant: StatusMotionVariant;
  label: string;
  description?: string;
  active?: boolean;
  layout?: 'centered' | 'inline';
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const statusIcons: Record<StatusMotionVariant, AppIconName> = {
  sending: 'send',
  waiting: 'time',
  working: 'tools',
  success: 'check',
};
const cycleDurations = { sending: 2400, waiting: 3600, working: 3000 } as const;
const pulseStops = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];
const pulseLevels = [0, 0.146, 0.5, 0.854, 1, 0.854, 0.5, 0.146, 0];
const dotLevels = [
  [0.4, 0.8, 0.6, 0.4, 0.4],
  [0.4, 0.6, 0.8, 0.6, 0.4],
  [0.4, 0.4, 0.6, 0.8, 0.4],
];

export function StatusMotion({
  variant,
  label,
  description,
  active = true,
  layout = 'centered',
  style,
  testID = 'status-motion',
}: StatusMotionProps) {
  const { locale } = useLocale();
  const { enabled, interactable, preferencePending } = useMotionAvailability(active);
  const [phase] = useState(() => new Animated.Value(0));
  const [settle] = useState(() => new Animated.Value(1));
  const successConsumed = useRef(false);
  const inline = layout === 'inline';
  const success = variant === 'success';

  useEffect(() => {
    phase.setValue(0);
    settle.setValue(1);
    if (variant !== 'success') successConsumed.current = false;

    let animation: Animated.CompositeAnimation;
    if (variant === 'success') {
      // A confirmation is a state transition, not a repeating activity. The first
      // preference lookup may permit it; inactive/reduced states consume it quietly.
      if (!interactable || (!preferencePending && !enabled)) successConsumed.current = true;
      if (!enabled || successConsumed.current) return;
      successConsumed.current = true;
      settle.setValue(0);
      animation = Animated.timing(settle, {
        toValue: 1,
        duration: tokens.motion.slow,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
        isInteraction: false,
      });
    } else {
      if (!enabled) return;
      // One timing node keeps the entire loop native; no JS interval or chained loop.
      animation = Animated.loop(
        Animated.timing(phase, {
          toValue: 1,
          duration: cycleDurations[variant],
          easing: Easing.linear,
          useNativeDriver: true,
          isInteraction: false,
        }),
      );
    }
    animation.start();
    return () => {
      animation.stop();
      phase.setValue(0);
      settle.setValue(1);
    };
  }, [enabled, interactable, phase, preferencePending, settle, variant]);

  const pulse = phase.interpolate({ inputRange: pulseStops, outputRange: pulseLevels });
  const tone = success ? tokens.colors.success : tokens.colors.primary;
  const softTone = success ? tokens.colors.successSoft : tokens.colors.primarySoft;

  return (
    <View
      testID={testID}
      style={[
        styles.status,
        inline ? [styles.inline, logicalRowStyle(locale)] : styles.centered,
        style,
      ]}
    >
      <View
        testID={`${testID}-graphic`}
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={[styles.graphic, inline && styles.graphicInline]}
      >
        <Animated.View
          style={[
            styles.halo,
            inline && styles.haloInline,
            {
              backgroundColor: softTone,
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.8] }),
              transform: [
                { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.06] }) },
              ],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.core,
            inline && styles.coreInline,
            {
              backgroundColor: softTone,
              borderColor: tone,
              transform: success
                ? [{ scale: settle.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }]
                : [{ translateY: pulse.interpolate({ inputRange: [0, 1], outputRange: [0, -2] }) }],
            },
          ]}
        >
          <AppIcon
            testID={`${testID}-icon`}
            name={statusIcons[variant]}
            color={tone}
            size={inline ? 22 : 32}
            strokeWidth={1.8}
          />
        </Animated.View>
        {!success ? (
          <View testID={`${testID}-dots`} style={[styles.dots, inline && styles.dotsInline]}>
            {dotLevels.map((levels, index) => (
              <Animated.View
                key={index}
                style={[
                  styles.dot,
                  {
                    backgroundColor: tone,
                    opacity: phase.interpolate({
                      inputRange: [0, 0.25, 0.5, 0.75, 1],
                      outputRange: levels,
                    }),
                  },
                ]}
              />
            ))}
          </View>
        ) : null}
      </View>
      <View style={[styles.copy, inline && styles.copyInline]}>
        <Text
          testID={`${testID}-label`}
          accessible
          accessibilityRole="header"
          accessibilityLiveRegion="polite"
          accessibilityLabel={label}
          allowFontScaling
          style={[styles.label, logicalTextStyle(locale), !inline && styles.centeredText]}
        >
          {label}
        </Text>
        {description ? (
          <Text
            allowFontScaling
            style={[styles.description, logicalTextStyle(locale), !inline && styles.centeredText]}
          >
            {description}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  status: { gap: tokens.spacing.sm },
  centered: { alignItems: 'center' },
  inline: { alignItems: 'center' },
  graphic: {
    width: 112,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    direction: 'ltr',
  },
  graphicInline: { width: 64, height: 72 },
  halo: { position: 'absolute', width: 104, height: 104, borderRadius: tokens.radius.pill },
  haloInline: { width: 60, height: 60 },
  core: {
    width: 72,
    height: 72,
    borderRadius: 26,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coreInline: { width: 44, height: 44, borderRadius: tokens.radius.md },
  dots: { position: 'absolute', bottom: 0, flexDirection: 'row', gap: tokens.spacing.xxs },
  dotsInline: { bottom: 0 },
  dot: { width: 4, height: 4, borderRadius: tokens.radius.pill },
  copy: { alignSelf: 'stretch', gap: tokens.spacing.xxs },
  copyInline: { flex: 1, justifyContent: 'center' },
  label: { ...tokens.type.section, color: tokens.colors.ink },
  description: { ...tokens.type.body, color: tokens.colors.textMuted },
  centeredText: { textAlign: 'center' },
});
