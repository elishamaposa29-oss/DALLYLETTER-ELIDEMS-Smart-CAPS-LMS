# Host Migration Guide

This preserves the existing React/Vite, Express, PostgreSQL, Drizzle, and pnpm architecture and avoids Render-specific hostnames.

## A. PostgreSQL provider

Provision PostgreSQL 16-compatible hosting with backups, TLS, a private URL, and a documented restore process. Keep `DATABASE_URL` as the application connection contract.

## B. Database restore

Resume/export the original database if possible. Create a separate recovery target, inspect `pg_restore --list`, restore with `pg_restore`, verify tables, and retain the original source. Never overwrite the source during testing.

## C. Backend deployment

Deploy `artifacts/api-server` with `pnpm install --frozen-lockfile && pnpm build`, start with `pnpm start`, and expose `/api/healthz`. Configure `DATABASE_URL`, `JWT_SECRET`, and `CORS_ORIGINS` as secrets/configuration.

## D. Frontend deployment

Deploy `artifacts/dallyletter` with `pnpm --dir artifacts/dallyletter build`. Publish `artifacts/dallyletter/dist/public` and set `VITE_API_BASE_URL` to the new HTTPS API origin before building.

## E-H. Configuration, CORS, API URL, and domain

Set `CORS_ORIGINS` to exact frontend origins. Set `VITE_API_BASE_URL` to the backend origin. Update DNS/custom domains only after health checks pass. Do not hard-code provider hostnames into application source.

## I. Authentication

Preserve `JWT_SECRET` during a live migration if existing sessions must remain valid. Store it only in the new host secret manager. Rotate deliberately after recovery if compromise is suspected, understanding that rotation invalidates existing tokens.

## J. Payments

Inventory configured payment provider webhooks, callback URLs, merchant accounts, and credentials separately. Update provider dashboard URLs and test mode first. Never copy secrets into Git or frontend source.

## K. AI integrations

Provide only the provider keys used by the AI routes. Keep them backend-only and test with non-sensitive prompts.

## L. File and media storage

The schema stores media URLs but no object-storage adapter was found. Inventory the provider behind existing URLs and copy those assets separately; a database restore alone may not restore media.

## M. Cron and background jobs

No cron, queue, or worker implementation was found in checked-in source. Inventory any external scheduled jobs manually and recreate them only after confirming commands and idempotency.

## N. Health checks

Configure the host health check to `/api/healthz`. Verify DNS, TLS, database connectivity, CORS, login, role dashboards, and representative flows using a test account.

## O. Database changes

This repository has Drizzle schema-push scripts but no checked-in SQL migration history. Restore first, compare schema, and perform future changes as reviewed, backed-up operations. Never run `push-force` against production.
