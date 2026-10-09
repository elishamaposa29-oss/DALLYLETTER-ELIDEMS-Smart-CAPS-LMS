# Dallyletter Elidems production recovery audit — 2026-10-09

## Scope and safety rules

- Production source of truth: protected `main` (observed HEAD `4d8c4f1e29c52ef1a60056e000d0d9d0053a9d5c` during this audit).
- Do not merge historical branches wholesale. Compare individual changes with `main`, then cherry-pick/reimplement only demonstrably missing, compatible work.
- Keep the existing React/Vite + Express/TypeScript + Drizzle/PostgreSQL + Expo architecture, current navy/gold lesson design, role boundaries, and existing routes.
- Never declare a feature complete based only on an HTTP 200/201 or a visible button. Verify persistence, permissions, error handling, reload, role-to-role behavior, and production runtime.
- AI Command Center / owner AI changes are explicitly out of scope for this recovery pass; keep relevant ideas recorded below.

## Findings confirmed from code/logs/repository metadata

1. Render logs show successful API calls for exercise retrieval, submissions, marking, notifications, lesson requests, content permissions and push subscription writes. HTTP 304 is a cache validation response, not a failure. Push subscriptions use `ON CONFLICT (endpoint) DO UPDATE`, so repeated 201 responses do not by themselves prove duplicate rows.
2. `StudentExercise.tsx` previously showed returned total marks, per-answer awarded marks and correction notes, but did not render stored `answer.markingData` on the learner's returned result.
3. `TeacherDrawboxSetup` used the same DOM id for every question and redrew via `document.getElementById`, which can redraw the wrong canvas when an exercise has multiple drawbox questions. Pointer movement mutated a stored pointer object in place.
4. The rich-text sanitizer patch initially contained over-escaped regexes; those patterns have now been corrected in this branch. Continue checking that code-like text is removed without stripping normal rich formatting.
5. Rich-text exercise title normalization initially contained over-escaped whitespace regexes; corrected to normalize NBSP and whitespace before sending the title to the API.
6. `persistUploadedMedia` silently selected local storage when object storage was unconfigured. On ephemeral production instances this can cause uploaded media to disappear after restart/redeploy. This branch now fails production uploads explicitly if durable S3-compatible storage is not configured, while retaining local fallback for development.
7. Teacher media marking had pen/tick tools but no eraser. An eraser was added to the media marking overlay.
8. The object-storage adapter exists and uses `MEDIA_S3_*` configuration, but real R2 upload → reload/retrieve → range playback → delete → verify behavior has not been tested against the live Render service in this audit.
9. Push subscription writes are idempotent at the database endpoint key. The client checks an existing browser subscription and syncs it to the API; repeated POSTs in Render logs are expected synchronization traffic unless database evidence shows duplicate endpoints.
10. Vercel account listing returned 13 Dallyletter-named projects. PR #27 reports several Vercel build-rate-limit failures on obsolete/duplicate projects. The separate team scope containing the check named `dallyletter-elidems-smart-caps-lms` returns 403 under the current Vercel connection, so its project settings/domains cannot yet be inspected; reauthorization is required before canonical project cleanup. Do not delete or disconnect projects until the canonical Git-connected project and production domain are confirmed.
11. The Render connector reported a workspace-selection requirement. Live Render service/environment inspection cannot safely proceed until the user confirms the intended workspace; do not guess a workspace for production operations.
12. Repository default branch is protected `main`; several historical feature/fix branches exist. PRs #1, #17, and #25 are still open and must not be merged wholesale without conflict and feature-parity review. PR #27 is the focused repair branch.

## Work implemented in this repair branch (not yet production-verified)

- Hide embedded HTML/CSS/script/source-code blocks in rich-text output while preserving the editor's supported formatting. Sanitizer regexes corrected after review.
- Normalize rich-text exercise titles to visible text before API submission, including whitespace/NBSP handling.
- Repair media share fallback messaging and use a direct link for opening documents in the existing media component.
- Add teacher drawbox zoom/fullscreen and eraser behavior.
- Fix drawbox canvas identity/redraw so each question uses its own canvas; update pointer movement immutably against the selected pointer id.
- Add returned learner annotation previews for drawbox answers and media, including teacher strokes, ticks, pointers, labels, per-question marks, and red correction notes.
- Add an eraser to the teacher's media-marking overlay.
- Fail closed on production uploads when persistent object storage is not configured, preventing a false success on ephemeral local disk. The live Render configuration must now be verified to avoid unintended upload outage.

