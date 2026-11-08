# PR #101 — Manual Verification Plan

Run this plan against the exact deployment built from `feat/public-seo-discovery-2026-11`. Do not treat a successful local build as proof that the public deployment is correct.

## 1. Public discovery pages

- [ ] Open the homepage and confirm it returns HTTP 200 with the Zimbabwe-first positioning.
- [ ] Open the About and Founder Story pages from the public navigation and footer.
- [ ] Open the remaining public pages listed in `sitemap.xml`; confirm each returns HTTP 200.
- [ ] Confirm every public page displays the Dallyletter logo, one clear H1, page-specific title and description.
- [ ] Confirm learner, teacher, manager and registration links open the expected sign-in or registration routes.
- [ ] Confirm public pages are readable without JavaScript and do not require authentication.

## 2. Search engine metadata and crawling

- [ ] Fetch `/sitemap.xml`; confirm it is valid XML, contains only public canonical pages and has no duplicate URLs.
- [ ] Fetch `/robots.txt`; confirm the sitemap URL is correct and private dashboards/token routes are disallowed.
- [ ] Inspect the homepage source for the canonical URL, indexable robots directive, Open Graph image, Twitter image and WebPage JSON-LD.
- [ ] Confirm Open Graph and Twitter point to the same accessible 1200 × 630 PNG.
- [ ] If HTML-tag Search Console verification is being used, confirm the exact `GOOGLE_SITE_VERIFICATION` token appears in the public homepage source and then verify the property in Search Console.
- [ ] If DNS verification is already active, confirm the exact URL-prefix property is verified; no HTML-tag token is required.

## 3. Real HTTP 404 behaviour

- [ ] Open a deliberately nonexistent path such as `/__dallyletter-404-check__/`.
- [ ] Confirm the response is HTTP 404, not HTTP 200 with the app shell.
- [ ] Confirm the branded 404 page provides working homepage and sign-in links.
- [ ] Confirm recognised app routes such as `/login/`, `/student/`, `/teacher/`, `/manager/` and `/admin/` still load the application shell.
- [ ] Confirm role authorization is enforced by the application and API; robots rules are not treated as security controls.

## 4. PWA and visual assets

- [ ] Fetch `/manifest.json`; confirm `start_url` and `id` point to `/login/`.
- [ ] Confirm `/icons/icon-192.png`, `/icons/icon-512.png` and `/favicon.svg` load with valid image content.
- [ ] Install the PWA on a test device and confirm it opens the sign-in workspace.
- [ ] Confirm the social preview image refreshes after a changed build and is not cached as immutable under the same filename.

## 5. Google Search Console

- [ ] Confirm the URL-prefix property matches `GSC_SITE_URL` exactly.
- [ ] Confirm the service account has access to that verified property.
- [ ] Run **Submit Dallyletter Sitemap to Google** only after the exact deployment serves the sitemap.
- [ ] Confirm the workflow validates the sitemap before the submission request.
- [ ] Run **Google Search Console Performance Report** and confirm the artifact compares two complete 28-day periods and attempts URL Inspection for every sitemap URL.
- [ ] Treat indexing verdicts as diagnostics, not guarantees of indexing or ranking.

## 6. Role showcase and privacy

- [ ] Use only dedicated, non-production learner, approved-teacher and manager demo accounts.
- [ ] Confirm public page capture succeeds before role captures begin.
- [ ] Confirm missing demo credentials are marked as skipped rather than treated as failed captures.
- [ ] Confirm the learner, teacher and manager dashboards show the expected role-specific UI.
- [ ] Confirm Owner credentials and private Owner dashboards are not captured or included in artifacts.
- [ ] Inspect artifacts and logs to ensure no passwords, tokens, private keys or personal user data are exposed.

## 7. Performance, accessibility and release

- [ ] Confirm Lighthouse meets the configured performance, accessibility, best-practices and SEO thresholds on the selected public pages.
- [ ] Confirm CI, Release Safety, Profile Hub integration and Android build/smoke checks pass on the latest PR head.
- [ ] Confirm the branch is still zero commits behind `main`.
- [ ] Confirm the preview deployment corresponds to the exact latest branch SHA.
- [ ] Do not merge or alter production deployment settings until the remaining checks and required approvals are satisfied.

## Known dependency

A Vercel deployment rate-limit status was reported during PR #101 work. If that quota is still active, live deployment checks cannot be completed until Vercel permits another preview deployment. Do not bypass the limit by changing plans or deployment settings without approval.
