import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("dist/public");
const base = "https://dallyletter-elidems-onlineschoolbye-two.vercel.app";
const routes = ["/", "/about", "/learners", "/educators", "/schools", "/resources", "/resources/study-plan"];
const sitemap = await readFile(path.join(root, "sitemap.xml"), "utf8");
const robots = await readFile(path.join(root, "robots.txt"), "utf8");
const app = await readFile(path.resolve("src/App.tsx"), "utf8");
const found = sitemap.split("<loc>").slice(1).map(value => value.split("</loc>")[0]);
const expected = routes.map(route => base + route);
if (new Set(found).size !== found.length) throw new Error("Sitemap contains duplicate URLs");
if (found.length !== expected.length || expected.some(url => !found.includes(url))) {
  throw new Error("Sitemap URL list does not match the approved public route list");
}
if (!robots.includes("Sitemap: " + base + "/sitemap.xml")) throw new Error("robots.txt does not advertise the canonical sitemap");
for (const route of routes.filter(route => route !== "/")) {
  if (!app.includes('path="' + route + '"')) throw new Error("Public route is missing from the application router: " + route);
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
    ['<meta name="twitter:title" content="', "Twitter title"],
    ['<script type="application/ld+json">', "structured data"],
    ['<div id="root"><main>', "static page content"]
  ];
  for (const [needle, label] of required) {
    if (!html.includes(needle)) throw new Error(route + " is missing " + label);
  }
  const description = html.split('<meta name="description" content="')[1]?.split('"')[0] ?? "";
  if (description.length < 40) throw new Error(route + " has a missing or thin meta description");
  if (!html.includes("</title>")) throw new Error(route + " has an incomplete title tag");
}
const privatePaths = ["/login", "/register", "/student", "/teacher", "/manager", "/admin"];
if (privatePaths.some(route => found.some(url => {
  const pathname = new URL(url).pathname;
  return pathname === route || pathname.startsWith(route + "/");
}))) throw new Error("Private or authenticated routes must not appear in the public sitemap");
console.log("Validated " + routes.length + " public URLs, page metadata, structured data, static content and robots.txt.");
