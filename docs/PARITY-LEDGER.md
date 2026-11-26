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
| Open PR inventory | UPDATED | PR #75 ledger, #76 auth hardening, #77 assignment file submissions, #78 mobile chat/media hardening are open; #76/#77 have review requests pending | Recheck all PRs, required checks and reviewer decisions before merge |
| Main CI | PASS (workflow evidence only) | Actions run `40212364549`, conclusion success | Does not establish end-to-end parity |
| Release Safety | PASS (workflow evidence only) | Actions run `40212364571`, conclusion success | Keep normal protection |
| Production DB schema workflow | PASS (workflow evidence only) | Actions run `40212364578`, conclusion success | Confirm actual endpoint/schema independently |
| Android build/smoke | PASS (emulator evidence) | Main Actions run `40212364585`: standalone APK build, v1.0.2 upgrade APK build, emulator install/launch/upgrade smoke, deployed API health all succeeded; checksums validated locally | Poll PR #77 Android run `40216334751`; do not restart either run |
| APK publication | BLOCKED BY EXISTING TAG | Publish workflow run `40216177054` failed safely: stable tag `mobile-v1.0.2` already exists; workflow refuses to overwrite a release with a different source commit | Bump app version/versionCode and release tag only after current feature PRs are reviewed and merged; do not overwrite tag |
| Installed-device parity | UNVERIFIED | No real-device installation evidence obtained | Install resulting APK on a test device and exercise core roles/workflows |
| Production end-to-end flows | UNVERIFIED | CI/schema checks are not user-workflow tests | Run non-destructive health, auth, persistence and role checks |

## Workstream ledger
The following are workstreams, not claims that every individual UI control has already been inventoried. Feature-level entries must be added with exact web/mobile locations, endpoint, role, persistence/offline behavior, provenance, reproduction, test evidence, owner/status, blocker, and next action.

| ID | Workstream / scope | Initial evidence | Status | Next action |
|---|---|---|---|---|
| AUTH-01 | Authentication, sessions, roles, least-privilege authorization across learner, teacher, prefect, manager, senior manager, owner | PR #76 adds timing-safe token verification, 90-day token TTL, scrypt hashes with transparent legacy migration, and manager-flag role isolation; latest CI still running at last poll | IN PROGRESS / E2E UNVERIFIED | Await latest CI/release-safety and owner review; run role-by-role positive/negative route tests after merge using test accounts |
| LEARN-01 | Lessons: create/edit/publish/view, lesson requests, content visibility and lifecycle | API route `routes/lessons.ts`; schema `lib/db/src/schema/lessons.ts` | IN PROGRESS / UNVERIFIED | Map web/mobile screens and all API + DB paths; test save/reload and role access |
| MEDIA-01 | Lesson/assignment/chat uploads, previews, embedded links, downloads, storage and ownership | PR #77 adds mobile assignment file upload and authenticated preview; PR #78 scopes media bearer headers to the configured API origin; production object-storage configuration is not independently confirmed | IN PROGRESS / STORAGE E2E UNVERIFIED | Pass CI/Android checks; verify persistent storage with authorized test learner/teacher accounts and confirm uploads survive restart |
| WORK-01 | Assignments/exercises, questions, due dates, submission, retry, return, grades and feedback | PR #73 merged; PR #77 adds mobile file submissions, attachment-only server validation and marking-view previews; six submission-validation tests pass on PR #77 head | PARTIAL IMPLEMENTATION / E2E UNVERIFIED | Await Android install/upgrade smoke; test real learner upload, teacher preview/marking, return, retry and persistence on web and Android |
| DRAW-01 | Drawing tools, drawbox answers, annotation, marking, attachments and feedback | PR #73 body explicitly says native drawbox canvas and assignment file submission remain follow-ups | BLOCKED ON IMPLEMENTATION WORK | Inspect web drawing implementation and mobile equivalent; implement parity with regression tests |
| POLL-01 | Poll creation, choices, voting, result visibility and role rules | API route `routes/polls.ts`; schema `polls.ts`; PR #73 includes learner poll choices | IN PROGRESS / UNVERIFIED | Compare web/mobile lifecycle and verify vote persistence, duplicate-vote handling and permissions |
| CHAT-01 | Private messaging, voice/media, group conversations, communities and moderation | Reproduced code-level defect: both mobile chat screens omitted required `groupId`/`recipientId`; PR #78 adds joined-group selection, scoped reads/sends and group-aware offline retries. Voice, private chat, polls and moderation remain gaps | IN PROGRESS / E2E UNVERIFIED | Pass latest CI; add Android build/smoke; verify live group send/reload and offline retry; implement direct chat, voice, polls and moderation parity |
| PUSH-01 | In-app notifications, subscription registration and real push delivery/retries | Routes `notifications.ts`, `push.ts`; schema health expects push subscription/retry fields | IN PROGRESS / DELIVERY UNVERIFIED | Verify subscription, provider configuration, send result, retry state and device receipt |
| OFFLINE-01 | Account-scoped cache, queued text/submissions, media downloads, reconnect/sync conflicts | Five offline-queue tests pass on PR #77 CI; PR #78 preserves destination group IDs in queued messages and fixes protected-media auth decisions | PARTIAL / DEVICE UNVERIFIED | Test disconnect/reconnect, account switching, duplicate-safe retries, legacy queue handling and authenticated media download on Android |
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


