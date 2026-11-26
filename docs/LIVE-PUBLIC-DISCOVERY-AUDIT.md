# Live public discovery audit

## Purpose

The build-time SEO verifier proves that generated files contain expected metadata. It does **not** prove that the deployed website serves those files correctly, that Vercel rewrites resolve every route, or that crawlers can retrieve the canonical sitemap and AI reference files. This live audit checks the deployed public origin independently.

## Automated checks

The daily/manual GitHub Actions audit checks:

- Anonymous HTTPS access to the canonical homepage, robots.txt, sitemap.xml, llms.txt and llms-full.txt.
- Crawler declarations for Google, Bing, OpenAI, Anthropic and Perplexity, while confirming private account routes remain disallowed.
- Sitemap XML shape, canonical host, duplicate URLs and a minimum public-page count.
- Every sitemap URL for HTTP success, a unique page title presence, a self-canonical URL, indexability, an H1 and visible brand identity in served HTML.
- Homepage creator attribution and JSON-LD presence.
- AI reference files for official brand identity, creator attribution, canonical host and stale legacy hostnames.
- A deliberately nonexistent URL returning a real HTTP 404 rather than a soft-404.

The workflow is read-only. It does not submit Search Console requests, change DNS, alter Vercel settings, deploy, touch secrets, or write to production data.

## How to use

Open GitHub Actions → **Live public discovery audit** → **Run workflow**. The workflow also runs daily. A failure includes the exact route or check that failed in the job log.

## What a pass means

A pass means the deployed public pages are technically retrievable and carry the expected discovery signals at the time of the check. It does **not** mean Google has indexed the pages, that the site ranks for a query, or that an AI provider has ingested the content.

## External indexing remains a separate gate

A repository cannot verify Search Console ownership or force indexing. The Google account owner must verify the canonical URL-prefix property, grant the service account access, and submit the sitemap. Follow [Search Console setup](SEARCH-CONSOLE-SETUP.md). Search Console API access must be enabled in the owning Google Cloud project. Track impressions, clicks, indexed-page counts and exclusion reasons over complete reporting periods; do not report indexing or ranking gains without Search Console evidence.

## Canonical host and safety

The canonical production URL remains `https://elishamaposa29-oss-dallyletter-elid-gamma.vercel.app/`. This work intentionally does not rename or redirect the production hostname. Private dashboards and user-specific routes must never be added to the sitemap or made crawlable.
