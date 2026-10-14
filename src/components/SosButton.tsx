import * as Haptics from 'expo-haptics';
import { useRef } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/lib/theme';

export function SosButton({
  label,
  hint,
  busy,
  onTrigger,
}: {
  label: string;
  hint: string;
  busy: boolean;
  onTrigger: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const press = () =>
    Animated.timing(scale, { toValue: 0.92, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  const release = () =>
    Animated.timing(scale, { toValue: 1, duration: 150, useNativeDriver: true }).start();

  return (
    <View style={styles.wrap}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          disabled={busy}
          delayLongPress={1000}
          onPressIn={press}
          onPressOut={release}
          onLongPress={() => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
            onTrigger();
          }}
          style={styles.btn}
        >
          {busy ? <ActivityIndicator color={colors.white} size="large" /> : <Text style={styles.sos}>SOS</Text>}
        </Pressable>
      </Animated.View>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.hint}>{hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', marginVertical: 20 },
  btn: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 8,
    borderColor: colors.primarySoft,
    elevation: 8,
    shadowColor: colors.primary,
    shadowOpacity: 0.4,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  sos: { color: colors.white, fontSize: 38, fontWeight: '900', letterSpacing: 2 },
  label: { marginTop: 14, fontSize: 16, fontWeight: '800', color: colors.text },
  hint: { marginTop: 2, fontSize: 13, color: colors.muted },
});
