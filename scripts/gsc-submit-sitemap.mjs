import { createGoogleSession, googleApi } from "./google-search-console-api.mjs";

const session = await createGoogleSession();
if (!session) {
  console.log("Search Console sitemap submission skipped: configure the GSC_SERVICE_ACCOUNT_JSON GitHub Actions secret and grant that service account access to the verified property.");
  process.exit(0);
}
const sitemapUrl = new URL("sitemap.xml", session.siteUrl).toString();
const endpoint = "https://www.googleapis.com/webmasters/v3/sites/" + encodeURIComponent(session.siteUrl) + "/sitemaps/" + encodeURIComponent(sitemapUrl);
await googleApi(endpoint, session.token, { method: "PUT" });
console.log("Submitted sitemap to Google Search Console: " + sitemapUrl);
