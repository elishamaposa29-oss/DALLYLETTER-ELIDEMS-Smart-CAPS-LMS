import fs from "node:fs";
import path from "node:path";
import { createGoogleSession, googleApi } from "./google-search-console-api.mjs";

const session = await createGoogleSession();
const today = new Date().toISOString().slice(0, 10);
const reportPath = path.resolve("seo-reports/search-console-" + today + ".md");
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
if (!session) {
  const message = "# Dallyletter Google Search Console report\n\nReport skipped because GSC_SERVICE_ACCOUNT_JSON is not configured. Add the service-account JSON as a GitHub Actions secret and grant it access to the verified Search Console property.\n";
  fs.writeFileSync(reportPath, message);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, message);
  console.log(message);
  process.exit(0);
}

const day = new Date();
day.setUTCHours(0, 0, 0, 0);
day.setUTCDate(day.getUTCDate() - 1);
const end = day.toISOString().slice(0, 10);
const previousEndDate = new Date(day);
previousEndDate.setUTCDate(previousEndDate.getUTCDate() - 28);
const previousEnd = previousEndDate.toISOString().slice(0, 10);
const currentStartDate = new Date(day);
currentStartDate.setUTCDate(currentStartDate.getUTCDate() - 27);
const currentStart = currentStartDate.toISOString().slice(0, 10);
const previousStartDate = new Date(day);
previousStartDate.setUTCDate(previousStartDate.getUTCDate() - 55);
const previousStart = previousStartDate.toISOString().slice(0, 10);

async function analytics(startDate, endDate, dimensions = []) {
  return googleApi(
    "https://www.googleapis.com/webmasters/v3/sites/" + encodeURIComponent(session.siteUrl) + "/searchAnalytics/query",
    session.token,
    { method: "POST", body: JSON.stringify({ startDate, endDate, dimensions, type: "web", dataState: "final", rowLimit: 20 }) }
  );
}
function metrics(response) {
  const row = response.rows?.[0] || {};
  return { clicks: row.clicks || 0, impressions: row.impressions || 0, ctr: row.ctr || 0, position: row.position || 0 };
}
function delta(current, previous) {
  if (!previous) return "—";
  const change = ((current - previous) / previous) * 100;
  return (change > 0 ? "+" : "") + change.toFixed(1) + "%";
}
const current = metrics(await analytics(currentStart, end));
const previous = metrics(await analytics(previousStart, previousEnd));
const queries = await analytics(currentStart, end, ["query"]);
const pages = await analytics(currentStart, end, ["page"]);
const sitemapUrl = new URL("sitemap.xml", session.siteUrl).toString();
const sitemapResponse = await fetch(sitemapUrl);
if (!sitemapResponse.ok) throw new Error("Sitemap fetch failed (" + sitemapResponse.status + "): " + sitemapUrl);
const xml = await sitemapResponse.text();
const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]);
const inspections = [];
for (const inspectionUrl of urls) {
  try {
    const result = await googleApi("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", session.token, {
      method: "POST",
      body: JSON.stringify({ inspectionUrl, siteUrl: session.siteUrl, languageCode: "en-US" })
    });
    const status = result.inspectionResult?.indexStatusResult || {};
    inspections.push({ url: inspectionUrl, verdict: status.verdict || "UNKNOWN", coverage: status.coverageState || "Not reported", indexing: status.indexingState || "Not reported", lastCrawl: status.lastCrawlTime || "—" });
  } catch (error) {
    inspections.push({ url: inspectionUrl, verdict: "ERROR", coverage: String(error.message || error), indexing: "—", lastCrawl: "—" });
  }
}
const pct = value => (value * 100).toFixed(2) + "%";
const queryRows = (queries.rows || []).slice(0, 10).map(row => "| " + row.keys[0] + " | " + (row.clicks || 0) + " | " + (row.impressions || 0) + " |").join("\n");
const pageRows = (pages.rows || []).slice(0, 10).map(row => "| " + row.keys[0] + " | " + (row.clicks || 0) + " | " + (row.impressions || 0) + " |").join("\n");
const inspectionRows = inspections.map(row => "| " + row.url + " | " + row.verdict + " | " + row.coverage + " | " + row.lastCrawl + " |").join("\n");
const indexed = inspections.filter(row => row.verdict === "PASS").length;
const report = [
"# Dallyletter Google Search Console report",
"",
"Property: " + session.siteUrl,
"Current period: " + currentStart + " to " + end,
"Previous period: " + previousStart + " to " + previousEnd,
"",
"## Search performance — 28-day comparison",
"",
"| Metric | Current 28 days | Previous 28 days | Change |",
"|---|---:|---:|---:|",
"| Clicks | " + current.clicks + " | " + previous.clicks + " | " + delta(current.clicks, previous.clicks) + " |",
"| Impressions | " + current.impressions + " | " + previous.impressions + " | " + delta(current.impressions, previous.impressions) + " |",
"| CTR | " + pct(current.ctr) + " | " + pct(previous.ctr) + " | — |",
"| Average position | " + current.position.toFixed(1) + " | " + previous.position.toFixed(1) + " | — |",
"",
"## Top search queries",
"",
"| Query | Clicks | Impressions |",
"|---|---:|---:|",
queryRows || "| No query rows returned | — | — |",
"",
"## Top landing pages",
"",
"| Page | Clicks | Impressions |",
"|---|---:|---:|",
pageRows || "| No page rows returned | — | — |",
"",
"## URL indexing inspection",
"",
"Inspected " + inspections.length + " sitemap URLs; " + indexed + " returned verdict PASS. A non-PASS verdict is a diagnostic result, not proof that the page can never be indexed.",
"",
"| URL | Verdict | Coverage | Last crawl |",
"|---|---|---|---|",
inspectionRows || "| No URLs inspected | — | — | — |",
"",
"## Interpretation",
"",
"Compare impressions, clicks, CTR and average position over complete 28-day windows. Very small impression counts produce unstable CTR and position changes; do not treat them as reliable ranking trends.",
"",
"Google Search Console does not guarantee a first-place ranking. Improve useful content and internal links based on the queries and pages that actually earn impressions."
].join("\n");
fs.writeFileSync(reportPath, report + "\n");
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + "\n");
console.log(report);
