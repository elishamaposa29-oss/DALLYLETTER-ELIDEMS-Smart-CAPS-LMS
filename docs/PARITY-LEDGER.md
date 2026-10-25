# Web / API / Database / Android Parity Ledger

Audit baseline: 2026-10-25
Baseline main SHA: dd3bb4f2ce5cbb852d0f704036a5cb063faf8973
Repository tree: 580 entries (recursive Git tree, not truncated)
Scope note: this is a persistent evidence ledger. A workstream is not complete merely because code or a route exists. Each feature-level row must be expanded during implementation and end VERIFIED COMPLETE, BLOCKED with exact dependency/next step, or NOT APPLICABLE with justification.

## Status definitions
- **VERIFIED COMPLETE** — end-to-end evidence covers UI, API, persistence, permissions, and Android where applicable.
- **BLOCKED** — exact external dependency or reproducible technical blocker recorded, with next action.
- **NOT APPLICABLE** — reason recorded.
- **IN PROGRESS / UNVERIFIED** — not complete; more evidence required.

## Verified baseline
| Item | Status | Evidence | Next action |
|---|---|---|---|
| Current main SHA | VERIFIED | GitHub `commits/main` returned `dd3bb4f2ce5cbb852d0f704036a5cb063faf8973` | Recheck before each write/PR |
| PR #73 | VERIFIED MERGED | GitHub PR API: merge commit `df90952ce626cb90576d1fe9ba36f1fd0e1add19` | Verify workflows and real Android behavior |
| PR #74 | VERIFIED MERGED | GitHub PR API: merge commit equals current main SHA | Preserve merged UI changes |
| Open PR inventory | VERIFIED EMPTY at audit time | GitHub `/pulls?state=open&per_page=30` returned `[]` | Recheck before creating any implementation PR |
| Main CI | PASS (workflow evidence only) | Actions run `40212364549`, conclusion success | Does not establish end-to-end parity |
| Release Safety | PASS (workflow evidence only) | Actions run `40212364571`, conclusion success | Keep normal protection |
| Production DB schema workflow | PASS (workflow evidence only) | Actions run `40212364578`, conclusion success | Confirm actual endpoint/schema independently |
| Android build/smoke | IN PROGRESS at last observed snapshot | Actions run `40212364585`, job `build-apk`, URL https://github.com/elishamaposa29-oss/DALLYLETTER-ELIDEMS-Smart-CAPS-LMS/actions/runs/40212364585 | Poll existing run; do not restart it |
| APK publication | SKIPPED at last observed snapshot | Actions run `40212477909`, conclusion skipped | Check existing build artifacts/release policy; do not claim a new APK |
| Installed-device parity | UNVERIFIED | No real-device installation evidence obtained | Install resulting APK on a test device and exercise core roles/workflows |
| Production end-to-end flows | UNVERIFIED | CI/schema checks are not user-workflow tests | Run non-destructive health, auth, persistence and role checks |

## Workstream ledger
The following are workstreams, not claims that every individual UI control has already been inventoried. Feature-level entries must be added with exact web/mobile locations, endpoint, role, persistence/offline behavior, provenance, reproduction, test evidence, owner/status, blocker, and next action.

