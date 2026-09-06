import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocale } from '../providers/locale-provider';
import { NavigationBackButton } from './navigation-back-button';
import { logicalRowStyle, logicalWritingDirection } from './rtl';
import { customerTokens as tokens } from './tokens';

export function NavigationHeader({ title, canGoBack }: { title: string; canGoBack: boolean }) {
  const { locale } = useLocale();
  const insets = useSafeAreaInsets();
  return (
    <View
      testID="navigation-header"
      style={[
        styles.header,
        { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right },
      ]}
    >
      <View testID="navigation-header-content" style={[styles.row, logicalRowStyle(locale)]}>
        <View testID="navigation-back-slot" style={styles.sideSlot}>
          <NavigationBackButton canGoBack={canGoBack} />
        </View>
        <Text
          testID="navigation-title"
          accessibilityRole="header"
          accessibilityLabel={title}
          allowFontScaling
          style={[styles.title, { writingDirection: logicalWritingDirection(locale) }]}
        >
          {title}
        </Text>
        <View testID="navigation-header-spacer" style={styles.sideSlot} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    direction: 'ltr',
    backgroundColor: tokens.colors.surface,
    borderBottomColor: tokens.colors.border,
    borderBottomWidth: 1,
  },
  row: {
    alignItems: 'center',
    gap: tokens.spacing.xs,
    paddingHorizontal: tokens.spacing.xs,
    paddingVertical: tokens.spacing.xxs,
    minHeight: tokens.touchTarget,
  },
  // Equal slots keep the title centered regardless of whether back is available.
  sideSlot: { width: tokens.touchTarget, minHeight: tokens.touchTarget, flexShrink: 0 },
  // Let the native stack measure the wrapped title instead of fixing header height.
  title: {
    ...tokens.type.section,
    flex: 1,
    direction: 'ltr',
    textAlign: 'center',
    color: tokens.colors.ink,
  },
});
