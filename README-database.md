# Database deployment and backup

This project uses managed PostgreSQL for production. The database is independent from the frontend and API deployments.

## Critical recovery rule

**A GitHub repository backup is not a PostgreSQL data backup.** The repository currently has no verified database dump. Creating a new Render PostgreSQL instance creates an empty database; it does not import data from the suspended instance or automatically update the existing API's `DATABASE_URL`.

Follow [DATABASE-MIGRATION-AND-RECOVERY.md](DATABASE-MIGRATION-AND-RECOVERY.md) before creating or switching databases. Preserve the original database and export it first if it becomes accessible. Do not create duplicate API services or add a database to `render.yaml` during recovery.

## Backup and restore policy

- Create regular backups from the managed PostgreSQL provider or use `pg_dump` when authorized access is available.
- Store dumps and checksums in protected storage outside GitHub; never commit database contents or connection secrets.
- Verify the archive with `pg_restore --list` and test a restore into a separate empty database.
- Keep staging and production databases separate.
- Never run production schema changes from development branches.
- Do not use `pnpm db:push` or `pnpm db:push:force` as a recovery method.

## Connection configuration

The existing API reads `DATABASE_URL` from its Render environment/secret settings. When changing databases, update the existing canonical API service only after restoring and verifying the target. Use the current connection URL supplied by Render; do not hard-code a hostname into source.

## Troubleshooting

- `getaddrinfo ENOTFOUND`: verify the hostname in the existing API's `DATABASE_URL`.
- SSL/TLS error: use the provider's required TLS settings and connection URL.
- Authentication failure: verify credentials privately; do not post secrets into logs or GitHub.
- Migration error: stop, preserve the source, and compare schema in a safe recovery target first.
