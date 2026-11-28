# Dallyletter Elidems infrastructure cost optimization

**Scope:** original Dallyletter Elidems LMS repository only. Keep Render as the application backend unless measured evidence justifies a change. Reduce Render egress by moving durable media delivery to Cloudflare R2 and a controlled delivery edge. Evaluate an external PostgreSQL provider without sacrificing records, authorization, backups, recovery, or application behavior.

**Safety:** this document does not authorize production database changes, production deployments, billing changes, data deletion, or disabling existing services. All implementation is additive and must be reviewed through this branch and pull request.

## Current architecture discovered

- Canonical repository: `elishamaposa29-oss/DALLYLETTER-ELIDEMS-Smart-CAPS-LMS` (not LMS4).
- API: Express 5 under `artifacts/api-server`; database access uses `pg` + Drizzle under `lib/db`.
- Render's `DALLYLETTER-ELIDEMS-Smart-CAPS-LMS-4` service points at this repository's `main`, root directory `artifacts/api-server`, Oregon. Render reported this service suspended with the `Monthly Quota Exceeded` suspender on 2026-11-22. Other duplicate services are also suspended; do not assume any of them is safe to delete.
- Render currently lists two recovery PostgreSQL instances, both suspended. The first recovery instance has an expiry of 2026-11-16 (already passed); Recovery-2 has an expiry of 2026-12-15. Their existence/status does not prove which database is currently canonical production.
- The latest checked-in database recovery runbook records a prior read-only snapshot of PostgreSQL 18.6, 51 public tables and approximately 13 MB, with user/role, learning, assignment, exercise, chat, permissions, payments and audit data. It also records legacy `message_media` and `teacher_documents` bytea tables. This is historical evidence, not a current backup or current live DB verification.
- Existing object storage adapter is S3-compatible and already reads `MEDIA_S3_ENDPOINT`, `MEDIA_S3_BUCKET`, `MEDIA_S3_ACCESS_KEY_ID`, `MEDIA_S3_SECRET_ACCESS_KEY`, and optional `MEDIA_S3_REGION`. The media layer currently proxies object reads through the API and falls back to PostgreSQL chunk storage for files up to 20 MiB when object storage is unavailable. This means simply configuring R2 will not remove media egress from Render.
- R2 account API discovery returned Cloudflare error 10042: enable R2 in the Cloudflare Dashboard. No bucket was created and no Cloudflare resource was changed.

## Workstreams

### A. Move media delivery off Render safely

1. Inventory every upload/download path, including lesson media, assignment materials/submissions, exercise question/answer media, group covers, profile covers, hand-raise media, voice messages, teacher CV/documents and legacy message media.
2. Classify each resource as public, authenticated/private, or owner/role-restricted. Never expose private educational records through a public bucket.
3. Add an R2 storage adapter using the existing S3-compatible configuration. Keep object keys and metadata in PostgreSQL; do not store new large binary payloads in PostgreSQL or Render ephemeral disk.
4. Add direct-to-R2 resumable/multipart uploads where supported. API issues narrowly scoped, short-lived upload authorization only after existing backend authorization checks.
5. For downloads, use an authenticated delivery edge (Cloudflare Worker on a custom media hostname) that validates short-lived, object-scoped signatures issued only after the existing API authorization checks, then reads R2 and supports HTTP Range requests. Do not redirect private media to permanent public object URLs. Cache only explicitly public immutable objects; private/learner-specific material must use private/no-store or carefully scoped cache keys and short TTLs.
6. Preserve existing API media URLs as compatibility entry points during rollout. They may authorize then redirect/proxy to the edge; existing consumers must not break.
7. Migrate existing object-backed media first. Migrate database bytea/local-disk legacy media only with verified object checksums, metadata reconciliation, reference updates and rollback. Do not delete source rows/files until restore and retrieval verification passes.
8. Test web and Android upload, preview, playback, byte ranges, PDFs, authorization denial, account switching, offline save, deletion, orphan cleanup, process restart, interrupted uploads and rollback.

### B. Reduce PostgreSQL cost without changing the data model

