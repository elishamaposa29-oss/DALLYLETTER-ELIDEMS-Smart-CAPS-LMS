# Backend deployment

## Purpose
This service hosts the Express API for DALLYLETTER ELIDEMS.

## Deployment target
- Provider: Render
- Repository: single monorepo
- App directory: artifacts/api-server

## Build settings
- Install command: pnpm install --frozen-lockfile
- Build command: pnpm --dir artifacts/api-server build
- Start command: pnpm --dir artifacts/api-server start
- Node.js version: 20

## Required environment variables
- NODE_ENV=production
- PORT=10000
- DATABASE_URL
- JWT_SECRET
- FRONTEND_PRODUCTION_ORIGIN: exact stable production frontend origin (scheme + hostname only)
- CORS_ORIGINS: comma-separated exact origins for explicitly approved previews; never use wildcard or *.vercel.app

The production API accepts browser requests only from FRONTEND_PRODUCTION_ORIGIN and the exact origins listed in CORS_ORIGINS. A Vercel deployment-specific URL is not a production origin. Use the stable project domain attached to the Vercel project; preview deployments must be approved individually and added to CORS_ORIGINS. Unknown origins remain rejected.

## Health endpoint
- GET /api/healthz

The health endpoint verifies PostgreSQL with SELECT 1. A 503 response with
code: ENOTFOUND means the configured DATABASE_URL hostname cannot be
resolved; authentication cannot work until the database URL is corrected.

## Database connection failures
On Render, open the API service's Environment settings and replace
DATABASE_URL with the current Internal Database URL from the PostgreSQL
service. Do not use an old hostname copied from a deleted or recreated
database. Redeploy the API, then confirm GET /api/healthz returns {"status":"ok"}.

## Deployment notes
- Deploy from the staging branch for pre-release validation
- Deploy from the production branch for live releases
- Health checks should return HTTP 200 from /healthz
