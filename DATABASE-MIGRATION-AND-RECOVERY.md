# Database Recovery and Migration — Safety-First Runbook

This document is a procedure, not permission to alter production. **Do not delete, replace, or overwrite the existing Render database. Do not create another API service or add a database to `render.yaml`.**

## Current recovery rule

The repository contains source code and recovery instructions, but it does **not** contain a verified PostgreSQL data dump. GitHub source backups are not database backups. A new PostgreSQL instance starts empty; Render does not copy data from the suspended database into it automatically.

## 1. Protect the original database first

1. Open the existing database in Render: https://dashboard.render.com/d/dpg-dakld2gu01pc73fi0u9g-a
2. Keep it and its dashboard entry intact. Do not delete it, rename resources to imitate it, or run migrations against it.
3. Check the database page for any available resume, recovery, snapshot, or export option. If the UI does not offer one, contact Render support and ask whether the suspended instance or its data can still be recovered. Do not assume a recovery window exists.
4. Do not paste credentials, connection strings, learner data, or database dumps into GitHub, issues, or chat.

## 2. Export the original database before creating a replacement

Only if the original database becomes reachable and its connection URL is confirmed, use a trusted computer with PostgreSQL client tools. Put the URL in a private environment/secret manager, not directly in a command or shell history.

```sh
umask 077
pg_dump -Fc "$DATABASE_URL" -f "dallyletter-db-backup-$(date +%F).dump"
pg_restore --list dallyletter-db-backup-YYYY-MM-DD.dump > backup-contents.txt
sha256sum dallyletter-db-backup-YYYY-MM-DD.dump > backup.sha256
```

Use the actual generated filename in the last two commands. Check that the dump is non-empty, the archive listing succeeds, and the checksum file is created. Store the dump and checksum outside GitHub in protected storage. A successful command alone is not proof of a successful restore; restore-test into a separate disposable database when possible.

If `pg_dump` fails, stop. Do not create an empty replacement and call it a backup.

## 3. Only then create a separate recovery database

Create a new Render PostgreSQL instance only after a valid source dump exists, or after the owner explicitly accepts that the new database will be empty and the old data may be unrecoverable.

- Create exactly one database for the recovery target; do not create a second copy of any Render web/API service.
- Keep the original database unchanged.
- Restore only into the confirmed empty target, using its private connection URL:

```sh
pg_restore --no-owner --no-acl --dbname="$TARGET_DATABASE_URL" dallyletter-db-backup-YYYY-MM-DD.dump
```

Do not use `--clean` on a shared or production database. Confirm the target hostname/database name before running any restore.

## 4. Prevent duplicate services and mismatched connections

- The checked-in `render.yaml` defines web services only; it intentionally declares no PostgreSQL resource. Do not add a database resource to it as part of recovery.
- Creating a database in the Render dashboard does **not** automatically restore data or guarantee that the existing API uses it.
- Do not create a new Render API/Web Service from the Blueprint during database recovery. Inspect and retain the existing canonical service.
- Do not change the live API's `DATABASE_URL` until the target has been restored and verified. Then update the existing API service's secret to the target's **internal** database URL, if available in the same Render region, and redeploy that existing service only.
- Keep staging and production databases separate. Never point both environments at the same database accidentally.

## 5. Verify before switching production

1. Verify expected tables with `psql "$TARGET_DATABASE_URL" -c '\\dt'`.
2. Run the repository's read-only database verification script if available.
3. Confirm table counts and key records without exposing personal data; test login and representative learner/teacher flows in a safe test environment.
4. Check `/api/healthz` and Render logs for successful DB connection, with no stale hostname errors.
5. Keep the original database untouched until the owner confirms the recovered app works and a separate backup has been verified.

## 6. Application schema cautions

The repository uses Drizzle schema-push behavior and has no checked-in SQL migration history. Do not run `pnpm db:push`, `push-force`, seed scripts, or schema-repair scripts against the old database or a recovery target before restoring and reviewing the schema. Schema-push is not a backup or data-recovery mechanism.

## 7. If the original database cannot be recovered

Stop before switching production. A new database will not contain existing accounts, lessons, messages, or other database records unless a verified dump can be restored. Report this as a data-loss risk and obtain an explicit decision before proceeding with an empty database.
