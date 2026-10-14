import type { ExpoConfig } from 'expo/config';

// Values supplied at build time (EAS secrets / env):
//   EAS_PROJECT_ID       - from `eas init`
//   GOOGLE_MAPS_API_KEY  - Android Maps SDK key
//   GOOGLE_SERVICES_JSON - path to google-services.json (EAS file secret) for FCM push
const projectId = process.env.EAS_PROJECT_ID ?? '56e36786-d5ac-441a-834d-052c8fbefdb1';
const mapsKey = process.env.GOOGLE_MAPS_API_KEY;
const googleServices = process.env.GOOGLE_SERVICES_JSON;

const config: ExpoConfig = {
  name: 'Helpawy',
  slug: 'helpawy',
  scheme: 'helpawy',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'app.helpawy.circle',
    config: mapsKey ? { googleMapsApiKey: mapsKey } : undefined,
    infoPlist: {
      UIBackgroundModes: ['location', 'remote-notification'],
    },
  },
  android: {
    package: 'app.helpawy.circle',
    versionCode: 1,
    adaptiveIcon: {
      backgroundColor: '#D92D20',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    googleServicesFile: googleServices,
    config: mapsKey ? { googleMaps: { apiKey: mapsKey } } : undefined,
    permissions: [
      'ACCESS_COARSE_LOCATION',
      'ACCESS_FINE_LOCATION',
      'ACCESS_BACKGROUND_LOCATION',
      'FOREGROUND_SERVICE',
      'FOREGROUND_SERVICE_LOCATION',
      'RECORD_AUDIO',
      'CAMERA',
      'READ_CONTACTS',
      'POST_NOTIFICATIONS',
      'VIBRATE',
    ],
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      { image: './assets/splash-icon.png', imageWidth: 200, backgroundColor: '#ffffff' },
    ],
    'expo-dev-client',
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission:
          'Helpawy shares your location with your circles and lets nearby helpers reach you in an emergency.',
        locationWhenInUsePermission:
          'Helpawy shows you and your circle on the map and sends your location when you press SOS.',
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
        isIosBackgroundLocationEnabled: true,
      },
    ],
    [
      'expo-notifications',
      {
        color: '#D92D20',
        defaultChannel: 'sos',
      },
    ],
    [
      'expo-contacts',
      {
        contactsPermission:
          'Helpawy checks which of your contacts are on Helpawy so help can reach you through people you trust. Numbers are hashed on your phone and never uploaded in clear text.',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'Helpawy lets you attach photos and videos to a help request.',
        cameraPermission: 'Helpawy lets you take a photo or video during a help request.',
        microphonePermission: 'Helpawy records short voice notes during a help request.',
      },
    ],
    [
      'expo-audio',
      {
        microphonePermission: 'Helpawy records short voice notes during a help request.',
      },
    ],
    'expo-localization',
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://msaxcbxjbpiqitmykspb.supabase.co',
    // Publishable (client-side) key. Safe to ship; data access is enforced by RLS.
    supabaseKey:
      process.env.EXPO_PUBLIC_SUPABASE_KEY ?? 'sb_publishable_WwTp8NfHV3Dhb2FuUodTCQ_aG0VXAT_',
    eas: projectId ? { projectId } : undefined,
  },
};

export default config;
