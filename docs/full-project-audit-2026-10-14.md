# DALLYLETTER ELIDEMS full-project audit — 2026-10-14

## Status and safety boundary

This is a verified inventory of the connected GitHub, Render, Vercel and read-only PostgreSQL surfaces inspected on 14 October 2026. It is not a claim that every interactive feature, app-store account, provider credential, or device has been tested. No production deployment, live schema/data mutation, secret rotation, service deletion, or database backup/restore was performed by this audit.

## Repository and delivery inventory

- Canonical repository: `elishamaposa29-oss/DALLYLETTER-ELIDEMS-Smart-CAPS-LMS`; default branch `main`.
- The recursive Git tree returned 519 entries, not truncated. It includes `artifacts/dallyletter` (React/Vite web/PWA), `artifacts/api-server` (Express API), `artifacts/dallyletter-mobile` (Expo), shared `lib/`, `scripts/`, `.github/workflows/`, docs and attached assets.
- Visible branch search returned 37 named branches including `main`, `production`, `staging`, `DEMx-Development-Mode-📳😏`, the integration branch, exercise foundations and several recovery branches. This is a returned search page, not proof of exhaustive pagination beyond its cursor.
- Five open PRs were found: #31 (draft recovery), #28 (production recovery), #25 (previews/notifications/follows/exercises/monitoring), #17 (UI/UX), and #1 (owner/admin settings). Do not merge overlapping historical branches independently; compare unique commits and changed files against current main.
- Main at inspection: `7e156a590e32b168aacf12c06426384dc356d43f`. Render and Vercel production deployment metadata both pointed at this commit.
- PR #31 head `a3d9be085630ca559956816425844ba5e3575699` had successful GitHub Actions CI and Release Safety runs on 14 October. Those checks prove the configured static/build/safety gates, not backup/restore or authenticated production regression.

## Verified infrastructure risks

1. **Expiring database:** Render database `dallyletter-db-temp`, database `dallyletter_6kud`, PostgreSQL 18.6, reported `available`, Free plan, no HA/read replicas, expiry `2026-10-15T14:30:34Z`. It has application data and must not be deleted/reset. An external backup and separate-target restore test are not complete.
2. **Broad DB allowlist:** Render reports `0.0.0.0/0`. Verify the API's actual internal connection path before restricting; do not risk locking out the service.
3. **Duplicate services/projects:** Render lists six similarly named API/web services and one PgHero service. Vercel lists 13 similarly named projects attached to the same repository; at least some deployments are SSO-protected and some old projects have their own domains. This can cause duplicate builds, deployment-rate-limit errors, and testing the wrong deployment. Do not delete anything until traffic, aliases, environment variables and database consumers are mapped.
4. **Production schema workflow failure:** GitHub Actions run for the `Apply production Drizzle schema` job failed at `Verify production database secret`; the schema apply and verification steps were skipped. The workflow URL is https://github.com/elishamaposa29-oss/DALLYLETTER-ELIDEMS-Smart-CAPS-LMS/actions/runs/38272107785/job/114888623414. This is a missing/unavailable GitHub production `DATABASE_URL` secret in that workflow context, not evidence that the live database is down. Keep this gate fail-closed until an approved secret/connection is configured.
5. **Potentially risky blueprint behavior:** `render.yaml` currently defines a production pre-deploy `pnpm run db:push`, and build-time schema repair/seed commands. A Drizzle push can mutate schema, and seeds/repairs run during build can have side effects. Rehearse on a restored staging copy and use reviewed ordered migrations before enabling this blueprint for production. The currently inspected live Render service's settings are not identical to every declaration in the blueprint.
6. **No custom-domain inventory in Vercel account-level domain query:** project-specific Vercel domains do exist. Store listings and certificates for Microsoft Store, Apple App Store, and Google Play were not independently verified because those provider accounts are not available through the connected tools in this audit.

## Live database facts

Read-only queries found 51 public base tables, 449 columns, 76 foreign keys (all validated), zero invalid indexes and zero unvalidated foreign keys. No migration-history table was found in the public schema. Approximate database size reported by the recovery runbook is 13 MB. The database contains real user, lesson, exercise, submission, message/media, notification and audit data.

The four live legacy tables were missing from main's canonical Drizzle schema index at the inspected main commit:
- `content_permission_requests` (5 estimated rows)
- `message_media` (8 estimated rows; includes `bytea` content)
- `push_subscriptions` (5 estimated rows)
- `teacher_documents` (0 estimated rows)

PR #31 adds declarations and `lib/db/migrations/0001_legacy_tables.sql` on its draft branch. The migration is additive and does not rewrite existing table shapes. It still needs full type/default/nullability/FK/index comparison, testing from an empty database, and safe testing against the current table shapes. No database mutation was performed by this audit.

