import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { z } from 'zod';
import {
  ActionButton,
  CustomerScreen,
  Field,
  InteractivePressable,
  Notice,
  Surface,
  customerStyles,
} from '@/design-system/primitives';
import { AppIcon } from '@/design-system/icon';
import { customerTokens as tokens } from '@/design-system/tokens';
import { supabase } from '@/lib/supabase';
import { useLocale } from '@/providers/locale-provider';

type AuthMode = 'signin' | 'signup';
type AuthAction = AuthMode | 'reset' | 'resend';
const emailSchema = z.email().max(320);

export default function Auth() {
  const { dir, locale, t } = useLocale();
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [pendingAction, setPendingAction] = useState<AuthAction | null>(null);
  const [notice, setNotice] = useState('');
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const inFlight = useRef(false);
  const pending = pendingAction !== null;

  function changeMode(next: AuthMode) {
    if (inFlight.current) return;
    setMode(next);
    setShowPassword(false);
    setError('');
    setNotice('');
  }

  async function act(action: AuthAction) {
    if (inFlight.current) return;
    setError('');
    setNotice('');
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setError(t('authEmailRequired'));
      return;
    }
    if (!emailSchema.safeParse(normalizedEmail).success) {
      setError(t('authEmailInvalid'));
      return;
    }
    if ((action === 'signin' || action === 'signup') && !password) {
      setError(t('authPasswordRequired'));
      return;
    }
    if (action === 'signup' && password.length < 8) {
      setError(t('authPasswordTooShort'));
      return;
    }
    inFlight.current = true;
    setPendingAction(action);
    try {
      const result =
        action === 'signin'
          ? await supabase.auth.signInWithPassword({ email: normalizedEmail, password })
          : action === 'signup'
            ? await supabase.auth.signUp({
                email: normalizedEmail,
                password,
                options: {
                  data: { preferred_locale: locale },
                  emailRedirectTo: Linking.createURL('/auth-callback'),
                },
              })
            : action === 'resend'
              ? await supabase.auth.resend({
                  type: 'signup',
                  email: normalizedEmail,
                  options: { emailRedirectTo: Linking.createURL('/auth-callback') },
                })
              : await supabase.auth.resetPasswordForEmail(normalizedEmail, {
                  redirectTo: Linking.createURL('/auth-recovery'),
                });
      if (result.error) {
        if (action === 'signin' && result.error.code === 'email_not_confirmed') {
          setVerificationEmail(normalizedEmail);
          setError(t('authVerificationRequired'));
        } else {
          setError(t('authFailed'));
        }
        return;
      }
      if (action === 'signup' || action === 'resend') {
        setVerificationEmail(normalizedEmail);
        setNotice(t('verificationEmailSent'));
      } else if (action === 'reset') {
        setNotice(t('recoveryEmailSent'));
      }
    } catch {
      setError(t('authFailed'));
    } finally {
      inFlight.current = false;
      setPendingAction(null);
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
        <View
          accessibilityRole="tablist"
          accessibilityLabel={t('authModeLabel')}
          style={[styles.modeControl, { flexDirection: dir === 'rtl' ? 'row-reverse' : 'row' }]}
        >
          {(['signin', 'signup'] as const).map((option) => (
            <InteractivePressable
              key={option}
              accessibilityLabel={t(option === 'signin' ? 'signIn' : 'signUp')}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === option, disabled: pending }}
              disabled={pending}
              onPress={() => changeMode(option)}
              style={[styles.modeOption, mode === option && styles.modeSelected]}
            >
              <Text style={[styles.modeText, mode === option && styles.modeSelectedText]}>
                {t(option === 'signin' ? 'signIn' : 'signUp')}
              </Text>
            </InteractivePressable>
          ))}
        </View>
        <View style={styles.introduction}>
          <Text accessibilityRole="header" style={customerStyles.section}>
            {t(mode === 'signin' ? 'authSignInHeading' : 'authSignUpHeading')}
          </Text>
          <Text style={customerStyles.bodyMuted}>
            {t(mode === 'signin' ? 'authSignInBody' : 'authSignUpBody')}
          </Text>
        </View>
        <Field
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          editable={!pending}
          icon="customer"
          keyboardType="email-address"
          label={t('email')}
          onChangeText={setEmail}
          style={styles.emailInput}
          textContentType="emailAddress"
          value={email}
        />
        <Field
          autoCapitalize="none"
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          autoCorrect={false}
          editable={!pending}
          icon="shield"
          label={t('password')}
          onChangeText={setPassword}
          onSubmitEditing={() => void act(mode)}
          returnKeyType="go"
          secureTextEntry={!showPassword}
          textContentType={mode === 'signup' ? 'newPassword' : 'password'}
          value={password}
        />
        <View style={styles.passwordHelp}>
          {mode === 'signup' ? (
            <Text style={customerStyles.caption}>{t('authPasswordHint')}</Text>
          ) : null}
          <ActionButton
            accessibilityLabel={t(showPassword ? 'authHidePassword' : 'authShowPassword')}
            accessibilityState={{ expanded: showPassword }}
            label={t(showPassword ? 'authHidePassword' : 'authShowPassword')}
            onPress={() => setShowPassword((visible) => !visible)}
            variant="ghost"
          />
        </View>
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
          accessibilityLabel={t(mode === 'signin' ? 'signIn' : 'signUp')}
          accessibilityState={{ busy: pending, disabled: pending }}
          disabled={pending}
          label={t(mode === 'signin' ? 'signIn' : 'signUp')}
          loading={pendingAction === 'signin' || pendingAction === 'signup'}
          onPress={() => void act(mode)}
        />
      </Surface>
      {mode === 'signin' || verificationEmail === email.trim() ? (
        <Surface tone="muted">
          <Text style={customerStyles.bodyMuted}>{t('authRecoveryHint')}</Text>
          {mode === 'signin' ? (
            <ActionButton
              accessibilityLabel={t('resetPassword')}
              disabled={pending}
              label={t('resetPassword')}
              loading={pendingAction === 'reset'}
              onPress={() => void act('reset')}
              variant="ghost"
            />
          ) : null}
          {verificationEmail === email.trim() ? (
            <ActionButton
              accessibilityLabel={t('resendVerification')}
              disabled={pending}
              label={t('resendVerification')}
              loading={pendingAction === 'resend'}
              onPress={() => void act('resend')}
              variant="ghost"
            />
          ) : null}
        </Surface>
      ) : null}
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
  introduction: { gap: tokens.spacing.xs },
  modeControl: {
    padding: tokens.spacing.xxs,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.surfaceMuted,
    gap: tokens.spacing.xxs,
  },
  modeOption: {
    flex: 1,
    minHeight: tokens.touchTarget,
    justifyContent: 'center',
    paddingVertical: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.xs,
    borderRadius: tokens.radius.sm,
  },
  modeSelected: { backgroundColor: tokens.colors.surface, ...tokens.shadow.card },
  modeText: { ...tokens.type.label, color: tokens.colors.textMuted, textAlign: 'center' },
  modeSelectedText: { color: tokens.colors.primaryStrong },
  emailInput: { textAlign: 'left', writingDirection: 'ltr' },
  passwordHelp: { gap: tokens.spacing.xxs },
});
