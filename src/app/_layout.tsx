import '@/lib/location'; // registers the background location task at module scope
import '@/lib/push'; // sets the foreground notification handler
import * as Notifications from 'expo-notifications';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Center } from '@/components/ui';
import { LangProvider, useI18n } from '@/i18n';
import { AuthProvider, useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';

function useNotificationObserver() {
  useEffect(() => {
    function open(n: Notifications.Notification) {
      const id = n.request.content.data?.sos_id;
      if (typeof id === 'string') router.push({ pathname: '/sos/[id]', params: { id } });
    }
    const last = Notifications.getLastNotificationResponse();
    if (last?.notification) open(last.notification);
    const sub = Notifications.addNotificationResponseReceivedListener((r) => open(r.notification));
    return () => sub.remove();
  }, []);
}

function Gate() {
  const { session, loading } = useAuth();
  const { ready, t } = useI18n();
  useNotificationObserver();

  if (loading || !ready) {
    return (
      <Center>
        <ActivityIndicator color={colors.primary} />
      </Center>
    );
  }

  const header = {
    headerShown: true,
    headerTintColor: colors.text,
    headerStyle: { backgroundColor: colors.bg },
    headerShadowVisible: false,
  } as const;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="circle/[id]" options={{ ...header, title: '' }} />
        <Stack.Screen name="sos/[id]" options={{ ...header, title: t('helpRequest') }} />
        <Stack.Screen name="join/[code]" options={{ ...header, title: t('joinCircle') }} />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="(auth)/sign-in" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <LangProvider>
        <AuthProvider>
          <StatusBar style="dark" />
          <Gate />
        </AuthProvider>
      </LangProvider>
    </SafeAreaProvider>
  );
}
