# Dallyletter Elidems — feature verification matrix

Baseline: 14 October 2026. This is an evidence matrix, not a declaration that all features are complete. “Present in source” means implementation files/routes were found; “complete” requires persisted, permission-correct, end-to-end tests.

## Status legend
- **Observed failure:** reproducible symptom or provider/API error appeared in logs or supplied evidence.
- **Implemented, unverified:** source/foundation exists but live end-to-end behavior is not proven.
- **Partially verified:** only a named subset has evidence.
- **Blocked:** a dependency or release gate prevents safe completion.
- **Missing/not established:** implementation was not established by this pass.
- **Complete:** source, persistence, permissions, UX, failure paths and applicable tests passed. This audit declares no broad feature complete without that evidence.

## Executive summary
- Web, API and Expo/mobile codebases exist in the monorepo.
- A Vercel preview build passed on commit be885db7a23c5b58905bf3c96bcb9b07131ec5d3, but emitted a 1,048.28 kB minified JavaScript chunk (287.85 kB gzip).
- Commit 51e684810fd5ea1e5e88ad4fb33c1ec7a46eeff9 introduces lazy loading for 56 page components. Its latest CI/Release Safety and preview build must be verified before calling this optimization validated.
- Render logs previously showed HTTP 503 on lesson-media upload, assignment-material upload and email sending, plus HTTP 500 on AI poll generation.
- The current PostgreSQL database was available at inspection, but an external backup and independent restore were not proven. Expiry is listed as 15 October 2026 14:30 UTC.
- The schema workflow previously failed because the protected production DATABASE_URL was unavailable in its workflow context. It was changed on the recovery branch to read-only verification; the latest checks were pending at the last check.
- No secrets were read or copied. No production data, deployment, database allowlist, or service lifecycle was changed by this audit.

## Feature inventory

| Domain | Evidence | Status | Required acceptance test |
|---|---|---|---|
| Sign-in, sessions, logout, registration and recovery | React pages, auth context and API auth exist; no authenticated production matrix | Implemented, unverified | Valid/invalid credentials, refresh, expiry, logout, password recovery, verification and abuse limits |
| RBAC and role assignment | Protected routes and API authorization foundations exist | Blocked on real role accounts | Learner/teacher/prefect/manager/senior manager/owner; direct API, IDOR and privilege-escalation tests |
| Global UI, navigation and accessibility | React/Vite, role pages and Feature Centre; web build passed before latest lazy-load commit | Partially verified | Every route, mobile/desktop, keyboard, focus, screen reader, touch, loading/empty/error states |
| Performance and responsiveness | Previous build emitted a 1 MB JS chunk warning | Performance risk; optimization in progress | Compare route chunks and startup; test low-end Android latency, memory and scrolling |
| Learner dashboard | Student routes/pages exist | Implemented, unverified | Lessons, tasks, submissions, marks, notifications, groups and privacy |
| Teacher dashboard | Teacher pages exist; reported exercise/notification/marking defects | Partially implemented | Create/edit/publish, media, filters, marking, final comment and correct recipients |
| Prefect dashboard | Prefect panel exists | Implemented, unverified | Authorized duties/requests and denial of private/admin endpoints |
| Manager/senior-manager dashboard | Manager routes exist; historical activity 404 and dashboard 403 reported | Known route/permission failures; current state unverified | Scoped access, valid IDs, preview-only behavior and audit records |
| Owner/Command Centre | Owner/admin pages and settings exist | Implemented, unverified | Owner-only routes, accurate diagnostics, safe settings, redacted logs |
| Live classes | Class and hand-raise foundations exist | Implemented, unverified | Schedule/timezone, valid meeting provider, join rules, real attendance, cancellation and reminders |
| Lessons | Lesson UI/API/media routes exist; media upload 503 and earlier playback 404 reported | Observed media reliability issue | Save/edit/publish, permissions, upload, playback after reload and restart |
| Exercise builder | Exercise UI/API/schema exist; question-media mismatch and rich-text/notification issues were reported | Partial with known defects | Create/edit/reorder/publish, draft persistence, per-question attachments, learner preview |
| Rich-text editor | Formatting controls exist; selection loss/reversed text reported | Known defects reported; current state unverified | Type/select/toolbar/paste/save/reload/edit/sanitize across all editors |
| Drawbox and marking | Marking UI/API foundations exist; no device-level regression proof | Implemented, unverified | Touch/stylus, erase/undo, zoom, annotation persistence, per-question marks and learner review |
| Assignments/submissions | Routes and file fields exist; material upload 503 observed | Observed upload failure | Upload, authenticated open/download, submit, mark, return, resubmit and retention |
| Polls/quizzes | Poll UI/API exists; AI generation returned 500 | Observed provider/API failure | Real generation, timeout/invalid response, voting, duplicate-vote and result reveal |
| Teacher CV/qualifications | TeacherQualifications page exists | Implemented, unverified | Secure upload/replace/remove, privacy, review and authorized download |
| Groups | Study-group/community routes exist | Implemented, unverified | Preview privacy, join/approve, mute/remove/leave, permissions and attachments |
| Chat/private messages | Chat pages and message schema exist | Implemented, unverified | Two-account privacy isolation, ordering, replies, delivery/retry and access controls |
| Voice messages | Recording/playback support and recovery-branch MIME fix exist | Partially verified | Microphone denial, final audio chunk, upload retry and device playback |
| Media/object storage | R2/S3-compatible code and legacy bytea storage exist | Blocked on provider-backed test | Upload → save → reload → preview/stream → restart → retrieve → delete → verify deletion |
| AI tutor/Elidems | Provider config and AI routes exist | Implemented, unverified | Genuine provider response, timeout, malformed output, cost/usage limits and privacy |
| Dally Sheets | Full implementation not established in this pass | Missing/not established | Inspect routes/schema first; implement only gaps actually found |
| Notifications/followers | Notification and push routes exist; follower notification errors reported | Partial; delivery unverified | Correct recipients, read state, retry and real push delivery |
| Achievements | Routes/pages/schema exist | Implemented, unverified | Criteria, idempotent awards, correct learner and privacy |
| Payments/subscriptions | Payment routes/schema/UI exist; real provider path not tested | Implemented, unverified | Test checkout, signed webhook, idempotency, failure, refund and reconciliation |
| Email | /api/email/send exists; HTTP 503 appeared in logs | Observed delivery/config failure | Provider setup, delivery result, timeout/retry and rate limit |
| PWA/service worker/offline | Manifest/config and /sw.js registration call exist | Partially verified | Install/update, route refresh, offline/reconnect, private cache isolation and stale assets |
| Expo/Android | Mobile app and EAS profiles exist | Implemented, unverified | Reproducible APK/AAB, install/update, permissions, low-end Android and offline behavior |
| App Store/Play Store/Microsoft Store | Account-side listings inaccessible in this audit | Missing/not established externally | Verify store consoles, listing and signed artifact with owner access |
| REST/GraphQL/external APIs | REST API exists; GraphQL usage not established | Partial | Route inventory, auth, validation, rate limits, CORS and error contracts |
| Environments/secrets | Secret references exist; values were not retrieved | Partially verified | Confirm required key presence per canonical service without printing values |
| PostgreSQL/Drizzle | 51 public tables, 449 columns, 76 validated FKs, zero invalid indexes | Partially verified; P0 risk | Full schema diff, migrations, dump/restore, row counts and sequence comparison |
| Connection pooling | Node pg/Drizzle code exists; load/leak tests absent | Unverified | Concurrency, pool limits, idle clients, timeout and retry tests |
| Backup/disaster recovery | Runbook exists on recovery branch; no dump/restore performed | Blocked | Encrypted external dump, checksum, archive listing and isolated restore |
| CI/Release Safety | Workflows exist; earlier commit passed; latest head runs pending | In progress | Latest exact SHA passes CI and Release Safety |
| Deployments/domain/SSL | Render/Vercel resources exist; preview build passed on earlier SHA | Partially verified | Exact SHA deploy, smoke tests, aliases, TLS and authenticated regression |
| Analytics/monitoring/background jobs | Some monitoring/provider surfaces exist; live execution not proven | Unverified | Real event/job/provider evidence, retry and failure tests |
| Security/accessibility | RBAC and sanitization patterns exist; full security/WCAG audit not complete | Unverified | Dependency scan, secret scan, authenticated security tests and WCAG 2.2 review |

