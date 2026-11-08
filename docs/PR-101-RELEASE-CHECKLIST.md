# PR #101 — Public Discovery and Release Checklist

Repository: `elishamaposa29-oss/DALLYLETTER-ELIDEMS-Smart-CAPS-LMS`  
Branch: `feat/public-seo-discovery-2026-11`  
Pull request: [#101](https://github.com/elishamaposa29-oss/DALLYLETTER-ELIDEMS-Smart-CAPS-LMS/pull/101)

## Implemented in the branch

- [x] Zimbabwe-first public positioning with a South African focus and wider African/global access, without claiming complete syllabus coverage.
- [x] Public founder-history page, creator attribution, homepage navigation and footer links.
- [x] 32 static public HTML pages with unique titles, descriptions, self-canonical URLs, H1 headings and page-specific structured metadata.
- [x] XML sitemap and 1200 × 630 PNG social preview image.
- [x] Matching Open Graph and Twitter preview image references.
- [x] Public favicon, PWA manifest, 192 px and 512 px icons, and sign-in launch URL.
- [x] Explicit Vercel rewrites for public pages and recognised app routes.
- [x] Branded HTTP 404 page; removed the generic SPA catch-all that could turn unknown paths into soft 404s.
- [x] Robots rules for search and AI crawlers, with authenticated dashboards and token-bearing routes excluded from crawling.
- [x] Build-time verification for sitemap coverage, canonical metadata, unique titles, internal links, static assets, JSON-LD, PWA assets, robots rules and 404 routing.
- [x] Search Console report covering every URL in the sitemap, with current-versus-previous 28-day metrics.
- [x] Sitemap submission validates the deployed XML before submitting it to Google.
- [x] Manual public/learner/approved-teacher/manager capture workflow; missing demo credentials skip safely and Owner access is excluded.
- [x] Unknown-route HTTP 404 probe in the live showcase capture.
- [x] Latest changes from merged PR #102 incorporated without resetting the feature branch.

## Validation and release gates

- [ ] Latest-head CI build, type checks, tests and formatting pass.
- [ ] Latest-head Release Safety workflow passes.
- [ ] Latest-head Profile Hub integration workflow passes.
- [ ] Latest-head Android build and smoke test passes.
- [ ] Latest-head public-page Lighthouse assertions pass.
- [ ] A deployment of this exact branch is available and the live public-route/404 showcase passes.
- [ ] Google Search Console service account is configured, has access to the exact verified property, and the sitemap workflow succeeds.
- [ ] Dedicated learner, approved-teacher and manager demo credentials are configured and all three dashboard captures succeed.
- [ ] Search Console report artifact is generated successfully after credentials are configured.

## Required account setup

Create the following repository variable and secret using [GitHub Actions settings](https://github.com/elishamaposa29-oss/DALLYLETTER-ELIDEMS-Smart-CAPS-LMS/settings/secrets/actions):

- `GSC_SITE_URL` — exact verified URL-prefix property, including trailing slash.
- `GSC_SERVICE_ACCOUNT_JSON` — complete private service-account JSON key file.

Optional role showcase captures require these six repository secrets:

- `SHOWCASE_LEARNER_EMAIL`
- `SHOWCASE_LEARNER_PASSWORD`
- `SHOWCASE_TEACHER_EMAIL`
- `SHOWCASE_TEACHER_PASSWORD`
- `SHOWCASE_MANAGER_EMAIL`
- `SHOWCASE_MANAGER_PASSWORD`

Use dedicated non-production accounts only. Owner credentials are deliberately not requested or captured.

## Known external blockers

- The latest reported Vercel status is `Deployment rate limited — retry in 24 hours`. This is an external deployment quota, not an application-build result. Do not bypass it by changing deployment settings or upgrading a plan without approval.
- Search Console and showcase automation cannot produce real account evidence until the required repository secrets/variable and Search Console property permissions are configured.
- The founder portrait is not present in the accessible file library. Keep the story text and creator attribution, but do not fabricate or publish a replacement portrait. Add the original image only after it is supplied and public-use approval is confirmed.

## Merge and production policy

Do not merge PR #101 or change production deployment settings as part of this checklist. Merge only after all latest-head automated checks pass, the deployment quota is available, the exact branch has been verified, and the remaining external account setup is complete or explicitly accepted as a post-merge task.

A successful build, sitemap submission or Lighthouse run is not proof of Google indexing, search ranking, user conversion or production readiness. Those outcomes must be measured separately.
