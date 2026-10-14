# DALLYLETTER ELIDEMS backend and PostgreSQL audit — 2026-10-14

## Scope and safety

Inspection was performed against the connected Render service and live Render PostgreSQL using the Render read-only SQL query interface. No SQL writes, schema changes, environment-variable changes, backups, restores, or production deployments were performed during the inspection.

- API service: `DALLYLETTER-ELIDEMS-Smart-CAPS-LMS-4`
- API URL: `https://dallyletter-elidems-smart-caps-lms-4.onrender.com`
- PostgreSQL service: `dallyletter-db-temp`
- Database: `dallyletter_6kud`
- PostgreSQL version: `18.6`
- Inspection time: `2026-10-14 17:58 UTC`
- Database service state: `available`
- Expiry reported by Render: `2026-10-15 14:30:34 UTC`

## Observed database health

Read-only catalog queries returned:

- 51 public base tables
- 449 public columns
- 473 catalog constraints (this includes PostgreSQL's generated NOT NULL constraints, not just keys)
- 78 public indexes
- 76 foreign-key constraints; all 76 were validated
- 0 invalid or not-ready indexes
- 0 unvalidated foreign keys
- No migration/drizzle/schema-history table in the public schema
- Four exercise relationship checks returned zero orphan rows: question → exercise, option → question, answer → submission, and non-null media question → question.

These checks are useful signals, not proof that every application query matches every live column. A source-level comparison across all 23 Drizzle schema modules identified 47 table declarations and 418 expected columns. No expected columns were missing for the matched live tables. The four live tables with no matching table declaration in the checked-in Drizzle schema are `content_permission_requests`, `message_media`, `push_subscriptions`, and `teacher_documents`. Their live columns, keys, foreign keys, and indexes were inspected separately; they are currently managed outside the canonical Drizzle table declarations (raw SQL/legacy storage paths). Column types/defaults/nullability across the full schema still need a complete comparison before approving any migration.

The live database contains application data (including users, lessons, exercises, submissions, messages, media metadata, notifications, and audit records). Do not reset or replace it.

## Log findings

The supplied PostgreSQL log excerpt shows successful authentication and authorization for `dallyletter_user` and successful TLS connections for `postgres`. The excerpt alone does not establish a connection failure.

The API's 12–13 October logs include:
- `POST /api/lessons/media` → HTTP 503
- `POST /api/assignments/material` → HTTP 503
- `POST /api/polls/ai-generate` → HTTP 500
- repeated bare `ELIFECYCLE Command failed.` messages without adjacent causal stack traces.

The 503 log entries show the HTTP logger reporting the status code; they do not expose the underlying storage-provider cause. A read of the 14 October request-log window returned no HTTP 500/503 request records in the queried time range. This does not prove all features are healthy.

## Changes in this PR branch

1. Media persistence now removes its temporary staged file when an object-storage upload fails, reducing risk of filling ephemeral Render disk during a storage outage.
2. Lesson and assignment media-upload failures now emit structured server-side diagnostics, including whether object storage is configured, while returning stable error codes to the client. Secrets are not logged.
3. AI poll generation validates topic/grade/subject/count inputs, caps generated questions at 20, refuses to present mock-provider placeholder questions as real generated content, validates the provider response shape, logs upstream failures server-side, and returns a non-secret generic upstream error to clients.
4. No database schema or data mutation is included in these code changes.

## Required release gates — still open

1. **Back up and restore-test PostgreSQL before expiry.** The available Render connector exposes read-only SQL and no backup/export action. This PR does not create or claim a backup. Use Render's supported backup/PITR/export workflow or a secured `pg_dump` from a trusted environment; store the backup outside the expiring service and perform a restore test to a separate target.
2. Decide how to version and reconcile the four raw-SQL/legacy tables (`content_permission_requests`, `message_media`, `push_subscriptions`, `teacher_documents`) with the canonical schema without duplicating or dropping existing constraints; finish type/default/nullability comparison before applying any migration.
3. Replace ad-hoc schema repair scripts/build-time database mutation with versioned, ordered, idempotent migrations and a migration ledger, after rehearsing against a restored copy.
4. Verify the live `MEDIA_S3_*` configuration without exposing secret values; test upload → reload/restart → authenticated stream/range playback → deletion → confirm missing after restart.
5. Inspect provider configuration without exposing API keys; test real AI poll generation and a provider-outage path.
6. Run CI and Release Safety on the latest PR head; run authenticated learner/teacher/manager/owner regression tests; deploy only after gates pass.
7. Confirm which of the similarly named Render services are canonical and whether old services have consumers before changing or deleting anything.

## Deployment decision

**Not production-ready for merge/deploy yet.** CI and Release Safety were still in progress on the latest PR head at the time of this report. The temporary PostgreSQL expiry and unverified backup/restore are the highest-priority operational risks. Production has not been changed by this PR branch.
