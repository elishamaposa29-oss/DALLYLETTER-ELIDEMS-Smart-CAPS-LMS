# Feature Visibility Audit — 2026-10-26

## Purpose and evidence standard

This is a source-level visibility audit, not a claim of complete end-to-end verification. A feature is only **VISIBLE** when its intended user can discover and reach the control on the relevant screen; **PRESENT / NOT VERIFIED** means the source contains it but runtime visibility/functionality is not yet tested; **GAP** means the UI or entry point is absent or materially narrower than its counterpart; **ROLE-GATED** means visibility depends on authorization and must not be bypassed.

Audit baseline: main commit `4bd32c817cded848d16da7d5ae3188534d37c7d5`. Web app: `artifacts/dallyletter`. Android app: `artifacts/dallyletter-mobile`.

## Findings verified from source

| Feature/control | Web location | Android location | Finding | Next action |
|---|---|---|---|---|
| Feature preview hub entry point | `src/pages/FeatureCenter.tsx`, route `/features` | `components/FeatureHub.tsx`, reachable from role-specific More screens | PRESENT, discoverability is weaker than a dashboard-level entry | PR #83 adds dashboard entry points for student, teacher and owner |
| Learner drawing pen | `src/pages/student/StudentExercise.tsx`, DrawBox | `components/MobileDrawAnswer.tsx` | PRESENT on both; Android drawing is materially narrower | Add/test accessible native tools and match core web capabilities |
| Drawing colour | DrawBox colour input | Mobile palette | PRESENT on both; different interaction | Test touch-target/accessibility and parity |
| Drawing size | DrawBox size range | Mobile 2/4/7 px choices | PRESENT on both; mobile offers fewer settings | Consider continuous size control if usable on small screens |
| Drawing opacity | DrawBox opacity control | No matching control identified in MobileDrawAnswer | GAP on Android | Implement if part of intended mobile parity |
| Drawing eraser | DrawBox eraser tool | Mobile eraser toggle | PRESENT on both; test actual erasure semantics and saved stroke behavior |
| Drawing text labels | DrawBox text tool and label text input | No matching tool identified in MobileDrawAnswer | GAP on Android | Add label creation/positioning and persisted-data tests |
| Drawing pointer/arrow | DrawBox pointer tool | No matching tool identified in MobileDrawAnswer | GAP on Android | Add touch-friendly pointer/arrow tool |
| Drawing undo | DrawBox undo stack | Mobile undo stroke | PRESENT on both; semantics differ | Test multi-segment stroke grouping and saved state |
| Drawing redo | DrawBox redo stack | No matching control identified in MobileDrawAnswer | GAP on Android | Add redo history and regression tests |
| Drawing clear | DrawBox clear action | Mobile Clear drawing | PRESENT on both | Test disabled/read-only/permission states |
| Drawing magnification | DrawBox magnification state | No matching control identified in MobileDrawAnswer | GAP on Android | Assess mobile zoom/pan usability and implement if required |
| Student Feature Hub access | Student web role navigation updated in PR #82 (not yet merged at audit time) | Student More tab hosts FeatureHub; PR #83 adds a dashboard quick action | Discoverability improvement in progress | Pass CI/build/smoke before merge |
| Teacher Feature Hub access | Teacher web role navigation updated in PR #82 (not yet merged at audit time) | Teacher More tab hosts FeatureHub; PR #83 adds dashboard entry | Discoverability improvement in progress | Pass CI/build/smoke before merge |
| Owner Feature Hub access | Owner web role navigation updated in PR #82 (not yet merged at audit time) | Admin More tab hosts FeatureHub; PR #83 adds dashboard entry | Discoverability improvement in progress | Pass CI/build/smoke before merge |
| Password recovery | Web routes include `/forgot-password` and `/reset-password`; screens are lazy-loaded | PR #80 says Android recovery/profile flows exist | Source/PR evidence only; email delivery and real device flow not verified | Test delivery, one-time token, expired token, session revocation, and Android screens |
| Assignment/exercise submission and marking | Learner exercise and teacher marking screens exist | FeatureHub and native Work screens contain related flows | Present in source; end-to-end parity not established | Test learner submit, teacher mark/return, attachments, retry, offline recovery |
| Chat/media/offline | Web role-specific chat/media screens exist | Mobile FeatureHub and chat screens exist; prior parity ledger records gaps and fixes | Partial/unverified | Verify direct/group chat, media authorization, retry and account switching |
| Push notifications | Web notification controls exist | Native push registration controls exist according to parity ledger | Provider/device delivery unverified | Verify real Android registration, accepted dispatch and device receipt |

