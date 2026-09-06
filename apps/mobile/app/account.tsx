import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { formatStatusLabel, localeNativeNames, supportedLocales } from '@sallah/i18n';
import { styles } from '@/components/ui';
import {
  ActionButton,
  Field,
  InteractivePressable,
  Notice,
  Surface,
  customerStyles,
} from '@/design-system/primitives';
import { AppIcon } from '@/design-system/icon';
import { customerTokens as tokens } from '@/design-system/tokens';
import {
  logicalFlexDirection,
  logicalTextAlignment,
  logicalWritingDirection,
} from '@/design-system/rtl';
import { supabase } from '@/lib/supabase';
import { useLocale } from '@/providers/locale-provider';
import { useSessionContext } from '@/providers/session-provider';
import { productLandingRoute } from '@/features/auth/route-policy';
import { useCustomerLocation } from '@/features/location/location-provider';
import { revokeExpoPushDevice } from '@/features/notifications/expo-push-runtime';

const notificationPreferencesSchema = z.object({
  in_app: z.boolean(),
  push: z.boolean(),
  email: z.boolean(),
  marketing: z.boolean(),
});
type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;
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
  const [notificationsLoaded, setNotificationsLoaded] = useState(false);
  const [notificationReadFailed, setNotificationReadFailed] = useState(false);
  const [notificationWrites, setNotificationWrites] = useState<
    Array<keyof NotificationPreferences>
  >([]);
  const pendingNotificationWrites = useRef(new Set<keyof NotificationPreferences>());
  const notificationReadVersion = useRef(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [reauthPassword, setReauthPassword] = useState('');
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [deletionSummary, setDeletionSummary] = useState<Record<string, unknown> | null>(null);
  const { context, setActiveRole, signOutAll } = useSessionContext();
  const { activeLocation } = useCustomerLocation();
  const textDirection = {
    textAlign: logicalTextAlignment(locale),
    writingDirection: logicalWritingDirection(locale),
  } as const;
  const rowDirection = { flexDirection: logicalFlexDirection(locale) } as const;
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
  async function loadNotifications(accountId: string) {
    const version = ++notificationReadVersion.current;
    setNotificationsLoaded(false);
    setNotificationReadFailed(false);
    try {
      const result = await supabase
        .from('notification_preferences')
        .select('in_app,push,email,marketing')
        .eq('user_id', accountId)
        .maybeSingle();
      if (result.error) throw result.error;
      const preferences = notificationPreferencesSchema.parse(result.data);
      if (version !== notificationReadVersion.current) return;
      setNotifications(preferences);
      setNotificationsLoaded(true);
    } catch {
      if (version !== notificationReadVersion.current) return;
      setNotificationReadFailed(true);
    }
  }
  useEffect(() => {
    let cancelled = false;
    void supabase.auth
      .getUser()
      .then(async ({ data }) => {
        if (!data.user || cancelled) return;
        setUserId(data.user.id);
        await loadNotifications(data.user.id);
        if (!cancelled) await loadDeletionSummary();
      })
      .catch(() => {
        if (!cancelled) setNotificationReadFailed(true);
      });
    return () => {
      cancelled = true;
      notificationReadVersion.current += 1;
    };
  }, []);
  async function updateNotifications(
    key: keyof NotificationPreferences,
    enabled: boolean,
  ): Promise<void> {
    if (!userId) {
      setStatus(t('signInToSaveNotifications'));
      return;
    }
    if (!notificationsLoaded || pendingNotificationWrites.current.has(key)) return;
    const previous = notifications[key];
    pendingNotificationWrites.current.add(key);
    setNotificationWrites([...pendingNotificationWrites.current]);
    setNotifications((current) => ({ ...current, [key]: enabled }));
    try {
      // Independent switches write only their own field. A slower response must
      // never restore another switch from an earlier full-preferences snapshot.
      const patch: Partial<NotificationPreferences> = {};
      patch[key] = enabled;
      const result = await supabase
        .from('notification_preferences')
        .update(patch)
        .eq('user_id', userId)
        .select('in_app,push,email,marketing')
        .single();
      if (result.error) throw result.error;
      const confirmed = notificationPreferencesSchema.parse(result.data);
      if (confirmed[key] !== enabled) throw new Error('NOTIFICATION_UPDATE_NOT_CONFIRMED');
      setStatus(t('notificationSaved'));
    } catch {
      setNotifications((current) => ({ ...current, [key]: previous }));
      setStatus(t('notificationSaveFailed'));
    } finally {
      pendingNotificationWrites.current.delete(key);
      setNotificationWrites([...pendingNotificationWrites.current]);
    }
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
    <ScrollView
      contentContainerStyle={[styles.scrollScreen, { direction: logicalWritingDirection(locale) }]}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
    >
      <Surface tone="accent" style={accountStyles.header}>
        <View style={[accountStyles.headingRow, rowDirection]}>
          <View style={accountStyles.accountIcon}>
            <AppIcon color={tokens.colors.primaryStrong} name="customer" size={32} />
          </View>
          <View style={accountStyles.headingText}>
            <Text accessibilityRole="header" style={[customerStyles.title, textDirection]}>
              {t('accountPrivacyTitle')}
            </Text>
            <Text style={[customerStyles.bodyMuted, textDirection]}>
              {t('accountSettingsLead')}
            </Text>
          </View>
        </View>
      </Surface>
      {context && !context.allowed && (
        <Notice live tone="danger">
          {t('accountRestricted', {
            status: formatStatusLabel(context.accountStatus ?? 'unknown', locale),
          })}
        </Notice>
      )}
      {context?.roles.includes('customer') ? (
        <Surface>
          <View style={[accountStyles.headingRow, rowDirection]}>
            <AppIcon color={tokens.colors.primaryStrong} name="location" />
            <Text accessibilityRole="header" style={[customerStyles.section, textDirection]}>
              {t('currentLocation')}
            </Text>
          </View>
          <Text selectable style={[customerStyles.body, textDirection]}>
            {activeLocation?.label ?? t('locationNotSelected')}
          </Text>
          {activeLocation?.formattedAddress ? (
            <Text selectable style={[customerStyles.bodyMuted, textDirection]}>
              {activeLocation.formattedAddress}
            </Text>
          ) : null}
          <ActionButton
            variant="secondary"
            label={t('changeLocation')}
            onPress={() => router.push('/locations')}
          />
        </Surface>
      ) : null}
      {context?.roles.includes('provider') && context.activeRole !== 'provider' ? (
        <ActionButton
          variant="secondary"
          icon="tools"
          label={t('provider')}
          onPress={() => void switchToProvider()}
        />
      ) : null}
      <Surface>
        <Text accessibilityRole="header" style={[customerStyles.section, textDirection]}>
          {t('language')}
        </Text>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={t('language')}
          style={[accountStyles.languages, rowDirection]}
        >
          {supportedLocales.map((code) => (
            <InteractivePressable
              key={code}
              accessibilityLabel={localeNativeNames[code]}
              accessibilityRole="radio"
              accessibilityState={{ checked: locale === code }}
              onPress={() => void updateLocale(code)}
              style={[
                accountStyles.languageOption,
                rowDirection,
                locale === code && accountStyles.languageSelected,
              ]}
            >
              <Text
                style={[
                  accountStyles.languageLabel,
                  {
                    textAlign: logicalTextAlignment(code),
                    writingDirection: logicalWritingDirection(code),
                  },
                ]}
              >
                {localeNativeNames[code]}
              </Text>
              <View style={accountStyles.selectionMark}>
                {locale === code ? (
                  <AppIcon color={tokens.colors.primaryStrong} name="check" size={20} />
                ) : null}
              </View>
            </InteractivePressable>
          ))}
        </View>
      </Surface>
      <Surface>
        <View style={[accountStyles.headingRow, rowDirection]}>
          <AppIcon color={tokens.colors.primaryStrong} name="bell" />
          <Text
            accessibilityRole="header"
            style={[customerStyles.section, textDirection, accountStyles.headingText]}
          >
            {t('notificationPreferences')}
          </Text>
        </View>
        {(
          [
            ['in_app', t('notificationInApp')],
            ['push', t('notificationPush')],
            ['email', t('notificationEmail')],
            ['marketing', t('notificationMarketing')],
          ] as const
        ).map(([key, label]) => (
          <View key={key} style={[accountStyles.notificationRow, rowDirection]}>
            <Text style={[customerStyles.body, accountStyles.notificationLabel, textDirection]}>
              {label}
            </Text>
            <Switch
              accessibilityLabel={label}
              disabled={!notificationsLoaded || notificationWrites.includes(key)}
              trackColor={{ false: tokens.colors.borderStrong, true: tokens.colors.primary }}
              thumbColor={tokens.colors.white}
              value={notifications[key]}
              onValueChange={(enabled) => void updateNotifications(key, enabled)}
            />
          </View>
        ))}
        {notificationReadFailed && (
          <>
            <Notice live tone="danger">
              {t('notificationSaveFailed')}
            </Notice>
            <ActionButton
              variant="secondary"
              label={t('retry')}
              onPress={() => {
                if (userId) void loadNotifications(userId);
              }}
            />
          </>
        )}
      </Surface>
      <Surface style={accountStyles.privacy}>
        <View style={[accountStyles.headingRow, rowDirection]}>
          <AppIcon color={tokens.colors.primaryStrong} name="shield" />
          <Text accessibilityRole="header" style={[customerStyles.section, textDirection]}>
            {t('privacy')}
          </Text>
        </View>
        <ActionButton
          label={t('legalDocuments')}
          onPress={() => router.push('/legal')}
          variant="ghost"
        />
        <ActionButton
          label={t('support')}
          onPress={() => router.push('/support')}
          variant="ghost"
        />
        <Text style={[customerStyles.bodyMuted, textDirection]}>{t('reauthLead')}</Text>
        <Field
          label={t('currentPassword')}
          accessibilityHint={t('reauthLead')}
          style={passwordFocused ? accountStyles.inputFocused : undefined}
          value={reauthPassword}
          onChangeText={setReauthPassword}
          onFocus={() => setPasswordFocused(true)}
          onBlur={() => setPasswordFocused(false)}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="current-password"
          textContentType="password"
        />
        <ActionButton
          variant="secondary"
          label={t('requestDataExport')}
          onPress={() => void command('request_data_export')}
        />
        <ActionButton
          variant="danger"
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
        {deletionSummary && (
          <Surface tone="muted">
            <Text accessibilityRole="header" style={[customerStyles.section, textDirection]}>
              {t('deletionStatusSummary')}
            </Text>
            <Text selectable style={[customerStyles.body, textDirection]}>
              {formatStatusLabel(
                typeof deletionSummary.status === 'string' ? deletionSummary.status : 'unknown',
                locale,
              )}
            </Text>
            <Text style={[customerStyles.bodyMuted, textDirection]}>
              {t('deletionBlockersSummary', {
                count: Object.values(
                  (deletionSummary.blockers as Record<string, unknown> | undefined) ?? {},
                ).filter((value) => typeof value === 'number' && value > 0).length,
              })}
            </Text>
            {typeof deletionSummary.failureCategory === 'string' && (
              <Text selectable style={[styles.error, textDirection]}>
                {String(deletionSummary.failureCategory)}
              </Text>
            )}
            <ActionButton
              variant="secondary"
              icon="refresh"
              label={t('refreshDeletionStatus')}
              onPress={() => void loadDeletionSummary()}
            />
          </Surface>
        )}
      </Surface>
      <ActionButton
        variant="secondary"
        label={t('logoutAllDevices')}
        onPress={() => void logout()}
      />
      {status.length > 0 && <Notice live>{status}</Notice>}
    </ScrollView>
  );
}

