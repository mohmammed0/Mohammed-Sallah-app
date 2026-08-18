import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppQueryProvider } from '@/providers/query-provider';
import { LocaleProvider } from '@/providers/locale-provider';

export default function RootLayout() {
  return (
    <AppQueryProvider>
      <LocaleProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerBackTitle: 'رجوع',
            headerTitleAlign: 'center',
            contentStyle: { backgroundColor: '#F6F0E7' },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="home" options={{ title: 'صلّح' }} />
          <Stack.Screen name="auth" options={{ title: 'الحساب' }} />
          <Stack.Screen name="request/new" options={{ title: 'طلب جديد' }} />
          <Stack.Screen name="requests" options={{ title: 'طلباتي وعروضي' }} />
          <Stack.Screen name="offers" options={{ title: 'مقارنة العروض' }} />
          <Stack.Screen name="jobs" options={{ title: 'الأعمال' }} />
          <Stack.Screen name="provider/onboarding" options={{ title: 'تسجيل مقدم الخدمة' }} />
          <Stack.Screen name="provider/feed" options={{ title: 'الطلبات المؤهلة' }} />
          <Stack.Screen name="provider/offer" options={{ title: 'عرض خاص' }} />
          <Stack.Screen name="provider/earnings" options={{ title: 'الأرباح' }} />
          <Stack.Screen name="messages" options={{ title: 'الرسائل' }} />
          <Stack.Screen name="support" options={{ title: 'الدعم' }} />
          <Stack.Screen name="account" options={{ title: 'الحساب' }} />
        </Stack>
      </LocaleProvider>
    </AppQueryProvider>
  );
}