## Important safeguards

- Do not expose owner/manager-only tools to learners merely to make them visible. Use explicit role-appropriate navigation and preserve API authorization.
- Do not mark a feature complete just because a route/component exists.
- Treat provider-backed features (email, push, media storage, payments) as unverified until provider configuration and real test flows succeed.
- Keep the Android app first-class. Web UI controls do not count as native mobile parity.
- This initial audit samples high-risk and small controls; it is not yet a complete file-by-file inventory of all repository components, routes, API endpoints, feature flags, responsive breakpoints, keyboard/touch states, and deployment behavior.

## Immediate execution

1. Add clear dashboard entry points to the existing role-protected Feature Hub (PR #83).
2. Continue component-by-component review, including all drawing tools, toolbar buttons, upload affordances, empty/error/loading states and role-conditioned controls.
3. Add Android parity for drawing controls absent from the native UI, with tests.
4. Verify build/typecheck, Android APK build and emulator smoke before merge; do not bypass branch protection.
5. Update this ledger with source path, role, visibility result, runtime evidence and regression coverage for every audited control.


## Second pass — route and dashboard discoverability (source inspection)

Current audited web router defines **61 routes**. The role navigation exposes 54 href entries after the current visibility work; the remaining dynamic exercise routes are intentionally contextual rather than safe static sidebar destinations.

| Screen/control | Web visibility | Android visibility | Result / next action |
|---|---|---|---|
| Feature Preview Center | Added visible student/teacher/owner sidebar entries on this work branch | Dashboard shortcut on student/teacher/owner home in this work branch | Changes are committed but not merged/deployed; CI pending at last check |
| Teacher CV / qualifications | Added teacher sidebar link to `/teacher/qualifications` | No equivalent native screen verified in this pass | Native CV submission/approval discoverability remains an audit gap |
| Manager notifications | Added to manager navigation for authorized manager-flagged staff | Owner/teacher notification areas exist; exact manager parity not verified | Test manager flag access and API authorization; do not expose to ordinary teachers |
| Manager prefect management | Added to manager navigation for authorized manager-flagged staff | No dedicated native manager prefect screen verified; feature hub exposes learner prefect section only to prefects | Mobile management UI gap to investigate |
| Owner command center | Added `/admin/command-center` to owner navigation | Owner dashboard already has a dedicated “Open Owner Command Centre” shortcut, role-gated in UI | Verify owner API permissions and all sub-controls; do not grant to admin/learner roles without policy |
| Learner exercise route | `/student/exercises/:id` is reached from a selected exercise/lesson context | Feature Hub opens an exercise list and then selected exercise detail | Contextual route; test navigation from actual list, not sidebar |
| Teacher exercise marking | `/teacher/exercises/:id/mark` is reached from teacher marking/submission workflow | Teacher uses Work/Marking tab and Feature Hub exercise section | Contextual route; verify returned work, attachment previews, marks, feedback and resubmission states |
| Android top-level tabs | Student: Home, Lessons, Work, Classes, Chat, More, Profile; Teacher: Home, Lessons, Marking, Classes, Chat, More, Profile; Owner: Dashboard, Users, Payments (role-gated), Alerts, More, Profile | Several extra routes are intentionally hidden from the tab bar (`href: null`) and must be discoverable through dashboard/More tools | Continue tracing every hidden tab route to a visible in-app entry; hidden tab alone is not a bug if there is a clear entry point |
| Native drawing answer | Web DrawBox has pen, paint, eraser, text labels, arrows/pointers, colour, size, opacity, undo/redo, selection/clear and magnification-related state | Updated component adds Pen/Paint/Eraser/Arrow/Text, colour, size, opacity presets, Undo/Redo and Clear; pointer/label render support added | Source change committed on this work branch; needs TypeScript/build and touch-device verification. Magnification and selection parity remain open. |

## CI / deployment status for this execution branch

- Latest work branch commit at this checkpoint: `c2c919eb5efe6c12cfb451edea2554d1d016648f` (subsequent audit fixes may advance it).
- CI and Release Safety were still running at the last status read. Do not treat them as passing until refreshed.
- Android APK/emulator workflow was **skipped** because its workflow deliberately gates PR runs behind the `android-release-check` label or manual dispatch. No APK or emulator evidence exists for these changes yet.
- The branch is not merged and these fixes are not live production changes.


## Third pass — drawing, manager tools, account security

| Feature/control | Current source finding | Visibility execution | Verification still required |
|---|---|---|---|
| Native drawing: pen and colour | Already visible in learner drawbox | Preserved | Confirm touch input and persisted strokes on a real Android device |
| Native drawing: paint/highlighter | Added as a separate `paintStrokes` layer so paint is not duplicated as pen ink | Implemented in work branch | Verify render/save/reload and eraser interactions |
| Native drawing: eraser target | Added Pen only / Paint only / Both controls; removes nearby saved segments from the selected layer | Implemented in work branch | Verify touch accuracy, edge cases, teacher template protection and undo/redo |
| Native drawing: arrow/pointer | Added arrow tool with arrowhead, colour, opacity and adjustable size | Implemented in work branch | Verify touch drag, short taps and stored drawing reload |
| Native drawing: text label | Added text entry plus tap-to-place label control | Implemented in work branch | Verify text entry on Android keyboard, label persistence and small-screen layout |
| Native drawing: opacity | Added 50%, 75%, 100% presets | Implemented in work branch | Compare with web slider and ensure teacher/learner layers retain opacity |
| Native drawing: undo/redo | Added history stacks for drawing actions | Implemented in work branch | Regression-test consecutive actions, clear, erase, arrow, label, undo and redo |
| Native drawing: magnification | Added 1× / 1.5× / 2× zoom with adjusted touch-coordinate mapping | Implemented in work branch | Verify drawing alignment at each zoom level; pan/viewport movement is still not implemented |
| Native drawing: stop tool | Added a Stop tool that prevents drawing gestures | Implemented in work branch | Selection/move of arbitrary strokes and labels remains unimplemented on mobile |
| Manager monitoring | Web manager screens use `/api/manager/dashboard`, `/api/manager/teachers`, `/api/manager/students`, `/api/manager/reports/overview`, and prefect leaderboard | Existing `ManagerDashboard` already has overview, teachers, students, prefects and reports panels; added explicit More Tools and Account entry points. Fixed FeatureHub role normalization so manager/senior-manager accounts receive authorized teacher tools and audit section | Verify role flag behavior and all endpoints with a real manager account; confirm the API denies ordinary teachers |
| Teacher qualifications/CV | Web `/teacher/qualifications`; Android `TeacherCvEditor` is embedded in the teacher Profile tab | Web link added; Android CV editor already present in Profile | Verify upload, approval status and persistence on Android |
| Change password | API `POST /api/auth/change-password` requires current password, accepts 8–256 characters and revokes active sessions. Web owner settings previously accepted 6 characters and stayed on a revoked session | Mobile ProfileDetailsEditor now exposes password change for learner, teacher and owner profiles; web owner settings now aligns validation to 8–256 and navigates to login after success | Verify current-password rejection, success, session revocation, and fresh login on web/Android |
| Recovery settings | Mobile profile editor exposes alternate email verification and recovery options for non-privileged roles; privileged users are intentionally excluded from those alternate recovery settings | Kept role policy unchanged | Verify owner recovery through the approved recovery path; do not make privileged recovery depend on an unverified alternate email |
| Mobile owner tools | Owner More includes Command Centre shortcut, Break-ELIDEMS shortcut and FeatureHub; owner tab hides tools/academic/break routes from the tab bar | Existing visible shortcuts traced; these routes are not all missing, some are intentionally nested | Verify every tool sub-section is reachable and correctly owner-gated |

## Latest execution caveats

- All changes above are still on the unmerged visibility work branch/PR; they are not live production changes.
- The Android workflow is skipped on pull requests unless the `android-release-check` label is present or the workflow is manually dispatched. Do not claim device-level verification from a skipped run.
- The Vercel preview check returned a build-rate-limit failure (`upgradeToPro=build-rate-limit`); this is a provider quota/plan blocker, not evidence that the TypeScript build passed or failed.
- CI previously exposed TypeScript errors in the expanded drawing component; the missing teacher `paintStrokes` type was fixed afterward. The latest head must pass a fresh CI run before the work can be considered verified.


## Fourth pass — owner and manager navigation corrections

- Added a visible **Achievements & Badges** entry in owner More and a mobile owner-tools section for listing achievements, creating badges, and awarding them to selected learners using the existing API routes.
- The manager dashboard already had overview, teacher, student, prefect and reports panels. The actual visibility issue was missing obvious navigation from the dashboard to More and account settings, plus FeatureHub treating explicit `manager` / `senior_manager` roles as non-teachers. Added dashboard shortcuts and a manager account/security screen, and normalized manager role detection in FeatureHub.
- Added account password change UI to the shared mobile profile details editor. It uses the existing authenticated `/api/auth/change-password` endpoint, enforces the server's 8–256 character length, and offers a sign-in action after the server revokes sessions.
- Added a web login confirmation banner when redirected after a password change; web owner settings now enforces the same server length and redirects to sign-in after successful password update.
- These are source changes on the unmerged execution branch. The branch still requires a fresh passing CI run and Android emulator/build evidence; the Vercel preview check is currently failing due the provider's build-rate limit.


## Fifth pass — role-navigation and control parity defects found during execution

- Fixed the mobile FeatureHub "back to tools" action: explicit manager/senior-manager accounts and manager-flagged accounts now return to Manager More; prefects return to Student More instead of being routed into the admin tab group.
- Fixed mobile audit-section visibility so explicit `manager` and `senior_manager` roles use the same UI eligibility check as the already-authorized manager audit API. The API remains authoritative and continues to limit manager-visible audit categories/details.
- Corrected an over-broad manager-to-teacher UI mapping found during review: explicit manager roles may see management/audit features, but do not automatically receive teacher exercise-creation/marking UI merely because they are managers. Existing explicit `isManager` permissions remain handled separately.
- Fixed web Feature Preview Center role-card filtering to normalize role names (including spaces/hyphens and case) before checking card eligibility.
- Drawing pass now verifies the native drawbox has explicit Pen, Paint/highlighter, Eraser with pen/paint/both targets, Arrow, Text, stop tool, colour, size, opacity, zoom, Undo, Redo and Clear controls in source. Compatibility changes preserve legacy paint strokes and allow clearing paint-only drawings. Runtime gesture/visual testing is still pending.
- CI and Release Safety were queued/in progress after the latest source corrections; Android APK/emulator job was pending at the last check. No production deployment or merge is claimed.

## Sixth pass — learner exercise entry point

- Found a genuine web discoverability gap: the learner exercise detail route required a numeric exercise ID, but the web app did not expose a published-exercise index. The Feature Preview Center's "Drawing / answer workspace" card pointed to Lessons rather than an exercise list.
- Added a dedicated /student/exercises screen that requests published exercises through the existing authenticated per-lesson API, lists status and returned marks, has loading/error/empty/retry states, and opens the existing exercise detail page.
- Added the learner navigation entry Exercises & Drawing and redirected the Feature Preview Center card to the new index. The API path follows the actual mounted endpoint /api/exercises/lessons/:lessonId/exercises; this screen does not create a new API permission or bypass per-lesson access checks.
- The new web exercise index is source-implemented but awaits CI typecheck/build and browser verification. The latest Android build is also still pending; no APK artifact has been confirmed.

## Seventh pass — owner alias route visibility

- Found a route-level mismatch: API authorization treats owner, admin, and legacy platform_owner as owner roles, while web ProtectedRoute only treated admin as an owner alias. This could leave platform_owner accounts blocked from owner screens despite backend authorization.
- Updated web ProtectedRoute alias handling, owner navigation rendering, role badges, and Feature Preview Center eligibility so these aliases reach the same owner-only frontend surfaces. The server remains authoritative; this does not expand API permissions.
- This fix awaits CI typecheck/build and role-matrix verification.
