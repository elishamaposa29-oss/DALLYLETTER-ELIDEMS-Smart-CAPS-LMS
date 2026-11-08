# Dallyletter SEO and Search Console operations

## Production public site

The public-site canonical base is `https://dallyletter-elidems-onlineschoolbye-two.vercel.app/`. If the production domain changes, update the default in `scripts/google-search-console-api.mjs`, `artifacts/dallyletter/public/robots.txt`, and the public deployment environment consistently.

The frontend build prerenders the public content pages, creates `sitemap.xml`, and generates the 1200 × 630 social preview PNG. The SEO verification script checks that each sitemap URL has a real HTML file, a unique title, a description, a matching canonical URL, an H1, social metadata, and that the social image has the expected PNG dimensions.

## Enable Google Search Console automation

1. In Google Cloud Console, create or select a project and enable the Google Search Console API.
2. Create a service account and generate a JSON key. Keep the key private.
3. In Google Search Console, add the service-account email as a user of the verified URL-prefix property. Grant the access level required to inspect URLs and submit sitemaps.
4. In GitHub, open **Settings → Secrets and variables → Actions** for this repository.
5. Add repository secret `GSC_SERVICE_ACCOUNT_JSON` containing the complete service-account JSON key.
6. Add repository variable `GSC_SITE_URL` with the exact URL-prefix property, including the trailing slash:
   `https://dallyletter-elidems-onlineschoolbye-two.vercel.app/`
7. After the public build is deployed, run **Actions → Submit Dallyletter Sitemap to Google → Run workflow**. The workflow submits `/sitemap.xml` through the Search Console API.

Never commit the service-account key, put it in a client-side environment variable, or paste it into an issue or pull request.

## Weekly measurement

The **Google Search Console Performance Report** workflow runs every Monday at 07:00 UTC and can also be started manually. It compares the latest complete 28-day period with the previous 28 days, reports clicks, impressions, CTR and average position, lists top queries and landing pages, and inspects sitemap URLs with the URL Inspection API. Each run publishes a workflow summary and a downloadable Markdown report artifact.

A URL inspection result is a point-in-time diagnostic. A page can be technically eligible but not yet indexed. Google controls crawling, indexing and ranking; sitemap submission is a discovery signal, not a ranking guarantee.

## Manual social-preview validation

After deployment, test the homepage and representative page URLs with:
- Facebook Sharing Debugger: https://developers.facebook.com/tools/debug/
- LinkedIn Post Inspector: https://www.linkedin.com/post-inspector/

Check that the preview image loads as a 1200 × 630 PNG, the title and description are page-specific, and the canonical URL is the production URL.

## Search Console baseline

Use complete 28-day periods for trend comparisons. Very small impression counts make CTR and average-position changes unstable. Do not make ranking claims from a handful of impressions.
