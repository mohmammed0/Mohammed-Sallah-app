import { Link, router } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { Button, Card, Screen, styles } from '@/components/ui';
import { CustomerHome } from '@/features/customer/customer-home';
import { useLocale } from '@/providers/locale-provider';
import { useSessionContext } from '@/providers/session-provider';

export default function Home() {
  const { t, locale } = useLocale();
  const { context, setActiveRole } = useSessionContext();
  const role = context?.activeRole === 'provider' ? 'provider' : 'customer';
  if (role === 'customer') return <CustomerHome />;

  const providerRestricted = context?.providerVerificationStatus !== 'verified';
  async function switchRole(nextRole: 'customer' | 'provider') {
    await setActiveRole(nextRole);
    router.replace(
      nextRole === 'provider'
        ? context?.providerVerificationStatus === 'verified'
          ? '/provider-home'
          : '/provider/onboarding'
        : '/customer-home',
    );
  }
  const provider = [
    ['/provider/onboarding', t('providerOnboarding')],
    ['/provider/feed', t('eligibleRequests')],
    ['/jobs', t('executeJob')],
    ['/messages', t('messages')],
    ['/notifications', t('notifications')],
    ['/provider/earnings', t('earnings')],
    ['/support', t('support')],
    ['/account', t('account')],
  ] as const;
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <Screen>
        <Text style={styles.title}>{t('providerHomeTitle')}</Text>
        <View style={styles.row}>
          <Button
            disabled={!context?.roles.includes('customer')}
            label={t('customer')}
            kind="secondary"
            onPress={() => void switchRole('customer')}
          />
          <Button
            disabled={!context?.roles.includes('provider')}
            label={t('provider')}
            onPress={() => void switchRole('provider')}
          />
        </View>
        <Card>
          <Text style={styles.badge}>{t('provider')}</Text>
          <Text style={styles.lead}>{t('providerPrivacyNotice')}</Text>
        </Card>
        {providerRestricted ? (
          <Card>
            <Text accessibilityLiveRegion="polite" style={styles.error}>
              {t('providerRestrictedUntilVerified')}
            </Text>
          </Card>
        ) : null}
        {provider
          .filter(
            ([href]) =>
              !providerRestricted ||
              ['/provider/onboarding', '/support', '/account', '/notifications'].includes(href),
          )
          .map(([href, label]) => (
            <Link key={href} href={href} asChild>
              <Button kind="secondary" label={label} />
            </Link>
          ))}
        <Text style={styles.lead}>
          {t('localeCurrencyTimezone', { locale: locale.toUpperCase() })}
        </Text>
      </Screen>
    </ScrollView>
  );
}
