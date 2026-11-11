# Dallyletter SEO and Search Console operations

## Canonical public site

The public-site canonical base is `https://elishamaposa29-oss-dallyletter-elid-gamma.vercel.app/`. If the public domain changes, update the default in `scripts/google-search-console-api.mjs`, `artifacts/dallyletter/public/robots.txt`, the prerender build environment and the verified Search Console property together.

The frontend build prerenders the public content pages, creates `sitemap.xml`, and generates the 1200 × 630 social preview PNG. Public content is served as crawlable HTML without requiring JavaScript. Authenticated application routes are explicitly rewritten to the app shell, while unknown routes use the branded HTTP 404 page rather than a catch-all SPA rewrite.

The SEO verifier checks:
- every sitemap URL has a real prerendered HTML file, a unique title, description, self-canonical URL and indexable robots metadata;
- each public page has a primary heading, visible Dallyletter logo, consistent social image and valid WebPage JSON-LD with creator/publisher attribution;
- all internal public links resolve to another public page or a real application route, and linked static assets exist;
- the social image is a valid 1200 × 630 PNG;
- robots.txt blocks private dashboards and token-bearing routes while allowing public pages to search and AI crawlers;
- the branded 404 page exists, and Vercel has no generic catch-all rewrite that would turn unknown URLs into soft 404s.

The public sitemap intentionally excludes login, registration, dashboards, profiles, token routes and other private application paths. Robots.txt is a crawl preference, not an authorization boundary; application and API permissions remain authoritative.

## Education keyword taxonomy

The exact supplied education keyword inventory is maintained in `scripts/education-seo-tags.mjs`: 58 phrase templates and 66 standalone tags. Placeholder templates such as `[Subject]`, `[Topic]`, `[Level]`, `[Exam Board]`, `[Year]` and `[Country/Location]` are stored unchanged for future resource tagging; they are not published literally as search snippets. Relevant standalone tags are rendered individually on matching public subject, revision, video and learning-platform pages and included in that page's WebPage structured data. The build verifier checks the inventory counts, key template strings and rendered page tags.

Tags that would falsely imply accreditation, certification, free tuition, a diploma, a school service, free downloads, PDF availability, or answers/solutions for resources not verified as published remain stored in the supplied taxonomy but are not emitted as public claims. When real resources are published, populate the template placeholders with their actual subject, topic, level, exam board, year and location before creating resource-specific indexable pages. Do not create thin pages or promise that tags alone guarantee Google rankings; Google ranks useful, crawlable page content, not a raw tag dump.

## Individual education search landing pages

The public homepage remains uncluttered: keyword tags are not added to its hero or main navigation. The public prerenderer generates separate indexable pages for individual search intents (exam papers, specimen papers, marking schemes, topical past papers, practice tests, exam questions, revision notes, study guides, worked examples, flashcards, educational tutorials and syllabus support), plus subject-specific past-paper and revision-note pages. These pages have unique titles, descriptions, explanatory content, canonicals, WebPage structured data and internal links; the prerendered sitemap includes them and `vercel.json` routes each URL to its generated HTML.

The pages clearly state that specific PDFs, memos and past-paper files are only available when published by an educator or school. Do not imply that Dallyletter currently hosts a resource merely because a search-intent page exists. Expand to more subject/topic/exam-board/year combinations only when the corresponding useful resource or original learning content is actually available. Avoid mass-generating thin doorway pages.

## Google Search Console automation

1. In Google Cloud Console, create or select a project and enable the Google Search Console API.
2. Verify the exact URL-prefix property in Search Console (DNS or the HTML-tag method). If using HTML-tag verification, set the public `GOOGLE_SITE_VERIFICATION` variable in GitHub and Vercel; the prerendered homepage will include and verify the token.
3. Create a service account and generate a JSON key. Keep the key private.
4. Add the service-account email as a user of the verified URL-prefix property. Grant the access level required to inspect URLs and submit sitemaps.
5. In GitHub, open **Settings → Secrets and variables → Actions** for this repository.
6. Add repository secret `GSC_SERVICE_ACCOUNT_JSON` containing the complete service-account JSON key.
7. Add repository variable `GSC_SITE_URL` with the exact URL-prefix property, including the trailing slash:
   `https://elishamaposa29-oss-dallyletter-elid-gamma.vercel.app/`
8. After the intended public deployment serves the sitemap, run **Actions → Submit Dallyletter Sitemap to Google → Run workflow**. The workflow first fetches and validates the public XML sitemap, then submits it through the Search Console API.

Never commit the service-account key, put it in a client-side environment variable, or paste it into an issue or pull request.

## Weekly measurement

The **Google Search Console Performance Report** workflow runs every Monday at 07:00 UTC after it is present on the default branch, and can also be started manually. It compares the latest complete 28-day period with the previous 28 days, reports clicks, impressions, CTR and average position, lists top queries and landing pages, and attempts URL Inspection for every URL in the sitemap. Each run publishes a workflow summary and a downloadable Markdown report artifact.

A URL inspection result is a point-in-time diagnostic. A page can be technically eligible but not yet indexed. Google controls crawling, indexing and ranking; sitemap submission is a discovery signal, not a ranking guarantee.

## Showcase and release evidence

The **Dallyletter Real UI Showcase Capture** workflow refreshes automatically after relevant changes reach `main`, runs weekly, and supports manual dispatch. Public page URLs are discovered from the deployed sitemap so new and removed pages are reflected without maintaining a hardcoded capture list. Authenticated learner/teacher/manager captures are restricted to the configured production origin and dedicated showcase credentials; arbitrary preview URLs cannot receive those credentials. The prerendered public pages embed the exact Vercel build commit. On push-triggered runs, the capture job waits until the live production homepage exposes the same commit SHA before taking any screenshots; if the deployment is delayed or rate-limited, the job fails without publishing stale captures. Scheduled/manual runs record the deployed build SHA when the site exposes it. The workflow records both deployed and workflow commit identifiers in the capture manifest and uploads the complete evidence as a 90-day artifact. After a fully successful public-page capture, it also refreshes the `showcase-media` branch with public-page PNGs, `latest/manifest.json` and `latest/README.md`; authenticated dashboard screenshots and Owner views are never published there. Stable image URLs follow `https://raw.githubusercontent.com/elishamaposa29-oss/DALLYLETTER-ELIDEMS-Smart-CAPS-LMS/showcase-media/latest/public-homepage.png` (replace the filename with the current manifest entry). Owner dashboards remain excluded.

Use dedicated non-production demo accounts only. Missing demo credentials skip that role; login failures or broken pages fail the capture. Owner authentication and private Owner dashboards are deliberately excluded from showcase artifacts.

## Manual social-preview validation

After deployment, test the homepage and representative page URLs with:
- Facebook Sharing Debugger: https://developers.facebook.com/tools/debug/
- LinkedIn Post Inspector: https://www.linkedin.com/post-inspector/

Check that the preview image loads as a 1200 × 630 PNG, the title and description are page-specific, and the canonical URL is the public production URL.

## Search Console baseline

Use complete 28-day periods for trend comparisons. Very small impression counts make CTR and average-position changes unstable. Do not make ranking claims from a handful of impressions.