## Canonical infrastructure map
- Repository: elishamaposa29-oss/DALLYLETTER-ELIDEMS-Smart-CAPS-LMS.
- Canonical live API: Render service srv-d9ihv8favr4c73assgag, URL https://dallyletter-elidems-smart-caps-lms-4.onrender.com, branch main.
- Recovery preview project: Vercel project prj_Xyxmr1MPPOnmRHzUMjGaBpiuYfwf; project has SSO protection.
- Database: Render dallyletter-db-temp, PostgreSQL 18, database dallyletter_6kud; listed expiry 2026-10-15T14:30:34Z.
- Vercel returned 14 similarly named projects. Do not delete them based on name alone.
- Render returned five similarly named API/web services plus a PgHero service. Preserve the canonical API by default.
- Database allowlist currently reports 0.0.0.0/0. Do not change it until the protected API DATABASE_URL host is verified as the internal Render hostname and connectivity is tested.

## Recent web performance change
Commit 51e684810fd5ea1e5e88ad4fb33c1ec7a46eeff9 changes 56 page imports in artifacts/dallyletter/src/App.tsx to React lazy imports and wraps routing in an accessible loading fallback. This targets the observed 1 MB initial bundle by deferring route pages. Do not call this complete until CI and the matching preview build pass, chunk sizes are compared, and all route paths are tested.

## Immediate execution order
1. P0: create an encrypted external database dump, verify checksum/archive listing, restore to a separate PostgreSQL 18 target; do not substitute an empty database for restored data.
2. Verify latest CI/Release Safety and preview build for the lazy-load commit.
3. Use render.database-rebuild.yaml only after reviewing a diff that proposes only a new database; follow docs/database-recreate-and-recovery.md.
4. Test the legacy-table migration on empty and populated clones; establish an ordered migration ledger before production schema changes.
5. Verify API internal DB hostname, then remove public database exposure only after connectivity is proven.
6. Map all 14 Vercel projects and six Render services by domains, branch, SHA, traffic and database consumers; archive duplicates only after a reversible cutover.
7. Fix and test media, lessons, exercise builder/rich text, submissions, drawbox/marking, final comment, polls and notification recipient correctness.
8. Test role matrix, groups/chat, live classes, voice messages, push and email.
9. Test real AI provider, payment/webhooks, analytics/background work, store releases, accessibility, offline mode and real devices.
10. Merge only after exact integration SHA passes CI, Release Safety, preview build, data recovery, authenticated feature tests and post-deploy smoke/log review.

## Proof rules
For each acceptance test, record commit, environment, role, API/UI path, expected/actual result, persistence/reload, failure/retry and sanitized logs. Never store passwords, tokens, connection strings or payment credentials in evidence. A button, route, mock, seed or schema declaration alone does not make a feature complete.
