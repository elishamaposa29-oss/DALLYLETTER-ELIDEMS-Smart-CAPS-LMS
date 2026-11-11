# Role workflow parity matrix — 11 November 2026

## Scope and certification rule

Target: complete functional parity for teacher, learner, manager and admin workflows across the Express API, React web app and Expo Android app. The frontend may provide more capability than the backend, but it must not invent authority or bypass server authorization.

This matrix is an execution record, **not a 100% certification**. Source-level presence is not enough. A workflow is only certified after its complete lifecycle passes with real role accounts, persisted state, direct-API denial tests, reload/restart checks and web + Android verification.

Status labels:
- **Source wired** — route and client code references exist.
- **Added in this pass** — a previously absent client workflow was implemented in this branch.
- **Runtime unverified** — requires CI, authenticated environment/device testing.
- **Not established** — current inspection has not proved a complete implementation.

## Role × workflow matrix

| Role | Workflow family | Backend/API surface | Web surface | Android surface | Current evidence / remaining acceptance |
|---|---|---|---|---|---|
| Teacher | Lessons: create, edit, media, notify followers, content permissions | `lessons.ts`, `contentPermissions.ts` | `teacher/TeacherLessons.tsx` | `(teacher)/lessons.tsx`, `MobileOperationsWorkspace` | Source wired. Test own-content authority, other-owner requests, duplicate submission, approval/decline, reload and notification. |
| Teacher | Content permission request lifecycle: submit, incoming list, approve, decline, requester history, report declined decision | `contentPermissions.ts`: POST/GET/mine/PATCH/report plus GET reports and POST report review | `teacher/TeacherLessons.tsx`, `OperationsWorkspace.tsx` | `MobileOperationsWorkspace.tsx` | Requester lifecycle is source-wired. This pass adds a scoped management escalation inbox, review-note action and requester notification on web + Android. Runtime scope, persistence and restart tests remain required. |
| Teacher | Class register, learner roster, present/absent, statistics | `attendance.ts`, `classes.ts` | `teacher/TeacherClasses.tsx`, `OperationsWorkspace.tsx` | `(teacher)/classes.tsx`, `MobileOperationsWorkspace.tsx` | PR #114 adds register endpoints and workspaces. Runtime and assigned-teacher/manager-scope tests remain required. |
| Teacher | Assignments, submissions, marking, feedback | `assignments.ts` | `teacher/TeacherAssignments.tsx` | `FeatureHub.tsx`, `(teacher)/work.tsx` | Source exists; prove submit/mark/return/resubmit and authenticated attachment retrieval on both clients. |
| Teacher | Exercises, marking queue, per-question marks, feedback, reports | `exercises.ts`, `academicRecords.ts` | `ExerciseMarking.tsx`, `TeacherExerciseQueue.tsx` | `(teacher)/work.tsx`, `MobileDrawAnswer.tsx` | PR #114 adds teacher-wide queue. Prove published-only scope, marking persistence, learner result visibility and report aggregation. |
| Teacher | Poll/quiz create, publish, close, review results | `polls.ts` | `teacher/TeacherPolls.tsx` | `FeatureHub.tsx` | Source exists. Verify every mutation, duplicate-vote prevention, result privacy and Android parity. |
| Teacher | CV/resume, qualifications, readiness survey submission, status, chat and history | `users.ts`, `teacherCvWorkspace.ts`, qualifications routes | `TeacherQualifications.tsx`, `TeacherCvWorkspace.tsx`, `ProfileHub.tsx` | `TeacherCvEditor.tsx`, `profile-hub.tsx` | Applicant-side Android workflow exists. Reviewer-side Android workspace was absent in the inspected route tree; **added in this pass** as `TeacherCvReviewWorkspace` with queue/details/documents/qualifications/survey decisions/history/chat/config and Owner/Manager entry routes. Runtime permission and document-preview checks pending. |
| Teacher | Academic report preparation and submission | `academicRecords.ts` | `RecordBookWorkspace.tsx`, `TeacherAssignments.tsx` | `(teacher)/reports.tsx`, `RecordBookWorkspace` | Source exists. Verify create/edit/submit, reviewer return/approve, final learner visibility and PDF export. |
| Teacher | Notifications, chat, study groups, payments, profile/privacy | `notifications.ts`, `messages.ts`, `studyGroups.ts`, `payments.ts`, `users.ts` | Teacher pages + Profile Hub | Teacher tabs, FeatureHub, Profile Hub | Source exists. Test delivery/read state, private two-account isolation, group membership permissions and verified payment status. |
| Learner | Classes/enrolment/join/attendance/history/stats | `classes.ts`, `attendance.ts`, `dailyAttendance.ts`, `users.ts` | `student/StudentClasses.tsx`, `ProfileHub.tsx` | `(student)/classes.tsx`, `profile-hub.tsx`, `MobileOperationsWorkspace.tsx` | Source wired. Verify enrolled roster, attendance join, own history, no ability to edit others, and report consistency. |
| Learner | Lessons/media, assignments, exercise answer/drawing, resubmit and returned marks | `lessons.ts`, `assignments.ts`, `exercises.ts` | Student lesson/assignment/exercise pages | Student tabs, FeatureHub, `MobileDrawAnswer` | Source exists. Verify rich media fidelity, upload/download, autosave, idempotency, marking and feedback persistence. |
| Learner | Polls/quizzes, achievements, notifications, chat, groups | `polls.ts`, `achievements.ts`, `notifications.ts`, `messages.ts`, `studyGroups.ts` | Student pages | Student tabs, FeatureHub | Source exists. Verify attempt/vote lifecycle, award criteria, notification recipients, private chat and group controls. |
| Learner | Academic reports, attendance evidence, transfer requests, profile/privacy | `academicRecords.ts`, `users.ts`, `profileConnections.ts` | `ProfileHub.tsx`, student pages | `profile-hub.tsx`, `app/profile-hub.tsx` | Source wired. Verify submit/list/approve/decline/history/download and privacy visibility for every role. |
| Learner | Payments and fee status | `payments.ts` | `student/StudentPayments.tsx` | FeatureHub/Profile Hub | Source exists. Verify partial/full reconciliation, webhook authenticity, pending vs paid distinction and receipt history. |
| Manager / Senior / Junior | Owner-granted permission discovery, scoped staff/learner oversight, audit | `managerPermissions.ts`, `manager.ts`, `auditLogs.ts`, role policy | Manager pages, permission controls | Manager dashboard/Profile Hub/Operations | Source exists. Test every grant individually, revocation immediately, hierarchy ceilings, no owner/admin visibility leakage and Junior/Senior boundaries. |\n| Owner | Assign/remove Junior/Senior roles, individual grants, deny, history | `managerPermissions.ts` | `ManagerPermissionControls.tsx` | **Added in this pass:** `(admin)/users.tsx`, `ManagerPermissionControlsMobile.tsx` | Owner-only mobile entry; per-capability Grant/Deny, Senior-only guard, role removal/revocation and history are wired. Runtime owner-only denial, persistence and audit history checks remain required. |
| Manager / Senior / Junior | Teacher CV and qualification review, applicant chat/history | `teacherCvWorkspace.ts`, qualifications routes | Manager CV workspace, qualifications pages | **Added in this pass**: manager route to shared review workspace | Backend permission middleware remains authoritative. Test no access without explicit `teacher_cv.view`, `teacher_cv.review`, `teacher_cv.authorize`, `teacher_cv.chat` grants; Junior cannot approve/authorize. |
| Manager | Transfer letters, academic report review, achievement recommendations, learner/teacher reports | `academicRecords.ts`, `manager.ts`, `achievements.ts` | Manager review queue, transfer, report review, achievement pages | **Added in this pass:** `(manager)/transfer-requests.tsx`, `TransferRequestReviewWorkspace`; `(manager)/academic-reports.tsx`, `AcademicReportReviewWorkspace`; Owner routes under `(admin)` | Android transfer review now loads scoped requests, displays original form fields and signatures, supports grant-gated approve/reject, preserves review notes and downloads approved PDFs through authenticated API retrieval. Android academic report review now lists scoped drafts, displays recorded marks/attendance/commentary, supports grant-gated approve/reject with reviewer notes, and downloads approved PDFs through authenticated API retrieval. Runtime permission, document and persistence checks remain required. Achievement recommendation review still needs Android verification/coverage. |
| Manager | Attendance, communities, notifications, content permissions | `attendance.ts`, `socialFeatures.ts`, `contentPermissions.ts`, `notifications.ts` | Operations workspace and manager pages | `MobileOperationsWorkspace.tsx` | PR #114 adds core workspace. Verify grants and manager scope on every direct API action. |
| Admin / Owner | Users, settings, audit, alerts, safety, finance/payments, achievements, platform command centre | `users.ts`, `settings.ts`, `auditLogs.ts`, `ownerAlerts.ts`, `safety.ts`, `payments.ts`, `ownerCommandCenter.ts`, `achievements.ts` | Admin/Owner pages and Command Centre | Admin tabs, `(admin)/tools.tsx`, Owner More | Android Owner financial tools now include pending manual-payment report list, Owner verification/settlement against the invoice ledger, and rejection that leaves balances unchanged. Keep Admin separate from Owner and Manager authority. Test direct API denial and ensure owner-only financial/system controls stay owner-only. |
| Admin / Owner | Teacher CV queue, decisions and survey review | `teacherCvWorkspace.ts` | Owner Command Centre and CV workspace | **Added in this pass**: Owner route and mobile review workspace | Owner entry is exposed; API authorization still decides. Admin is not given manager grants by this change. Verify owner can inspect evidence and authorize; test Admin denial unless explicitly allowed by backend policy. |

