# Dallyletter Elidems — feature-by-feature design and verification tracker

This is a working acceptance ledger for the real LMS. The source of truth is the existing React/Vite app, Expo app, API and role policies. The generic static mock has been removed.

## Design language

- Signature identity: existing Dallyletter animated D monogram, deep navy and gold.
- Future-interface layer: controlled cyan and violet signal accents, subtle grid/ambient light, layered surfaces, high-contrast navigation and refined data cards.
- Typography: Plus Jakarta Sans for application text, Playfair Display for editorial/brand headings, Orbitron reserved for short technical labels.
- The design should feel advanced and product-specific, not a generic SaaS kit or a government portal.
- Respect reduced-motion preferences; effects must not obstruct content, focus or touch interaction.
- Existing routes, APIs, server-side authorization, stored data and role visibility are invariants.

## Phase 0 — shared foundation

| Surface | Current change | Verification |
|---|---|---|
| Real app entry | Authenticated SPA remains served from the existing `app.html` Vite entry; public landing remains separate | Preview route returns HTTP 200 |
| Web tokens | Navy/gold identity, cyan/violet future accents, accessible light/dark tokens | Build/typecheck pending on latest head |
| Web shell | Existing role-specific navigation retained; ambient future layer and active-route signal refined | Navigation regression tests pending on latest head |
| Cards | Existing Card API and layout retained; refined border, depth and hover focus | Visual review pending from authenticated screenshots |
| Android palette | Light palette aligned to Dallyletter navy/gold; dark palette added with restrained cyan/violet | Full workspace typecheck passed after replacing the unsafe union cast with typed `colors.dark` / `colors.light` selection |
| Teacher-manager nav | Removed duplicate route entries from teacher-manager navigation | Regression assertion for unique destinations passes in the full verification suite |
| Learner notification badge | Corrected the Android home badge to open the existing Feature Hub notifications section instead of a nonexistent route | Added a route regression assertion; Expo TypeScript check passes |

## Phase 1 — learner learning loop

| Feature | Web surface | Android surface | Design pass | Functional acceptance |
|---|---|---|---|---|
| Lessons and media | `StudentLessons.tsx` | `FeatureHub.tsx` lessons section / authenticated media | Existing navy/gold filter-and-card composition retained; future surface layer, token-based media/status accents and brand typography refined | Verify search, filters, follows, media auth, lesson preview, empty/error/loading states |
| Exercises and drawing | `StudentExercises.tsx`, `StudentExercise.tsx` | `FeatureHub.tsx`, `MobileDrawAnswer.tsx` | Refined workspace header and count; existing canvas behavior retained | Verify exercise list, draw/text answers, attachments, offline queue, submission idempotency, returned marks |
| Assignments | `StudentAssignments.tsx` | `FeatureHub.tsx` assignments section | Replaced inconsistent hard-coded blue/purple styling with Dallyletter tokens; clearer task header and status hierarchy | Verify due dates, overdue rules, attachment upload, submit/resubmit, feedback, error recovery |
| Marking and feedback | Teacher marking routes/components | Teacher FeatureHub marking sections | Pending | Verify teacher rubric/marking, returned status, learner feedback and resubmission rules |
| RecordBook | `RecordBookWorkspace.tsx` | Existing mobile reports/RecordBook surface | Existing saved-record workflow retained; Dallyletter technical label aligned | Verify source data, factual/missing marks, role scope, draft/review/approval/PDF permissions |

**Phase 1 status:** the first learner visual pass is in the branch. The Lessons screen has now been aligned to the shared future-interface layer and token-based status colours; Exercises and Assignments retain their real task flows while using the refined Dallyletter surfaces. Full `pnpm run ci:verify` passed in an isolated Vercel sandbox after the Android notification destination was corrected: web/mobile/scripts typechecks, navigation and role-guard audits, teacher-CV static regression, API authorization, assignment submission, offline queue, media-auth and AI-provider tests, web/mobile builds, public-page prerender/SEO verification and release formatting. This does not replace authenticated screen-by-screen visual review or real account/API end-to-end acceptance. No feature is declared fully complete yet.

## Phase 2 — teacher experience

- Teacher home and Profile Hub
- Lesson creation, media and previews
- Exercise authoring and marking queue
- Assignment creation, submissions and grading
- Polls, quizzes and result analysis
- Live classes and class management
- Attendance register and colour-key semantics
- Study groups, chat and notifications
- RecordBook, reports and PDF workflow
- CV, qualifications, certificates, survey and transfer approvals
- Pending, approved, rejected and grace-period account states

## Phase 3 — management and Owner

- Manager, Senior Manager and Junior Manager dashboards
- Per-user Owner-issued grants and permission-denied states
- Teacher/learner monitoring and review queues
- Teacher CV/survey/qualification/transfer decisions
- Classes, lessons, assignments, polls and groups
- Attendance and RecordBook oversight
- Payment configuration, reconciliation and reporting
- Owner alerts, audit logs, AI controls, system health and settings
- Admin read-only boundaries and explicit Owner-only controls

## Phase 4 — Android parity and system-wide features

- Login/session isolation and role-specific home/navigation
- Feature Hub sections and direct deep links
- Camera, document, audio/video and authenticated media
- Drawing, submissions, offline queue and conflict recovery
- Notifications, push delivery and retry states
- Achievements, prefect actions, reports and safety flows
- Touch targets, safe areas, keyboard behavior and accessibility
- Network loss, loading, empty, success and failure states for every feature

## Required completion evidence for each row

1. Capture the real current feature with synthetic test accounts at desktop and Android widths.
2. Compare it to Dallyletter's current brand and the supplied GOVT-3000 visual reference; keep the existing app recognizable.
3. Implement only the necessary UI/UX improvement and preserve the existing API/data/permission contracts.
4. Verify the route and every visible control reaches the intended feature/action.
5. Exercise loading, empty, success, validation, denied, offline and server-error states.
6. Verify backend authorization and persistence, not merely client-side visibility.
7. Run the targeted tests, web/mobile typechecks, builds and relevant workflow suites.
8. Capture the improved screen and record evidence before marking the row complete.

## Release boundary

PR #125 stays draft and unmerged. The Vercel deployment is a preview only. No production deployment, production database change, secret/environment change or production data access is authorised by this design task.
