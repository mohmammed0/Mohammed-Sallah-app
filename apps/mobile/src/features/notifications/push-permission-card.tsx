import { useState } from 'react';
import { Linking, Text } from 'react-native';
import { Button, Card, styles } from '@/components/ui';
import { useLocale } from '@/providers/locale-provider';
import { synchronizeExpoPushDevice } from './expo-push-runtime';

export function PushPermissionCard() {
  const { t } = useLocale();
  const [status, setStatus] = useState<'idle' | 'registered' | 'denied' | 'unavailable'>('idle');

  async function enable(): Promise<void> {
    const result = await synchronizeExpoPushDevice({
      prompt: true,
      channelName: t('notificationPush'),
    });
    setStatus(result === 'not_requested' ? 'unavailable' : result);
  }

  return (
    <Card>
      <Text style={styles.badge}>{t('pushPermissionTitle')}</Text>
      <Text accessibilityLiveRegion="polite" style={styles.lead}>
        {status === 'registered'
          ? t('pushPermissionEnabled')
          : status === 'denied'
            ? t('pushPermissionDenied')
            : status === 'unavailable'
              ? t('pushPermissionUnavailable')
              : t('pushPermissionLead')}
      </Text>
      {status === 'denied' ? (
        <Button
          kind="secondary"
          label={t('openDeviceSettings')}
          onPress={() => void Linking.openSettings()}
        />
      ) : (
        <Button
          kind="secondary"
          label={status === 'registered' ? t('retry') : t('enablePushNotifications')}
          onPress={() => void enable()}
        />
      )}
    </Card>
  );
}