## Newly implemented in this pass

1. Added `artifacts/dallyletter-mobile/components/TeacherCvReviewWorkspace.tsx`.
   - Loads the backend review queue and Owner-configurable review duration.
   - Opens the applicant detail record, uploaded documents, qualifications, readiness survey, review history and private chat.
   - Supports CV approve/reject, independent survey approve/reject, chat send and review-duration update.
   - Downloads protected teacher documents using the authenticated API before opening them.
2. Added hidden Expo routes for Admin/Owner and Manager groups.
3. Added Owner and Manager More-screen entry points. Manager access is not granted by the UI; backend grants remain authoritative.
4. Added static regression checks for the CV review lifecycle and the existing content-permission lifecycle.
5. Added a static route-to-client inventory generator at `scripts/audit-role-workflow-parity.mjs`.
6. Added management review of declined content-permission escalations: scoped report listing, idempotent review recording, audit-log history and requester notification. Wired the inbox and review-note action into both web and Android Operations Workspaces.
7. Exposed the API-authorized Admin CV-review workspace in Android Admin navigation and reviewer controls; corrected invalid Feather icon names that blocked Android typechecking.
8. Corrected the static parity assertion so the web report action is checked in the Operations Workspace where it is actually implemented.
9. Added an Android transfer-letter review workspace for authorized Managers and Owner, including original submitted form/signatures, grant-gated approve/reject, reviewer notes, history/status and authenticated approved-PDF download.
10. Added an Android academic-report reviewer workspace for Managers with `reports.view` and Owners, with `reports.review`-gated approve/reject, saved reviewer notes, recorded mark/attendance evidence and authenticated approved-PDF download.
11. Added Owner-only Android manager-role and individual-permission controls from the Users screen, including Junior/Senior assignment, per-capability Grant/Deny, Senior-only restrictions, removal/revocation and permission-change history.
12. Added Owner-only Android manual-payment report review: list unverified reports, verify and settle against the referenced invoice, or reject without changing the fee ledger; requester notifications remain server-controlled.

