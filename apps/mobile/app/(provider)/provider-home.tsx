import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { formatStatusLabel } from '@sallah/i18n';
import {
  ActionButton,
  CustomerScreen,
  InteractivePressable,
  Notice,
  SectionHeader,
  Surface,
  customerStyles,
} from '@/design-system/primitives';
import { AppIcon } from '@/design-system/icon';
import { customerTokens as tokens } from '@/design-system/tokens';
import { logicalRowStyle, logicalChevron, logicalTextStyle } from '@/design-system/rtl';
import { useLocale } from '@/providers/locale-provider';
import { useSessionContext } from '@/providers/session-provider';

export default function ProviderHome() {
  const { locale, t } = useLocale();
  const { context, setActiveRole } = useSessionContext();
  const verified = context?.providerVerificationStatus === 'verified';
  const textDirection = logicalTextStyle(locale);
  const accountActions = [
    { icon: 'shield' as const, label: t('providerOnboarding'), route: '/provider/onboarding' },
    { icon: 'bell' as const, label: t('notifications'), route: '/notifications' },
    { icon: 'alert' as const, label: t('support'), route: '/support' },
    { icon: 'customer' as const, label: t('account'), route: '/account' },
  ];
  const workActions = verified
    ? [
        { icon: 'tools' as const, label: t('jobs'), route: '/provider-jobs' },
        { icon: 'messages' as const, label: t('messages'), route: '/provider-messages' },
        { icon: 'star' as const, label: t('earnings'), route: '/provider/earnings' },
      ]
    : [];

  async function switchToCustomer() {
    await setActiveRole('customer');
  }

  return (
    <CustomerScreen testID="provider-dashboard">
      <Surface>
        <View style={[styles.header, logicalRowStyle(locale)]}>
          <View style={styles.headerIcon}>
            <AppIcon color={tokens.colors.primaryStrong} name="tools" size={24} />
          </View>
          <View style={{ flex: 1, gap: tokens.spacing.xs }}>
            <Text accessibilityRole="header" style={[customerStyles.title, textDirection]}>
              {t('providerDashboard')}
            </Text>
            <Text style={[customerStyles.caption, textDirection]}>
              {t('providerPrivacyNotice')}
            </Text>
          </View>
        </View>
        {!verified ? (
          <Notice tone="warning" live>
            {t('providerRestrictedUntilVerified')}
          </Notice>
        ) : (
          <View style={[styles.verified, logicalRowStyle(locale)]}>
            <AppIcon color={tokens.colors.success} name="shield" size={18} />
            <Text style={[styles.verifiedLabel, textDirection]}>
              {formatStatusLabel('verified', locale)}
            </Text>
          </View>
        )}
        <ActionButton
          icon={verified ? 'requests' : 'shield'}
          label={t(verified ? 'eligibleRequests' : 'providerOnboarding')}
          onPress={() => router.push(verified ? '/provider-feed' : '/provider/onboarding')}
        />
      </Surface>

      {[
        { title: t('jobs'), actions: workActions },
        {
          title: t('account'),
          actions: accountActions.filter(
            (action) => verified || action.route !== '/provider/onboarding',
          ),
        },
      ].map((section) =>
        section.actions.length > 0 ? (
          <View key={section.title} style={styles.section}>
            <SectionHeader title={section.title} />
            <Surface style={styles.actionGroup}>
              {section.actions.map((action, index) => (
                <InteractivePressable
                  key={action.route}
                  accessibilityLabel={action.label}
                  accessibilityRole="button"
                  onPress={() => router.push(action.route)}
                  style={[
                    styles.actionRow,
                    logicalRowStyle(locale),
                    index > 0 && styles.actionDivider,
                  ]}
                >
                  <View style={styles.actionIcon}>
                    <AppIcon color={tokens.colors.primaryStrong} name={action.icon} size={22} />
                  </View>
                  <Text style={[styles.actionLabel, textDirection]}>{action.label}</Text>
                  <AppIcon
                    color={tokens.colors.textMuted}
                    name={logicalChevron(locale, 'forward')}
                    size={20}
                  />
                </InteractivePressable>
              ))}
            </Surface>
          </View>
        ) : null,
      )}
      {context?.roles.includes('customer') ? (
        <ActionButton
          icon="customer"
          label={t('customer')}
          onPress={() => void switchToCustomer()}
          variant="secondary"
        />
      ) : null}
    </CustomerScreen>
  );
}

const styles = StyleSheet.create({
  header: { gap: tokens.spacing.sm, alignItems: 'flex-start' },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colors.primarySoft,
  },
  section: { gap: tokens.spacing.sm },
  verified: { alignItems: 'center', gap: tokens.spacing.xs },
  verifiedLabel: { ...tokens.type.label, color: tokens.colors.success, flexShrink: 1 },
  actionGroup: { gap: 0, paddingVertical: 0 },
  actionRow: {
    alignItems: 'center',
    gap: tokens.spacing.sm,
    minHeight: 64,
    paddingVertical: tokens.spacing.sm,
  },
  actionDivider: { borderTopWidth: 1, borderTopColor: tokens.colors.border },
  actionIcon: { width: 36, alignItems: 'center' },
  actionLabel: { ...tokens.type.label, color: tokens.colors.ink, flexGrow: 1, flexShrink: 1 },
});
