# Dallyletter web-to-mobile parity execution ledger — 2026-10-21

## Objective
Make the Expo mobile experience functionally equivalent to the existing web LMS while retaining phone-first UX, usable tablet/desktop layouts, safe authorization, and practical offline learning for learners with expensive or unreliable connectivity. This is an execution ledger, not a claim of completed parity.

## Working branch and safety
- Work on `feat/mobile-parity-offline-install-download-2026-10-21` / PR #62; preserve existing commits and unique fixes.
- Keep web/API code authoritative for business rules. Reuse the existing API contracts rather than creating weaker mobile-only authorization.
- Never declare a feature complete from a button, route, mock, cached list, or successful compile alone.
- For each change, run the applicable typecheck and focused tests; then compare web and mobile behavior before broad integration. Keep the release gate separate from parity implementation as requested.
- Do not change production data, secrets, database topology, or payment behavior as part of UI parity work.

## P0 — foundational gaps
1. **Role and route parity:** inventory every web role and route (learner, teacher, prefect, manager, senior manager, owner/admin). Compare with Expo route tree. Test deep links and direct API calls for each role; staff preview/monitoring must remain read-only where specified. Audit owner/admin/system/payment/audit-log isolation.
2. **Content fidelity:** lessons must preserve readable rich text, headings, lists, formulas, drawings, links, images, audio/video and attachments. Do not silently strip meaningful content. Every media object must resolve through authenticated access after reload.
3. **Assignments:** create/edit/publish, due dates, reference visibility, attachment upload/download, drafts, submit, resubmit, marking, feedback and returned results.
4. **Exercises/marking:** builder lifecycle, question ordering/types/media, drawbox/stylus, autosaved drafts, retries, submissions, per-question marks, overall feedback and learner review.
5. **Reliability/security:** loading/empty/error/retry states, upload retry, duplicate-submit protection, token expiry, offline cache separation by account, server-side permission enforcement and regression tests.

## P1 — learning and collaboration
- Poll/quiz creation, publication, attempts, privacy, duplicate vote prevention and result visibility.
- Group discovery, preview privacy, join/approval/leave, member controls, announcements-only mode, rules, polls, media attachments and member-only chat.
- Private messages, voice recording/playback, attachment handling, delivery/retry and two-account privacy tests.
- Notifications, read state, correct recipients, follower notifications, device push permission/token registration and real push delivery evidence.
- Classes, schedule/timezone, valid join links, hand raises, attendance, cancellation and reminders.
- Qualifications/CVs, achievements, profiles, search, analytics, AI tutor, payments and other web-only tools after route-by-route inventory.

## P2 — fit and finish
- Rich-text toolbar and selection behavior; readable font scaling, color/pen controls, drawing undo/erase, keyboard handling, accessible labels/focus, screen readers and touch targets.
- Consistent pagination/search/filter/sort, progress indicators, retry affordances, offline indicators and useful empty states.
- Efficient startup and navigation; split large bundles and avoid loading large media until requested.
- Verify narrow phones, landscape phones, tablets, laptop browsers and wide desktop windows. Prefer responsive layouts over stretching phone-sized content across desktop.

## Offline-first and low-cost data strategy
- Cache only authorized, account-scoped content; clear/switch cache on logout/account changes. Use bounded storage and versioned cache entries.
- Download-for-offline should be an explicit user action for lesson notes and approved media, with size estimates, progress, cancel/delete, storage limits and stale-content refresh. Verify media can actually open offline; caching a URL or lesson list is not enough.
- Save assignment/exercise drafts locally and clearly label them as drafts. Queue submissions only with a safe retry/idempotency strategy; never show an offline submission as accepted until the server confirms it.
- Prefer text-first lessons, compressed images, adaptive video quality, audio-only options, resumable uploads/downloads, pagination and user-controlled sync on metered connections.
- Radio reality check: ordinary FM/AM broadcasting cannot deliver personalized interactive LMS data to a standard smartphone app by software alone, and radio broadcast has no return channel for submissions. A one-way educational broadcast is possible only with a broadcaster/data-broadcast partner and compatible receiver/device support. SMS/USSD can support limited text/status workflows only through a telecom integration. Practical near-term priority is downloadable content plus offline drafts and low-data synchronization. Bluetooth/Wi-Fi Direct sharing may be explored later for nearby device-to-device transfer, with signed packages and authorization checks.

