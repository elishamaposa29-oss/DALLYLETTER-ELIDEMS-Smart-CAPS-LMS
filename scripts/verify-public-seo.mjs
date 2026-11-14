import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeGoogleSiteVerificationToken } from "./google-site-verification.mjs";
import { educationSeoTags, getEducationSeoTagCounts, getPageSeoTags } from "./education-seo-tags.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.join(repoRoot, "artifacts", "dallyletter", "dist", "public");
const appShellPath = path.join(root, "app.html");
if (!fs.existsSync(appShellPath)) throw new Error("Authenticated SPA shell app.html is missing from the production build");
if (fs.existsSync(path.join(root, "index.html"))) throw new Error("Authenticated SPA shell must not occupy /index.html; Vercel needs the root path for the prerendered public homepage");
const vercelConfig = JSON.parse(fs.readFileSync(path.join(repoRoot, "vercel.json"), "utf8"));
const rootRewrite = (vercelConfig.rewrites || []).find((route) => route.source === "/");
if (rootRewrite?.destination !== "/public-site/index.html") {
  throw new Error("Vercel root route must serve /public-site/index.html so the public homepage is indexable");
}
const appRewrites = (vercelConfig.rewrites || []).filter((route) => route.destination === "/app.html");
if (appRewrites.length < 20 || (vercelConfig.rewrites || []).some((route) => route.destination === "/index.html")) {
  throw new Error("Vercel authenticated app routes must resolve to /app.html, not the public homepage or a missing /index.html");
}
const siteUrl = (process.env.PUBLIC_SITE_URL || "https://elishamaposa29-oss-dallyletter-elid-gamma.vercel.app").replace(/\/+$/, "");
const siteOrigin = new URL(siteUrl).origin;
const verificationToken = normalizeGoogleSiteVerificationToken(process.env.GOOGLE_SITE_VERIFICATION);
// Enforce the HTML-tag token only for the permanent, canonical Vercel production project.
// Other legacy/duplicate Vercel projects may still build this repository, but they do not
// own the canonical gamma hostname and must not block its release for missing project-local env.
const canonicalVercelProjectId = "prj_Xyxmr1MPPOnmRHzUMjGaBpiuYfwf";
const isCanonicalProductionBuild = process.env.VERCEL_ENV === "production"
  && process.env.VERCEL_PROJECT_ID === canonicalVercelProjectId;
if (isCanonicalProductionBuild && !verificationToken) {
  throw new Error("GOOGLE_SITE_VERIFICATION is missing from the canonical Dallyletter production project. Preserve the existing Search Console token in that project's Production environment.");
}
const expectedBuildSha = (process.env.VERCEL_GIT_COMMIT_SHA || "").trim();
const seoTagCounts = getEducationSeoTagCounts();
if (seoTagCounts.templateTags !== 58 || seoTagCounts.standaloneTags !== 66) {
  throw new Error("Education SEO tag inventory is incomplete: " + JSON.stringify(seoTagCounts));
}
if (!educationSeoTags.templates.past_papers_and_exams.includes("[Subject] past papers pdf") || !educationSeoTags.templates.online_school_enrollment.includes("accredited online school in [Country/Location]")) {
  throw new Error("Education SEO templates were altered or lost");
}
const sitemapPath = path.join(root, "sitemap.xml");
const sitemap = fs.readFileSync(sitemapPath, "utf8");
const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]);

if (urls.length < 65) throw new Error("Expected at least 65 public sitemap URLs, including individual education search pages; got " + urls.length);
if (new Set(urls).size !== urls.length) throw new Error("Duplicate URLs found in sitemap.xml");

const titles = new Set();
const publicRoutes = new Set(urls.map(url => new URL(url).pathname));
const requiredSearchRoutes = [
  "/exam-papers/","/specimen-papers/","/marking-schemes/","/topical-past-papers/",
  "/practice-tests/","/exam-questions/","/revision-notes/","/study-guides/",
  "/worked-examples/","/flashcards/","/educational-tutorials/","/syllabus/",
  "/mathematics/past-papers/","/mathematics/revision-notes/",
  "/biology/past-papers/","/biology/revision-notes/",
  "/chemistry/past-papers/","/chemistry/revision-notes/",
  "/physics/past-papers/","/physics/revision-notes/"
];
for (const route of requiredSearchRoutes) {
  if (!publicRoutes.has(route)) throw new Error("Missing individual education search landing page from sitemap: " + route);
}

const appRoutePrefixes = [
  "/login", "/register", "/forgot-password", "/reset-password", "/verify-email",
  "/confirm-email-change", "/docs", "/resource-unavailable", "/suspended",
  "/shared-media", "/student", "/teacher", "/manager", "/admin", "/profile",
  "/profile-hub", "/record-book", "/features", "/preview", "/verify/transfer"
];

