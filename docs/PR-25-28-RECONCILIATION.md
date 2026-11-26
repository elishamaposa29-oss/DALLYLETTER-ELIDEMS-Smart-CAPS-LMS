# PR #25 / #28 reconciliation against main — 2026-10-17

## Decision

Do not merge either historical branch wholesale. Both branches diverged from current `main`; copying their older versions of shared files would regress newer production safeguards and functionality. This checkpoint is intentionally documentation-only; it does not claim that runtime tests have passed.

## Feature inventory verified in current main

| Feature area | Current-main evidence | Reconciliation decision |
| --- | --- | --- |
| Push notification schema | `artifacts/api-server/src/lib/ensureConnectSchema.ts` creates/adds `notifications.push_sent_at` idempotently | Already present after PR #34; verify on live DB/logs |
| Persistent media storage | `artifacts/api-server/src/lib/media-storage.ts`, `object-storage.ts`, lesson/message media routes | Keep current-main implementation: production rejects uploads without persistent object storage; storage errors clean up staging files; object media streams with backpressure |
| Authenticated media access | `artifacts/api-server/src/routes/messages.ts`, `artifacts/api-server/src/routes/lessons.ts`, `AuthenticatedMedia.tsx` | Keep current-main access checks and storage integration |
| Exercise question attachments | `artifacts/api-server/src/routes/exercises.ts`, `ExerciseBuilderPanel.tsx` | Endpoint and builder references are present; verify upload → save → reload → preview → delete with real authentication |
| Rich-text editing | `RichTextEditor.tsx` | Selection save/restore and internal-change handling are already present; verify selection and text direction in browser |
| Exercise marking/submission | `ExerciseMarking.tsx`, `StudentExercise.tsx` | Current-main files contain newer implementations than historical branches; do not replace with older versions |
| Lesson requests | `artifacts/api-server/src/routes/achievements.ts` | Dismissed status and delete route are already present |
| Poll question images | `artifacts/api-server/src/routes/polls.ts`, `lib/db/src/schema/polls.ts` | Image field support is already present |
| Group controls/settings | `artifacts/api-server/src/routes/studyGroups.ts`, `StudentStudyGroups.tsx`, `lib/db/src/schema/chatFeatures.ts` | Current main has newer group profile/control logic; preserve it |
| Follow notifications | `artifacts/api-server/src/routes/lessons.ts` | Current main has preference-aware, per-recipient notification handling and permission checks |
| Hand raises | `artifacts/api-server/src/routes/handRaises.ts` | Role/class-scoped access checks are already present |
| PWA notifications/offline shell | `artifacts/dallyletter/public/sw.js`, `SystemNotificationBridge.tsx` | Current main already contains the notification bridge and service-worker handlers |
| Mobile build configuration | `artifacts/dallyletter-mobile/eas.json` | Already present on main; no duplicate copy needed |

## Historical changes deliberately not copied

- PR #25's older `messages.ts` permits managers/prefects to delete messages in cases where current main restricts deletion to the sender, owner, or group creator. Keep the stricter current-main rule unless a documented role policy explicitly authorizes broader deletion.
- PR #25's older lesson/media and study-group files omit newer persistent-storage error handling, content permissions, group profile functionality, or other current-main additions.
- PR #28's older media-storage and lesson code lacks some current-main error handling/logging. Do not replace current-main files with the older versions.
- PR #17's UI-only redesign remains deferred and is outside this reconciliation.

## Required release gates

1. `pnpm run ci:verify` passes on the proposed integration commit.
2. Release Safety passes against a test/CI database.
3. On the production database, verify `notifications.push_sent_at` exists; do not drop/recreate notification tables.
4. Authenticated integration tests cover question-media upload/retrieval/deletion, lesson/message media persistence across restart, rich-text formatting/selection, exercise submit/mark/return, follow notification preferences, group permissions, and hand-raise scope.
5. Verify production Render logs and the canonical API health endpoint after deployment. A successful build alone is not production acceptance.

## Scope

This document records selective reconciliation findings only. It changes no runtime behavior, database data, permissions, environment variables, or deployment settings. Any genuinely missing behavior should be implemented as a focused source change with tests rather than importing a stale whole-file snapshot.
