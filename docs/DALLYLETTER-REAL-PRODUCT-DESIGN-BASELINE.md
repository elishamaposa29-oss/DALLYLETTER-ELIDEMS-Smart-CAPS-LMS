# Dallyletter Elidems — real-product design baseline and acceptance plan

## Why this replaces the previous preview

The static mock dashboard previously added to this branch was generic and did not represent the existing Dallyletter Elidems product. It has been removed. The application in `artifacts/dallyletter` and the companion Expo application in `artifacts/dallyletter-mobile` are the product; this plan is not a replacement UI.

## Repository baseline inspected

- Web application: React + Vite + TypeScript, routed in `artifacts/dallyletter/src/App.tsx`.
- Shared authenticated shell and role navigation: `artifacts/dallyletter/src/components/DashboardLayout.tsx`.
- Brand mark: `artifacts/dallyletter/public/favicon.svg` (the animated D monogram on a deep navy field with gold and platinum detailing).
- Existing brand direction: `docs/BRAND-LAUNCH-KIT.md` — primary navy `#0f2a5a`, gold `#b38b00`, existing logo, warm off-white/white/charcoal support colours, real product imagery, and evidence-led claims.
- Web styling tokens: `artifacts/dallyletter/src/index.css`.
- Mobile application: Expo/React Native in `artifacts/dallyletter-mobile`, including role-specific navigation and the feature hub.
- Backend: Express API in `artifacts/api-server`; PostgreSQL/Drizzle and server-side role/permission enforcement.
- Existing real-feature showcase and route tests: `scripts/capture-dallyletter-showcase.mjs`, `scripts/test-all-navigation-targets.mjs`, `scripts/test-navigation-contracts.mjs`, `scripts/verify-role-route-guards.mjs`, and `scripts/audit-role-workflow-parity.mjs`.

**Inspection limitation:** this baseline is based on source-code inspection. It is not a claim that every live screen has been visually inspected or that all routes have passed end-to-end testing. Authenticated screenshots must be collected from the existing showcase workflow using its dedicated synthetic demo accounts. Owner/private screens must never be placed in public showcase artifacts.

## Visual direction — retain Dallyletter

1. Keep the real Dallyletter logo, signature D monogram, wordmark, navy/gold identity and product-specific language.
2. Preserve the visual richness and purposeful information density of the existing product and the founder-supplied mobile dashboard reference: layered dashboards, useful metrics, meaningful card hierarchy, distinctive feature surfaces, clear active states and strong mobile navigation.
3. Do not flatten the product into a generic government portal, plain white admin template, generic LMS kit, or unrelated neon/cyan/purple rebrand.
4. Use gold as a deliberate identity accent; use the existing navy as the principal brand anchor. Maintain readable contrast, spacing, keyboard focus and touch targets.
5. Design each role and feature around its real task and real data. Avoid invented counts, fake approvals, fake payment statuses, fake biometric/security claims, or controls that do not work.
6. Reuse existing design tokens and components where they are sound. Consolidate inconsistencies only after checking the affected pages and responsive states.

## Role and feature inventory to review one by one

### Learner and Prefect
- Learner dashboard and profile hub
- Class & Learning Operations
- Lessons and authenticated media preview
- Exercises, written answers and drawing workspace
- Assignments, submission, marking feedback and resubmission
- Live classes and timetable
- Study groups and Connect/chat
- Polls and quizzes
- RecordBook and learner reports
- Achievements and BREAK-ELIDEMS
- School fees and payment history
- Notifications and deep links
- Confidential report-to-Owner flow
- Prefect panel and prefect-only actions

### Teacher
- Teacher dashboard and Profile Hub
- Lessons, media and lesson preview
- Exercise builder, submissions and marking queue
- Assignment creation, submissions and marking
- Classes and live-class controls
- Polls and quizzes
- Study groups, chat and notifications
- Teacher RecordBook, attendance evidence and reports
- Student payment visibility
- Qualifications, certificates, CV and application status
- Pending/rejected/approved teacher access states
- Manager features only where separately granted to a teacher-manager account

### Junior Manager, Senior Manager and Manager
- Manager dashboard and permission-aware metrics
- Teacher and learner monitoring
- RecordBook, assignments and marking oversight
- Class, lesson, poll and group management
- Teacher CV, qualification, transfer and report review queues
- Notifications, chat and reports
- Prefect and achievement administration
- Moderation and permitted audit history
- Per-user Owner-issued grants, scope limits and denied states
- No Owner-only financial, security, system or Owner-audit access unless explicitly authorised by the actual policy

### Owner and Admin
- Owner command centre and platform health
- Users, roles and account lifecycle
- Individual Junior/Senior manager permission grants and audit trail
- Teacher CV/survey/qualification and transfer approvals
- Lessons, classes, assignments, polls and groups
- Payment configuration, reconciliation, financial and staff-payment views
- AI provider/settings and AI usage controls
- Notifications, safety/moderation and audit logs
- Reports, achievements, owner alerts and settings
- Admin is not an Owner alias; Owner-only actions remain Owner-only

### Android / Expo
- Authentication, session isolation and role-aware home/navigation
- Learner and teacher feature parity with the web where the feature is supported
- Manager permission checks and explicit denied/loading/error states
- Drawing, camera/media/document upload and authenticated playback
- Offline queues, retry/conflict handling and reconnect state
- Push notifications and deep links
- Safe-area, keyboard, small-screen and accessibility behavior

## Required design-and-test loop for every feature

For each feature, in order:

1. Record the current web and Android route/component, API endpoints, permission keys, role visibility and existing tests.
2. Capture the existing screen at desktop and Android viewport using synthetic demo data. Compare against the real Dallyletter brand and founder reference.
3. Identify the exact UX defect(s), not a speculative redesign. Record current behavior and intended behavior.
4. Improve that feature without removing its API contract, stored data, role policy, workflow, navigation destination or mobile parity.
5. Test loading, empty, success, validation, permission-denied, network-error and small-screen states.
6. Test the actual action end to end against a safe preview/test environment; do not fake success in the UI.
7. Run targeted unit/type/navigation/authorization tests and the relevant full build checks.
8. Capture the improved screen and compare it against the baseline before moving to the next feature.

## Release and safety gates

- All work stays on this PR branch until the founder reviews it.
- No production merge, production deployment, production database migration or secret/environment change is authorised by this design task.
- No production data is used in screenshots or test fixtures.
- Backend authorization remains authoritative; hiding a button is not security.
- No existing feature is removed or silently replaced.
- A feature is not marked complete merely because a screen renders. Its route, action, API, permission, persistence, error handling, mobile behavior and tests must all pass.
- If an existing implementation is broken, preserve its behavior/data contract while repairing the defect; do not paper over it with a mock action.

## First execution order

1. Restore the authentic application as the preview entry point (remove the unrelated static mock page).
2. Capture and inspect current authenticated learner, teacher, manager, junior manager and senior manager screens using synthetic showcase accounts.
3. Review the shared shell/navigation and responsive behavior without changing role policy.
4. Then proceed feature-by-feature, starting with the learner learning loop: lesson → exercise/drawing → submission → marking/feedback → RecordBook evidence.
