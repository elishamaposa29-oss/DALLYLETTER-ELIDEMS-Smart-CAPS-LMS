# Mobile deployment

## Purpose

This app is the Expo-based mobile experience for DALLYLETTER ELIDEMS.

## Build notes

- Build from artifacts/dallyletter-mobile
- Use Expo Application Services (EAS) for app store and internal distribution builds
- Keep the mobile app independent from the web and API deployment pipelines

## Environment variables

- EXPO_PUBLIC_API_URL

## Future publishing notes

- Configure app signing before Play Store or App Store publication
- Keep production API URLs separate from development or staging values
