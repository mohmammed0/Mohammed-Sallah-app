import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { formatStatusLabel } from '@sallah/i18n';
import {
  ActionButton,
  CustomerScreen,
  Notice,
  SectionHeader,
  Surface,
  customerStyles,
} from '@/design-system/primitives';
import { AppIcon } from '@/design-system/icon';
import { customerTokens as tokens } from '@/design-system/tokens';
import {
  logicalFlexDirection,
  logicalTextAlignment,
  logicalWritingDirection,
} from '@/design-system/rtl';
import { useLocale } from '@/providers/locale-provider';
import { useSessionContext } from '@/providers/session-provider';

export default function ProviderHome() {
  const { dir, locale, t } = useLocale();
  const { context, setActiveRole } = useSessionContext();
  const verified = context?.providerVerificationStatus === 'verified';
  const textDirection = {
    textAlign: logicalTextAlignment(locale),
    writingDirection: logicalWritingDirection(locale),
  } as const;
  const actions = [
    { icon: 'shield' as const, label: t('providerOnboarding'), route: '/provider/onboarding' },
    ...(verified
      ? [
          { icon: 'requests' as const, label: t('eligibleRequests'), route: '/provider-feed' },
          { icon: 'tools' as const, label: t('jobs'), route: '/provider-jobs' },
          { icon: 'messages' as const, label: t('messages'), route: '/provider-messages' },
          { icon: 'star' as const, label: t('earnings'), route: '/provider/earnings' },
        ]
      : []),
    { icon: 'bell' as const, label: t('notifications'), route: '/notifications' },
    { icon: 'alert' as const, label: t('support'), route: '/support' },
    { icon: 'customer' as const, label: t('account'), route: '/account' },
  ];

  async function switchToCustomer() {
    await setActiveRole('customer');
    router.replace('/customer-home');
  }

  return (
    <CustomerScreen testID="provider-dashboard">
      <Surface tone="accent">
        <View style={{ flexDirection: logicalFlexDirection(locale), gap: tokens.spacing.md }}>
          <View
            style={{
              alignItems: 'center',
              backgroundColor: tokens.colors.primarySoft,
              borderRadius: 18,
              height: 48,
              justifyContent: 'center',
              width: 48,
            }}
          >
            <AppIcon color={tokens.colors.primaryStrong} name="tools" size={24} />
          </View>
          <View style={{ flex: 1, gap: tokens.spacing.xs }}>
            <Text accessibilityRole="header" style={[customerStyles.title, textDirection]}>
              {t('providerDashboard')}
            </Text>
            <Text style={[customerStyles.bodyMuted, textDirection]}>
              {t('providerPrivacyNotice')}
            </Text>
          </View>
        </View>
      </Surface>

      {!verified ? (
        <Notice tone="warning" live>
          {t('providerRestrictedUntilVerified')}
        </Notice>
      ) : (
        <Notice tone="success">{formatStatusLabel('verified', locale)}</Notice>
      )}

      {context?.roles.includes('customer') ? (
        <ActionButton
          icon="customer"
          label={t('customer')}
          onPress={() => void switchToCustomer()}
          variant="secondary"
        />
      ) : null}

      <SectionHeader title={verified ? t('jobs') : t('verification')} />
      {actions.map((action) => (
        <Surface key={action.route}>
          <View
            style={{
              alignItems: 'center',
              flexDirection: logicalFlexDirection(locale),
              gap: tokens.spacing.md,
            }}
          >
            <AppIcon
              color={tokens.colors.primaryStrong}
              name={action.icon}
              size={tokens.iconSize.lg}
            />
            <Text style={[customerStyles.section, { flex: 1 }, textDirection]}>{action.label}</Text>
            <ActionButton
              label={action.label}
              onPress={() => router.push(action.route)}
              variant="secondary"
            />
          </View>
        </Surface>
      ))}
      <Text style={[customerStyles.caption, { direction: dir }, textDirection]}>
        {t('localeCurrencyTimezone', { locale: locale.toUpperCase() })}
      </Text>
    </CustomerScreen>
  );
}
