# DALLYLETTER ELIDEMS

## Project overview
This repository contains a multi-part education platform with:
- a React/Vite web app in artifacts/dallyletter
- an Express API in artifacts/api-server
- a React Native/Expo app in artifacts/dallyletter-mobile
- shared libraries in lib/

## Current stack
- Frontend: React + Vite + TypeScript
- Backend: Express + TypeScript
- Database: PostgreSQL via Drizzle ORM
- Auth: token-based session handling with role-based access

## Local setup
1. Install dependencies:
   ```bash
   pnpm install
   cp .env.example .env
   ```
2. Start PostgreSQL and set DATABASE_URL in .env.
3. Start the app:
   ```bash
   pnpm dev
   ```
4. Open the web app at http://localhost:3000 and the API at http://localhost:4000.

## Production build
```bash
pnpm build
```

## Notes
- The project has been updated to remove most Replit-specific startup requirements.
- The API and web app are now runnable outside Replit with local environment variables.
- The mobile Expo package can also build locally and does not require Replit-only deployment variables.
