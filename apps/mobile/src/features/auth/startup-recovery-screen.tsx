import { Text, View } from 'react-native';
import type { TranslationKey } from '@sallah/i18n';
import { Button, Card, Screen, styles } from '@/components/ui';
import { useLocale } from '@/providers/locale-provider';
import type { StartupErrorCategory } from '@/providers/session-bootstrap';

const categoryKeys = {
  storage_unavailable: 'startupErrorStorage',
  session_unavailable: 'startupErrorSession',
  context_unavailable: 'startupErrorContext',
  malformed_session_context: 'startupErrorMalformed',
  startup_timeout: 'startupErrorTimeout',
  local_clear_failed: 'startupErrorClear',
  startup_unavailable: 'startupErrorUnknown',
} satisfies Readonly<Record<StartupErrorCategory, TranslationKey>>;

export function startupErrorTranslationKey(category: StartupErrorCategory): TranslationKey {
  return categoryKeys[category];
}

export function StartupRecoveryScreen({
  category,
  onRetry,
  onClearLocalSession,
}: {
  category: StartupErrorCategory;
  onRetry: () => void;
  onClearLocalSession: () => void;
}) {
  const { t } = useLocale();
  return (
    <Screen>
      <Card>
        <Text accessibilityRole="header" style={styles.title}>
          {t('startupErrorTitle')}
        </Text>
        <View accessible accessibilityLiveRegion="assertive" accessibilityRole="alert">
          <Text style={styles.error}>{t('startupErrorMessage')}</Text>
          <Text style={styles.lead}>
            {t('startupErrorCategory', {
              category: t(startupErrorTranslationKey(category)),
            })}
          </Text>
        </View>
        <Text style={styles.lead}>{t('clearLocalSessionHint')}</Text>
        <Button
          accessibilityHint={t('startupErrorMessage')}
          accessibilityLabel={t('startupRetryAccessibility')}
          label={t('retry')}
          onPress={onRetry}
        />
        <Button
          accessibilityHint={t('clearLocalSessionHint')}
          accessibilityLabel={t('clearLocalSessionAccessibility')}
          kind="danger"
          label={t('clearLocalSession')}
          onPress={onClearLocalSession}
        />
      </Card>
    </Screen>
  );
}
