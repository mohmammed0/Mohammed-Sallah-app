import { router } from 'expo-router';
import { StyleSheet } from 'react-native';
import { useLocale } from '../providers/locale-provider';
import { AppIcon } from './icon';
import { InteractivePressable } from './primitives';
import { logicalChevron } from './rtl';
import { customerTokens as tokens } from './tokens';

export function NavigationBackButton({ canGoBack }: { canGoBack: boolean }) {
  const { locale, t } = useLocale();
  if (!canGoBack) return null;
  return (
    <InteractivePressable
      accessibilityLabel={t('back')}
      accessibilityRole="button"
      onPress={() => router.back()}
      style={styles.button}
      testID="navigation-back"
    >
      <AppIcon name={logicalChevron(locale, 'back')} color={tokens.colors.ink} size={24} />
    </InteractivePressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: tokens.touchTarget,
    minHeight: tokens.touchTarget,
    borderRadius: tokens.radius.sm,
  },
});
