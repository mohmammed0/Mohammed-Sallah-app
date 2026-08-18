import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Screen, styles } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useLocale } from '@/providers/locale-provider';
export default function Auth() {
  const { t } = useLocale();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  async function act(mode: 'signin' | 'signup' | 'reset') {
    setPending(true);
    setError('');
    const result =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : mode === 'signup'
          ? await supabase.auth.signUp({
              email,
              password,
              options: { data: { preferred_locale: 'ar' } },
            })
          : await supabase.auth.resetPasswordForEmail(email, { redirectTo: 'sallah://auth/reset' });
    setPending(false);
    if (result.error) {
      setError(t('authFailed'));
      return;
    }
    if (mode === 'signin') router.replace('/home');
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
          label={t('resetPassword')}
          onPress={() => void act('reset')}
        />
      </View>
    </Screen>
  );
}
