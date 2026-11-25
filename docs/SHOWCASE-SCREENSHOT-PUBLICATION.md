# Publishing real Dallyletter role screenshots safely

The signed-in learner, prefect and teacher routes stay private and retain their existing noindex protection. Google receives only static PNG copies of the public showcase screenshots; it never receives an authenticated session or access to live account pages.

## Required repository secrets

Configure these in GitHub Actions before running the capture workflow:

- `SHOWCASE_ACCOUNTS_ARE_SYNTHETIC=true` — explicit attestation that every configured showcase account contains synthetic test data only.
- `SHOWCASE_LEARNER_EMAIL` and `SHOWCASE_LEARNER_PASSWORD` — dedicated learner showcase account.
- `SHOWCASE_PREFECT_EMAIL` and `SHOWCASE_PREFECT_PASSWORD` — a separate dedicated prefect showcase account. It must not reuse learner credentials.
- `SHOWCASE_TEACHER_EMAIL` and `SHOWCASE_TEACHER_PASSWORD` — dedicated teacher showcase account.
- `VERCEL_AUTOMATION_BYPASS_SECRET` when the deployed Vercel target is protected.

The capture script checks the account roles through the authenticated API and rejects duplicate learner/prefect/teacher email addresses. Do not use real learner, teacher or school records.

## Capture and review

1. Run **Dallyletter Real UI Showcase Capture** from GitHub Actions on the intended deployed build.
2. Wait for the run to complete successfully.
3. Download and inspect its private artifact named `dallyletter-full-role-feature-captures-<run number>`.
4. Inspect `role-feature-screenshots/dashboard-learner-student.png`, `dashboard-prefect-student.png` and `dashboard-teacher-teacher.png` (or the exact default-route filenames listed in `capture-manifest.json`). Confirm no real names, emails, phone numbers, school identifiers, messages, grades, attendance, balances or other personal information is visible.
5. Only after that inspection, run **Publish reviewed Dallyletter role screenshots**, enter the successful capture run ID, and confirm both required attestations.

The publication workflow downloads that exact artifact, verifies successful authenticated captures for all three roles, validates the PNG files, and publishes only the three default dashboard screenshots to the `showcase-media` branch. It does not publish the full feature capture set, manager/admin/Owner views, videos, login data or browser storage.

## Search indexing

The public image sitemap includes descriptive URLs for the three static role screenshots. This does not make signed-in dashboard routes public and does not guarantee Google Images indexing; Google decides when and whether to show the images.
