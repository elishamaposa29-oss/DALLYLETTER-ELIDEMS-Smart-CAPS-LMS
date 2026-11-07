import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("dist/public");
const base = "https://dallyletter-elidems-onlineschoolbye-two.vercel.app";
const routes = ["/", "/about", "/learners", "/educators", "/schools", "/resources", "/resources/study-plan"];
const sitemap = await readFile(path.join(root, "sitemap.xml"), "utf8");
const robots = await readFile(path.join(root, "robots.txt"), "utf8");
const app = await readFile(path.resolve("src/App.tsx"), "utf8");
const found = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
const expected = routes.map(route => base + route);
if (new Set(found).size !== found.length) throw new Error("Sitemap contains duplicate URLs");
if (found.length !== expected.length || expected.some(url => !found.includes(url))) {
  throw new Error("Sitemap URL list does not match the approved public route list");
}
if (!robots.includes(`Sitemap: ${base}/sitemap.xml`)) throw new Error("robots.txt does not advertise the canonical sitemap");
for (const route of routes.filter(route => route !== "/")) {
  if (!app.includes(`path="${route}"`)) throw new Error(`Public route is missing from the application router: ${route}`);
}
for (const route of routes) {
  const relative = route === "/" ? "index.html" : path.join(route.slice(1), "index.html");
  const html = await readFile(path.join(root, relative), "utf8");
  const canonical = base + route;
  for (const [label, pattern] of [
    ["canonical URL", new RegExp(`<link rel="canonical" href="${canonical.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}"`)],
    ["Open Graph URL", new RegExp(`<meta property="og:url" content="${canonical.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}"`)],
    ["page title", /<title>[^<]{12,}<\\/title>/],
    ["description", /<meta name="description" content="[^"]{40,}"\\s*\\/>/],
    ["Open Graph title", /<meta property="og:title" content="[^"]+"\\s*\\/>/],
    ["Open Graph description", /<meta property="og:description" content="[^"]+"\\s*\\/>/],
    ["Twitter title", /<meta name="twitter:title" content="[^"]+"\\s*\\/>/],
    ["structured data", /<script type="application\\/ld\\+json">/],
    ["static page content", /<div id="root"><main>/]
  ]) {
    if (!pattern.test(html)) throw new Error(`${route} is missing valid ${label}`);
  }
}
const privatePaths = ["/login", "/register", "/student", "/teacher", "/manager", "/admin"];
if (privatePaths.some(route => found.some(url => new URL(url).pathname === route || new URL(url).pathname.startsWith(route + "/")))) {
  throw new Error("Private or authenticated routes must not appear in the public sitemap");
}
console.log(`Validated ${routes.length} public URLs, page metadata, structured data, static content and robots.txt.`);
