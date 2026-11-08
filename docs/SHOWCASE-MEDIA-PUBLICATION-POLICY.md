# Showcase media publication and recording policy

## Capture scope

- Discover public pages from the deployed sitemap and capture full-page screenshots.
- Record a short, silent public-page walkthrough clip for each successfully screened public page.
- Capture learner, teacher and manager dashboard screenshots and short recordings only with dedicated showcase accounts. Authenticate in a non-recording browser context; start the recording context only after login so passwords are never recorded.
- Do not capture Owner dashboards or Owner credentials.

## Publication boundary

- Public-page screenshots and clips may be published to the dedicated `showcase-media` branch after the complete public capture run succeeds.
- Authenticated learner, teacher and manager evidence is private GitHub Actions artifact output only. It is never copied to `showcase-media`, embedded in public pages, or added to search-facing content by automation.
- Owner views and credentials are excluded entirely.
- Search engines should discover public product pages and deliberately approved media only. Authenticated workspace recordings are not public assets and must never be added to sitemap, Open Graph metadata, public galleries or AI reference files.

## Mandatory pre-publication gate

A public capture is rejected when the browser detects:
- Any non-empty visible input, select or textarea value.
- Visible alert/toast error content.
- Obvious application failure text, stack traces or common credential/token patterns.
- Broken visible images or missing Dallyletter branding.
- HTTP 4xx/5xx responses or nearly empty page content.

If a public page fails, the capture workflow fails and the publication step does not run. Do not bypass a failed gate merely to produce a gallery.

Automated checks are a first barrier, not a guarantee that every visual defect or sensitive detail can be detected. Review the generated gallery and clip artifact before using media in advertisements or external campaigns. Never publish a clip that exposes personal records, learner names, contact details, private messages, grades, payment details, credentials, API keys, access tokens, internal logs, or unapproved negative/private information.

## Product-story coverage

Keep the sitemap-driven public captures current. The public story should show the value proposition for learners, teachers, schools and organisations. Authenticated role recordings are retained privately for review and should cover the real learning cycle when suitable demo data exists: teacher preparation, lesson delivery, learner study, exercises/demonstration, assessment, feedback, progress evidence and follow-up learning. Do not fabricate completed workflows or imply a feature is available if it is not.

## Founder image and attribution

Keep Elisha Maposa's creator attribution and public founder-story page linked. The original founder portrait is not currently committed as a repository asset; the original full-resolution file and explicit publication approval are still required before adding it to the public founder page, social preview, image sitemap or public showcase. Do not replace it with a generated, unrelated or fabricated portrait. Track the outstanding image in issue #106 and `docs/FOUNDER_PHOTO_ARCHIVE_TODO.md`.

## Media retention

- GitHub Actions capture artifacts retain private role evidence for 90 days.
- The dedicated `showcase-media` branch contains only approved public-page media and its manifest/gallery.
- Re-run captures after relevant public product changes and review the published gallery for stale or unsuitable content.
