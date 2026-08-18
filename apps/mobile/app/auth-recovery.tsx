import { useState } from 'react';
import { router } from 'expo-router';
import { Text, TextInput } from 'react-native';
import { Button, Screen, styles } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useLocale } from '@/providers/locale-provider';
import { useSessionContext } from '@/providers/session-provider';

export default function AuthRecovery() {
  const { t } = useLocale();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [status, setStatus] = useState('');
  const [pending, setPending] = useState(false);
  const { session, authLinkError } = useSessionContext();
  async function save() {
    if (password.length < 8 || password !== confirmation) {
      setStatus(t('passwordMismatch'));
      return;
    }
    setPending(true);
    const { error } = await supabase.auth.updateUser({ password });
    setPending(false);
    if (error) {
      setStatus(t('passwordUpdateFailed'));
      return;
    }
    await supabase.auth.refreshSession();
    router.replace('/home');
  }
  return (
    <Screen>
      <Text style={styles.title}>{t('chooseNewPassword')}</Text>
      {!session || authLinkError ? (
        <>
          <Text accessibilityLiveRegion="assertive" style={styles.error}>
            {t('recoveryLinkInvalid')}
          </Text>
          <Button
            kind="secondary"
            label={t('requestNewRecoveryLink')}
            onPress={() => router.replace('/auth')}
          />
        </>
      ) : (
        <>
          <TextInput
            accessibilityLabel={t('newPassword')}
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
          />
          <TextInput
            accessibilityLabel={t('confirmPassword')}
            style={styles.input}
            value={confirmation}
            onChangeText={setConfirmation}
            secureTextEntry
            autoComplete="new-password"
          />
          <Button disabled={pending} label={t('saveNewPassword')} onPress={() => void save()} />
          {status && (
            <Text accessibilityLiveRegion="polite" style={styles.error}>
              {status}
            </Text>
          )}
        </>
      )}
    </Screen>
  );
}