- Hand-raise privacy: the prior `GET /raise-hand` route returned all hand raises to any authenticated user when no class filter was supplied, and teacher resolution was not limited to the teacher's classes. This branch now scopes learners to their own raises, teachers to their own classes, and broad monitoring to owner/senior managers; verify with role-based API tests.
- Older product brief status: hand lowering, prefect lesson requests, voice recording, payment-setting UI and block/suspend controls have code footprints, so do not recreate them. Still require end-to-end checks for role promotion/removal, reason capture/audit, voice upload/playback across browsers, account-role exclusivity, admin credential change, and notification deletion/styling. No matching password-change workflow was found in the inspected API routes; treat it as missing until a safe owner-authenticated design is approved.

- Manager moderation reason mismatch: the current moderation route accepts a missing/blank `note`, although the stored product brief requires a reason before a manager blocks or suspends a user. Fix this in a separate permission-focused change with UI validation, API validation, and audit-log verification.
- Role/account exclusivity is not proven by a database constraint or centralized account policy in the inspected code. Do not add a broad unique constraint without defining whether it means one account per person or one role per account; audit and decide with migration-safe rules.

## Must-fix verification gates before merge/deploy

### A. Build, API and release safety
- [ ] CI typecheck, build, lint/release safety all pass on this branch.
- [ ] No unintended duplicate schema, routes, dependencies, secrets, or generated-code drift.
- [ ] Confirm `main` and deployment commit match; confirm health endpoint and error logs after deploy.
- [ ] Validate auth context and role gates for student, teacher, prefect, junior/senior manager, and owner; no cross-user data exposure.

### B. Exercises and marking
- [ ] Create and save an exercise whose title is formatted rich text; reload and confirm no title-required error.
- [ ] Test multiple drawbox questions independently: pen, paint, pointer, eraser, labels, color, width, zoom, fullscreen, clear and reload.
- [ ] Mark drawbox and media answers using pen, eraser, ticks, pointers/labels and red correction notes; save/return; reload as the learner.
- [ ] Verify each question's earned/max marks, total, percentage and teacher's final comment exactly match the API result.
- [ ] Confirm returned marking is read-only for learners and does not allow them to change teacher annotations or marks.
- [ ] Confirm only one return is allowed per attempt and a new attempt does not overwrite the previous result.

### C. Rich text and media viewer
- [ ] Verify normal bold/italic/underline, lists, font, size, color and word-art formatting still render.
- [ ] Verify literal code examples are not mistakenly stripped from educational lesson content; sanitize unsafe active markup.
- [ ] Confirm toolbar actions preserve selection after clicking font, size, color and word-art controls.
- [ ] Check clipboard UI messages on Android/browser; do not attempt to suppress operating-system-owned clipboard notices.
- [ ] Test PDF/document open, full-screen, download, share, images and audio/video on low-end Android and desktop.

### D. Durable media / R2
- [ ] Confirm Render has endpoint, bucket, access key ID, secret access key, and region configured as server-only environment variables; never print secret values.
- [ ] Upload a harmless test file; verify stable database URL/key, retrieve after page reload, restart/redeploy and range playback, then delete and verify both DB reference and object cleanup.
- [ ] Verify behavior for missing/invalid credentials, provider 4xx/5xx, interrupted upload, DB insert failure, unauthorized read/delete, and files near the size limit.
- [ ] If R2 is not configured, report that uploads are intentionally rejected instead of claiming durability.

### E. All roles and product areas
- [ ] Learner: lessons, assignments/submissions, exercise retries/results, polls/results privacy, notifications, groups, media and offline cache.
- [ ] Teacher: lessons, rich text, followers/notify, exercises/create/edit/attachments/marking, assignments, polls, lesson requests, groups/chat, voice/media.
- [ ] Prefect: teacher requests/replies/history, group participation and scoped notifications.
- [ ] Manager junior/senior: preview vs mutation permissions, activity monitoring, learner/teacher controls, group moderation and strict audit isolation.
- [ ] Owner/admin: settings, role management, audits, payments/staff payments, monitoring and integrations; owner-only data remains owner-only.
- [ ] Connect/chat: private conversation isolation, group membership/settings permissions, media, polls, voice, notifications and moderation.
- [ ] Poll lifecycle: draft/create/publish, image attachment, answer, repeat attempts, privacy, results and analytics.
- [ ] Assignments: visibility by grade, upload/preview/download, submit/resubmit, teacher marking/return and media durability.
- [ ] Payments: real provider configuration and verified success/failure/pending/cancelled flows; never fake provider success.
- [ ] Audit logs: actor identity/role, correct actions, redaction and role-specific isolation.

### F. PWA and native APK
- [ ] PWA installability, service-worker cache versioning, stale-cache recovery, update prompt and safe offline fallback.
- [ ] Explicit offline capability matrix: cached lesson text/assets only when available; authenticated writes and fresh media require connectivity unless a safe queue exists.
- [ ] Expo app typecheck/build, API base URL per environment, login/session refresh, lesson/exercise parity, file access, upload behavior, Android permissions and crash-free startup.
- [ ] Record APK/AAB size, installed storage, cold start and low-memory performance before claiming it is lightweight or offline-ready.

