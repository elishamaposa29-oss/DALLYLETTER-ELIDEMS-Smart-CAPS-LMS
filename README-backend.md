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
- CORS_ORIGINS

## Health endpoint

- GET /healthz

## Deployment notes

- Deploy from the staging branch for pre-release validation
- Deploy from the production branch for live releases
- Health checks should return HTTP 200 from /healthz
