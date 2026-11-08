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
- [x] Automatic public/learner/approved-teacher/manager showcase capture after relevant changes reach `main`, weekly and on manual dispatch; missing demo credentials skip safely and Owner access is excluded.
- [x] Sitemap-driven capture discovery, timestamped manifest, Markdown gallery and 90-day screenshot artifact.
- [x] Silent short WebM walkthrough clips for public discovery pages, published alongside the matching screenshots only after the automated safety gate passes.
- [x] Learner, teacher and manager walkthrough videos recorded after authentication in a separate recording context; login credentials are never included in recordings.
- [x] Role walkthroughs follow only visible, same-origin read-only navigation links for learning and teaching workflows; no form submission, payments, approvals, account settings or destructive actions.
- [x] Authenticated role screenshots and videos remain private in the 90-day workflow artifact; they are not published to the public media branch. Owner views and credentials remain excluded.
- [x] Public capture safety gate blocks populated form fields, visible alerts, obvious credentials/secrets, broken images and sparse/failed pages before media is eligible for publication.
- [x] Public pages embed the exact Vercel build SHA; push-triggered captures wait for that exact commit and refuse to capture stale deployments.
- [x] Successful public captures publish stable image URLs and a current manifest/gallery on the dedicated `showcase-media` branch; authenticated dashboards and Owner screenshots are excluded.
- [x] Authenticated capture restricted to the configured production origin so preview URLs cannot receive showcase credentials.
- [x] Unknown-route HTTP 404 probe in the live showcase capture.
- [x] PR #100's useful launch, social publishing and search measurement documents selectively preserved; stale preview-host sitemap/prerender code deliberately excluded because PR #101 has a newer 33-page canonical implementation.
- [x] PR #100's supported registration improvements preserved: E.164 phone input/normalization, current ZW/ZA country choices, and routing pending teachers to qualifications. The unsupported `OTHER` option was excluded because the API does not persist a third-country profile field.
- [x] Removed implicit junior-manager inheritance of manager/senior-manager route access and added a CI regression check.

## Validation and release gates

- [ ] Latest-head CI build, type checks, tests and formatting pass.
- [ ] Latest-head Release Safety workflow passes.
- [ ] Latest-head Profile Hub integration workflow passes.
- [ ] Latest-head Android build and smoke test passes.
- [ ] Latest-head public-page Lighthouse assertions pass.
- [ ] A successful deployment of this exact branch is available and the live public-route/404 showcase passes.
- [ ] The Search Console URL-prefix property is verified (DNS or HTML-tag method); if using HTML-tag verification, the public homepage emits the supplied token.
- [ ] Google Search Console service account is configured, has access to the exact verified property, and the sitemap workflow succeeds.
- [ ] Dedicated learner, approved-teacher and manager demo credentials are configured and all three dashboard captures succeed.
- [ ] Search Console report artifact is generated successfully after credentials are configured.

## Required account setup

Create the following repository variable and secret using [GitHub Actions settings](https://github.com/elishamaposa29-oss/DALLYLETTER-ELIDEMS-Smart-CAPS-LMS/settings/secrets/actions):

- `GSC_SITE_URL` — exact verified URL-prefix property, including trailing slash.
- `GSC_SERVICE_ACCOUNT_JSON` — complete private service-account JSON key file.
- `GOOGLE_SITE_VERIFICATION` — optional public HTML-tag token if DNS or another ownership-verification method has not already been used. Set the same value in Vercel build environment variables.

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
- The founder portrait is not present in the accessible file library or current PR branch. The public founder story and Elisha Maposa creator attribution remain linked and accessible; the actual portrait is still pending. Do not fabricate, substitute or remove the creator attribution. Add the original portrait only after the original image is supplied and public-use approval is confirmed.

## Merge and production policy

**Merge gate:** require all latest-head CI, Release Safety, Profile Hub integration, Android smoke and Lighthouse checks to pass. Resolve any new review comments and re-check the exact PR head SHA immediately before merging. A Vercel rate-limit failure is an external deployment blocker; do not bypass branch protection or change plans/settings to force a deployment.

**Production gate:** after the deployment quota resets, verify the exact deployed commit, all public sitemap URLs, 404 behavior, login/registration, role-based dashboard access, and learner/teacher/manager showcase captures. Complete Search Console ownership verification and sitemap submission with the account owner's authorization. Keep production database changes, secrets and deployment configuration unchanged unless separately authorized.

A successful build, sitemap submission or Lighthouse run is not proof of Google indexing, search ranking, user conversion or full product completion. Those outcomes must be measured separately.
