# Database deployment and backup

The project uses managed PostgreSQL for production. The database is independent from the frontend and API deployments.

## Canonical service

- Render API service: DALLYLETTER-ELIDEMS-Smart-CAPS-LMS-4
- Repository: elishamaposa29-oss/DALLYLETTER-ELIDEMS-Smart-CAPS-LMS
- Branch: main
- Database connection: Render-managed DATABASE_URL secret (never paste its value into logs, commits, or public tickets).

## New database behavior

A newly created PostgreSQL database is empty. Connecting it does not restore users, lessons, exercises, submissions, marks, or other records from an old database. The build initializes the application's canonical schema, but schema creation alone does not prove the app's workflows are functional.

## Before deleting an old database

1. Confirm the current Render deployment uses the intended database.
2. Confirm all expected tables/columns exist.
3. Verify signup, login, owner provisioning, and role permissions.
4. Verify create/save/reload flows for lessons, exercises, submissions, marking, polls, groups, and lesson requests.
5. Check application logs for SQL errors and confirm data survives reload/restart.
6. Get explicit owner confirmation before permanently deleting the original database.

## Backups

A backup is not verified until a real database dump has been created securely and restored successfully to an isolated database. Keep secrets out of Git. For production migrations, prefer versioned, tested migrations and an explicit rollback plan; do not rely on an unreviewed destructive schema push.

See [DATABASE-MIGRATION-AND-RECOVERY.md](DATABASE-MIGRATION-AND-RECOVERY.md) for the full safety-first runbook.
