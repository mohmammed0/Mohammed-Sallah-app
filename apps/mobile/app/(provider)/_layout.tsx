import { Tabs } from 'expo-router';
import { useLocale } from '@/providers/locale-provider';

export default function ProviderTabs() {
  const { t } = useLocale();
  return (
    <Tabs screenOptions={{ headerTitleAlign: 'center', tabBarHideOnKeyboard: true }}>
      <Tabs.Screen name="provider-home" options={{ title: t('home'), tabBarLabel: t('home') }} />
      <Tabs.Screen
        name="provider-feed"
        options={{ title: t('eligibleRequests'), tabBarLabel: t('requests') }}
      />
      <Tabs.Screen name="provider-jobs" options={{ title: t('jobs'), tabBarLabel: t('jobs') }} />
      <Tabs.Screen
        name="provider-messages"
        options={{ title: t('messages'), tabBarLabel: t('messages') }}
      />
      <Tabs.Screen
        name="provider-account"
        options={{ title: t('account'), tabBarLabel: t('account') }}
      />
    </Tabs>
  );
}