for (const url of urls) {
  const parsed = new URL(url);
  if (parsed.origin !== siteOrigin || parsed.search || parsed.hash) {
    throw new Error("Sitemap URL is not a clean canonical URL on the configured site: " + url);
  }
  const route = parsed.pathname;
  const file = route === "/" ? path.join(root, "public-site", "index.html") : path.join(root, route, "index.html");
  if (!fs.existsSync(file)) throw new Error("Missing prerendered page: " + url);

  const html = fs.readFileSync(file, "utf8");
  if (expectedBuildSha && !html.includes('<meta name="dallyletter-build-sha" content="' + expectedBuildSha + '">')) {
    throw new Error("Public page build marker does not match the Vercel deployment commit: " + url);
  }
  const title = html.match(/<title>(.*?)<\/title>/)?.[1];
  const description = html.match(/<meta name="description" content="([^"]+)"/)?.[1];
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  const robots = html.match(/<meta name="robots" content="([^"]+)"/)?.[1];
  const ogImage = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
  const twitterImage = html.match(/<meta name="twitter:image" content="([^"]+)"/)?.[1];

  if (!title || !description || !canonical || !robots || !ogImage || !twitterImage) {
    throw new Error("Missing required SEO or social metadata: " + url);
  }
  if (canonical !== url) throw new Error("Canonical mismatch: " + url + " -> " + canonical);
  if (route === "/" && verificationToken && !html.includes('<meta name="google-site-verification" content="' + verificationToken + '">')) {
    throw new Error("Google Search Console HTML-tag verification meta is missing from the public homepage");
  }
  if (!robots.includes("index") || robots.includes("noindex")) throw new Error("Public page is not indexable: " + url);
  if (titles.has(title)) throw new Error("Duplicate title: " + title);
  titles.add(title);
  if (!html.includes("<h1>") || !html.includes('alt="Dallyletter Elidems logo"')) {
    throw new Error("Missing visible primary heading or Dallyletter logo: " + url);
  }
  if (!html.includes('<link rel="manifest" href="/manifest.json">') || !html.includes('<link rel="apple-touch-icon" href="/icons/icon-192.png">')) {
    throw new Error("Public page is missing PWA manifest or touch-icon metadata: " + url);
  }
  if (ogImage !== twitterImage) throw new Error("Open Graph and Twitter images differ: " + url);
  if (html.includes('"+workspaceLinks+"')) throw new Error("Workspace links were not interpolated into the rendered page: " + url);

  const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!jsonLdMatch) throw new Error("Missing JSON-LD structured data: " + url);
  const jsonLd = JSON.parse(jsonLdMatch[1]);
  const expectedKeywords = getPageSeoTags(route.split("/").filter(Boolean).join("/"));
  if (JSON.stringify(jsonLd.keywords || []) !== JSON.stringify(expectedKeywords)) {
    throw new Error("Structured SEO keyword tags do not match the approved page taxonomy: " + url);
  }
  const keywordMetaMatch = html.match(/<meta name="keywords" content="([^"]*)">/);
  const actualMetaKeywords = keywordMetaMatch ? keywordMetaMatch[1] : "";
  const expectedMetaKeywords = expectedKeywords.join(", ").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  if (actualMetaKeywords !== expectedMetaKeywords) {
    throw new Error("SEO keyword metadata does not match the approved page taxonomy: " + url);
  }
  if (html.includes('aria-label="Related search topics"') || html.includes("keyword-tags")) {
    throw new Error("Keyword clouds must not be visibly rendered on public landing pages: " + url);
  }
  if (jsonLd["@type"] !== "WebPage" || jsonLd.url !== url || jsonLd.creator?.name !== "Elisha Maposa") {
    throw new Error("Invalid WebPage structured data or creator attribution: " + url);
  }
  if (jsonLd.publisher?.logo?.url !== siteUrl + "/favicon.svg") {
    throw new Error("Publisher logo structured data is missing or incorrect: " + url);
  }

  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1]);
  for (const href of hrefs) {
    if (!href.startsWith("/") || href.startsWith("//")) continue;
    const linkPath = new URL(href, siteUrl).pathname;
    if (appRoutePrefixes.some(prefix => linkPath === prefix || linkPath.startsWith(prefix + "/"))) continue;
    if (linkPath === "/favicon.svg" || linkPath === "/manifest.json" || linkPath.startsWith("/icons/") || linkPath.startsWith("/social/") || linkPath.startsWith("/assets/")) {
      if (!fs.existsSync(path.join(root, linkPath))) throw new Error("Missing linked static asset " + linkPath + " on " + url);
      continue;
    }
    const normalized = linkPath.endsWith("/") ? linkPath : linkPath + "/";
    if (!publicRoutes.has(normalized) && normalized !== "/") {
      throw new Error("Broken internal public link " + href + " found on " + url);
    }
  }
}

