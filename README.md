# Helpawy

Family-circle crowd-help app. Expo SDK 57 + expo-router, Supabase backend (`msaxcbxjbpiqitmykspb`), English + Egyptian Arabic (RTL).

## What's in the app

- **Home**: live map of circle members, hold-to-send SOS button (1 s), timeline of help requests (circle + nearby helpers).
- **Circles**: create (family / friends / work / neighbors), join by invite code or `helpawy://join/<code>`, per-circle privacy (location / mic / camera), listen-request consent flow.
- **SOS screen**: victim sees live stats, can add photo / video / voice note, mark safe or cancel. Recipients see approximate location (exact after "I'm on my way"), respond, open in Maps.
- **Helpers**: opt in as a nearby helper (radius, chain length, quiet hours), save own number (SHA-256 hashed on device), sync contacts as hashes only, see mutual contacts on Helpawy, optional background location.
- **Settings**: language, name, push permission, sign out, delete account (edge function `delete-account`).

Backend contract used: RPCs `create_circle`, `join_circle`, `create_sos`, `resolve_sos`, `respond_sos`, `mark_alert_seen`, `sos_stats`, `sos_location_for_me`, `my_contacts_on_helpawy`; tables under RLS; bucket `sos-media`; edge function `notify-sos`.

## Before the first store build

1. `npm install`, then `npx eas-cli@latest login` and `npx eas-cli@latest init`; set the project id as the `EAS_PROJECT_ID` EAS secret.
2. Maps: `eas secret:create --name GOOGLE_MAPS_API_KEY --value <key>`.
3. Push: Firebase Android app `app.helpawy.circle` -> `eas secret:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json`; upload an FCM V1 service-account key in EAS credentials.
4. Test build: `npx eas-cli build -p android --profile preview`.
5. Store build: `npx eas-cli build -p android --profile production`, then `npx eas-cli submit -p android`.

`npm install` uses `legacy-peer-deps` (see `.npmrc`) because of a react-dom peer conflict in the SDK 57 tree.

## Local

`npx expo start` needs a dev build (native modules): `npx eas-cli build --profile development -p android`.

## Play Store notes

- Background location (`ACCESS_BACKGROUND_LOCATION`) needs a Play Console permissions declaration and a demo video; it is behind an in-app opt-in toggle.
- Foreground-service location is declared by `expo-location`.
- Account deletion is in-app (Settings); also provide a web deletion URL in the Data safety form.

## Known gaps

- Mic/camera "listen" is a consent record only; live audio/video streaming (WebRTC) is not implemented. Voice notes, photos and videos are uploaded to `sos-media`.
- Contact sync deletes and re-inserts your hashes (not atomic).
- Owner can leave a circle; deleting a circle outright is not exposed.
- Not run on a device or emulator in this environment: typecheck, `expo-doctor` and an Android prebuild passed; runtime behaviour is untested.
