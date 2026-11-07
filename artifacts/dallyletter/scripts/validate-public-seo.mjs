import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("dist/public");
const base = "https://dallyletter-elidems-onlineschoolbye-two.vercel.app";
const routes = ["/", "/about", "/learners", "/educators", "/schools", "/resources", "/resources/study-plan"];
const sitemap = await readFile(path.join(root, "sitemap.xml"), "utf8");
const robots = await readFile(path.join(root, "robots.txt"), "utf8");
const app = await readFile(path.resolve("src/App.tsx"), "utf8");
const publicPages = JSON.parse(await readFile(path.resolve("src/content/public-pages.json"), "utf8"));
const found = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1].trim());
const expected = routes.map(route => base + route);
if (!sitemap.startsWith('<?xml version="1.0" encoding="UTF-8"?>') || !sitemap.includes("<urlset") || !sitemap.includes("</urlset>")) {
  throw new Error("Sitemap is not a complete XML urlset document");
}
if (new Set(found).size !== found.length) throw new Error("Sitemap contains duplicate URLs");
if (found.length !== expected.length || expected.some(url => !found.includes(url))) {
  throw new Error("Sitemap URL list does not match the approved public route list");
}
if (found.some(url => new URL(url).origin !== base)) throw new Error("Sitemap contains a URL outside the canonical host");
if (!robots.includes("Sitemap: " + base + "/sitemap.xml")) throw new Error("robots.txt does not advertise the canonical sitemap");
if (!robots.includes("User-agent: *") || !robots.includes("Allow: /")) throw new Error("robots.txt must allow public crawling");
for (const route of routes.filter(route => route !== "/")) {
  if (!app.includes('path="' + route + '"')) throw new Error("Public route is missing from the application router: " + route);
}
const titles = new Set();
const descriptions = new Set();
const pageRoutes = { about: "/about", learners: "/learners", educators: "/educators", schools: "/schools", resources: "/resources", "study-plan": "/resources/study-plan" };
for (const [key, page] of Object.entries(publicPages)) {
  const route = pageRoutes[key];
  if (!route || !routes.includes(route)) throw new Error("Public page content has no approved sitemap route: " + key);
  const htmlPath = path.join(root, route.slice(1), "index.html");
  const html = await readFile(htmlPath, "utf8");
  for (const section of page.sections) {
    if (!html.includes("<h2>" + section.title.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;") + "</h2>")) {
      throw new Error(route + " static content is missing shared section: " + section.title);
    }
  }
}
for (const route of routes) {
  const relative = route === "/" ? "index.html" : path.join(route.slice(1), "index.html");
  const html = await readFile(path.join(root, relative), "utf8");
  const canonical = base + route;
  const required = [
    ['<link rel="canonical" href="' + canonical + '"', "canonical URL"],
    ['<meta property="og:url" content="' + canonical + '"', "Open Graph URL"],
    ["<title>", "page title"],
    ['<meta name="description" content="', "description"],
    ['<meta property="og:title" content="', "Open Graph title"],
    ['<meta property="og:description" content="', "Open Graph description"],
    ['<meta property="og:image" content="', "Open Graph image"],
    ['<meta name="twitter:card" content="summary_large_image"', "Twitter card type"],
    ['<meta name="twitter:title" content="', "Twitter title"],
    ['<meta name="twitter:description" content="', "Twitter description"],
    ['<meta name="twitter:image" content="', "Twitter image"],
    ['<script type="application/ld+json">', "structured data"]
  ];
  if (route !== "/") required.push(['<div id="root"><main>', "static page content"]);
  for (const [needle, label] of required) {
    if (!html.includes(needle)) throw new Error(route + " is missing " + label);
  }
  const title = html.split("<title>")[1]?.split("</title>")[0]?.trim() ?? "";
  const description = html.split('<meta name="description" content="')[1]?.split('"')[0] ?? "";
  if (title.length < 20 || titles.has(title)) throw new Error(route + " has a missing or duplicate title");
  if (description.length < 40 || descriptions.has(description)) throw new Error(route + " has a missing or duplicate meta description");
  titles.add(title);
  descriptions.add(description);
}
await readFile(path.join(root, "opengraph.jpg"));
const privatePaths = ["/login", "/register", "/student", "/teacher", "/manager", "/admin"];
if (privatePaths.some(route => found.some(url => {
  const pathname = new URL(url).pathname;
  return pathname === route || pathname.startsWith(route + "/");
}))) throw new Error("Private or authenticated routes must not appear in the public sitemap");
console.log("Validated " + routes.length + " public URLs, XML sitemap, page-specific SEO/social metadata, structured data, static content, OG artwork and robots.txt.");
