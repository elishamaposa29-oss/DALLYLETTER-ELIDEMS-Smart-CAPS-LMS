# Mobile deployment

## Purpose

This app is the Expo-based mobile experience for DALLYLETTER ELIDEMS.

## Build notes

- Build from artifacts/dallyletter-mobile
- Use Expo Application Services (EAS) for app store and internal distribution builds
- Keep the mobile app independent from the web and API deployment pipelines

## Environment variables

- EXPO_PUBLIC_API_BASE_URL (preferred full API origin)\n- EXPO_PUBLIC_API_URL (legacy full-URL fallback)\n- EXPO_PUBLIC_DOMAIN (fallback hostname; the app adds https://)\n\nOffline status: the Expo app currently does not persist API query data for offline learning. Do not advertise full offline support until user-scoped cache, logout clearing, and offline behavior are implemented and tested.

## Android build profiles\n\n- `artifacts/dallyletter-mobile/eas.json` defines an internal preview APK and a production Android App Bundle.\n- Before the first cloud build, link this app to the correct Expo account/project with `pnpm dlx eas-cli init` from `artifacts/dallyletter-mobile`. Do not guess or reuse another app’s Expo project ID.\n- Build an installable test APK with `pnpm dlx eas-cli build --platform android --profile preview` from this directory.\n- Production store builds use `pnpm dlx eas-cli build --platform android --profile production`.\n- The profiles use the current Render API origin. Update it only when the canonical API domain changes. The EAS build itself, signing, device install, and runtime tests are not yet verified.\n\n## Future publishing notes

- Configure app signing before Play Store or App Store publication
- Keep production API URLs separate from development or staging values
