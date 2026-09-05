import { router, Stack, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AppQueryProvider } from '@/providers/query-provider';
import { LocaleProvider } from '@/providers/locale-provider';
import { useLocale } from '@/providers/locale-provider';
import { SessionProvider, useSessionContext } from '@/providers/session-provider';
import { Screen, styles } from '@/components/ui';
import { ConnectivityBanner } from '@/components/connectivity-banner';
import { MobileAppErrorBoundary } from '@/components/app-error-boundary';
import { StartupRecoveryScreen } from '@/features/auth/startup-recovery-screen';
import { canEnterProductArea, productLandingRoute } from '@/features/auth/route-policy';
import { CustomerLocationProvider } from '@/features/location/location-provider';
import { SecureUploadRecoveryCoordinator } from '@/features/media/secure-upload-recovery';
import { NotificationCoordinator } from '@/features/notifications/notification-coordinator';
import { LegalConsentProvider, useLegalConsent } from '@/features/legal/legal-consent-provider';

function LocalizedStack() {
  const { t } = useLocale();
  const { loading, session, context, startupError, refresh, clearLocalSession } =
    useSessionContext();
  const segments = useSegments();
  const legal = useLegalConsent();
  useEffect(() => {
    if (loading || startupError) return;
    const first = segments[0];
    const publicRoute =
      first === undefined ||
      first === 'index' ||
      first === 'auth' ||
      first === 'auth-callback' ||
      first === 'auth-recovery' ||
      first === 'legal';
    if (!session && !publicRoute) router.replace('/auth');
    if (session && context?.allowed && (first === 'auth' || first === 'index')) {
      router.replace(legal.canEnter ? productLandingRoute(context) : '/legal');
    }
    if (
      session &&
      context &&
      !context.allowed &&
      first !== 'account' &&
      first !== 'legal' &&
      first !== 'support'
    ) {
      router.replace('/account');
    }
    if (
      session &&
      context?.allowed &&
      !legal.canEnter &&
      first !== 'legal' &&
      first !== 'account' &&
      first !== 'support' &&
      first !== 'auth-recovery' &&
      first !== 'auth-callback'
    ) {
      router.replace('/legal');
    }
  }, [loading, session, context, startupError, segments, legal.canEnter]);
  if (loading) {
    return (
      <Screen>
        <Text
          accessibilityLabel={t('loading')}
          accessibilityLiveRegion="polite"
          accessibilityRole="progressbar"
          style={styles.lead}
        >
          {t('loading')}
        </Text>
      </Screen>
    );
  }
  if (startupError) {
    return (
      <StartupRecoveryScreen
        category={startupError}
        onClearLocalSession={() => {
          void clearLocalSession();
        }}
        onRetry={() => {
          void refresh();
        }}
      />
    );
  }
  const customerAllowed =
    Boolean(session) && legal.canEnter && canEnterProductArea(context, 'customer');
  const providerRoleAllowed =
    Boolean(session) && legal.canEnter && canEnterProductArea(context, 'provider-onboarding');
  const providerOperationsAllowed =
    Boolean(session) && legal.canEnter && canEnterProductArea(context, 'provider-operations');
  const accountAllowed = Boolean(session);
  return (
    <>
      <StatusBar style="dark" />
      <ConnectivityBanner />
      <NotificationCoordinator />
      <SecureUploadRecoveryCoordinator
        ownerId={legal.canEnter ? (session?.user.id ?? null) : null}
      />
      <Stack
        screenOptions={{
          headerBackTitle: t('back'),
          headerTitleAlign: 'center',
          contentStyle: { backgroundColor: '#F6F0E7' },
        }}
      >
        <Stack.Protected guard={!session}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="auth" options={{ title: t('account') }} />
        </Stack.Protected>
        <Stack.Screen name="auth-callback" options={{ title: t('account') }} />
        <Stack.Screen name="auth-recovery" options={{ title: t('resetPassword') }} />
        <Stack.Screen name="legal" options={{ title: t('legalDocuments') }} />
        <Stack.Protected guard={accountAllowed}>
          <Stack.Screen name="account" options={{ title: t('account') }} />
          <Stack.Screen name="support" options={{ title: t('support') }} />
        </Stack.Protected>
        <Stack.Protected guard={customerAllowed}>
          <Stack.Screen name="(customer)" options={{ headerShown: false }} />
          <Stack.Screen name="request/new" options={{ headerShown: false }} />
          <Stack.Screen name="requests" options={{ title: t('requestsAndOffers') }} />
          <Stack.Screen name="offers" options={{ title: t('compareOffers') }} />
          <Stack.Screen name="locations" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={providerRoleAllowed}>
          <Stack.Screen name="provider/onboarding" options={{ title: t('providerOnboarding') }} />
        </Stack.Protected>
        <Stack.Protected guard={providerOperationsAllowed}>
          <Stack.Screen name="(provider)" options={{ headerShown: false }} />
          <Stack.Screen name="provider/feed" options={{ title: t('eligibleRequests') }} />
          <Stack.Screen name="provider/offer" options={{ title: t('privateOffer') }} />
          <Stack.Screen name="provider/earnings" options={{ title: t('earnings') }} />
        </Stack.Protected>
        <Stack.Protected guard={customerAllowed || providerOperationsAllowed}>
          <Stack.Screen name="home" options={{ title: t('appName') }} />
          <Stack.Screen name="jobs" options={{ title: t('jobs') }} />
          <Stack.Screen name="messages" options={{ title: t('messages') }} />
          <Stack.Screen name="notifications" options={{ title: t('notifications') }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <MobileAppErrorBoundary>
      <AppQueryProvider>
        <LocaleProvider>
          <SessionProvider>
            <LegalConsentProvider>
              <CustomerLocationProvider>
                <LocalizedStack />
              </CustomerLocationProvider>
            </LegalConsentProvider>
          </SessionProvider>
        </LocaleProvider>
      </AppQueryProvider>
    </MobileAppErrorBoundary>
  );
}
