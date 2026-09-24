# Database Migration and Recovery

This is a runbook, not an instruction to change production. Do not run a migration against the suspended Render database or any production URL until access, target, and backup verification are confirmed.

## 1. Provision a recovery target

Create a PostgreSQL 16-compatible database with backups, retention, TLS, and a documented restore process. Do not delete or replace `dallyletter-db` while its Render recovery options remain available.

## 2. Install client tools

On Debian/Ubuntu: `sudo apt-get update && sudo apt-get install postgresql-client`. Verify `pg_dump`, `pg_restore`, and `psql` before proceeding.

## 3. Back up a resumed source

Only after the source is accessible and the URL is confirmed:

```sh
umask 077
pg_dump -Fc "$DATABASE_URL" -f "dallyletter-db-backup-$(date +%F).dump"
pg_restore --list dallyletter-db-backup-YYYY-MM-DD.dump > backup-contents.txt
```

Review the list and keep the dump and checksum in protected storage. Never put `DATABASE_URL` or a password in shell history or documentation.

## 4. Restore to a new database

Set the target URL only in the current shell or an approved secret manager, then restore into the empty target:

```sh
export TARGET_DATABASE_URL='postgresql://...'
pg_restore --clean --if-exists --no-owner --no-acl --dbname="$TARGET_DATABASE_URL" dallyletter-db-backup-YYYY-MM-DD.dump
```

`--clean` is appropriate only for a confirmed empty recovery target. Never use it against the source or a shared production database.

## 5. Drizzle configuration

`lib/db/drizzle.config.ts` requires `DATABASE_URL` and points to `lib/db/src/schema/index.ts`. This repository has no checked-in SQL migration directory. `pnpm --filter @workspace/db run push` is schema-push behavior, not a reviewed production migration history. Do not use `push-force` for recovery. Restore first and compare schema before any controlled change.

## 6. Configure and start the backend

Configure `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS`, `NODE_ENV=production`, and host-provided `PORT` in the backend secret/environment store:

```sh
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/api-server run start
```

## 7. Verify without exposing secrets

With `DATABASE_URL` set in a private shell, run `pnpm exec node scripts/db-verify-readonly.mjs`. Check `/api/healthz`, then use `psql "$DATABASE_URL" -c '\dt'` to verify expected tables. Do not paste connection strings or personal data into logs.

## 8. Verify application functionality

Using an approved test account, verify registration/login, role dashboards, lessons/classes, messages, notifications, payment configuration, AI configuration, and media URLs. Confirm frontend CORS. Do not seed or mutate production until approved; `scripts/src/seed-owner.ts` is not an automatic recovery step.
