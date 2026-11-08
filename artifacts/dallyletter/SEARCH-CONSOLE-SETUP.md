# Google Search Console — verification, sitemap and measurement

## Canonical site property
Use this URL-prefix property:
`https://dallyletter-elidems-onlineschoolbye-two.vercel.app/`

## Before verification
1. Merge and deploy the approved SEO branch to the canonical production host. PR #97/#98 changes are not live until that happens.
2. Confirm the homepage and each public URL below loads anonymously over HTTPS.
3. Confirm each page returns HTTP 200, has a unique title and description, and declares its own canonical URL.
4. Confirm `/robots.txt` is accessible and points to the sitemap.
5. Confirm `/sitemap.xml` returns HTTP 200 and valid XML.

## Public sitemap URLs
- `/`
- `/about`
- `/learners`
- `/educators`
- `/schools`
- `/organisations`
- `/resources`
- `/resources/study-plan`

Private dashboards, authentication pages, account-specific pages and utility routes are intentionally excluded.

## Ownership verification
The homepage includes the Search Console HTML meta token supplied for this site. After deployment:
1. Sign in to the Google account that should own the property.
2. Open https://search.google.com/search-console and add the URL-prefix property above.
3. Select HTML tag verification and compare the token Google displays with the live homepage's `google-site-verification` meta tag.
4. If they match, click **Verify** in Search Console.
5. Keep the verification tag in the deployed homepage. If Google issues a different token, replace the old value with the newly issued token and deploy before retrying.

A GitHub commit does not verify ownership. Only Google's successful verification result does.

## Submit the sitemap
After ownership is verified, open the property's **Sitemaps** report and submit:
`https://dallyletter-elidems-onlineschoolbye-two.vercel.app/sitemap.xml`

Record the submission date, discovered URL count, last read date and any fetch or parsing errors. A submitted sitemap is not a guarantee that every URL will be indexed.

## Measurement baseline
On the deployment date, record the initial values (use zero only when Search Console explicitly reports zero; use “not yet available” when data has not populated):
- Pages indexed and pages not indexed, with reasons.
- Search impressions and clicks.
- Average position and click-through rate.
- Queries containing “Dallyletter” and “Dallyletter Elidems”.
- Non-branded queries related to online learning, digital education and school learning tools in Zimbabwe and South Africa.
- Top landing pages from organic search.

Review weekly for the first month, then monthly. Compare the same date ranges and annotate deployments or major content changes. Separate Search Console search performance from analytics sessions, registrations, learner activation and institutional enquiries. Never claim ranking growth without recorded data.

## Current limitations and controls
- Search Console ownership and sitemap submission require the Google account owner's action after deployment; this repository cannot perform those account actions.
- The canonical host is a Vercel subdomain. Use the HTML-tag method unless a separately controlled custom domain is connected.
- Social profiles must not be linked until the actual accounts are created, secured and verified.
- Google may take time to crawl and index new pages. Rankings and autocomplete suggestions cannot be guaranteed.
