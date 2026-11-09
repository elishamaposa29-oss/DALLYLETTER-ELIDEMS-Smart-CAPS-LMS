# Google Search Console — verification, sitemap and measurement

## Canonical site property

Use the URL-prefix property:

`https://elishamaposa29-oss-dallyletter-elid-gamma.vercel.app/`

The previously used URL-prefix property `https://dallyletter-elidems-onlineschoolbye-two.vercel.app/` belongs to a separate Vercel project. Keep it as a legacy Search Console property; it is not the current primary project's production hostname. Do not reuse its verification token for this property. The gamma hostname is the permanent production URL for the current primary project and must be verified as its own URL-prefix property. Routine deployments must not change either hostname or property.


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
3. Select HTML tag verification and copy only the `content` token value from Google's meta tag.
4. Set that non-secret value as `GOOGLE_SITE_VERIFICATION` in the Vercel project's **Production** environment.
5. Set the same value as a GitHub Actions repository variable named `GOOGLE_SITE_VERIFICATION`; the public-page CI build exercises the production verification gate and fails if this variable is missing.
6. Redeploy the production build, then confirm the exact `<meta name="google-site-verification">` tag is present in the served homepage.
7. Click **Verify** in Search Console only after the deployed tag matches Google's token.

## Service-account access

1. In Google Cloud Console, open IAM & Admin → Service Accounts → the Dallyletter Search Console service account → Keys.
2. Download a fresh JSON key if the existing key is malformed or revoked.
3. In GitHub repository Settings → Secrets and variables → Actions, replace `GSC_SERVICE_ACCOUNT_JSON` with the complete raw contents of that JSON file. Do not add Markdown fences, outer quotes, or manually edit the PEM. Never paste the private key into chat.
4. In Search Console → Settings → Users and permissions for the exact URL-prefix property, add the JSON key's `client_email` as a **Full user**.
5. Run the **Verify Google Search Console Property Access** workflow. It must report `siteFullUser` or `siteOwner` for the exact production property.

If the workflow reports an invalid private-key PEM, replace the secret with a newly downloaded, complete service-account JSON key. Do not try to repair or share the private key manually.

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
