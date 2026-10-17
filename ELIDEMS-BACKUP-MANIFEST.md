# Elidems Backup Manifest

- Project: Dallyletter Elidems Smart CAPS LMS
- Manifest purpose: inventory of repository/configuration backup only; this file is **not** proof that production database data is backed up.
- Source repository snapshot reference: commit `d3c9d41d91a0cc52a5f7fbd5f629c5fc381a9eca` on branch `DEMx-Development-Mode` (2026-09-07).
- Application source: frontend, backend, mobile app, API contracts, DB schema, scripts, package manifests, and lockfile.
- Database schema: `lib/db/src/schema/`; no checked-in SQL migration directory was found.
- Environment names: `.env.example`, `.env.production.example`, and `ENVIRONMENT-VARIABLES-MAP.md`; actual secret values are not included.
- Render configuration: `render.yaml` defines web services only and intentionally declares no PostgreSQL resource. Do not add one during recovery; this avoids accidental extra databases from Blueprint deployment.
- Vercel: `vercel.json`, Vite build and static output configuration.
- Database architecture: API and Drizzle use configurable `DATABASE_URL`; frontend uses configurable `VITE_API_BASE_URL`.
- Recovery runbook: `DATABASE-MIGRATION-AND-RECOVERY.md`.
- Host migration: `HOST-MIGRATION-GUIDE.md`.
- Secret inventory/recovery: `ELIDEMS-SECRET-INVENTORY.md` and `ELIDEMS-SECRETS-RECOVERY.md`.
- **PostgreSQL data dump: NOT CREATED / NOT VERIFIED.** Repository search found no committed dump; committing database dumps is prohibited. A real backup must be exported from an accessible source and stored securely outside GitHub.
- **Encrypted secret backup: NOT CREATED / NOT VERIFIED.** Do not store live secrets in the repository.
- Production data recovery status: unresolved until the original Render database is accessible or the provider confirms a recoverable backup/snapshot.