const socialImage = path.join(root, "social", "dallyletter-og.png");
if (!fs.existsSync(socialImage)) throw new Error("1200x630 social PNG missing");
const pngHeader = fs.readFileSync(socialImage).subarray(0, 24);
if (pngHeader.toString("hex", 0, 8) !== "89504e470d0a1a0a" || pngHeader.readUInt32BE(16) !== 1200 || pngHeader.readUInt32BE(20) !== 630) {
  throw new Error("Social PNG must be 1200x630");
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
if (manifest.start_url !== "/login/" || manifest.id !== "/login/" || manifest.scope !== "/") {
  throw new Error("PWA manifest must launch the sign-in workspace within the site scope");
}
for (const icon of manifest.icons || []) {
  const iconPath = path.join(root, icon.src.startsWith("/") ? icon.src.slice(1) : icon.src);
  if (!fs.existsSync(iconPath)) throw new Error("PWA icon is missing: " + icon.src);
  const header = fs.readFileSync(iconPath).subarray(0, 24);
  if (header.toString("hex", 0, 8) !== "89504e470d0a1a0a") throw new Error("PWA icon is not a PNG: " + icon.src);
  const expectedSize = Number(icon.sizes.split("x")[0]);
  if (header.readUInt32BE(16) !== expectedSize || header.readUInt32BE(20) !== expectedSize) {
    throw new Error("PWA icon dimensions do not match manifest: " + icon.src);
  }
}

const robots = fs.readFileSync(path.join(root, "robots.txt"), "utf8");
for (const privatePath of ["/student", "/teacher", "/manager", "/admin", "/profile", "/record-book", "/features", "/preview", "/reset-password"]) {
  if (!robots.includes("Disallow: " + privatePath)) throw new Error("robots.txt must disallow private route " + privatePath);
}
if (!robots.includes(siteUrl + "/sitemap.xml")) throw new Error("robots.txt sitemap reference missing");
const sitemapDirectives = robots.split(/\r?\n/).filter(line => /^\s*Sitemap:/i.test(line));
if (sitemapDirectives.length !== 1 || sitemapDirectives[0].trim() !== "Sitemap: " + siteUrl + "/sitemap.xml") {
  throw new Error("robots.txt must contain exactly one sitemap directive on the canonical production hostname");
}
for (const crawler of ["OAI-SearchBot", "ChatGPT-User", "GPTBot", "ClaudeBot", "Claude-SearchBot", "PerplexityBot", "Googlebot", "Bingbot"]) {
  if (!robots.includes("User-agent: " + crawler)) throw new Error("robots.txt is missing the public discovery rule for " + crawler);
}
for (const match of sitemap.matchAll(/<loc>(.*?)<\/loc>/g)) {
  const location = new URL(match[1]);
  if (location.origin !== siteOrigin) throw new Error("Sitemap contains a URL on a stale or non-canonical hostname: " + match[1]);
}
for (const match of sitemap.matchAll(/<image:loc>(.*?)<\/image:loc>/g)) {
  const imageUrl = new URL(match[1]);
  if (imageUrl.origin !== siteOrigin) throw new Error("Sitemap social image points to a stale or non-canonical hostname: " + match[1]);
}
for (const fileName of ["llms.txt", "llms-full.txt"]) {
  const filePath = path.join(root, fileName);
  if (!fs.existsSync(filePath)) throw new Error(fileName + " is missing from the public build");
  const text = fs.readFileSync(filePath, "utf8");
  if (!text.includes(siteUrl) || text.includes("dallyletter-elidems-onlineschoolbye-two.vercel.app")) {
    throw new Error(fileName + " must reference the canonical production hostname and contain no legacy Vercel hostname");
  }
  for (const match of text.matchAll(/https?:\/\/[^\s)\]>]+/g)) {
    const candidate = match[0].replace(/[.,;]+$/, "");
    if (candidate.includes("elishamaposa29-oss-dallyletter-elid-gamma.vercel.app") && new URL(candidate).origin !== siteOrigin) {
      throw new Error(fileName + " contains a non-canonical Dallyletter URL: " + candidate);
    }
  }
}

const notFound = path.join(root, "404.html");
if (!fs.existsSync(notFound)) throw new Error("Branded 404.html is missing");
const notFoundHtml = fs.readFileSync(notFound, "utf8");
if (!notFoundHtml.includes('name="robots" content="noindex, follow"') || !notFoundHtml.includes('href="/"')) {
  throw new Error("404 page must be noindex and link back to the public homepage");
}

const vercel = JSON.parse(fs.readFileSync(path.join(repoRoot, "vercel.json"), "utf8"));
const rewriteSources = new Set(vercel.rewrites.map(rewrite => rewrite.source));
if (rewriteSources.has("/(.*)") || rewriteSources.has("/:path*")) {
  throw new Error("A catch-all SPA rewrite creates soft 404s for unknown URLs");
}
for (const appRoute of ["/student/", "/teacher/", "/manager/", "/admin/"]) {
  if (!rewriteSources.has(appRoute)) throw new Error("Missing authenticated application root rewrite: " + appRoute);
}
for (const role of ["student", "teacher", "manager", "admin"]) {
  const nestedRoute = "/" + role + "/(.*)";
  if (!rewriteSources.has(nestedRoute)) throw new Error("Missing nested authenticated application rewrite: " + nestedRoute);
}
for (const route of publicRoutes) {
  const source = route === "/" ? "/" : route;
  if (!rewriteSources.has(source)) throw new Error("Missing Vercel rewrite for public page: " + source);
}
console.log("SEO verification passed for " + urls.length + " canonical public pages, private-route crawl rules, workspace links, JSON-LD, social image and 404 routing.");
