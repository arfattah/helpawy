import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { supabase } from './supabase';

export const BG_TASK = 'helpawy-background-location';
const SHARING_KEY = 'helpawy.shareLocation';

async function pushLocation(lat: number, lng: number, accuracy?: number | null) {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) return;
  await supabase.from('member_locations').upsert({
    user_id: uid,
    lat,
    lng,
    accuracy: accuracy ?? null,
    updated_at: new Date().toISOString(),
  });
}

// Must be defined at module scope so the task exists when the OS wakes the app.
TaskManager.defineTask(BG_TASK, async ({ data, error }) => {
  if (error || !data) return;
  const { locations } = data as { locations: Location.LocationObject[] };
  const last = locations[locations.length - 1];
  if (!last) return;
  try {
    if ((await AsyncStorage.getItem(SHARING_KEY)) === '0') return;
    await pushLocation(last.coords.latitude, last.coords.longitude, last.coords.accuracy);
  } catch {}
});

export async function isSharingEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(SHARING_KEY)) !== '0';
}

export async function setSharingEnabled(on: boolean) {
  await AsyncStorage.setItem(SHARING_KEY, on ? '1' : '0');
  if (!on) await stopBackground();
}

export async function ensureForeground(): Promise<boolean> {
  const cur = await Location.getForegroundPermissionsAsync();
  if (cur.granted) return true;
  const req = await Location.requestForegroundPermissionsAsync();
  return req.granted;
}

export interface Coords {
  lat: number;
  lng: number;
}

export async function getCoords(): Promise<Coords | null> {
  if (!(await ensureForeground())) return null;
  try {
    const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { lat: p.coords.latitude, lng: p.coords.longitude };
  } catch {
    const last = await Location.getLastKnownPositionAsync();
    return last ? { lat: last.coords.latitude, lng: last.coords.longitude } : null;
  }
}

/** Foreground sharing while the app is open. Returns a stop function. */
export async function startForegroundSharing(onCoords?: (c: Coords) => void): Promise<() => void> {
  if (!(await isSharingEnabled()) || !(await ensureForeground())) return () => {};
  const sub = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.Balanced, distanceInterval: 50, timeInterval: 30000 },
    (p) => {
      onCoords?.({ lat: p.coords.latitude, lng: p.coords.longitude });
      pushLocation(p.coords.latitude, p.coords.longitude, p.coords.accuracy).catch(() => {});
    },
  );
  return () => sub.remove();
}

export async function isBackgroundRunning(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(BG_TASK);
  } catch {
    return false;
  }
}

export async function startBackground(title: string, body: string): Promise<boolean> {
  if (!(await ensureForeground())) return false;
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (!bg.granted) return false;
  if (await isBackgroundRunning()) return true;
  await Location.startLocationUpdatesAsync(BG_TASK, {
    accuracy: Location.Accuracy.Balanced,
    distanceInterval: 100,
    timeInterval: 120000,
    pausesUpdatesAutomatically: true,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: title,
      notificationBody: body,
      notificationColor: '#D92D20',
    },
  });
  return true;
}

export async function stopBackground() {
  try {
    if (await isBackgroundRunning()) await Location.stopLocationUpdatesAsync(BG_TASK);
  } catch {}
}
