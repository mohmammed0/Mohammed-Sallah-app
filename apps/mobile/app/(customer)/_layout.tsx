import { Tabs } from 'expo-router';
import { AppIcon } from '@/design-system/icon';
import { customerTokens as tokens } from '@/design-system/tokens';
import { useLocale } from '@/providers/locale-provider';

export default function CustomerTabs() {
  const { dir, t } = useLocale();
  const options = {
    headerShown: false,
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
  return (
    <Tabs screenOptions={options}>
      <Tabs.Screen
        name="customer-home"
        options={{
          title: t('home'),
          tabBarLabel: t('home'),
          tabBarIcon: ({ color, size }) => (
            <AppIcon color={color as string} name="home" size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="customer-requests"
        options={{
          title: t('requests'),
          tabBarLabel: t('requests'),
          tabBarIcon: ({ color, size }) => (
            <AppIcon color={color as string} name="requests" size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="customer-messages"
        options={{
          title: t('messages'),
          tabBarLabel: t('messages'),
          tabBarIcon: ({ color, size }) => (
            <AppIcon color={color as string} name="messages" size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="customer-account"
        options={{
          title: t('account'),
          tabBarLabel: t('account'),
          tabBarIcon: ({ color, size }) => (
            <AppIcon color={color as string} name="customer" size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
