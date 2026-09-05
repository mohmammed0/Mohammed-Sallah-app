import { useState } from 'react';
import { Link } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { branding } from '@sallah/config/branding';
import { direction, localeNativeNames, supportedLocales, type SupportedLocale } from '@sallah/i18n';
import { Button, styles } from '@/components/ui';
import { customerTokens as tokens } from '@/design-system/tokens';
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
        { paddingVertical: tokens.spacing.sm },
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
    textAlign: dir === 'rtl' ? ('right' as const) : ('left' as const),
  };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: branding.colors.sand }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View
          testID="welcome-content"
          style={{
            flexGrow: 1,
            justifyContent: 'center',
            padding: tokens.spacing.lg,
            gap: tokens.spacing.md,
            direction: dir,
          }}
        >
          <Text style={[styles.badge, textDirection]}>{t('welcomeBadge')}</Text>
          <Text style={[styles.title, { fontSize: 44, lineHeight: 56 }, textDirection]}>
            {t('appName')}
          </Text>
          <Text style={[styles.lead, textDirection]}>{t('welcomeLead')}</Text>
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
          <Link href="/home" asChild>
            <Button label={t('home')} />
          </Link>
          <Link href="/auth" asChild>
            <Button kind="secondary" label={t('signIn')} />
          </Link>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
