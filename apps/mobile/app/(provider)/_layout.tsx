import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import { AppIcon, type AppIconName } from '@/design-system/icon';
import { customerTokens as tokens } from '@/design-system/tokens';
import { useLocale } from '@/providers/locale-provider';

export default function ProviderTabs() {
  const { dir, t } = useLocale();
  const options = {
    headerTitleAlign: 'center' as const,
    tabBarHideOnKeyboard: true,
    tabBarActiveTintColor: tokens.colors.primaryStrong,
    tabBarInactiveTintColor: tokens.colors.textMuted,
    tabBarLabelStyle: {
      fontSize: 12,
      fontWeight: '800' as const,
      paddingBottom: 4,
      direction: 'ltr' as const,
      writingDirection: dir,
      textAlign: dir === 'rtl' ? ('right' as const) : ('left' as const),
    },
    tabBarStyle: {
      height: 72,
      paddingTop: 8,
      backgroundColor: tokens.colors.surface,
      borderTopColor: tokens.colors.border,
      direction: dir,
    },
  };
  const tab =
    (name: AppIconName) =>
    ({ color, size }: { color: ColorValue; size: number }) => (
      <AppIcon color={color as string} name={name} size={size} />
    );
  return (
    <Tabs screenOptions={options}>
      <Tabs.Screen
        name="provider-home"
        options={{ title: t('home'), tabBarLabel: t('home'), tabBarIcon: tab('home') }}
      />
      <Tabs.Screen
        name="provider-feed"
        options={{
          title: t('eligibleRequests'),
          tabBarLabel: t('requests'),
          tabBarIcon: tab('requests'),
        }}
      />
      <Tabs.Screen
        name="provider-jobs"
        options={{ title: t('jobs'), tabBarLabel: t('jobs'), tabBarIcon: tab('tools') }}
      />
      <Tabs.Screen
        name="provider-messages"
        options={{ title: t('messages'), tabBarLabel: t('messages'), tabBarIcon: tab('messages') }}
      />
      <Tabs.Screen
        name="provider-account"
        options={{ title: t('account'), tabBarLabel: t('account'), tabBarIcon: tab('customer') }}
      />
    </Tabs>
  );
}
