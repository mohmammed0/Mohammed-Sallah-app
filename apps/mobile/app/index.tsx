import { useState } from 'react';
import { Link } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { branding } from '@sallah/config/branding';
import { direction, localeNativeNames, supportedLocales, type SupportedLocale } from '@sallah/i18n';
import { Button, styles } from '@/components/ui';
import { customerTokens as tokens } from '@/design-system/tokens';
import { AppIcon } from '@/design-system/icon';
import { useLocale } from '@/providers/locale-provider';

function LanguageOption({
  code,
  selected,
  onPress,
}: {
  code: SupportedLocale;
  selected: boolean;
  onPress: () => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={localeNativeNames[code]}
      accessibilityLanguage={code}
      accessibilityState={{ selected }}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        styles.button,
        !selected && styles.secondary,
        welcomeStyles.languageOption,
        focused && styles.focused,
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          !selected && styles.secondaryText,
          { writingDirection: direction(code) },
        ]}
      >
        {localeNativeNames[code]}
      </Text>
    </Pressable>
  );
}

export default function Welcome() {
  const { locale, dir, setLocale, t } = useLocale();
  const textDirection = {
    writingDirection: dir,
    // Let the native paragraph direction choose its leading edge.
    textAlign: 'auto' as const,
  };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: branding.colors.sand }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View
          testID="welcome-content"
          style={{
            flexGrow: 1,
            padding: tokens.spacing.lg,
            gap: tokens.spacing.xl,
            direction: dir,
          }}
        >
          <View style={welcomeStyles.introduction}>
            <View style={welcomeStyles.brandMark} accessible={false}>
              <AppIcon name="tools" size={42} color={tokens.colors.white} />
            </View>
            <Text style={[styles.badge, textDirection]}>{t('welcomeBadge')}</Text>
            <Text
              accessibilityRole="header"
              style={[styles.title, welcomeStyles.brandTitle, textDirection]}
            >
              {t('appName')}
            </Text>
            <Text style={[styles.lead, textDirection]}>{t('welcomeLead')}</Text>
          </View>
          <View style={welcomeStyles.steps}>
            {(['describeProblem', 'privateOffersTitle', 'jobDetailsTitle'] as const).map(
              (key, index) => (
                <View key={key} style={welcomeStyles.step}>
                  <View style={welcomeStyles.stepMarker} accessible={false}>
                    <Text style={welcomeStyles.stepNumber}>{index + 1}</Text>
                  </View>
                  <Text style={[welcomeStyles.stepLabel, textDirection]}>{t(key)}</Text>
                </View>
              ),
            )}
          </View>
          <View style={welcomeStyles.languageGroup}>
            <Text style={[welcomeStyles.sectionLabel, textDirection]}>{t('language')}</Text>
            <View style={styles.row}>
              {supportedLocales.map((code) => (
                <LanguageOption
                  key={code}
                  code={code}
                  selected={locale === code}
                  onPress={() => setLocale(code)}
                />
              ))}
            </View>
          </View>
          <View style={welcomeStyles.actions}>
            <Link href="/auth" asChild>
              <Button label={t('newRequest')} />
            </Link>
            <Link href="/auth" asChild>
              <Button kind="secondary" label={t('signIn')} />
            </Link>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const welcomeStyles = StyleSheet.create({
  introduction: { gap: tokens.spacing.sm, paddingTop: tokens.spacing.xl },
  brandMark: {
    width: 80,
    height: 80,
    borderRadius: tokens.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colors.primaryStrong,
    marginBottom: tokens.spacing.sm,
  },
  brandTitle: { fontSize: 44, lineHeight: 56 },
  steps: {
    gap: tokens.spacing.sm,
    paddingVertical: tokens.spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: tokens.colors.borderStrong,
  },
  step: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm },
  stepMarker: {
    width: 30,
    height: 30,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumber: { ...tokens.type.label, color: tokens.colors.primaryStrong },
  stepLabel: { flex: 1, ...tokens.type.label, color: tokens.colors.ink },
  sectionLabel: { ...tokens.type.label, color: tokens.colors.textMuted },
  languageGroup: { gap: tokens.spacing.sm },
  languageOption: { flexBasis: 120, flexGrow: 1, paddingVertical: tokens.spacing.sm },
  actions: { gap: tokens.spacing.sm, paddingBottom: tokens.spacing.lg },
});