1. Identify the exact database used by the canonical Render API without revealing or copying secret values. Inspect environment-variable key presence and provider/host metadata only through a protected workflow.
2. Before comparing providers, establish current live schema/table counts, DB size, row counts for critical records, active connections, query profile, write rate, growth, backup age and actual outbound database traffic.
3. Candidate to benchmark first: Neon PostgreSQL. It is PostgreSQL-compatible, but its Free plan has a 0.5 GB/project storage cap, 100 CU-hours/project, 5 GB public transfer/project and scale-to-zero behavior. Treat Free as a staging/prototype candidate, not an assumed production replacement. Paid Launch has usage-based compute/storage and 500 GB public transfer included; calculate actual cost using Dallyletter workload.
4. Compare Neon Launch against the current Render PostgreSQL plan and other managed PostgreSQL offers using total cost, not headline monthly price. Include external network egress from the DB to Render, Render outbound transfer, compute wake-up latency, connection limits, backups/PITR, restore testing, region latency and support.
5. Keep API and database in the same region where possible. Configure bounded `pg.Pool` settings and connection/statement timeouts only after measuring instance count and provider connection limits. Do not add Cloudflare Hyperdrive to the Render API path unless there is a measured architecture that actually uses Workers; Hyperdrive is not a PostgreSQL host.
6. Do not change `DATABASE_URL` or run schema pushes against production in this workstream. Any eventual migration must use encrypted external `pg_dump`, checksum, isolated restore, schema/row/sequence comparison, authenticated regression tests and a tested rollback before owner-approved cutover.

### C. Observability and cost controls

- Record baseline Render bandwidth by service and identify media-heavy request paths before/after.
- Record R2 storage, Class A/B operations, Worker requests, cache hit ratio and total cost.
- Record PostgreSQL compute, storage, transfer, connection saturation and backup/restore status.
- Add dashboards/alerts for budget thresholds and unusual transfer spikes. Avoid logging credentials, signed URLs or private object contents.
- Keep an explicit inventory of data that must never be evicted: learner records, academic evidence, payment transactions, audit logs, teacher documents and private messages.

## Release gates

- [ ] R2 is enabled and a dedicated non-production bucket exists; credentials are least-privilege and stored only in Render secrets.
- [ ] Worker/custom media hostname is configured and verified with TLS.
- [ ] Public/private object access tests prove no authorization bypass; private media cannot be fetched after expiry or by another account.
- [ ] Upload → object checksum → database metadata → reload → range playback/download → delete lifecycle passes on staging.
- [ ] All current media routes and web/Android consumers pass regression tests; legacy DB bytea records remain readable until individually migrated and verified.
- [ ] Render egress baseline and post-change reduction are measured on the same traffic profile.
- [ ] External PostgreSQL candidate passes a production-sized restore test, schema/row/sequence comparison, connection/load tests, backup and recovery drill.
- [ ] Total monthly cost comparison includes Render egress, DB egress, compute, storage, operations and backups.
- [ ] CI/typecheck/integration tests pass on the exact PR head.
- [ ] No production deployment, database switch, source deletion, or service deletion occurs until the owner separately approves a documented cutover plan.

## Immediate blockers observed

1. Cloudflare R2 is not enabled on the connected account; Cloudflare instructs enabling it in the Dashboard.
2. Render's canonical-looking `-4` API service is suspended for monthly quota exhaustion, so live service validation/deployment is currently blocked.
3. The two Render recovery PostgreSQL instances visible to the workspace are suspended; one is past its listed expiry. The actual canonical production database must be positively identified before any database-cost migration.
4. Existing media adapter proxies reads through Render, so R2 configuration alone is insufficient to meet the bandwidth objective. A secure delivery edge/direct upload design is required.


## D. Public edge caching, offline assets and compression

