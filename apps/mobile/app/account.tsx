import { useEffect, useState } from 'react';
import { Alert, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { formatStatusLabel } from '@sallah/i18n';
import { Button, Card, styles } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useLocale } from '@/providers/locale-provider';
import { useSessionContext } from '@/providers/session-provider';
import { productLandingRoute } from '@/features/auth/route-policy';
import { useCustomerLocation } from '@/features/location/location-provider';
import { revokeExpoPushDevice } from '@/features/notifications/expo-push-runtime';

interface NotificationPreferences {
  in_app: boolean;
  push: boolean;
  email: boolean;
  marketing: boolean;
}
const defaultNotifications: NotificationPreferences = {
  in_app: true,
  push: true,
  email: true,
  marketing: false,
};

export default function Account() {
  const { locale, setLocale, t } = useLocale();
  const [status, setStatus] = useState('');
  const [providerSwitchPending, setProviderSwitchPending] = useState(false);
  const [notifications, setNotifications] = useState(defaultNotifications);
  const [userId, setUserId] = useState<string | null>(null);
  const [reauthPassword, setReauthPassword] = useState('');
  const [deletionSummary, setDeletionSummary] = useState<Record<string, unknown> | null>(null);
  const { context, setActiveRole, signOutAll } = useSessionContext();
  const { activeLocation } = useCustomerLocation();
  useEffect(() => {
    if (!providerSwitchPending || context?.activeRole !== 'provider') return;
    setProviderSwitchPending(false);
    router.replace(productLandingRoute(context));
  }, [context, providerSwitchPending]);
  async function loadDeletionSummary() {
    const result = await (
      supabase.rpc as unknown as (
        functionName: string,
      ) => Promise<{ data: unknown; error: unknown }>
    )('get_account_deletion_summary');
    if (
      !result.error &&
      result.data &&
      typeof result.data === 'object' &&
      Object.keys(result.data).length > 0
    ) {
      setDeletionSummary(result.data as Record<string, unknown>);
    }
  }
  useEffect(() => {
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      setUserId(data.user.id);
      const result = await supabase
        .from('notification_preferences')
        .select('in_app,push,email,marketing')
        .eq('user_id', data.user.id)
        .maybeSingle();
      if (result.data) setNotifications(result.data);
      await loadDeletionSummary();
    });
  }, []);
  async function updateNotifications(
    key: keyof NotificationPreferences,
    enabled: boolean,
  ): Promise<void> {
    if (!userId) {
      setStatus(t('signInToSaveNotifications'));
      return;
    }
    const next = { ...notifications, [key]: enabled };
    setNotifications(next);
    const { error } = await supabase
      .from('notification_preferences')
      .update(next)
      .eq('user_id', userId);
    setStatus(error ? t('notificationSaveFailed') : t('notificationSaved'));
  }
  async function updateLocale(next: 'ar' | 'en' | 'ur' | 'hi'): Promise<void> {
    setLocale(next);
    if (!userId) {
      setStatus(t('localeSavedLocally'));
      return;
    }
    const { error } = await supabase
      .from('profiles')
      .update({ preferred_locale: next })
      .eq('id', userId);
    setStatus(error ? t('localeLocalOnly') : t('localeSynced'));
  }
  async function command(name: 'request_data_export' | 'request_account_deletion') {
    if (reauthPassword.length < 8) {
      setStatus(t('reauthPasswordRequired'));
      return;
    }
    const verification = await supabase.functions.invoke('reauthenticate', {
      body: { method: 'password', password: reauthPassword },
    });
    setReauthPassword('');
    if (verification.error) {
      setStatus(t('reauthFailed'));
      return;
    }
    const { error } = await supabase.rpc(name);
    setStatus(
      error
        ? t('privacyRequestFailed')
        : name === 'request_data_export'
          ? t('exportRequested')
          : t('deletionRequested'),
    );
    if (!error && name === 'request_account_deletion') {
      await loadDeletionSummary();
    }
  }
  async function logout() {
    await revokeExpoPushDevice('all', t('notificationPush'));
    await signOutAll();
    router.replace('/');
  }
  async function switchToProvider() {
    setProviderSwitchPending(true);
    try {
      await setActiveRole('provider');
    } catch {
      setProviderSwitchPending(false);
      setStatus(t('authFailed'));
    }
  }
  return (
    <ScrollView contentContainerStyle={styles.scrollScreen} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{t('accountPrivacyTitle')}</Text>
      {context && !context.allowed && (
        <Card>
          <Text accessibilityLiveRegion="polite" style={styles.error}>
            {t('accountRestricted', {
              status: formatStatusLabel(context.accountStatus ?? 'unknown', locale),
            })}
          </Text>
        </Card>
      )}
      {context?.roles.includes('customer') ? (
        <Card>
          <Text style={styles.badge}>{t('currentLocation')}</Text>
          <Text style={styles.lead}>{activeLocation?.label ?? t('locationNotSelected')}</Text>
          {activeLocation?.formattedAddress ? (
            <Text style={styles.lead}>{activeLocation.formattedAddress}</Text>
          ) : null}
          <Button
            kind="secondary"
            label={t('changeLocation')}
            onPress={() => router.push('/locations')}
          />
        </Card>
      ) : null}
      {context?.roles.includes('provider') && context.activeRole !== 'provider' ? (
        <Button kind="secondary" label={t('provider')} onPress={() => void switchToProvider()} />
      ) : null}
      <Card>
        <Text style={styles.badge}>{t('language')}</Text>
        <View style={styles.row}>
          {(['ar', 'en', 'ur', 'hi'] as const).map((code) => (
            <Button
              key={code}
              kind={locale === code ? 'primary' : 'secondary'}
              label={code.toUpperCase()}
              onPress={() => void updateLocale(code)}
            />
          ))}
        </View>
      </Card>
      <Card>
        <Text style={styles.badge}>{t('reauthTitle')}</Text>
        <Text style={styles.lead}>{t('reauthLead')}</Text>
        <TextInput
          accessibilityLabel={t('password')}
          style={styles.input}
          value={reauthPassword}
          onChangeText={setReauthPassword}
          secureTextEntry
          autoComplete="current-password"
        />
      </Card>
      <Card>
        <Text style={styles.badge}>{t('notificationPreferences')}</Text>
        {(
          [
            ['in_app', t('notificationInApp')],
            ['push', t('notificationPush')],
            ['email', t('notificationEmail')],
            ['marketing', t('notificationMarketing')],
          ] as const
        ).map(([key, label]) => (
          <View key={key} style={styles.row}>
            <Text style={[styles.lead, { flex: 1 }]}>{label}</Text>
            <Switch
              accessibilityLabel={label}
              value={notifications[key]}
              onValueChange={(enabled) => void updateNotifications(key, enabled)}
            />
          </View>
        ))}
      </Card>
      <Button
        kind="secondary"
        label={t('requestDataExport')}
        onPress={() => void command('request_data_export')}
      />
      <Button
        kind="danger"
        label={t('startAccountDeletion')}
        onPress={() =>
          Alert.alert(t('deleteAccount'), t('deletionConfirmBody'), [
            { text: t('back'), style: 'cancel' },
            {
              text: t('continueAction'),
              style: 'destructive',
              onPress: () => void command('request_account_deletion'),
            },
          ])
        }
      />
      <Button kind="secondary" label={t('logoutAllDevices')} onPress={() => void logout()} />
      {deletionSummary && (
        <Card>
          <Text style={styles.badge}>{t('deletionStatusSummary')}</Text>
          <Text style={styles.lead}>
            {formatStatusLabel(
              typeof deletionSummary.status === 'string' ? deletionSummary.status : 'unknown',
              locale,
            )}
          </Text>
          <Text style={styles.lead}>
            {t('deletionBlockersSummary', {
              count: Object.values(
                (deletionSummary.blockers as Record<string, unknown> | undefined) ?? {},
              ).filter((value) => typeof value === 'number' && value > 0).length,
            })}
          </Text>
          {typeof deletionSummary.failureCategory === 'string' && (
            <Text style={styles.error}>{String(deletionSummary.failureCategory)}</Text>
          )}
          <Button
            kind="secondary"
            label={t('refreshDeletionStatus')}
            onPress={() => void loadDeletionSummary()}
          />
        </Card>
      )}
      {status.length > 0 && (
        <Text accessibilityLiveRegion="polite" style={styles.lead}>
          {status}
        </Text>
      )}
    </ScrollView>
  );
}
