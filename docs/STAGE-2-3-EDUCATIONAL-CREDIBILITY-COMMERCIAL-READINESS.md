# Dallyletter Elidems — Stage 2 and Stage 3 delivery notes

This document distinguishes product surfaces found in source from capabilities that have passed end-to-end verification. It is not an accreditation claim or a production-readiness certificate.

## Stage 2 — educational credibility

### Public experience delivered in this change
- The signed-out root route presents a public Dallyletter overview; authenticated users continue to their role-appropriate home workspace.
- /welcome provides the same public overview as a shareable entry point.
- The page links directly to real learner routes through sign-in: dashboard, lessons, classes, exercises, assignments, study groups, achievements, academic records and school-fee records.
- Educator and management links lead to existing teacher, record-book and manager workspaces. Existing route guards remain in place.
- The public story explains a learning-evidence cycle: learning activity, submitted work, assessment/feedback and authorised records.
- The page explicitly distinguishes platform records from government accreditation and nationally recognised qualifications.

### Existing product surfaces located in the repository
- Learner dashboard: artifacts/dallyletter/src/pages/student/StudentHome.tsx
- Lessons and classes: StudentLessons.tsx, StudentClasses.tsx
- Exercises and assignments: StudentExercises.tsx, StudentExercise.tsx, StudentAssignments.tsx
- Study groups: StudentStudyGroups.tsx
- Achievements: StudentAchievements.tsx
- Payment records: StudentPayments.tsx
- Academic record workspace: artifacts/dallyletter/src/components/RecordBookWorkspace.tsx
- Profile Hub and attendance: artifacts/dallyletter/src/pages/ProfileHub.tsx, DailyAppAttendanceCard.tsx
- Educator dashboard and tools: TeacherHome.tsx, TeacherLessons.tsx, TeacherAssignments.tsx, ExerciseMarking.tsx

Finding a page or route proves source presence only. It does not prove that production APIs, persistence, permissions, uploads, payment providers or every role workflow work correctly.

### Visual assets reused
- Web app icon: public/icons/icon-192.png
- High-resolution app icon: public/icons/icon-512.png
- Existing Dallyletter social/brand artwork: public/opengraph.jpg
- Browser favicon: public/favicon.svg (replaced a placeholder solid-red square with a navy/gold education mark)
- The separate native mobile icon exists at artifacts/dallyletter-mobile/assets/images/icon.png; this change does not replace or regenerate that native asset.
- No stock photography, fabricated screenshots, invented learner testimonials, fake school logos or synthetic usage statistics were added.

### Required verification before making stronger claims
1. Test each learner route using real student and prefect accounts.
2. Verify persisted lesson progress, assignment submissions, exercise marks, attendance, reports and achievement history after reload and a fresh session.
3. Test direct API access and cross-account privacy, not only visible navigation.
4. Confirm that records identify the responsible educator/school reviewer and preserve decision history.
5. Test accessibility, mobile layout, low-bandwidth loading and failure/empty states.

## Stage 3 — commercial readiness

### Public experience delivered in this change
- A school and organisation section explains the intended cohort-based use without inventing customer numbers, partnerships, revenue, prices or deployment guarantees.
- Registration and existing role-specific sign-in flows are linked from the public page.
- Payment language is deliberately restrained: the existing learner payment page is a record/instructions surface; a submitted payment notice must not be described as a verified receipt.

### Commercial model to validate before publishing prices
- **Learner access:** school-managed access and school-fee records, with the institution responsible for confirming its own fee arrangements.
- **School / organisation:** cohort-based onboarding and a negotiated service scope based on learner volume, staff roles, support, storage and integrations.
- **Educator workflows:** teaching, assessment, marking and learner communication inside the role-authorised workspace.
- Do not publish a price, paid plan entitlement, automated school checkout, teacher payout promise or refund guarantee until the matching billing, entitlement, webhook and reconciliation paths are implemented and tested.

### Commercial launch gates still open
- End-to-end student-fee payment verification using a signed provider webhook, idempotency, reconciliation and refund handling.
- Confirmed Paynow/PayPal configuration and successful provider-backed test transactions in a non-production environment.
- School/organisation enquiry capture with a persistent backend record, consent, anti-spam controls and a responsible follow-up owner. The current change does not invent a contact email or pretend an enquiry was submitted.
- Tenant isolation for each school/organisation, staff permissions, learner data export and deletion/retention controls.
- Published service terms, privacy notice, support channel, pricing and cancellation/refund policy.

## Routing and sign-in behavior
- Signed-out / and /welcome show the public overview.
- Authenticated / resolves to the existing home workspace for the account role.
- ?next= sign-in returns only to explicit role-appropriate destinations; unapproved or mismatched destinations fall back to the user's normal role home.
- Server-side route and API authorization remain authoritative. A public link does not grant access.

## Release boundary
This branch is a proposal for review. It does not merge PR #97, deploy to Vercel/Render, change production data, configure payment-provider secrets, or claim that the end-to-end product workflows are verified.
