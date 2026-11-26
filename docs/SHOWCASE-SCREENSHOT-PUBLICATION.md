# Publishing real Dallyletter role screenshots safely

Signed-in learner, prefect and teacher routes remain private and retain their existing noindex protection. Google receives only static PNG copies of the authenticated interface screenshots; it never receives an authenticated dashboard session.

## Existing account configuration

Reuse the showcase credentials already configured in GitHub Actions:

- `SHOWCASE_ACCOUNTS_ARE_SYNTHETIC=true` — required repository secret attesting that all showcase accounts contain synthetic data only.
- `SHOWCASE_LEARNER_EMAIL` and `SHOWCASE_LEARNER_PASSWORD` — dedicated synthetic learner account; this same account is used for the prefect capability view.
- `SHOWCASE_TEACHER_EMAIL` and `SHOWCASE_TEACHER_PASSWORD` — separate dedicated synthetic teacher account.
- `VERCEL_AUTOMATION_BYPASS_SECRET` only when the Vercel deployment is protected.

There is no separate prefect signup and no separate prefect credential. Dallyletter represents prefect as an existing student/learner account with the Profile Hub `isPrefect` capability. The capture workflow signs in once using the dedicated synthetic learner account, then verifies the normal role and `isPrefect` flag from `/api/auth/me` before recording the learner and prefect views. This mirrors the role badge and role-aware UI already used by Profile Hub. Authenticated capture runs only when the `SHOWCASE_ACCOUNTS_ARE_SYNTHETIC=true` repository secret is present. If that attestation is absent, the workflow completes public-page capture and records authenticated role capture as skipped; it does not fabricate screenshots or mark any role as verified. The separate role-image publisher still rejects artifacts without a true synthetic-account attestation.

No new synthetic-account secret or prefect credential is required. Do not create another account just for prefect capture.

## Capture and review

1. Run **Dallyletter Real UI Showcase Capture** from GitHub Actions on the intended deployed build.
2. Wait for the run to complete successfully.
3. Download and inspect its private artifact named `dallyletter-full-role-feature-captures-<run number>`.
4. Inspect the default learner, prefect and teacher dashboard screenshots listed in `capture-manifest.json`. Confirm no real names, email addresses, phone numbers, school identifiers, private messages, grades, attendance, balances or other personal information is readable.
5. Only after that inspection, run **Publish reviewed Dallyletter role screenshots**, enter the successful capture run ID, and confirm both the privacy-review and synthetic-data attestations. The publisher also checks the capture manifest for the synthetic-account safeguard.

The publication workflow downloads that exact artifact, verifies successful authenticated captures for all three role views (including Profile Hub's prefect capability), validates the PNG files, and publishes only the three default dashboard screenshots to the `showcase-media` branch. It checks out the existing media branch and adds/updates only the role screenshot files; it does not create an orphan replacement branch or force-push, so previously published public-page images remain in place. It does not publish the full feature capture set, manager/admin/Owner views, videos, login data or browser storage.

## Landing page and Google Images

The homepage does not display generated dashboard illustrations as if they were screenshots. Its compact three-image role showcase is added only when all three real PNGs are publicly fetchable and have an `image/png` content type. The image sitemap likewise receives the real image URLs only after that public availability check passes. Until then, no dashboard gallery is rendered and no unavailable screenshot URLs are submitted to Google.

Signed-in dashboard routes remain private. Google may index the published static images after they are accessible, but indexing and appearance in Google Images are not guaranteed.
