# Google Search Console — verification, sitemap and measurement

## Canonical site property

Use the URL-prefix property:

`https://elishamaposa29-oss-dallyletter-elid-gamma.vercel.app/`

## Before verification

1. Merge and deploy the approved PR to the canonical production host.
2. Confirm the homepage and public pages load anonymously over HTTPS.
3. Confirm public routes return HTTP 200 with unique titles, descriptions and self-canonical URLs.
4. Confirm `/robots.txt` is accessible and points to the sitemap.
5. Confirm `/sitemap.xml` returns HTTP 200 and valid XML. The current build generates the sitemap from the public-page registry; do not maintain a second hardcoded URL list here.
6. Confirm private dashboards, authentication routes, token-bearing routes and account-specific pages are absent from the sitemap.

## Ownership verification

The prerender build can insert the Search Console HTML verification token from the `GOOGLE_SITE_VERIFICATION` environment variable.

1. Sign in to the Google account that should own the property.
2. Open https://search.google.com/search-console and add the URL-prefix property above.
3. Select HTML tag verification and compare the token Google displays with the token injected into the deployed public homepage.
4. Click **Verify** only when the tokens match.
5. Keep the verification token configured in the production build environment.

A GitHub commit or passing CI check does not verify ownership. Only Google's successful verification result does.

## Submit the sitemap

After ownership is verified and the deployed sitemap has been checked, submit:

`https://elishamaposa29-oss-dallyletter-elid-gamma.vercel.app/sitemap.xml`

The repository includes an optional authenticated submission workflow. It requires the Search Console service-account JSON secret and the exact site URL variable, with the service-account email granted access to the verified property. Never commit or expose the service-account key.

Record the submission date, discovered URL count, last read date and fetch/parsing errors. Sitemap submission does not guarantee indexing.

## Measurement baseline

Use complete 28-day periods where possible. Record:

- Indexed and not-indexed pages, including exclusion reasons.
- Search impressions, clicks, CTR and average position.
- Branded queries containing “Dallyletter” and “Dallyletter Elidems”.
- Non-branded education and learning queries, filtered by Zimbabwe and South Africa where available.
- Top organic landing pages.
- Registrations, active learners and educator/school enquiries only when reliable product analytics or a documented enquiry log exists.

Use “not yet available” when Google has not populated a report; do not invent zeroes or ranking gains. Separate search impressions from visits, registrations and active learners.

## Review cadence

- First month after deployment: weekly crawl, indexing, query and landing-page checks.
- Thereafter: monthly review using equivalent date ranges.
- Annotate major deployments and page changes.
- Improve pages based on actual search and audience evidence rather than mass-producing thin keyword pages.

## Limitations

- Search Console ownership and sitemap submission require the Google account owner's action.
- Google controls crawling, indexing and ranking; timing and position cannot be guaranteed.
- The current canonical host is a Vercel subdomain. Use the HTML-tag method unless a separately controlled custom domain is connected.
- Social profile links must not be published until the accounts exist, are secured and verified.