## Unmerged work and ideas — compare selectively

- PR #25: manager audit scoping/redaction, private chat participant isolation, group-settings permissions, follow controls and notification preference, push bridge, poll images/publish/retries, lesson-request cleanup, exercise retry/feedback, drawbox upgrades and staff monitoring. Compare each file with current `main`; reuse only missing safe parts. PR is not a safe wholesale merge.
- PR #17: premium reusable button/stat-card styles and motion. Preserve existing lesson design; cherry-pick only if the component is still missing and its reduced-motion/mobile behavior passes.
- PR #1: owner/admin dashboard/settings and AI-provider access control. Security fixes should be reviewed separately; AI/Owner Command Center feature work remains paused.
- Attached AI upgrade specification (ideas, not verified implementations): ELIDEMS AI agent; AI-generated polls; AI monitoring/alerts; external-content learning overlays and content limits; BREAK-ELIDEMS rotating events; temporary event benefits; content safety detection and automated actions; admin override/reversal. These require separate authorization, legal/privacy review, permissions, auditable reversible actions and cost/safety planning before implementation. Do not silently activate them during production repair.
- Native mobile publishing/signing, custom domain cutover, canonical Vercel integration cleanup, and Render/R2 production secret verification remain infrastructure tasks, not solved by web preview success.

## Additional findings from expanded project/mobile/payment scan

- Vercel: 13 Dallyletter-named projects were listed. 11 latest deployments reported ERROR; 2 reported READY (one explicitly targeted production and one had no production target). All returned project metadata showed live=false. This does not prove which URL users are currently using; canonical domain and production project must be confirmed before deleting or disconnecting anything. Twelve duplicate/obsolete Vercel checks currently fail from build-rate limits; one differently scoped Vercel check has been successful/pending across recent runs.
- PWA offline: `public/sw.js` caches the shell and same-origin documents/scripts/styles/fonts when online; it bypasses `/api/` and does not cache authenticated lesson data or media. The manifest makes it installable, but this is not complete offline learning.
- Native mobile: Expo app config and router are present, but the root query client has no persistent cache configured and no evidence of a built/sign-tested APK was found in the inspected files. APK size, cold-start, low-memory and offline behavior remain unverified.
- Paynow: the callback verifies a hash but maps every non-paid status (including cancellation/failure) to `pending`; the UI supports only paid/pending/overdue. A failed checkout initialization can leave a pending row. Fix only after defining provider-state mapping, idempotent callback handling and a tested migration/UI contract.
- Existing PR #25 changes overlap with code already on `main` (including portions of audit isolation, manager activity, follower notifications and marking). Reapplying whole files would risk reverting newer safeguards; compare individual behavior and preserve current code.

- Render Blueprint CORS: the original `render.yaml` contained a placeholder frontend origin (`your-frontend-domain.com`). This branch removes the placeholder and makes CORS origins dashboard-managed; verify the exact canonical frontend origin before the next production deployment, or the browser may block API calls.

## Render branch alignment

The checked-in `render.yaml` production service pointed at `production`; the `production` and `staging` branches were each 348 commits behind `main` at audit time. This branch changes the production Blueprint target to `main` and adds placeholders for R2, VAPID and Paynow server environment variables. `autoDeploy: false` is intentionally retained until CI and the actual Render service/workspace are verified. Editing this repository file does not change the live Render service by itself.

## Branch and pull-request inventory

- 35 Git branches were listed; `main` is protected and remained unchanged during this repair work.
- `production` and `staging` each trail `main` by 348 commits; the two stable recovery branches trail by 324 and 322 commits; `chore/production-db-schema` trails by 114; `fix/platform-feature-auth-loading` trails by 174.
- `fix/platform-role-routing-and-academic-workflows` is diverged (56 commits ahead and 299 behind, 27 changed files). Its old API-base URL and prefect-panel changes overlap with code already on current `main`; do not merge it wholesale.
- Open PRs at audit time: #1 (owner/admin settings; conflicts), #17 (premium UI redesign; mergeable but changes visual components), #25 (preview/notifications/security; conflicts), and this focused #27. Closed PRs #26 and #24–#2 remain historical context, not merge candidates.
- No branch or Vercel project was deleted, no old branch was merged, and no live service was changed during this audit.

## Completion policy

A task is complete only after code review, successful CI/release safety, successful deployment to the intended production service, and role-appropriate end-to-end verification. Any blocked check must retain a named owner/action and must not be relabeled as passed.
