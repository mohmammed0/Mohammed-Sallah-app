import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { ActionButton, CustomerScreen, Surface, customerStyles } from '@/design-system/primitives';
import { StatusMotion } from '@/design-system/motion';
import { AppIcon } from '@/design-system/icon';
import { logicalRowStyle, logicalTextStyle } from '@/design-system/rtl';
import { customerTokens as tokens } from '@/design-system/tokens';
import { useLocale } from '@/providers/locale-provider';

export function RequestPublished({
  requestId,
  active,
  onStartAnother,
}: {
  requestId: string | null;
  active: boolean;
  onStartAnother: () => void;
}) {
  const { locale, t } = useLocale();
  const textDirection = logicalTextStyle(locale);
  return (
    <CustomerScreen testID="request-publish-success">
      <StatusMotion
        active={active}
        description={t('publishSuccessBody')}
        label={t('publishSuccessTitle')}
        variant="success"
      />
      <Surface>
        <Text accessibilityRole="header" style={[customerStyles.section, textDirection]}>
          {t('nextStepsTitle')}
        </Text>
        {(['nextStepOffers', 'nextStepChoose', 'nextStepReceive'] as const).map((key, index) => (
          <View key={key} style={[styles.step, logicalRowStyle(locale)]}>
            <View style={styles.number}>
              <Text style={styles.numberLabel}>{(index + 1).toLocaleString(locale)}</Text>
            </View>
            <Text style={[customerStyles.body, styles.stepLabel, textDirection]}>{t(key)}</Text>
          </View>
        ))}
        {requestId ? (
          <View style={[styles.reference, logicalRowStyle(locale)]}>
            <AppIcon color={tokens.colors.primaryStrong} name="requests" size={18} />
            <Text selectable style={[customerStyles.caption, styles.stepLabel, textDirection]}>
              {t('requestNumber', { id: requestId })}
            </Text>
          </View>
        ) : null}
      </Surface>
      {requestId ? (
        <ActionButton
          icon="requests"
          label={t('viewRequestOffers')}
          onPress={() => router.replace({ pathname: '/offers', params: { requestId } })}
        />
      ) : null}
      <ActionButton
        label={t('viewAllRequests')}
        onPress={() => router.replace('/customer-requests')}
        variant="secondary"
      />
      <ActionButton label={t('startAnotherRequest')} onPress={onStartAnother} variant="ghost" />
    </CustomerScreen>
  );
}

const styles = StyleSheet.create({
  step: { alignItems: 'center', gap: tokens.spacing.sm },
  number: {
    minWidth: 36,
    minHeight: 36,
    paddingHorizontal: tokens.spacing.xs,
    paddingVertical: tokens.spacing.xxs,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberLabel: { ...tokens.type.label, color: tokens.colors.primaryStrong },
  stepLabel: { flex: 1, flexShrink: 1 },
  reference: {
    alignItems: 'center',
    gap: tokens.spacing.xs,
    borderTopWidth: 1,
    borderTopColor: tokens.colors.border,
    paddingTop: tokens.spacing.md,
    marginTop: tokens.spacing.xs,
  },
});