## Responsive device target
- Android and iOS: native app, small screens, variable network, permissions and offline use.
- Tablet: adaptive two-column layouts where useful, larger drawing/marking canvas and keyboard/stylus support.
- Desktop/laptop: web build must remain first-class with keyboard navigation, resizable panels, wide-screen layouts and accessible tables. The Expo web target must also be smoke-tested if it is offered as a supported desktop route.
- "100%" is an acceptance target, not a status claim: record actual device/browser, role, network state, commit SHA and results.

## Acceptance record template
For every feature, record:
- Web route/API contract and mobile route/component
- Roles allowed and roles denied (including direct API attempts)
- Online, offline, reconnect, retry and app-restart behavior
- Media readability and persistence after reload
- Phone/tablet/desktop checks and accessibility
- Tests executed, exact commit SHA, pass/fail and remaining blocker

## Current evidence at start
- Existing verification matrix: `docs/feature-verification-matrix-2026-10-14.md`.
- Mobile has role-specific home/tab routes and a shared FeatureHub for assignments, exercises, polls, notifications and study groups.
- Lesson screen caches text/list metadata per user, but explicitly warns that media/new content may need internet. That is not full offline media support.
- Mobile now has incremental School Fees/payment-history UI, learner achievements/badges/leaderboard, a prefect lesson-request/following panel, confidential safety reports, direct learner shortcuts, per-user assignment drafts, per-user/per-group chat drafts, and display of all embedded lesson links/API media references with supported image previews. These changes still need typecheck and focused role/data-flow regression verification.
- Payment UI reuses existing authenticated API endpoints and configured payment settings; it must not imply a reported payment is confirmed/cleared.
- Android build/emulator verification is intended to be the final release gate after the requested feature-parity pass; current PR workflows may still run automatically because of the repository workflow triggers. No APK is represented as parity-complete.

## Execution continuation — 2026-10-21 (verified repository state)
- Native push UI and registration flow are present in `artifacts/dallyletter-mobile/components/NativePushControls.tsx` and are rendered in the FeatureHub Notifications section. The flow requests OS permission, obtains an Expo token using `EXPO_PUBLIC_EAS_PROJECT_ID` / embedded EAS project ID, registers it through the authenticated API, and provides a dispatch-status test. Account logout/switch cleanup is implemented in `AuthContext.tsx`.
- `artifacts/dallyletter-mobile/app.json` includes the `expo-notifications` config plugin, and `expo-notifications` is a declared mobile dependency. However, no project ID is committed in `app.json` and the checked-in `eas.json` build profiles do not declare `EXPO_PUBLIC_EAS_PROJECT_ID`. Confirm the actual EAS project ID and configure it in the authorized EAS project/build environment before building; do not substitute the unrelated Vercel project ID or invent an ID.
- CI run 1105 and Release Safety run 1103 completed successfully on the inspected commit. The Android workflow reached mobile typecheck and native project generation, but its standalone APK build was cancelled; this is not an APK build or emulator-smoke pass.
- Native push remains unverified until an Android build with the correct EAS project ID is installed on a real device, permission is granted, token registration succeeds, the dispatcher reports Expo ticket acceptance, and the notification is observed in the device notification shade. Expo ticket acceptance alone does not prove OS display.
- Next execution gate: confirm/configure the EAS project ID, run the Android release-check workflow on the exact PR head, then test device registration, push dispatch, account switching/logout cleanup, and role-specific notification navigation. Keep PR #62 draft and do not publish/merge on the strength of typecheck alone.
