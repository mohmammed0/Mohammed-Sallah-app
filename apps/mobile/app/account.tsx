import { useEffect, useState } from 'react';
import { Alert, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, Screen, styles } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useLocale } from '@/providers/locale-provider';

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
  const { locale, setLocale } = useLocale();
  const [status, setStatus] = useState('');
  const [notifications, setNotifications] = useState(defaultNotifications);
  const [userId, setUserId] = useState<string | null>(null);
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
    });
  }, []);
  async function updateNotifications(
    key: keyof NotificationPreferences,
    enabled: boolean,
  ): Promise<void> {
    if (!userId) {
      setStatus('سجّل الدخول لحفظ تفضيلات الإشعارات.');
      return;
    }
    const next = { ...notifications, [key]: enabled };
    setNotifications(next);
    const { error } = await supabase
      .from('notification_preferences')
      .update(next)
      .eq('user_id', userId);
    setStatus(error ? 'تعذر حفظ تفضيلات الإشعارات.' : 'تم حفظ تفضيلات الإشعارات.');
  }
  async function updateLocale(next: 'ar' | 'en' | 'ur' | 'hi'): Promise<void> {
    setLocale(next);
    if (!userId) {
      setStatus('تم حفظ اللغة على هذا الجهاز. سجّل الدخول لمزامنتها مع حسابك.');
      return;
    }
    const { error } = await supabase
      .from('profiles')
      .update({ preferred_locale: next })
      .eq('id', userId);
    setStatus(error ? 'حُفظت اللغة على الجهاز فقط.' : 'تم حفظ اللغة ومزامنتها مع الحساب.');
  }
  async function command(name: 'request_data_export' | 'request_account_deletion') {
    const { error } = await supabase.rpc(name, {});
    setStatus(
      error
        ? 'تعذر قبول الطلب. أعد تسجيل الدخول وحاول مرة أخرى.'
        : name === 'request_data_export'
          ? 'تم تسجيل طلب التصدير. ستتاح حزمة خاصة برابط مؤقت.'
          : 'تم تسجيل طلب الحذف وستُلغى الجلسات عند المعالجة.',
    );
  }
  async function logout() {
    await supabase.auth.signOut({ scope: 'global' });
    router.replace('/');
  }
  return (
    <Screen>
      <Text style={styles.title}>الحساب والخصوصية</Text>
      <Card>
        <Text style={styles.badge}>اللغة</Text>
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
        <Text style={styles.badge}>تفضيلات الإشعارات</Text>
        {(
          [
            ['in_app', 'داخل التطبيق'],
            ['push', 'إشعارات الجهاز'],
            ['email', 'البريد الإلكتروني'],
            ['marketing', 'رسائل تسويقية اختيارية'],
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
        label="طلب تصدير بياناتي"
        onPress={() => void command('request_data_export')}
      />
      <Button
        kind="danger"
        label="بدء حذف الحساب"
        onPress={() =>
          Alert.alert(
            'حذف الحساب',
            'يتطلب الحذف جلسة حديثة. تُحذف البيانات القابلة للحذف وتُجهّل السجلات المحتفظ بها وفق سياسة المراجعة.',
            [
              { text: 'رجوع', style: 'cancel' },
              {
                text: 'متابعة',
                style: 'destructive',
                onPress: () => void command('request_account_deletion'),
              },
            ],
          )
        }
      />
      <Button kind="secondary" label="تسجيل الخروج من كل الأجهزة" onPress={() => void logout()} />
      {status.length > 0 && (
        <Text accessibilityLiveRegion="polite" style={styles.lead}>
          {status}
        </Text>
      )}
    </Screen>
  );
}
