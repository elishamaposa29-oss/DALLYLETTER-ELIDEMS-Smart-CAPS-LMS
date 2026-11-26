# Database recreation and recovery — Dallyletter Elidems

**Purpose:** safely provision a replacement PostgreSQL database through a Render Blueprint when the owner explicitly chooses to create a new database. This is infrastructure-as-code, not an automatic database deletion or a claim that the current database has been backed up.

## 1. Critical rule

The existing Render database `dallyletter-db-temp` (`dallyletter_6kud`) was reported available but scheduled to expire at `2026-10-15T14:30:34Z`. Treat it as production data until a verified restore/cutover proves otherwise. Do not delete it, reset it, or point the live API at an empty database.

A new PostgreSQL instance is **empty**. Creating it does not restore learners, lessons, exercises, submissions, messages, media metadata, payment records, audit logs or other data. A schema push is not a data migration.

## 2. Provisioning configuration

Use the separate [`render.database-rebuild.yaml`](../render.database-rebuild.yaml) Blueprint. It intentionally defines only the new database so syncing it cannot silently retarget existing API services or trigger a production build/schema push.

Recommended initial production setting is PostgreSQL 18 in Oregon on Render's `basic-1gb` plan, with no public IP allowlist entries. Same-region Render services should use the **internal** database connection string. This is a cost/performance starting point, not a promise of zero downtime; review current Render pricing and the available plan name before provisioning.

### Create it when you are ready

1. In Render, create a **New Blueprint Instance** from the repository and select `render.database-rebuild.yaml` as the Blueprint file, or use Render's supported Blueprint sync flow with that file.
2. Review the resource diff. It must show only a *new* database named `dallyletter-postgres-rebuild`. Cancel if it proposes deleting, replacing or changing any existing service/database.
3. Review the region, PostgreSQL major version, plan and IP allowlist. Keep the public allowlist empty; do not use `0.0.0.0/0`.
4. Provision only after the above diff is correct. Record the new database's internal hostname, database name, role and resource ID in the owner's password manager/infra inventory. Never commit the connection string.

## 3. Backup first, then restore data

From a trusted machine with PostgreSQL 18 client tools and authorized access, use the database's **external/internal connection URL only in your local shell**. Avoid pasting credentials into ChatGPT, issues, logs, shell history or repository files.

Example for a custom-format dump (replace the shell variable securely; do not put a real URL in the command text):

```bash
umask 077
read -rsp 'Source DATABASE_URL: ' SOURCE_DATABASE_URL; echo
export SOURCE_DATABASE_URL
pg_dump --format=custom --no-owner --no-acl --verbose \
  --dbname="$SOURCE_DATABASE_URL" --file=dallyletter-pre-expiry.dump
unset SOURCE_DATABASE_URL
sha256sum dallyletter-pre-expiry.dump
pg_restore --list dallyletter-pre-expiry.dump > dallyletter-pre-expiry.contents.txt
```

- Confirm the dump is non-empty and the archive listing succeeds.
- Store the dump and checksum encrypted in a separate account/location from Render.
- Restore to the new database first, not the current live database. Use the new database's internal URL when running from a same-region Render job, or its authorized external URL from a trusted machine.
- A restore may need `--no-owner --no-acl` and a target role. Review errors; do not ignore missing tables, constraints or sequences.
- Compare table and column inventories, constraints/indexes, key row counts, sequence values, recent lesson/exercise/submission/message records, and media object references. Test the application against the restored database before cutover.
- Keep the original source unchanged until the restored target and rollback plan are accepted.

## 4. Connect the API only after restore verification

Set `DATABASE_URL` on the **staging/recovery API first** to the new database's internal connection string. Do this in Render's environment-variable UI or a protected secret-management integration. Never commit the value.

Use this order:
1. Run the repository's schema comparison and reviewed, versioned migrations against the restored target.
2. Deploy the API to a separate recovery/staging service and wait for `/api/healthz`.
3. Test login, role authorization, lesson/exercise reads, submission/marking, messages, notifications and media with test accounts.
4. Check logs and database connections; confirm no data writes are landing in the old database.
5. Only then schedule a controlled cutover for the canonical API, with a rollback route to the old connection while the old database remains available.

Do **not** run `drizzle-kit push --force`, run seeds against a database containing real data, or allow a production build to perform destructive schema changes.

## 5. Why the current production Blueprint is not the recreation file

The current root `render.yaml` includes a production `db:push` pre-deploy and build-time repair/seed commands. Those are not suitable as the first action against a replacement production database until schema declarations are reconciled, the data restore is validated, and migrations have been rehearsed. This dedicated file avoids implicitly deploying those existing services.

## 6. Secure network access

The old database was observed with `0.0.0.0/0` in its IP allowlist. For the replacement:
- Leave the public allowlist empty by default.
- Use Render's private/internal connection string for Render-hosted API/worker services in the same region.
- If external access is genuinely required, add only the operator's stable trusted IP as a temporary narrow CIDR, then remove it after use.
- Confirm the API is using the internal URL before tightening the *existing* database allowlist; changing the old database before proving the connection route could cause an outage.

## 7. Cost and reliability

- Start at the smallest paid PostgreSQL plan that meets measured memory/connections/latency; `basic-1gb` is the suggested starting point for this school app, not a guarantee of capacity.
- Measure database CPU/memory, active/idle connections, slow queries and disk growth after launch; upgrade only from observed pressure.
- Keep a tested external backup with documented retention and a scheduled restore drill. Availability, a green health endpoint, and a schema-only rebuild are not backups.
- Add connection pooling only after checking the application's existing `pg` pool behavior and the provider's connection limit. Do not add Redis simply because it is on the wish list; introduce it only for a demonstrated cache/queue requirement.

## 8. Acceptance checklist

- [ ] Blueprint diff contains only the intended new database.
- [ ] New database is PostgreSQL 18 and uses internal-only networking by default.
- [ ] External dump has a recorded checksum and valid archive listing.
- [ ] Dump restores to the new database without unexplained errors.
- [ ] Table/column/FK/index/sequence inventories and representative row counts match.
- [ ] Recovered API passes authenticated staging tests.
- [ ] Persistent R2/S3 objects are independently checked; PostgreSQL restore does not restore object-store files by itself.
- [ ] Canonical service cutover and rollback are explicitly approved.
- [ ] Old database is retained until data and traffic verification is complete.
