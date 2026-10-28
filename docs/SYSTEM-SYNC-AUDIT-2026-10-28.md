# System Sync Audit — 2026-10-28

Base revision audited: `b88e503dee73b6db093851c60b45a4e5ba877a43` (main).

## Verified repository structure

- Web: `artifacts/dallyletter` (React/Vite/TypeScript).
- API: `artifacts/api-server` (Express/TypeScript).
- Android: `artifacts/dallyletter-mobile` (Expo/React Native).
- Database: PostgreSQL through Drizzle in `lib/`.
- Profile Hub integration test: `lib/db/scripts/test-profile-hub-integration.mjs`.

## Evidence-based feature map

| Feature | API/source evidence | Web/mobile evidence | Current audit conclusion |
|---|---|---|---|
| Profile and contact data | `GET /api/users/:id`; `PATCH /api/users/:id`; recovery profile endpoints in API `routes/users.ts` | Mobile `app/profile-hub.tsx` loads profile, phone, notification email, recovery profile using bearer token | Own profile reads authenticated user ID; email changes are explicitly restricted to verified email-change workflow. |
| Subjects | `GET /api/users/me/subjects`; `GET /api/subjects/catalog` (called by mobile) | Mobile Profile Hub has Subjects tab and loads saved subject selection | API calls are present; actual cross-client persistence and stale-cache behavior still require tests. |
| Achievements | `GET /api/achievements/my`; `GET /api/achievements/user/:id` (called by mobile) | Mobile Profile Hub has Achievements tab | Read path exists; no evidence in this audit of a unified sync contract or conflict strategy. |
| Enrollments | `GET /api/users/me/enrollments`; `GET /api/users/me/enrollments-summary` | Mobile Profile Hub loads both | Reads exist; must confirm both endpoints agree and refresh after enrollment changes. |
| Qualifications | `/api/users/me/qualifications`, bulk create, upload and verification endpoints | Mobile Qualifications tab and manager/owner verification controls | Existing role checks and verification workflow must be preserved. |
| Attendance and academic records | Integration test calls `/api/academic-records/...`; test reads learner attendance and awards | Mobile Profile Hub now has Attendance and Reports tabs on `feat/system-sync-audit-repair` in `TABS` | Key gap: academic data is tested at API level but is not exposed as a complete synced daily/weekly/monthly/termly interface in this Profile Hub. |
| Reports | `POST /api/academic-records/reports/drafts` | Reports tab added on the implementation branch; approved reports are loaded from `/api/academic-records/reports/me` | Draft creation exists; report review/publish UI and time-period views need end-to-end verification. |
| Transfer letters | `/api/academic-records/transfer-requests` and protected download route, exercised by integration test | Transfer Letters tab added on the implementation branch; request/list/download uses existing approval-gated endpoints | Backend workflow exists; user-facing request/review/download entry points need verification. |
| Payments / payout details | Payment ledger exists at `/api/payments`; payout preferences remain a separate endpoint. `/api/payments/:id` now checks learner ownership on the implementation branch | Mobile Profile Hub reads payout method/destination masked/bank/account holder | Payout destination is not proof of a completed payment. A canonical payment ledger/status endpoint still needs to be mapped before any UI sync is added. |
| Avatar / cover media | `POST /api/users/me/avatar`, `POST /api/users/me/cover`, public-profile response | Mobile upload followed by a fresh public-profile read | Upload-and-reload path exists in source; live authenticated persistence still requires browser/device verification. |

## Authentication and data safety observations

- Mobile API wrapper attaches the current bearer token to API requests.
- Own-profile and other-profile loading use different API paths; private own-account data is loaded only for `isOwn`.
- Public-profile paths are used for other users. Do not add phone, payout destination, recovery profile, email verification state, or private academic records to public-profile payloads.
- `PATCH /api/users/:id` prevents non-owner users from directly changing email; verified email-change workflow is required.
- Existing academic-record integration test asserts a learner can request a transfer letter, approved transfers can be downloaded, and learners cannot create manager-reviewed report drafts (403).
- No production database was queried or modified for this audit.

## Next implementation steps

1. Trace the exact academic-record route file and schema definitions; identify read endpoints and role checks for attendance, reports, transfer requests, and payment status.
2. Add an authenticated, read-only academic summary endpoint only if existing endpoints cannot provide a consistent contract; derive the account ID from auth context, not client-supplied IDs.
3. Add web and Android Reports / Attendance / Transfer Letters entry points using existing APIs and pagination/period filters; do not duplicate source records.
4. Add period filters for day, week, month, and term using the institution's existing timezone and academic-term definitions. Never fabricate absent attendance or payment data.
5. Add integration coverage for user isolation, reload/persistence, period boundaries, manager approval, and denial of unauthorized report/transfer access.
6. Run API tests/typecheck and web/mobile checks. Then validate the preview with an authorized test account before any production promotion.

## Verification limits

This document records source-level findings only. It does not claim live inbox delivery, authenticated live user-data verification, Android device verification, or successful production promotion.


## Implementation progress — branch `feat/system-sync-audit-repair`

Commits on this branch include the audit and the following additive repairs:

- Web Profile Hub: Reports, Attendance, Payments, and Transfer Letters tabs for the authenticated user's own profile.
- Android Profile Hub: matching tabs and the same academic-record, approved-report, transfer-request, and payment-ledger endpoints.
- Attendance periods: Daily, Weekly, Monthly, and Termly with explicit start/end date inputs for term ranges; records are filtered from saved attendance only and are never fabricated.
- Payment semantics: the UI reads `/api/payments` (only for learner roles) and labels ledger status separately from payout destination preferences. Pending/reported payments are not represented as cleared.
- API security: `GET /api/payments/:id` now returns 404 when a learner attempts to read another learner's payment.
- Integration test additions: payment list/ID ownership, payout-preference separation, approved-report reload, and transfer-request list isolation assertions in `lib/db/scripts/test-profile-hub-integration.mjs`.

## Latest verification state

- Vercel preview deployment for web commit `0cd10acb74e219d592b691e86ec2d339b81effaa` reached `READY`; the build log reports Vite built successfully. Preview URL: `https://dallyletter-elidems-onlineschoolbyelishamaposa-703gujjoc.vercel.app`.
- The Vercel build emits existing sourcemap-location warnings in UI components; Vite build itself completed.
- Full API integration script has been updated but has **not been executed** against isolated PostgreSQL in this session. API TypeScript typecheck and Android TypeScript/build/device verification have **not been run**.
- Authenticated UI behavior and actual web↔Android persistence/reload are **not yet end-to-end verified**.
- Production remains unchanged: no merge, Render deployment, production database query/mutation, or production promotion was performed.

The Termly filter uses the dates selected by the user/school rather than assuming a fixed school calendar. Production promotion must wait for API integration tests, API typecheck, Android typecheck/build, and authenticated preview verification.
