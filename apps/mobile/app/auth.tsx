import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Screen, styles } from '@/components/ui';
import { supabase } from '@/lib/supabase';
export default function Auth() {
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
      setError('تعذر إكمال العملية. تحقق من البيانات والاتصال.');
      return;
    }
    if (mode === 'signin') router.replace('/home');
  }
  return (
    <Screen>
      <Text style={styles.title}>حسابك</Text>
      <Text style={styles.lead}>
        البريد الإلكتروني وكلمة المرور. يجب تأكيد البريد قبل نشر الطلبات.
      </Text>
      <TextInput
        accessibilityLabel="البريد الإلكتروني"
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
      />
      <TextInput
        accessibilityLabel="كلمة المرور"
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
        <Button disabled={pending} label="تسجيل الدخول" onPress={() => void act('signin')} />
        <Button
          disabled={pending}
          kind="secondary"
          label="إنشاء حساب"
          onPress={() => void act('signup')}
        />
        <Button
          disabled={pending || !email}
          kind="secondary"
          label="استعادة كلمة المرور"
          onPress={() => void act('reset')}
        />
      </View>
    </Screen>
  );
}
