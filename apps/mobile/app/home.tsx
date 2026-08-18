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
    ['/provider/feed', t('eligibleRequests')],
    ['/jobs', t('executeJob')],
    ['/messages', t('messages')],
    ['/provider/earnings', t('earnings')],
    ['/support', t('support')],
    ['/account', t('account')],
  ] as const;
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <Screen>
        <Text style={styles.title}>
          {role === 'customer' ? t('customerHomeTitle') : t('providerHomeTitle')}
        </Text>
        <View style={styles.row}>
          <Button
            label={t('customer')}
            kind={role === 'customer' ? 'primary' : 'secondary'}
            onPress={() => setRole('customer')}
          />
          <Button
            label={t('provider')}
            kind={role === 'provider' ? 'primary' : 'secondary'}
            onPress={() => setRole('provider')}
          />
        </View>
        <Card>
          <Text style={styles.badge}>{role === 'customer' ? 'CUSTOMER' : 'PROVIDER'}</Text>
          <Text style={styles.lead}>
            {role === 'customer' ? t('customerPrivacyNotice') : t('providerPrivacyNotice')}
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
