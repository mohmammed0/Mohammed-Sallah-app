import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { Button, Screen, styles } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useLocale } from '@/providers/locale-provider';
export default function Auth() {
  const { t } = useLocale();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  async function act(mode: 'signin' | 'signup' | 'reset' | 'resend') {
    setPending(true);
    setError('');
    setNotice('');
    const result =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : mode === 'signup'
          ? await supabase.auth.signUp({
              email: email.trim(),
              password,
              options: {
                data: { preferred_locale: 'ar' },
                emailRedirectTo: Linking.createURL('/auth-callback'),
              },
            })
          : mode === 'resend'
            ? await supabase.auth.resend({
                type: 'signup',
                email: email.trim(),
                options: { emailRedirectTo: Linking.createURL('/auth-callback') },
              })
            : await supabase.auth.resetPasswordForEmail(email.trim(), {
                redirectTo: Linking.createURL('/auth-recovery'),
              });
    setPending(false);
    if (result.error) {
      setError(t('authFailed'));
      return;
    }
    if (mode === 'signin') router.replace('/home');
    else
      setNotice(
        mode === 'signup' || mode === 'resend'
          ? t('verificationEmailSent')
          : t('recoveryEmailSent'),
      );
  }
  return (
    <Screen>
      <Text style={styles.title}>{t('authTitle')}</Text>
      <Text style={styles.lead}>{t('authLead')}</Text>
      <TextInput
        accessibilityLabel={t('email')}
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
      />
      <TextInput
        accessibilityLabel={t('password')}
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password"
      />
      {error && (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {error}
        </Text>
      )}
      {notice && (
        <Text accessibilityLiveRegion="polite" style={styles.lead}>
          {notice}
        </Text>
      )}
      <View style={{ gap: 10 }}>
        <Button disabled={pending} label={t('signIn')} onPress={() => void act('signin')} />
        <Button
          disabled={pending}
          kind="secondary"
          label={t('signUp')}
          onPress={() => void act('signup')}
        />
        <Button
          disabled={pending || !email}
          kind="secondary"
          label={t('resendVerification')}
          onPress={() => void act('resend')}
        />
        <Button
          disabled={pending || !email}
          kind="secondary"
          label={t('resetPassword')}
          onPress={() => void act('reset')}
        />
      </View>
    </Screen>
  );
}
