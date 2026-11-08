import { createGoogleSession, googleApi } from "./google-search-console-api.mjs";

const session = await createGoogleSession();
if (!session) throw new Error('Google Search Console session could not be created. Verify GSC_SERVICE_ACCOUNT_JSON and GSC_SITE_URL.');

const sitemapUrl = new URL("sitemap.xml", session.siteUrl).toString();
const sitemapResponse = await fetch(sitemapUrl, { redirect: "follow" });
if (!sitemapResponse.ok) {
  throw new Error("Sitemap is not publicly available (HTTP " + sitemapResponse.status + "): " + sitemapUrl);
}
const sitemapXml = await sitemapResponse.text();
if (!/<(?:urlset|sitemapindex)\b/.test(sitemapXml) || !/<loc>https:\/\//.test(sitemapXml)) {
  throw new Error("The public sitemap response is not a valid sitemap XML document: " + sitemapUrl);
}
if (!sitemapXml.includes("<loc>")) {
  throw new Error("The public sitemap contains no canonical URLs: " + sitemapUrl);
}

const endpoint =
  "https://www.googleapis.com/webmasters/v3/sites/" +
  encodeURIComponent(session.siteUrl) +
  "/sitemaps/" +
  encodeURIComponent(sitemapUrl);
await googleApi(endpoint, session.token, { method: "PUT" });
console.log("Submitted validated sitemap to Google Search Console: " + sitemapUrl);
