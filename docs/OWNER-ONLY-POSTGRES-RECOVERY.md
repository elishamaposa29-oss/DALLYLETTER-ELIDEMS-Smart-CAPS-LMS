# Owner-only PostgreSQL recovery — Dallyletter Elidems

**Recovery target:** a clean PostgreSQL 18 database with the canonical Dallyletter schema and one privileged account:
`elishamaposa430@gmail.com`.

**This file is recovery code and instructions, not a database dump.** No production connection string, password, password hash, Google credential, live row data, uploaded document, or secret belongs in Git. The previous live database could not be exported through the connected Render SQL tool because its network allowlist rejected that connection. Therefore this PR cannot honestly claim to contain a byte-for-byte backup of that database.

## What is intentionally preserved

- The complete application schema represented by `lib/db/src/schema/index.ts` and its imported Drizzle modules.
- The four raw-SQL legacy tables covered by `lib/db/migrations/0001_legacy_tables.sql`: `content_permission_requests`, `message_media`, `push_subscriptions`, and `teacher_documents`.
- The repository's ordered additive setup tasks for manager permissions, payment transactions, exercise schema, messages, and Connect schema.
- Authentication/session schema, Profile Hub schema, and the Google account-link table created by the API's schema initializers.
- The existing owner bootstrap implementation in `scripts/src/seed-owner.ts`, which uses the app-compatible scrypt password format and creates/promotes the configured email as `owner` when the new database has no existing privileged account.
- Google sign-in's existing-account linking behavior: a verified Google ID token whose email exactly matches the pre-created owner account links to that user; it does not create a second learner account or change the existing role.

No learner, teacher, lesson, message, payment, or other user data is required by this owner-only fresh-start plan. If any data is later found to be important, stop and restore a verified dump instead of using the empty-database procedure.

## Render resource configuration

Create a new PostgreSQL 18 resource in the existing Render workspace, same region as the canonical API (Oregon), with internal-only access and a database plan that is actually available in the workspace. Render rejected a second simultaneous Free database while the expiring Free instance was active. A Free replacement can only be created after the old Free resource is deleted/expired and the Free slot is available. Free databases are temporary; do not describe this as a permanent production recovery.

Use the dedicated `render.database-rebuild.yaml` only as a reference for database-only provisioning. Review the Render plan before applying it. It must create only the replacement database and must not modify any existing service. Do not copy the old connection string into Git or this PR.

## Required protected environment values

Set these in the canonical Render API service's Environment page, never in source control:

| Key | Purpose |
|---|---|
| `DATABASE_URL` | New database's **internal** connection URL. |
| `JWT_SECRET` | New strong random signing secret; retain securely. Existing tokens will not survive a clean database reset. |
| `GOOGLE_CLIENT_ID` | The exact Google Identity Services OAuth client ID used by the Dallyletter web sign-in button. |
| `OWNER_BOOTSTRAP_EMAIL` | Set to `elishamaposa430@gmail.com`. |
| `OWNER_BOOTSTRAP_PASSWORD` | Set a new strong password privately in Render. Never paste it into ChatGPT, a PR, a commit, logs, or build output. |

Also confirm the non-secret runtime/configuration values are correct for the canonical service: `NODE_ENV=production`, `PORT=10000`, `CORS_ORIGINS` includes the exact production Dallyletter web origin(s), and `PUBLIC_APP_URL` / `PUBLIC_API_URL` point to the real production web/API origins. Google Cloud must have the matching client enabled for the production web origin. The browser's client ID and API's `GOOGLE_CLIENT_ID` must match exactly.

Other integrations (email provider, PayNow, PayPal, media object storage, AI providers, SMS) need their own keys only when those features are enabled. They are not prerequisites for Owner Google sign-in. Do not invent or reuse missing secrets; check each integration separately.

## Exact fresh-database sequence

Run this only against the **new, empty replacement database**. Do not run it against the expiring database or any database containing records you intend to keep.

