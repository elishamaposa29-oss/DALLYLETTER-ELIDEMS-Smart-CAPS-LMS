# Frontend deployment

## Purpose

This app is the React/Vite web frontend for DALLYLETTER ELIDEMS.

## Deployment target

- Provider: Vercel
- Repository: single monorepo
- App directory: artifacts/dallyletter

## Build settings

- Install command: pnpm install --frozen-lockfile
- Build command: pnpm --dir artifacts/dallyletter build
- Output directory: artifacts/dallyletter/dist/public
- Node.js version: 20

## Required environment variables

- VITE_API_BASE_URL
- VITE_APP_NAME

## Preview and production

- Preview: automatic for pull requests
- Production: automatic for the production branch

## Common problems

- API URL is wrong: set VITE_API_BASE_URL to the deployed Render API URL
- Build fails: verify pnpm install completed successfully
- Static assets do not load: confirm the build output path is artifacts/dallyletter/dist/public