const accountStyles = StyleSheet.create({
  header: { padding: tokens.spacing.lg },
  headingRow: { alignItems: 'center', gap: tokens.spacing.sm },
  headingText: { flex: 1, gap: tokens.spacing.xs },
  accountIcon: {
    width: 56,
    height: 56,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  languages: { flexWrap: 'wrap', gap: tokens.spacing.sm },
  languageOption: {
    flexBasis: '45%',
    flexGrow: 1,
    minHeight: tokens.touchTarget,
    padding: tokens.spacing.sm,
    borderRadius: tokens.radius.md,
    borderWidth: tokens.focusRing.width,
    borderColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.xs,
  },
  languageSelected: {
    backgroundColor: tokens.colors.primarySoft,
    borderColor: tokens.colors.primary,
  },
  languageLabel: { ...tokens.type.body, color: tokens.colors.ink, flexShrink: 1 },
  selectionMark: { width: 20, height: 20 },
  notificationRow: {
    alignItems: 'center',
    gap: tokens.spacing.md,
    minHeight: tokens.touchTarget,
    paddingVertical: tokens.spacing.xs,
    borderTopWidth: 1,
    borderColor: tokens.colors.border,
  },
  notificationLabel: { flex: 1 },
  privacy: { gap: tokens.spacing.md },
  inputFocused: {
    borderWidth: tokens.focusRing.width,
    borderColor: tokens.focusRing.color,
    borderRadius: tokens.radius.sm,
  },
});
