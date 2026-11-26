# Elidems Infrastructure Inventory

## Scope and status

Generated from the repository on 2026-09-07. This describes checked-in application and deployment configuration only. No production service was modified and no production database connection was attempted.

## Application layout

- `artifacts/dallyletter`: React/Vite web application with admin, manager, student, and teacher pages.
- `artifacts/api-server`: Express 5 API. `esbuild` compiles `src/index.ts` to `dist/index.mjs`.
- `artifacts/dallyletter-mobile`: Expo/React Native application with admin, student, and teacher routes.
- `artifacts/mockup-sandbox`: Separate Vite mockup preview application.
- `lib/api-spec`: OpenAPI source.
- `lib/api-zod`: Generated Zod/API types.
- `lib/api-client-react`: Generated React API client.
- `lib/db`: Drizzle ORM, PostgreSQL pool, schema, and verification scripts.
- `scripts`: repository checks, owner seed source, and read-only DB verification.

## Database

- PostgreSQL is accessed through `DATABASE_URL` using `pg` and Drizzle ORM.
- Drizzle config: `lib/db/drizzle.config.ts`; schema entry: `lib/db/src/schema/index.ts`.
- Schema modules cover users, lessons, classes, messages, study groups, payments, notifications, hand raises, activity logs, platform settings, polls, Break Elidems, AI actions, content flags, audit logs, assignments, attendance, owner alerts, staff payments, and achievements.
- Database scripts expose `drizzle-kit push` and `push-force`; no checked-in Drizzle SQL migration directory was found.
- Read-only verification scripts: `lib/db/scripts/db-verify.mjs` and `scripts/db-verify-readonly.mjs`.
- The supplied incident identifies Render PostgreSQL `dallyletter-db` (PostgreSQL 16, Oregon, service ID `dpg-d9igb9cvikkc7397s580-a`) as suspended. This repository does not contain its data.

## Deployment

- Render Blueprint: `render.yaml`, with staging and production Node web services, health check `/api/healthz`, and `sync: false` for `DATABASE_URL` and JWT secrets.
- The Blueprint intentionally does not declare a database resource. Adding one could provision a second database and is outside this recovery operation.
- Vercel config: `vercel.json`; it builds `artifacts/dallyletter` and serves `artifacts/dallyletter/dist/public`.
- Package manager: pnpm workspace in `pnpm-workspace.yaml`; lockfile: `pnpm-lock.yaml`.

## Security and integrations

- Authentication is custom JWT-based. Production must provide `JWT_SECRET`; `AUTH_SECRET` is a compatibility fallback.
- CORS is controlled by `CORS_ORIGINS`; the web client API URL is configurable with `VITE_API_BASE_URL` and `API_BASE_URL` fallback.
- AI provider code is in `artifacts/api-server/src/lib/ai-provider.ts` and AI routes. Payment routes and payment schema exist; provider credentials are template-only in this repository.
- Notifications are application/database features. No mail, SMS, cron, queue worker, or external object-storage adapter was found in checked-in runtime source.
- Lesson/message records support `mediaUrl`; externally hosted media must be backed up separately.

## Commands

- Install: `pnpm install --frozen-lockfile`
- Typecheck: `pnpm run typecheck`
- Build: `pnpm build`
- Full verification: `pnpm run ci:verify`
- API build/start: `pnpm --filter @workspace/api-server run build` / `pnpm --filter @workspace/api-server run start`
- Web build: `pnpm --filter @workspace/dallyletter run build`

## Deliberate limitations

- No production database was created, replaced, migrated, reset, or queried.
- No secret values are included in this inventory or tracked example files.
- No encrypted secret archive was created because this workspace contains no local real environment file or secret payload to preserve. Render/Vercel secret stores must be exported by an authorized operator into an approved local source before encryption.