| ID | Workstream / scope | Initial evidence | Status | Next action |
|---|---|---|---|---|
| AUTH-01 | Authentication, sessions, roles, least-privilege authorization across learner, teacher, prefect, manager, senior manager, owner | API route `artifacts/api-server/src/routes/auth.ts`; `users.ts`; CI includes `test:authorization` | IN PROGRESS / UNVERIFIED | Inspect every protected route and run role-by-role positive/negative tests; capture evidence without exposing learner data |
| LEARN-01 | Lessons: create/edit/publish/view, lesson requests, content visibility and lifecycle | API route `routes/lessons.ts`; schema `lib/db/src/schema/lessons.ts` | IN PROGRESS / UNVERIFIED | Map web/mobile screens and all API + DB paths; test save/reload and role access |
| MEDIA-01 | Lesson/assignment/chat uploads, previews, embedded links, downloads, storage and ownership | Health schema expects `media_object_chunks`; routes include lessons, assignments, messages | IN PROGRESS / UNVERIFIED | Trace upload-to-storage-to-display lifecycle, size/type validation, access control and restart persistence |
| WORK-01 | Assignments/exercises, questions, due dates, submission, retry, return, grades and feedback | PR #73 merged; routes `assignments.ts`, `exercises.ts`; schemas `assignments.ts`, `exercises.ts` | PARTIAL IMPLEMENTATION / E2E UNVERIFIED | Exercise each learner/teacher lifecycle on web and Android; test persisted result and invalid/unauthorized requests |
| DRAW-01 | Drawing tools, drawbox answers, annotation, marking, attachments and feedback | PR #73 body explicitly says native drawbox canvas and assignment file submission remain follow-ups | BLOCKED ON IMPLEMENTATION WORK | Inspect web drawing implementation and mobile equivalent; implement parity with regression tests |
| POLL-01 | Poll creation, choices, voting, result visibility and role rules | API route `routes/polls.ts`; schema `polls.ts`; PR #73 includes learner poll choices | IN PROGRESS / UNVERIFIED | Compare web/mobile lifecycle and verify vote persistence, duplicate-vote handling and permissions |
| CHAT-01 | Private messaging, voice/media, group conversations, communities and moderation | Routes `messages.ts`, `studyGroups.ts`, `socialFeatures.ts`; known prior message POST 400 needs fresh reproduction | BLOCKED / REPRODUCTION REQUIRED | Reproduce request against current code safely; record exact status/validation response; test delivery and reload |
| PUSH-01 | In-app notifications, subscription registration and real push delivery/retries | Routes `notifications.ts`, `push.ts`; schema health expects push subscription/retry fields | IN PROGRESS / DELIVERY UNVERIFIED | Verify subscription, provider configuration, send result, retry state and device receipt |
| OFFLINE-01 | Account-scoped cache, queued text/submissions, media downloads, reconnect/sync conflicts | Mobile README describes partial offline support; package exposes offline-queue test | PARTIAL / DEVICE UNVERIFIED | Run queue tests; simulate offline/reconnect on device; test account switching and duplicate-safe retries |
| MGMT-01 | Manager/owner tools, AI, payments, safety, attendance, audit and content permissions | Routes include manager, ownerCommandCenter, ai, payments, safety, attendance, auditLogs and contentPermissions | IN PROGRESS / UNVERIFIED | Inventory controls and server authorization; avoid financial changes; use test accounts and non-destructive diagnostics |
| DESIGN-01 | Web/mobile layout, readability, touch targets, icons, forms, loading/empty/error/success states and accessibility | PR #74 consolidated installer UI and moved shortcut into Feature Hub | PARTIAL / VISUAL E2E UNVERIFIED | Compare route-by-route screenshots on matched viewport/device; verify small controls and keyboard/screen-reader behavior |
| API-DB-01 | API contracts, migrations, schema compatibility, persistence, storage, backups and rollback | Drizzle schemas and migration files exist; production schema workflow passed | IN PROGRESS / DATA-FLOW UNVERIFIED | Map endpoints to tables; inspect migrations and health route; no destructive production change without verified backup/rollback and authorization |
| RELEASE-01 | CI, branch protection, deployment, Android artifact, install/upgrade/smoke | Main CI and Release Safety passed; Android run was in progress and publish workflow skipped | IN PROGRESS | Recheck existing run; verify Vercel and API health; verify downloadable artifact and install/upgrade on real device |

## Repository structure inspected so far
- `artifacts/dallyletter`: React/Vite web app
- `artifacts/api-server`: Express/TypeScript API; route files enumerated in the recursive tree
- `artifacts/dallyletter-mobile`: Expo/React Native app
- `lib/api-client-react`: generated client schemas
- `lib/db/src/schema` and `lib/db/migrations`: database schema/migrations
- `.github/workflows`: CI, deploy, Android emulator/build, production schema verification, release and security workflows
- Root scripts: `pnpm run typecheck`, `pnpm build`, `pnpm run ci:verify`; API scripts include authorization and offline-queue tests; mobile includes typecheck/build/offline-queue test.

## Known risks / non-claims
- A route, component, passing lint/typecheck, merged PR, or green schema workflow alone is not end-to-end evidence.
- Android run status is time-sensitive and must be refreshed before release decisions.
- No production database contents, secrets, or private learner records belong in this ledger.
- No production migration, financial change, branch-protection bypass, force-push, or required-check bypass is authorized by this audit.
