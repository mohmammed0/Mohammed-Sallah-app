import { Text } from 'react-native';
import { ActionButton, Notice, Surface, customerStyles } from '@/design-system/primitives';
import { useLocale } from '@/providers/locale-provider';

interface AiDataConsentPanelProps {
  granted: boolean;
  manual: boolean;
  pending: boolean;
  hasQueuedWork: boolean;
  onGrant: () => void;
  onWithdraw: () => void;
  onManual: () => void;
  onReport: () => void;
}

export function AiDataConsentPanel({
  granted,
  manual,
  pending,
  hasQueuedWork,
  onGrant,
  onWithdraw,
  onManual,
  onReport,
}: AiDataConsentPanelProps) {
  const { t } = useLocale();
  return (
    <Surface tone="muted" testID="ai-data-consent">
      <Text accessibilityRole="header" style={customerStyles.section}>
        {t('aiDataConsentTitle')}
      </Text>
      <Text style={customerStyles.body}>{t('aiDataConsentBody')}</Text>
      <Text style={customerStyles.caption}>{t('aiDataConsentScope')}</Text>
      {granted ? (
        <ActionButton label={t('aiDataConsentWithdraw')} onPress={onWithdraw} variant="ghost" />
      ) : (
        <>
          <ActionButton
            disabled={pending}
            label={t('aiDataConsentAllow')}
            onPress={onGrant}
            variant="secondary"
          />
          {!manual ? (
            <ActionButton
              disabled={pending || hasQueuedWork}
              label={t('aiContinueManually')}
              onPress={onManual}
              variant="ghost"
            />
          ) : null}
          {hasQueuedWork ? <Notice>{t('aiConsentQueuedWork')}</Notice> : null}
        </>
      )}
      <Text style={customerStyles.caption}>{t('aiReportHelp')}</Text>
      <ActionButton label={t('reportAiSuggestion')} onPress={onReport} variant="ghost" />
    </Surface>
  );
}
