# Dallyletter PostgreSQL recovery and recreation runbook

**Purpose:** reproducibly rebuild the schema after a database loss without pretending that schema recreation recovers learner data. Production must remain unchanged until a backup has been restored and tested.

## What the live database looks like (read-only inspection, 14 Oct 2026)

- PostgreSQL 18.6; database name reported by the server: `dallyletter_6kud`.
- 51 public base tables; approximately 13 MB total database size.
- 449 columns and 78 indexes were reported by the PR #31 audit. All 76 inspected foreign keys were validated; no invalid indexes were reported.
- Main feature domains include users/roles, lessons/classes, exercises/questions/answers/submissions/media, assignments, messages and embedded media, study groups, permissions, push subscriptions, polls, notifications, payments, achievements, moderation and audit/activity logs.
- The four tables now declared in `lib/db/src/schema/legacyTables.ts` are `content_permission_requests`, `message_media`, `push_subscriptions`, and `teacher_documents`.
- `message_media.data` and `teacher_documents.data` are PostgreSQL `bytea` blobs. These are small today, but growth is a reason to prefer durable object storage for new media/documents, keeping only object keys and metadata in PostgreSQL where application compatibility permits.
- No public migration-history table was found. The canonical schema and live database had drifted. This runbook and versioned SQL migration begin addressing reproducibility; they do not claim the entire historical schema is already represented by a complete migration chain.

## Complete live table inventory and how the schema works

The live public schema contains these 51 base tables. The canonical Drizzle schema files are the source for each column definition; this inventory is a domain map, not a substitute for the column/default/FK comparison.

- **Identity and audit:** `users`, `activity_log`, `audit_logs`, `ai_actions`.
- **Learning content:** `lessons`, `classes`, `assignments`, `assignment_submissions`, `attendance`, `hand_raises`, `lesson_requests`.
- **Exercises and marking:** `exercises`, `exercise_questions`, `exercise_options`, `exercise_submissions`, `exercise_answers`, `exercise_media`.
- **Chat and communities:** `messages`, `message_media`, `study_groups`, `study_group_members`, `group_member_controls`, `group_settings`, `chat_communities`, `chat_community_groups`, `chat_polls`, `chat_poll_options`, `chat_poll_votes`, `chat_broadcasts`, `chat_broadcast_recipients`.
- **Permissions, follows and moderation:** `content_permission_requests`, `follows`, `content_comments`, `content_flags`, `moderation_actions`.
- **Polls and notifications:** `polls`, `poll_questions`, `poll_options`, `poll_submissions`, `notifications`, `notification_preferences`, `push_subscriptions`.
- **People and engagement:** `achievements`, `user_achievements`, `break_elide_events`, `break_elide_volunteers`.
- **Administration and finance:** `owner_alerts`, `platform_settings`, `payments`, `staff_payments`, `teacher_documents`.

**Relationship pattern:** `users` is the identity root. Learning objects reference their teacher/creator; exercises have questions/options and submissions/answers; group/chat records connect members, messages and polls; notifications and push endpoints target users; audit/activity records provide traceability. Many older raw-SQL tables use explicit foreign keys and named indexes, while content IDs in some polymorphic tables (e.g. comments and permission requests) intentionally identify multiple content types and therefore do not use one FK to several possible tables.

**Observed strengths:** normalized learning entities; primary/unique keys and query indexes; live foreign keys were reported validated; recent targeted exercise orphan checks found no orphans; PostgreSQL supports transactions, JSONB marking/layout fields and bytea binary data; small current footprint means no need for premature sharding or complicated distributed databases.

**Observed risks/limits:** no migration-history table was found; canonical declarations omitted four active tables until this PR; Render reports the database as Free, expiring, without HA or replicas; its network allowlist is `0.0.0.0/0`; persistent object-storage configuration has not been verified; `message_media` and `teacher_documents` store raw `bytea` in PostgreSQL. These are reliability/recovery risks, not evidence that PostgreSQL itself is slow. Do not add speculative indexes or increase CPU before examining real query and metric data.

**Four live legacy-table row counts observed read-only:** `content_permission_requests` 5; `message_media` 8; `push_subscriptions` 5; `teacher_documents` 0. Preserve these rows in any restore. In particular, message-media bytes are actual content, not disposable cache data.

## Restore is different from rebuild

- **Restore** means load a verified data backup, retaining user accounts, lessons, submissions, marks, messages, audit history, and other rows.
- **Rebuild** means create empty tables and indexes from code. It does not recover any of those rows, uploaded objects, or secrets.
- Never delete the current database just because a schema rebuild is possible. First export a custom-format dump with `pg_dump -Fc`, store it outside Render (private object storage or a secured machine), record its SHA-256, and restore it into a separate disposable PostgreSQL 18 target. A backup is not verified until restore succeeds and row/schema checks pass.

## Recreate a Render PostgreSQL instance

