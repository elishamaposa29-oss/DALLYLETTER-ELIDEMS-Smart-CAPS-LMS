# Elidems Backup Manifest

- Project: Dallyletter Elidems Smart CAPS LMS
- Backup date: 2026-09-07
- Git commit SHA: `d3c9d41d91a0cc52a5f7fbd5f629c5fc381a9eca`
- Branch: `DEMx-Development-Mode`
- Application source: frontend, backend, mobile app, API contracts, DB schema, scripts, package manifests, and lockfile.
- Database schema: `lib/db/src/schema/`; no checked-in SQL migration directory found.
- Environment names: `.env.example`, `.env.production.example`, and `ENVIRONMENT-VARIABLES-MAP.md`; values absent.
- Render: `render.yaml`, two Node web services, `/api/healthz`, and secrets marked `sync: false`; no database resource declared to avoid creating a second database.
- Vercel: `vercel.json`, Vite build and static output configuration.
- Commands: `pnpm run ci:verify`; API and web commands are in `ELIDEMS-INFRASTRUCTURE-INVENTORY.md`.
- Database architecture: API and Drizzle use configurable `DATABASE_URL`; frontend uses configurable `VITE_API_BASE_URL`.
- External surfaces: JWT auth, CORS, optional AI providers, payment routes/configuration, notifications, and media URLs. No checked-in object storage, mail, cron, or queue adapter was found.
- Recovery: `DATABASE-MIGRATION-AND-RECOVERY.md`.
- Host migration: `HOST-MIGRATION-GUIDE.md`.
- Secret inventory/recovery: `ELIDEMS-SECRET-INVENTORY.md` and `ELIDEMS-SECRETS-RECOVERY.md`.
- Database dump: not created; source database was reported suspended and no connection was attempted.
- Encrypted secret backup: not created; no local real secret source exists in this workspace.