## Execution updates — 2026-10-25

| PR / run | Change or evidence | State at last check | Remaining gate |
|---|---|---|---|
| [PR #76](https://github.com/elishamaposa29-oss/DALLYLETTER-ELIDEMS-Smart-CAPS-LMS/pull/76) | Token signature timing safety, malformed-token rejection, 90-day token expiry, scrypt password hashes with legacy SHA-256 migration, manager-flag role isolation, regression tests | Open; latest CI and Release Safety running on head `89f94bc81f4892ae250413d45f324b977bd216d7` | Required approving review; then post-merge production verification |
| [PR #77](https://github.com/elishamaposa29-oss/DALLYLETTER-ELIDEMS-Smart-CAPS-LMS/pull/77) | Mobile assignment attachment upload, attachment-only submissions, authenticated attachment preview in learner and teacher marking views; 6 assignment-validation tests, 9 authorization tests, 5 offline-queue tests passed with typecheck/build/release safety on head `86b0ae9d0cc1104d025cc071c7ce23d7e73ad1c6` | Open; reviewer requested; Android release-build/install/launch/upgrade run `40216334751` still running at last poll; typecheck and full CI/release-safety passed on head `86b0ae9d0cc1104d025cc071c7ce23d7e73ad1c6` | Finish Android smoke; test upload against configured persistent storage and test accounts |
| [PR #78](https://github.com/elishamaposa29-oss/DALLYLETTER-ELIDEMS-Smart-CAPS-LMS/pull/78) | Fixes mobile group-message 400 root cause; adds group selection, group-aware queued retries, and same-origin-only protected-media auth headers plus regression tests | Open draft; CI and Release Safety passed on head `5478738cd3d677678e670b9149aa63c888a5eafe`; 9 authorization tests, 5 offline-queue tests and 4 protected-media-auth tests passed; Android run `40217354293` queued | Android build/smoke run `40217354293` queued; review requested; then verify live group send/reload and media download |
| Main Android workflow | PASS | Run `40212364585`: `build-apk` and `emulator-smoke` both concluded success; both `dallyletter-v1.apk` and `dallyletter-v1.0.2.apk` passed SHA-256 verification; build metadata identifies source commit `dd3bb4f2ce5cbb852d0f704036a5cb063faf8973` | Use this as an interim candidate only; it does not include unmerged PR #76/#77/#78 |
| Android publish workflow | Publication refused because stable tag `mobile-v1.0.2` already exists; no tag overwrite attempted | Run `40216177054` failed safely with explicit tag guard | New release requires version/versionCode/tag bump after implementation PRs are approved and merged |
| Production DB schema | Workflow run `40212364578` concluded success | Workflow evidence only | Does not prove each feature's production data flow or media storage configuration |

### Current hard blockers / non-claims
- Branch protection requires an approving review. No approval, required-check bypass, force-push, or direct merge was attempted.
- Production media/object-storage configuration and end-to-end upload persistence are not confirmed from an authenticated test account.
- Android emulator smoke is not equivalent to real-device, multi-role workflow verification.
- Web/mobile role-by-role E2E, lesson lifecycle, exercise retries/drawing, teacher marking, push delivery/receipt, private/voice messaging, polls, groups moderation, and offline media synchronization are still not VERIFIED COMPLETE.
- Do not publish a replacement `mobile-v1.0.2` release. Use a new version/tag only after the implementation and review gates are satisfied.
