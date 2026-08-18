import { Link } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { useState } from 'react';
import { Button, Card, Screen, styles } from '@/components/ui';
import { useLocale } from '@/providers/locale-provider';

export default function Home() {
  const { t, locale } = useLocale();
  const [role, setRole] = useState<'customer' | 'provider'>('customer');
  const customer = [
    ['/request/new', t('newRequest')],
    ['/requests', t('offers')],
    ['/jobs', t('jobs')],
    ['/messages', t('messages')],
    ['/support', t('support')],
    ['/account', t('account')],
  ] as const;
  const provider = [
    ['/provider/onboarding', t('providerOnboarding')],
    ['/provider/feed', 'الطلبات المؤهلة'],
    ['/jobs', 'تنفيذ العمل'],
    ['/messages', t('messages')],
    ['/provider/earnings', t('earnings')],
    ['/support', t('support')],
    ['/account', t('account')],
  ] as const;
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <Screen>
        <Text style={styles.title}>
          {role === 'customer' ? 'كيف نساعدك اليوم؟' : 'أعمالك بوضوح وثقة'}
        </Text>
        <View style={styles.row}>
          <Button
            label="عميل"
            kind={role === 'customer' ? 'primary' : 'secondary'}
            onPress={() => setRole('customer')}
          />
          <Button
            label="مقدم خدمة"
            kind={role === 'provider' ? 'primary' : 'secondary'}
            onPress={() => setRole('provider')}
          />
        </View>
        <Card>
          <Text style={styles.badge}>{role === 'customer' ? 'CUSTOMER' : 'PROVIDER'}</Text>
          <Text style={styles.lead}>
            {role === 'customer'
              ? 'لن ننشر طلبًا أو نكشف موقعك الدقيق دون موافقتك.'
              : 'سترى فقط الطلبات المؤهلة ومعلومات الموقع التقريبية قبل الاختيار.'}
          </Text>
        </Card>
        {(role === 'customer' ? customer : provider).map(([href, label]) => (
          <Link key={href} href={href} asChild>
            <Button kind="secondary" label={label} />
          </Link>
        ))}
        <Text style={styles.lead}>Language: {locale.toUpperCase()} · SAR · Asia/Riyadh</Text>
      </Screen>
    </ScrollView>
  );
}
