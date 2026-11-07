# Google Search Console — ownership and launch checklist

## Site property
Use this URL-prefix property because the current official site is hosted on Vercel:

`https://dallyletter-elidems-onlineschoolbye-two.vercel.app/`

## Ownership verification — HTML meta tag
1. Sign in to the Google account that will own Dallyletter's Search Console property.
2. Open Google Search Console: https://search.google.com/search-console
3. Add the exact URL-prefix property above.
4. Choose **HTML tag** in the ownership verification methods.
5. Copy the full meta tag Google provides. It contains a unique verification token; do not reuse another site's token.
6. Send the full tag to the repository maintainer, or add it inside the `<head>` of `artifacts/dallyletter/index.html`.
7. Commit the tag and deploy the verified build to the canonical production URL.
8. Return to Search Console and click **Verify**.
9. Keep the meta tag in the live site's `<head>` so ownership remains verified.

## Sitemap submission
After Google confirms ownership, submit:

`https://dallyletter-elidems-onlineschoolbye-two.vercel.app/sitemap.xml`

The sitemap must return HTTP 200 and valid XML from an anonymous browser before submission.

## What is already prepared in the site branch
- `robots.txt` permits crawling and points to the sitemap.
- `sitemap.xml` lists the canonical homepage.
- The homepage metadata includes a descriptive title, description, canonical URL, Open Graph and X/Twitter metadata.
- Organization JSON-LD identifies Dallyletter Elidems and names Elisha Maposa as founder and sole creator.

## Verification boundaries
- A Search Console property cannot be verified without the unique token Google issues to the account owner, or control of an eligible DNS zone.
- The current canonical host is a `.vercel.app` subdomain. A DNS TXT record cannot be placed there by the project owner; use the HTML-tag method unless a separately controlled custom domain is connected.
- Search Console ownership, sitemap acceptance, indexing and search ranking are separate states. Do not claim indexing or ranking until Search Console reports it.
- The branch changes are not yet deployed to production. Verification must happen against the deployed production site, not a GitHub branch.