## Exact verification still required

- Run the new static regression test and the full CI/typecheck/Android build on the exact branch head.
- Run the generated route inventory and manually classify every endpoint flagged as missing from Web or Android. Webhooks, internal callbacks, and owner-only server routes must not be turned into inappropriate UI.
- Use real learner, teacher, Junior Manager, Senior Manager, Admin and Owner accounts. For every operation, test allowed and denied calls directly against the API.
- Exercise every lifecycle: submit → list → approve/decline → requester notification → history → report/escalation → management report list → review note → requester notification → reload/restart. Verify persistence in the database and correct recipient visibility.
- Verify all document/media links with authenticated retrieval; verify report PDFs and attachments open on a real Android device.
- Run both web and Android end-to-end tests for attendance, assignments, exercises, polls, CV/qualifications, transfer letters, reports, achievements, notifications, messages, groups, payments, settings, audit and safety workflows.
- Capture exact commit SHA, role, environment, API/UI path, expected/actual outcome and sanitized evidence for every pass/fail.

## Certification

**Not certified yet.** This branch adds a previously missing Android teacher-CV reviewer workflow and regression coverage, but broad platform parity is not proven until the remaining route inventory is classified and all role/action lifecycles pass the tests above. No production deployment, database mutation, permanent URL change, environment-variable change or secret change is included.
