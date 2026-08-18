import { useEffect, useState } from 'react';
import { onlineManager } from '@tanstack/react-query';
import { Text, View } from 'react-native';
import { useLocale } from '@/providers/locale-provider';
import { styles } from './ui';

export function ConnectivityBanner() {
  const { t } = useLocale();
  const [online, setOnline] = useState(onlineManager.isOnline());
  useEffect(() => onlineManager.subscribe(setOnline), []);
  if (online) return null;
  return (
    <View accessibilityRole="alert" style={styles.offlineBanner}>
      <Text style={styles.offlineText}>{t('offline')}</Text>
    </View>
  );
}