- Vercel edge caching is restricted to fingerprinted build assets (`/assets/*`, one-year immutable) and explicitly public image/icon paths with short revalidation windows. The authenticated SPA document (`/app.html`) is explicitly private/no-store; the former blanket public cache rule is removed so private routes and unknown paths do not inherit public caching.
- Vercel's static delivery edge negotiates Brotli/Gzip where supported. Verify `Content-Encoding` and transferred bytes for JS, CSS and HTML on the live deployment; do not pre-compress user uploads or authenticated media.
- The service worker caches only same-origin, successful, bounded static assets. It refuses private/no-store/no-cache responses, Range requests, API, media, uploads and auth paths. The asset cache has count and byte ceilings; quota failures remain non-fatal.
- Cache budgets are deliberately small for low-storage Android devices. Cache Storage is opportunistic, not durable offline storage for learner records or submissions. Those continue to use their dedicated offline queue and synchronization contracts.
- Measure with a repeatable before/after profile: cold and warm page load, bytes transferred, cache hit/miss, `Content-Encoding`, media Range response bytes, API egress and Render monthly transfer. Record device/network profile and avoid claiming savings until measured.


## E. Provider-independent media implementation and route inventory (2026-11-28)

### Media path inventory (source audit)
- **Shared storage core:** `artifacts/api-server/src/lib/media-storage.ts` persists uploads to the configured S3-compatible provider, otherwise to PostgreSQL chunks (20 MiB ceiling); reads support HTTP byte ranges from both provider and PostgreSQL fallback; deletes remove provider, chunk and local staging data.
- **Lesson / group media:** `POST /api/lessons/media`, `GET /api/lessons/media/:storageKey`, signed share-link creation at `POST /api/lessons/media/:storageKey/share`. This route family also serves assignment materials and submission attachments because those upload endpoints return the lesson-media URL.
- **Assignment uploads:** `POST /api/assignments/material` and `POST /api/assignments/submission-material`; both persist through the shared media layer and return `/api/lessons/media/:storageKey`.
- **Exercise media:** question and answer attachment uploads in `artifacts/api-server/src/routes/exercises.ts`; they persist through the same storage layer and return lesson-media URLs.
- **Chat / voice media:** `POST /api/messages/media` and authenticated `GET /api/messages/media/:storageKey`; private conversation and group membership checks remain in the route before serving.
- **Profile media:** avatar and profile-cover upload flows in `artifacts/api-server/src/routes/users.ts`; avatars resolve through lesson-media; private teacher documents use a separate user document endpoint and stream from the shared store after role/access checks.
- **Hand-raise media:** upload flow in `artifacts/api-server/src/routes/handRaises.ts`; returns a lesson-media URL and records media ownership for cleanup.
- **Clients:** web `AuthenticatedMedia`, `StoredMedia`, lesson preview/student lesson screens; Android `OfflineMediaDownload` and existing lesson/chat/profile screens. These currently depend on the existing API URL contract; do not change URLs during provider rollout.
- **Legacy data:** older message media and teacher-document bytea storage paths exist independently of the shared object key store and require a separate inventory/migration before deprecation.

### Provider contract and instrumentation
- The S3-compatible implementation now exposes a provider-neutral `MediaObjectStorageProvider` contract (streaming put, get with optional Range, delete) and declares byte-range/stream-upload capabilities. This is a seam for another S3-compatible provider; it does not claim an R2 connection is active.
- Transfer telemetry emits structured upload/download/delete events with backend, outcome, duration, byte count where known, Range flag and status. It intentionally excludes storage keys, user IDs, URLs, credentials, signed tokens and object contents.
- Current metrics are application logs, not a durable dashboard. Aggregate them in the hosting log platform before making cost claims; API-side byte counts do not equal Render network egress or billed transfer.

### Cache safety correction
- Service-worker navigation caching now stores only the public root document and refuses `private`, `no-store`, or `no-cache` responses. Authenticated SPA routes are never stored under the shared root cache key. Asset caching remains same-origin, bounded and excludes API/media/auth paths and Range requests.

### Verification still required
- Automated unit tests are wired for the telemetry helper; run `pnpm --dir artifacts/api-server run test:media-telemetry` and full API typecheck/CI on this branch.
- Add integration tests with a disposable PostgreSQL instance for chunk boundaries, malformed/unsatisfiable/suffix/open-ended ranges, missing chunks, empty objects, integrity, fallback, deletion and authorization on each route family.
- Provider contract integration tests need a disposable S3-compatible endpoint; verify streamed PUT, GET/Range, 404, delete and checksum. No production credentials are needed for these tests.
- Audit the exact legacy document/media route handlers and Android attachment consumers before claiming the inventory is exhaustive; the route inventory above covers the shared storage key paths found by source search.
