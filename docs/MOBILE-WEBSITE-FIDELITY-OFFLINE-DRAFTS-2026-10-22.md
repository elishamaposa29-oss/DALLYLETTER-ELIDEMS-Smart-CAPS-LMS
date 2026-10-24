# Mobile website-fidelity and offline-draft execution — 2026-10-22

## Goal and acceptance standard
The website is the source of truth for visual design, information hierarchy, feature grouping, labels, colors, spacing, card composition, content order, media display, and role-specific capabilities. The app must adapt the same design system to touch-sized mobile layouts; it must not be a separate, simplified or inconsistently styled product. "100% parity" is the target, and is not to be claimed until route-by-route and behavior-by-behavior verification is complete.

## Working rules
- Preserve main and all existing work; make changes on this branch and review them through a PR.
- Inspect the website implementation before changing each mobile screen. Reuse existing APIs, rich-text sanitization rules, design tokens and authorization contracts.
- Do not replace rich content with plain text, flatten related functionality into unrelated cards, or add placeholder actions.
- Do not claim success based only on compilation, route presence, or a button appearing.
- Never publish a new APK or merge unfinished parity work as complete.

## P0 — match the website's layout and content
- Compare the web route/component and native route side by side for every role and feature.
- Match the web's shared header/navigation structure, including a proper mobile hamburger/menu, typography, palette, spacing, card grouping, badges, action placement, empty/loading/error states and responsive behavior.
- Lesson cards must combine related information and actions in the same hierarchy as web. Render sanitized rich-text descriptions/content (headings, lists, links and formatting), attachments and supported media correctly.
- Show playable video thumbnails/previews directly in lesson cards where the website does; do not require opening a lesson just to see its video. Fullscreen must present the media with the appropriate web-equivalent card/options structure and reliable back navigation.
- Show lesson-linked exercises and assignment context in the same card/section hierarchy as the website. Preserve answer types, drawing, retries, submissions, marks, feedback and returned results.
- Message composer: integrate insert/attachment options in one toolbar, including voice recording, media/document attachments, and supported rich text. Voice recording must offer a clear review/cancel/send flow rather than silently sending on stop.
- Download/offline action is hidden from ordinary lesson/card surfaces. Show it only in fullscreen media viewing or the media options menu, as requested.

## P0 — offline-first drafts and safe synchronization
- Every user action that would publish/submit while offline must instead persist an account-scoped local draft/queue item with clear "Saved as draft — waiting for connection" state.
- Automatically retry queued work when connectivity returns and app resumes; show pending/syncing/synced/failed states. Do not label it published/submitted until the server confirms success.
- Use idempotency/deduplication or server-state reconciliation for retries. Preserve drafts on transient failures; expose retry/edit/delete where safe.
- Autosave unfinished lessons' learner progress/drafts locally, then display unfinished lessons automatically in a stable sorted list grouped by course/subject and ordered by most recently worked/next action.
- Cache authorized lesson text and metadata for offline reading, separated by account and cleared safely on logout/account change. Cache media only after explicit download action, with progress, cancellation, storage limits and delete controls. A cached URL is not proof media works offline.
- Do not queue irreversible payments or privileged actions without explicit, action-specific safety rules.

## P0 — investigate production log failures
- Five POST /api/messages responses returned 400 before a later successful media+message flow. Capture/log validation failure reasons without logging secrets or private message content; compare native request payloads against SendMessageBody (content string, type text|voice|media, nullable mediaUrl/groupId/recipientId as defined by schema). Add tests for private and group messages, text and media/voice.
- Lesson media UUID 406b89ce-0fe2-4a7d-ab58-f5d5b234be0f returned 404 twice. Trace the database record, storage key/provider and retention/deletion behavior; distinguish missing record, authorization failure and missing blob without leaking private data.
- Keep normal HTTP 304 responses classified as cache validation; do not treat GET / as a product failure without checking the service's intended routes.

## Test and release gates
- Add/update focused tests for rich-text rendering, inline video, fullscreen/media options, lesson-exercise grouping, message payload validation, offline draft persistence, reconnect synchronization, duplicate retry safety, account isolation, and missing-media recovery.
- Run lint/typecheck/unit tests and relevant API tests. Build Android, install and launch in emulator, verify role-specific navigation, then test offline/reconnect behavior.
- Verify APK package, version, signature, checksum, and published release assets. Provide a preview and download links only after the actual deployment/release exists.
- Track parity by route and feature; mark each complete only after behavioral and visual comparison against the website. This ledger itself is not evidence that implementation is complete.