1. In Render, create a PostgreSQL **18** instance in the same region as the API (the current service is in Oregon). Choose the lowest plan/storage that actually meets the live workload and backup requirements; do not assume a free instance offers durable backups, PITR, or a restore path. Set storage based on measured growth plus headroom, not the current 13 MB alone.
2. Do not use the temporary database's credentials or hard-code any connection URL. Copy the new database's **internal connection string** into the API service's secret `DATABASE_URL` using Render's dashboard/environment configuration. Keep API and database in the same region, use TLS for external administrative connections, and avoid broad `0.0.0.0/0` access when an internal path suffices.
3. Deploy/build the repository revision intended for release. Confirm the API can reach PostgreSQL with `/api/healthz`; health success alone proves connectivity, not schema completeness.
4. Create the core schema from the canonical Drizzle declarations using a reviewed, non-force schema operation in a staging database first. From repository root, install using the lockfile, then run the db package's `push` script with `DATABASE_URL` set to the **new staging database**. Never run `push-force` against production. Review Drizzle's proposed changes before applying them.
5. Apply `lib/db/migrations/0001_legacy_tables.sql` after the core `users` table exists. It is idempotent for table/index creation, but does not repair columns of an already-existing table. Validate the four table definitions against the schema below and fail the release if they differ.
6. Run only the repository's reviewed, idempotent seed/bootstrap tasks required by the app. Inspect their source first; do not blindly rerun owner/user seeds against a restored database. Avoid automatic destructive seeding.
7. Restore the verified dump into a separate target before cutover when preserving data. For a schema-only empty rebuild, verify all expected tables, columns, defaults, constraints, indexes and sequences; then run authenticated API smoke tests against that isolated target.
8. Only after restore-test, feature checks, storage checks, and CI/Release Safety pass should an owner schedule a controlled cutover. Keep the old database intact until the new database is confirmed healthy and the rollback path is proven.

## Backup and restore-test checklist

Run these commands from a trusted machine with PostgreSQL client tools and a connection URL supplied through a secret environment variable (never paste the URL into logs/chat/shell history):

```sh
umask 077
pg_dump --format=custom --no-owner --no-acl --file=dallyletter-$(date -u +%Y%m%dT%H%M%SZ).dump "$DATABASE_URL"
sha256sum dallyletter-*.dump
pg_restore --list dallyletter-*.dump >/dev/null
```

Then create a **separate** disposable PostgreSQL 18 database and restore into it:

```sh
pg_restore --exit-on-error --no-owner --no-acl --dbname="$RESTORE_TEST_DATABASE_URL" dallyletter-YYYYMMDDTHHMMSSZ.dump
```

Do not set `DATABASE_URL` and `RESTORE_TEST_DATABASE_URL` to the same target. Check that restore has completed without errors, compare table/column/index/FK counts, verify important row counts and sequences, and run authenticated learner/teacher/manager/owner regression tests. Keep the dump encrypted/private and restrict access. A checksum proves file integrity, not that a restore works.

## Persistent media configuration verification

The API code expects these Render API-service environment variables for S3-compatible object storage:

- `MEDIA_S3_ENDPOINT` — the provider endpoint URL (for Cloudflare R2, the account's R2 S3 endpoint).
- `MEDIA_S3_BUCKET` — existing bucket name.
- `MEDIA_S3_ACCESS_KEY_ID` and `MEDIA_S3_SECRET_ACCESS_KEY` — credentials with only the required bucket/object permissions.
- `MEDIA_S3_REGION` — optional in code; Cloudflare R2 commonly uses `auto`.

The service-details API used during this audit does not expose environment-variable presence, and I did not read or change secrets. Therefore, **the current live R2 configuration is unverified**. An operator should inspect only whether each variable is set in the Render dashboard; never copy the secret value into logs, GitHub, a PR, or chat.

After checking presence, use a staging bucket and test: authenticated upload; object exists in the bucket; API process restart; authenticated stream and byte-range/PDF/audio preview; unauthorized request denied; deletion removes the object and metadata; and a second read confirms deletion. Repeat with a production-safe test object only after staging passes. The current upload path stages files on local disk temporarily, but local disk is not the durable source of truth. Also note that teacher documents and legacy message media currently use database `bytea` storage; the R2 test does not prove those two features use R2.

## Capacity and performance strategy

- Start with a small paid PostgreSQL plan only if its connection, backup, and recovery guarantees are necessary; otherwise use a genuinely persistent free/low-cost provider only after evaluating expiry, backups, storage caps, CPU/RAM, sleeping, and egress. Cheapest is not cheapest if it risks student records.
- Keep API and DB in the same region. Reuse a bounded `pg.Pool`; size the pool for all service instances together, not each instance independently. Set connection and statement timeouts, use parameterized SQL, and monitor active connections/CPU/memory/storage.
- Add indexes only for measured query paths; indexes consume storage and slow writes. Use `EXPLAIN (ANALYZE, BUFFERS)` on staging with representative data before adopting query/index changes.
- Keep uploaded media in durable R2/S3-compatible storage, not Render ephemeral filesystem. Verify upload, restart persistence, authenticated stream/download, and deletion before calling media reliable.
- Keep secrets out of Git, logs and diagnostics. Narrow network access only after the API's actual connection route is verified.

## Release gates (must all pass)

- [ ] External backup created, checksum recorded, `pg_restore --list` succeeds.
- [ ] Restore test into a separate PostgreSQL 18 database succeeds; critical row counts and sequences verified.
- [ ] Canonical Drizzle declarations cover all live tables/columns with matching SQL types, nullability, defaults, FK delete rules and indexes.
- [ ] Versioned migration path is documented and tested from an empty database and against a database where the four legacy tables already exist.
- [ ] Render `MEDIA_S3_*` secrets/configuration checked without exposing values; R2 upload/restart/stream/delete passes.
- [ ] Authenticated learner, teacher, manager, owner flows and exercises, media, permission requests, messages, push subscriptions and documents pass.
- [ ] CI and Release Safety pass on the exact PR head; production deployment is tied to that commit.
- [ ] PR #31 stays draft and production remains unchanged until every gate passes.
