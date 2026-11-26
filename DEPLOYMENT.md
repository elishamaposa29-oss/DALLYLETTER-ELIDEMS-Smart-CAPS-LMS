# Deployment guide

## Final deployment architecture

This repository remains a single monorepo with multiple deployable services:

- Frontend: Vercel deploys only the web app in artifacts/dallyletter
- Backend API: Render deploys only the API in artifacts/api-server
- Database: managed PostgreSQL remains independent from the frontend deployment
- Mobile: Expo builds remain independent for EAS or future store publication

This avoids unnecessary repository splitting while keeping each service deployable independently.

## Safe release workflow

This repository now uses a protected release path:

- main: active development and integration
- staging: quality assurance and pre-release verification
- production: live platform branch

Use the release guide in RELEASE-WORKFLOW.md for the full process.

## Recommended production setup

- Frontend: Vercel or Netlify for the React app
- Backend: Render or Railway for the Express API
- Database: managed PostgreSQL (Neon, Supabase, Railway Postgres, or Render Postgres)
- Mobile: Expo builds via EAS or Expo Application Services

## 1. Prepare the database

Create a PostgreSQL database and set the connection string in the environment:

```bash
export DATABASE_URL=postgresql://user:password@host:5432/dbname
pnpm db:push
```

## 2. Deploy the API

Use the provided Render configuration in render.yaml:

- Create a new Web Service on Render.
- Connect this repository.
- Choose the root directory.
- Render should use the generated settings automatically.

Required environment variables:

- DATABASE_URL
- JWT_SECRET
- CORS_ORIGINS
- NODE_ENV=production

Optional AI integration (server-side only):

- `AI_PROVIDER=gemini`, `openai`, or `anthropic` selects the provider explicitly.
- Set the matching `GEMINI_API_KEY`, `OPENAI_API_KEY`, or `ANTHROPIC_API_KEY` in the API service's secret environment.
- If no provider/key is configured, ELIDEMS AI intentionally stays in mock/development mode.
- Existing owner-configured AI settings in the database take precedence over environment values.
- Never put provider keys in Vercel browser variables, `VITE_*`, or `EXPO_PUBLIC_*`; mobile and web clients must call the backend.

`DATABASE_URL` must be the current connection URL for a running PostgreSQL
instance. If the API logs `getaddrinfo ENOTFOUND`, the hostname in Render's
environment variable is stale or invalid; update it from the database
provider's current connection details and redeploy. The API will return
`503 Database unavailable` until this is fixed.

## 3. Deploy the web app

For Vercel/Netlify:

- Set the project root to the repository root.
- Build command: pnpm build
- Output directory: artifacts/dallyletter/dist/public
- Environment variable: VITE_API_BASE_URL=https://your-api-domain.com

## 4. Mobile app

Build with Expo:

```bash
cd artifacts/dallyletter-mobile
pnpm exec expo export --platform android
```

## 5. Security checklist

- Never commit secrets.
- Rotate JWT_SECRET and database passwords.
- Restrict CORS to the exact frontend domains.
- Enable HTTPS and secure cookies.
- Use managed PostgreSQL backups.
