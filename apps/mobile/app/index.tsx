import { Link } from 'expo-router';
import { SafeAreaView, Text, View } from 'react-native';
import { Button, styles } from '@/components/ui';
import { useLocale } from '@/providers/locale-provider';
export default function Welcome() {
  const { locale, setLocale, t } = useLocale();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F6F0E7' }}>
      <View
        style={[
          { flex: 1, justifyContent: 'center', padding: 24, gap: 18 },
          locale === 'ar' && { direction: 'rtl' },
        ]}
      >
        <Text style={styles.badge}>SAUDI SERVICES · خدمات السعودية</Text>
        <Text style={[styles.title, { fontSize: 44 }]}>{t('appName')}</Text>
        <Text style={styles.lead}>
          اشرح المشكلة، راجع الطلب، وقارن عروضًا خاصة من مقدمي خدمة مؤهلين.
        </Text>
        <View style={styles.row}>
          {(['ar', 'en', 'ur', 'hi'] as const).map((code) => (
            <Button
              key={code}
              kind={locale === code ? 'primary' : 'secondary'}
              label={code.toUpperCase()}
              onPress={() => setLocale(code)}
            />
          ))}
        </View>
        <Link href="/home" asChild>
          <Button label={t('home')} />
        </Link>
        <Link href="/auth" asChild>
          <Button kind="secondary" label="تسجيل الدخول · Sign in" />
        </Link>
      </View>
    </SafeAreaView>
  );
}
