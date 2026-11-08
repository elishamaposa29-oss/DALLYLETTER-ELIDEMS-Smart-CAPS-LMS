import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("dist/public");
const base = "https://dallyletter-elidems-onlineschoolbye-two.vercel.app";
const pageContent = JSON.parse(await readFile(path.resolve("src/content/public-pages.json"), "utf8"));
const routes = { about: "/about", learners: "/learners", educators: "/educators", schools: "/schools", organisations: "/organisations", resources: "/resources", "study-plan": "/resources/study-plan" };
const template = await readFile(path.join(root, "index.html"), "utf8");
const replace = (html, pattern, value) => {
  if (!pattern.test(html)) throw new Error("Expected metadata tag not found: " + pattern);
  return html.replace(pattern, value);
};
const escapeHtml = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
for (const [key, page] of Object.entries(pageContent)) {
  const route = routes[key];
  if (!route) throw new Error("Public content has no approved route: " + key);
  const canonical = base + route;
  let html = template;
  html = replace(html, /<title>[^<]*<\/title>/, `<title>${escapeHtml(page.title)}</title>`);
  html = replace(html, /<meta name="description" content="[^"]*"\s*\/>/, `<meta name="description" content="${escapeHtml(page.description)}" />`);
  html = replace(html, /<link rel="canonical" href="[^"]*"\s*\/>/, `<link rel="canonical" href="${canonical}" />`);
  html = replace(html, /<meta property="og:url" content="[^"]*"\s*\/>/, `<meta property="og:url" content="${canonical}" />`);
  html = replace(html, /<meta property="og:title" content="[^"]*"\s*\/>/, `<meta property="og:title" content="${escapeHtml(page.title)}" />`);
  html = replace(html, /<meta property="og:description" content="[^"]*"\s*\/>/, `<meta property="og:description" content="${escapeHtml(page.description)}" />`);
  html = replace(html, /<meta name="twitter:title" content="[^"]*"\s*\/>/, `<meta name="twitter:title" content="${escapeHtml(page.title)}" />`);
  html = replace(html, /<meta name="twitter:description" content="[^"]*"\s*\/>/, `<meta name="twitter:description" content="${escapeHtml(page.description)}" />`);
  const schema = { "@context": "https://schema.org", "@type": "WebPage", name: page.title, description: page.description, url: canonical, isPartOf: { "@type": "WebSite", name: "Dallyletter Elidems", url: base + "/" }, author: { "@type": "Person", name: "Elisha Maposa" } };
  html = html.replace(/<\/head>/, `<script type="application/ld+json">${JSON.stringify(schema)}</script>\n  </head>`);
  const sections = page.sections.map(section => {
    const bullets = section.bullets?.length ? `<ul>${section.bullets.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "";
    return `<section><h2>${escapeHtml(section.title)}</h2><p>${escapeHtml(section.body)}</p>${bullets}</section>`;
  }).join("\n");
  const staticBody = `<main><header><a href="/">Dallyletter Elidems</a><nav><a href="/about">About</a> · <a href="/learners">Learners</a> · <a href="/educators">Educators</a> · <a href="/schools">Schools</a> · <a href="/organisations">Organisations</a> · <a href="/resources">Resources</a></nav></header><article><p>${escapeHtml(page.eyebrow)}</p><h1>${escapeHtml(page.title.split("|")[0].trim())}</h1><p>${escapeHtml(page.intro)}</p>${sections}<p><a href="/register">Get started</a> · <a href="/about">About Dallyletter</a></p></article></main>`;
  html = html.replace('<div id="root"></div>', `<div id="root">${staticBody}</div>`);
  const output = path.join(root, route.slice(1), "index.html");
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, html);
  console.log(`Prerendered ${route}`);
}
