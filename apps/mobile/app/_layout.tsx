import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppQueryProvider } from '@/providers/query-provider';
import { LocaleProvider } from '@/providers/locale-provider';
import { useLocale } from '@/providers/locale-provider';

function LocalizedStack() {
  const { t } = useLocale();
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerBackTitle: t('back'),
          headerTitleAlign: 'center',
          contentStyle: { backgroundColor: '#F6F0E7' },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="home" options={{ title: t('appName') }} />
        <Stack.Screen name="auth" options={{ title: t('account') }} />
        <Stack.Screen name="request/new" options={{ title: t('newRequestTitle') }} />
        <Stack.Screen name="requests" options={{ title: t('requestsAndOffers') }} />
        <Stack.Screen name="offers" options={{ title: t('compareOffers') }} />
        <Stack.Screen name="jobs" options={{ title: t('jobs') }} />
        <Stack.Screen name="provider/onboarding" options={{ title: t('providerOnboarding') }} />
        <Stack.Screen name="provider/feed" options={{ title: t('eligibleRequests') }} />
        <Stack.Screen name="provider/offer" options={{ title: t('privateOffer') }} />
        <Stack.Screen name="provider/earnings" options={{ title: t('earnings') }} />
        <Stack.Screen name="messages" options={{ title: t('messages') }} />
        <Stack.Screen name="support" options={{ title: t('support') }} />
        <Stack.Screen name="account" options={{ title: t('account') }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <AppQueryProvider>
      <LocaleProvider>
        <LocalizedStack />
      </LocaleProvider>
    </AppQueryProvider>
  );
}
