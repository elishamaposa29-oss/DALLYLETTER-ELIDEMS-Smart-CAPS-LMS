# Mobile deployment

## Purpose

This app is the Expo-based mobile experience for DALLYLETTER ELIDEMS.

## Build notes

- Build from artifacts/dallyletter-mobile
- Use Expo Application Services (EAS) for app store and internal distribution builds
- Keep the mobile app independent from the web and API deployment pipelines

## Environment variables

- EXPO_PUBLIC_API_BASE_URL (preferred full API origin)\n- EXPO_PUBLIC_API_URL (legacy full-URL fallback)\n- EXPO_PUBLIC_DOMAIN (fallback hostname; the app adds https://)\n\nOffline status: the Expo app currently does not persist API query data for offline learning. Do not advertise full offline support until user-scoped cache, logout clearing, and offline behavior are implemented and tested.

## Future publishing notes

- Configure app signing before Play Store or App Store publication
- Keep production API URLs separate from development or staging values
