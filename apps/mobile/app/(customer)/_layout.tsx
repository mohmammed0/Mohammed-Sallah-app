import { Tabs } from 'expo-router';
import { useLocale } from '@/providers/locale-provider';

export default function CustomerTabs() {
  const { t } = useLocale();
  return (
    <Tabs screenOptions={{ headerTitleAlign: 'center', tabBarHideOnKeyboard: true }}>
      <Tabs.Screen name="customer-home" options={{ title: t('home'), tabBarLabel: t('home') }} />
      <Tabs.Screen
        name="customer-requests"
        options={{ title: t('requests'), tabBarLabel: t('requests') }}
      />
      <Tabs.Screen name="customer-jobs" options={{ title: t('jobs'), tabBarLabel: t('jobs') }} />
      <Tabs.Screen
        name="customer-messages"
        options={{ title: t('messages'), tabBarLabel: t('messages') }}
      />
      <Tabs.Screen
        name="customer-account"
        options={{ title: t('account'), tabBarLabel: t('account') }}
      />
    </Tabs>
  );
}
