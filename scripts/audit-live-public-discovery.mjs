import process from "node:process";

const base = new URL((process.env.PUBLIC_SITE_URL || "https://elishamaposa29-oss-dallyletter-elid-gamma.vercel.app").replace(/\/+$/, "") + "/");
const timeoutMs = Number(process.env.PUBLIC_AUDIT_TIMEOUT_MS || 15000);
const errors = [];
const warnings = [];
const results = [];
const fail = (message) => errors.push(message);
const warn = (message) => warnings.push(message);

async function request(path, accept = "text/html,application/xml,text/plain,*/*") {
  const url = new URL(path, base);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "DallyletterPublicDiscoveryAudit/1.0 (+public-site-health-check)", accept },
    });
    if (new URL(response.url).origin !== base.origin) fail(`Unexpected cross-origin redirect for ${url.pathname}: ${response.url}`);
    return { response, body: await response.text(), url };
  } catch (error) {
    fail(`Request failed for ${url.pathname}: ${error.message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function extract(html, regex) {
  return html.match(regex)?.[1]?.trim() || "";
}

const robotsResult = await request("/robots.txt", "text/plain");
if (robotsResult) {
  const { response, body } = robotsResult;
  if (!response.ok) fail(`robots.txt returned HTTP ${response.status}`);
  for (const bot of ["Googlebot", "Bingbot", "OAI-SearchBot", "ChatGPT-User", "GPTBot", "ClaudeBot", "Claude-SearchBot", "PerplexityBot"]) {
    if (!body.includes(`User-agent: ${bot}`)) fail(`robots.txt is missing ${bot}`);
  }
  if (!body.includes(`Sitemap: ${new URL("/sitemap.xml", base).href}`)) fail("robots.txt does not advertise the canonical sitemap URL");
  for (const route of ["/student", "/teacher", "/manager", "/admin", "/profile", "/profile-hub", "/record-book", "/reset-password"]) {
    if (!body.includes(`Disallow: ${route}`)) fail(`robots.txt does not protect private route ${route}`);
  }
}

const sitemapResult = await request("/sitemap.xml", "application/xml,text/xml");
let pagePaths = [];
if (sitemapResult) {
  const { response, body } = sitemapResult;
  if (!response.ok) fail(`sitemap.xml returned HTTP ${response.status}`);
  if (!/<urlset[\s>]/i.test(body)) fail("sitemap.xml is not a URL-set XML document");
  const locs = [...body.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map((m) => m[1].trim());
  if (locs.length < 20) fail(`Sitemap contains only ${locs.length} URLs; expected at least 20 public pages`);
  if (new Set(locs).size !== locs.length) fail("Sitemap contains duplicate URLs");
  for (const raw of locs) {
    try {
      const u = new URL(raw);
      if (u.origin !== base.origin || u.search || u.hash) fail(`Non-canonical sitemap URL: ${raw}`);
      else pagePaths.push(u.pathname);
    } catch {
      fail(`Invalid sitemap URL: ${raw}`);
    }
  }
}

const llmsChecks = await Promise.all(["/llms.txt", "/llms-full.txt"].map((p) => request(p, "text/plain")));
for (let i = 0; i < llmsChecks.length; i++) {
  const result = llmsChecks[i];
  const path = ["/llms.txt", "/llms-full.txt"][i];
  if (!result) continue;
  if (!result.response.ok) fail(`${path} returned HTTP ${result.response.status}`);
  if (!/Dallyletter Elidems/i.test(result.body)) fail(`${path} does not identify Dallyletter Elidems`);
  if (!result.body.includes(base.origin)) fail(`${path} does not reference the canonical public origin`);
  if (!/Elisha Maposa/.test(result.body)) fail(`${path} omits the creator attribution`);
  if (/dallyletter-elidems-onlineschoolbye-two\.vercel\.app/i.test(result.body)) fail(`${path} contains a legacy hostname`);
}

const homepage = await request("/");
if (homepage) {
  if (!homepage.response.ok) fail(`Homepage returned HTTP ${homepage.response.status}`);
  const title = extract(homepage.body, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description = extract(homepage.body, /<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i);
  const canonical = extract(homepage.body, /<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i);
  if (!title || !/Dallyletter/i.test(title)) fail("Homepage title is missing or does not identify Dallyletter");
  if (!description || description.length < 50) fail("Homepage meta description is missing or too short");
  if (canonical !== base.href) fail(`Homepage canonical is incorrect: ${canonical || "(missing)"}`);
  if (/noindex/i.test(extract(homepage.body, /<meta\s+name=["']robots["']\s+content=["']([^"']+)["']/i))) fail("Homepage is marked noindex");
  if (!homepage.body.includes("Elisha Maposa")) fail("Homepage HTML omits the creator attribution");
  if (!homepage.body.includes("application/ld+json")) fail("Homepage has no JSON-LD structured data");
}

const uniquePaths = [...new Set(pagePaths)];
let next = 0;
const worker = async () => {
  while (next < uniquePaths.length) {
    const path = uniquePaths[next++];
    const result = await request(path);
    if (!result) continue;
    const { response, body } = result;
    if (!response.ok) {
      fail(`Public sitemap page ${path} returned HTTP ${response.status}`);
      continue;
    }
    const title = extract(body, /<title[^>]*>([\s\S]*?)<\/title>/i);
    const canonical = extract(body, /<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i);
    const robots = extract(body, /<meta\s+name=["']robots["']\s+content=["']([^"']+)["']/i);
    if (!title) fail(`${path} has no title`);
    if (canonical !== new URL(path, base).href) fail(`${path} has a missing or incorrect canonical: ${canonical || "(missing)"}`);
    if (/noindex/i.test(robots)) fail(`${path} is marked noindex`);
    if (!/<h1\b/i.test(body)) fail(`${path} has no H1`);
    if (!/Dallyletter Elidems/i.test(body)) fail(`${path} does not identify the brand in served HTML`);
    results.push({ path, status: response.status, title });
  }
};
await Promise.all(Array.from({ length: Math.min(5, uniquePaths.length) }, worker));

const missingPath = "/__dallyletter_public_audit_missing_route__/";
const notFound = await request(missingPath);
if (notFound && notFound.response.status !== 404) {
  fail(`Unknown URL ${missingPath} returned HTTP ${notFound.response.status}; expected a real 404, not a soft-404 page`);
}

const report = {
  checkedAt: new Date().toISOString(),
  origin: base.origin,
  sitemapPages: uniquePaths.length,
  successfulPages: results.length,
  warnings,
  errors,
  pages: results,
};
console.log(JSON.stringify(report, null, 2));
if (errors.length) process.exitCode = 1;
else console.log(`Live public-discovery audit passed for ${results.length} sitemap pages.`);