1. Provision the replacement PostgreSQL 18 database in Render. Wait until Render reports it available.
2. Set the new internal connection URL as `DATABASE_URL` on a separate recovery/staging API service first. Keep production's existing `DATABASE_URL` unchanged at this stage.
3. From the repository revision being released, install using the lockfile and apply the canonical Drizzle schema with the non-force command:
   `pnpm install --frozen-lockfile`
   `pnpm run db:push`
   Never use `db:push:force`.
4. Apply the repository's additive migrations/repairs in the same order as the canonical production service:
   `pnpm --dir lib/db run migrate:manager-permissions`
   `pnpm --dir lib/db run migrate:payment-transactions`
   `pnpm --dir scripts run migrate:exercise-schema`
   `pnpm --dir scripts run repair:messages-schema`
   `pnpm --dir scripts run repair:connect-schema`
   Apply `lib/db/migrations/0001_legacy_tables.sql` after the core `users` table exists. The SQL migration is additive and idempotent for creation; it is not a substitute for comparing live historical column shapes.
5. Configure the protected owner bootstrap values and run:
   `pnpm --dir scripts run seed:owner`
   On a truly empty database this creates the named account with role `owner`. The script does not print the password or hash. If another `owner` or `admin` already exists, it intentionally refuses to create a competing privileged account; stop and investigate rather than weakening this guard.
6. Start the recovery API so its auth-session and Profile Hub schema initializers can create their additive tables. Confirm the `google_account_links` table exists before attempting Google sign-in. Do not rely on a green health endpoint alone.
7. Verify the owner row is exactly one row for the target email, role is `owner`, and both `is_blocked` and `is_suspended` are false. Verify `google_account_links`, `auth_sessions`, and the Profile Hub tables exist.
8. Open the production Dallyletter login page and use Google sign-in with the Google account whose verified email is exactly `elishamaposa430@gmail.com`. The first successful Google sign-in links that Google subject to the existing owner row. Verify the returned identity is the same owner and the Owner dashboard loads; then verify Owner-only user promotion, teacher application review/approval, and audit access.
9. Only after all checks pass, explicitly switch the canonical API's `DATABASE_URL` to the new internal URL and redeploy/restart it. Confirm the production API health endpoint, owner Google login, Owner dashboard, user promotion, and teacher approval. Keep the old database until the new service is verified and rollback is understood.

## Owner-only acceptance checks

- [ ] PostgreSQL 18 replacement is available in the existing Render workspace.
- [ ] The schema push and all additive migrations/repairs complete without errors.
- [ ] Every Drizzle table and the four legacy tables exist; no migration is skipped silently.
- [ ] Auth session and Profile Hub initializers complete; Google link table exists.
- [ ] Exactly one configured owner account exists for `elishamaposa430@gmail.com`; its role is `owner`, and it is not blocked/suspended.
- [ ] Owner bootstrap password is stored only as an app-compatible scrypt hash; no plaintext password or hash is committed.
- [ ] Google sign-in verifies a Google-issued, verified ID token for the matching email and links to the pre-created owner rather than creating a student.
- [ ] The owner can reach the real Owner dashboard, promote users, and approve/review teacher applications.
- [ ] The API service has the correct new internal `DATABASE_URL`, JWT secret, Google client ID, and exact CORS/app origins.
- [ ] No production cutover occurs until the recovery service passes these checks.

## Explicit limitations

- This PR does not contain a live PostgreSQL dump because the connected SQL path could not reach the source database. A schema rebuild is not a data backup.
- The exact current live database schema may include drift or raw-SQL tables not fully represented by Drizzle. The historical 51-table inventory in `docs/postgres-rebuild-and-restore-runbook.md` is useful evidence, but it is not a substitute for an actual live schema export.
- Object-store files and provider-side secrets are not contained in PostgreSQL or this repository. Reconfigure and verify those separately if those features are needed.
- Do not delete the expiring database until the owner confirms that the only required state is the fresh Owner account and accepts losing all other database records, and the replacement provisioning path is ready.
