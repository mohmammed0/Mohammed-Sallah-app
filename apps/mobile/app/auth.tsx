import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import {
  ActionButton,
  CustomerScreen,
  Field,
  Notice,
  Surface,
  customerStyles,
} from '@/design-system/primitives';
import { AppIcon } from '@/design-system/icon';
import { customerTokens as tokens } from '@/design-system/tokens';
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
    if (mode !== 'signin') {
      setNotice(
        mode === 'signup' || mode === 'resend'
          ? t('verificationEmailSent')
          : t('recoveryEmailSent'),
      );
    }
  }
  return (
    <CustomerScreen testID="auth-screen">
      <View style={styles.hero}>
        <View style={styles.mark}>
          <AppIcon color={tokens.colors.white} name="tools" size={34} strokeWidth={2.4} />
        </View>
        <Text accessibilityRole="header" style={customerStyles.display}>
          {t('authTitle')}
        </Text>
        <Text style={styles.lead}>{t('authLead')}</Text>
      </View>
      <Surface style={styles.form}>
        <Field
          autoCapitalize="none"
          autoComplete="email"
          icon="customer"
          keyboardType="email-address"
          label={t('email')}
          onChangeText={setEmail}
          value={email}
        />
        <Field
          autoComplete="password"
          icon="shield"
          label={t('password')}
          onChangeText={setPassword}
          secureTextEntry
          value={password}
        />
        {error ? (
          <Notice live tone="danger">
            {error}
          </Notice>
        ) : null}
        {notice ? (
          <Notice live tone="success">
            {notice}
          </Notice>
        ) : null}
        <ActionButton
          disabled={pending}
          label={t('signIn')}
          loading={pending}
          onPress={() => void act('signin')}
        />
        <ActionButton
          disabled={pending}
          label={t('signUp')}
          onPress={() => void act('signup')}
          variant="secondary"
        />
      </Surface>
      <Surface tone="muted">
        <ActionButton
          disabled={pending || !email}
          label={t('resendVerification')}
          onPress={() => void act('resend')}
          variant="ghost"
        />
        <ActionButton
          disabled={pending || !email}
          label={t('resetPassword')}
          onPress={() => void act('reset')}
          variant="ghost"
        />
      </Surface>
    </CustomerScreen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: tokens.spacing.sm, paddingVertical: tokens.spacing.lg },
  mark: {
    alignItems: 'center',
    backgroundColor: tokens.colors.primary,
    borderRadius: tokens.radius.xl,
    height: 72,
    justifyContent: 'center',
    width: 72,
    ...tokens.shadow.floating,
  },
  lead: { ...customerStyles.bodyMuted, maxWidth: 420, textAlign: 'center' },
  form: { gap: tokens.spacing.md },
});
