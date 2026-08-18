import { useEffect } from 'react';
import { router } from 'expo-router';
import { Text } from 'react-native';
import { Screen, styles } from '@/components/ui';
import { useLocale } from '@/providers/locale-provider';
import { useSessionContext } from '@/providers/session-provider';

export default function AuthCallback() {
  const { t } = useLocale();
  const { session, context, loading, authLinkError } = useSessionContext();
  useEffect(() => {
    if (!loading && session && context?.allowed) router.replace('/home');
  }, [loading, session, context]);
  return (
    <Screen>
      <Text accessibilityLiveRegion="polite" style={styles.title}>
        {t('verifyingAccount')}
      </Text>
      <Text style={styles.lead}>{t('authCallbackLead')}</Text>
      {authLinkError && (
        <Text accessibilityLiveRegion="assertive" style={styles.error}>
          {t('authLinkInvalid')}
        </Text>
      )}
    </Screen>
  );
}
