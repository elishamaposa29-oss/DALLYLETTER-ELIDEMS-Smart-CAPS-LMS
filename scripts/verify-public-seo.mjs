import fs from "node:fs";
import path from "node:path";

const root = path.resolve("dist/public");
const siteUrl = (process.env.PUBLIC_SITE_URL || "https://dallyletter-elidems-onlineschoolbye-two.vercel.app").replace(/\/+$/, "");
const siteOrigin = new URL(siteUrl).origin;
const sitemapPath = path.join(root, "sitemap.xml");
const sitemap = fs.readFileSync(sitemapPath, "utf8");
const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]);

if (urls.length < 30) throw new Error("Expected at least 30 public sitemap URLs; got " + urls.length);
if (new Set(urls).size !== urls.length) throw new Error("Duplicate URLs found in sitemap.xml");

const titles = new Set();
const publicRoutes = new Set(urls.map(url => new URL(url).pathname));
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

const notFound = path.join(root, "404.html");
if (!fs.existsSync(notFound)) throw new Error("Branded 404.html is missing");
const notFoundHtml = fs.readFileSync(notFound, "utf8");
if (!notFoundHtml.includes('name="robots" content="noindex, follow"') || !notFoundHtml.includes('href="/"')) {
  throw new Error("404 page must be noindex and link back to the public homepage");
}

const vercel = JSON.parse(fs.readFileSync(path.resolve("../../vercel.json"), "utf8"));
const rewriteSources = new Set(vercel.rewrites.map(rewrite => rewrite.source));
if (rewriteSources.has("/(.*)") || rewriteSources.has("/:path*")) {
  throw new Error("A catch-all SPA rewrite creates soft 404s for unknown URLs");
}
for (const appRoute of ["/student/", "/student/:path*", "/teacher/", "/teacher/:path*", "/manager/", "/manager/:path*", "/admin/", "/admin/:path*"]) {
  if (!rewriteSources.has(appRoute)) throw new Error("Missing authenticated application rewrite: " + appRoute);
}
for (const route of publicRoutes) {
  const source = route === "/" ? "/" : route;
  if (!rewriteSources.has(source)) throw new Error("Missing Vercel rewrite for public page: " + source);
}
console.log("SEO verification passed for " + urls.length + " canonical public pages, private-route crawl rules, workspace links, JSON-LD, social image and 404 routing.");
