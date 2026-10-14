import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useEffect } from 'react';
import { useI18n } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { startForegroundSharing } from '@/lib/location';
import { registerForPush } from '@/lib/push';
import { colors } from '@/lib/theme';

export default function TabsLayout() {
  const { t } = useI18n();
  const { session } = useAuth();
  const uid = session?.user.id;

  // Push token + live location sharing while a user is signed in.
  useEffect(() => {
    if (!uid) return;
    registerForPush(uid, true);
    let stop: (() => void) | undefined;
    let cancelled = false;
    startForegroundSharing().then((s) => {
      if (cancelled) s();
      else stop = s;
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [uid]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarLabelStyle: { fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabHome'),
          tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="circles"
        options={{
          title: t('tabCircles'),
          tabBarIcon: ({ color, size }) => <Ionicons name="people-circle" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="helpers"
        options={{
          title: t('tabHelpers'),
          tabBarIcon: ({ color, size }) => <Ionicons name="shield-checkmark" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabSettings'),
          tabBarIcon: ({ color, size }) => <Ionicons name="settings" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