## Application/API evidence

- The Render API service `DALLYLETTER-ELIDEMS-Smart-CAPS-LMS-4` is attached to the canonical repository and deploys from `main`; latest recorded successful deploy uses the main commit above.
- Render logs include repeated HTTP 503 responses for `POST /api/lessons/media` and `POST /api/assignments/material`, HTTP 500 for `POST /api/polls/ai-generate`, and HTTP 503 for `POST /api/email/send` (12–13 October). Those status codes alone do not establish the underlying provider/configuration cause.
- PR #31 contains code intended to clean staged files when object-storage upload fails, add bounded non-secret upload diagnostics, and reject placeholder/mock AI poll output instead of representing it as genuine AI output. These are PR-branch changes, not production fixes until released and tested.
- Persistent R2/S3 configuration and full upload → restart → authenticated stream/range preview → delete → verify-deleted remain unverified. The connector used for this audit does not expose the configured Render secret values, and no values were read or copied.
- Authenticated learner/teacher/manager/owner end-to-end tests have not been completed in this audit because no production user tokens/session were supplied to the testing interface. Do not infer role security from a successful health check.
- Payment routes/configuration and optional AI provider integrations are represented in repository docs/code, but real provider credentials, webhook signatures, successful settlement/refund paths, email delivery, VAPID delivery, offline replay, and background behavior have not been verified against real providers/devices.
- The repository includes a web manifest, Vite/PWA-related configuration and Expo EAS profiles for Android APK/App Bundle. This does not prove the current installed APK, Play Store/App Store releases, Microsoft Store packaging, offline behavior, push delivery, or device compatibility.

## Security and secret handling

- The repository's secret inventory documents names such as `DATABASE_URL`, `JWT_SECRET`, optional AI/payment provider keys, but no raw values were placed in this audit.
- A Vercel environment-variable inventory query returned no environment records through the connected interface; this result does **not** prove that the projects have no variables. Confirm required variable presence through each canonical host's dashboard without copying values into GitHub/chat/logs.
- No credential rotation is recommended solely from this inspection. Rotate only if a real exposure is established, then update all consuming services and verify rollback.
- Do not expose secrets while scanning. Search tracked files for key-shaped strings and verify any suspected match in context before classifying it as a live credential.

## Ordered completion plan

### P0 — protect data before expiry
1. Use a trusted machine or supported Render export/backup route to create an encrypted external custom-format PostgreSQL dump. Record SHA-256; `pg_restore --list` must pass.
2. Restore the dump to a separate PostgreSQL 18 test database. Compare table/column/index/FK counts, important row counts and sequences. A schema-only rebuild is not a data backup.
3. Preserve the expiring DB until restore and cutover are verified. If a trusted machine/export route is unavailable, the database owner must perform the backup immediately through Render's supported interface; this connected read-only SQL interface cannot create or download a dump.

### P1 — schema and deployment safety
4. Finish full schema comparison; reconcile the four legacy tables; establish ordered versioned migrations and a migration ledger. Test both empty rebuild and existing-table no-op paths.
5. Resolve the production schema workflow secret failure through approved host secret management, then run against a restored test target first. Never silently mark a missing-secret gate as successful.
6. Reconcile the live Render service configuration with `render.yaml`; remove automatic production schema pushes/build-time data mutations unless a reviewed migration gate safely replaces them.
7. Map canonical Render/Vercel targets, aliases, domain ownership, traffic and secret-variable presence. Disable duplicate deployment triggers only after confirming no users/consumers rely on them.

### P2 — feature and release validation
8. Test real R2 storage lifecycle and legacy bytea-backed document/message media separately.
9. Test real AI provider success, malformed responses, timeouts and provider outage; verify no fake success.
10. Test payment provider test-mode checkout, signed webhooks, duplicate event idempotency, refund/error paths and ledger reconciliation before enabling live payments.
11. Run authenticated role matrix tests for learner, teacher, manager, senior manager and owner across lessons, exercises, marking feedback, assignments, group/chat, permissions, notifications, push subscriptions, moderation and settings.
12. Test PWA install/update/offline queue/reconnect, low-end Android performance, mobile APK/App Bundle, accessibility and responsive layouts. Verify email, VAPID push, background jobs and analytics only with actual provider/device evidence.
13. Run CI, Release Safety, a deployment tied to the exact integration commit, smoke tests, authenticated regressions and post-deploy log review. Keep PR #31 draft and production unchanged until the data-recovery and release gates pass.

## Completion standard

A task is complete only when the change is implemented in the intended branch, automated checks pass, the relevant real integration is tested, and the result is recorded. Untested, inaccessible, planned, mocked, and provider-dependent items remain explicitly open. No claim of 109% reliability or error-free status is technically supportable.
