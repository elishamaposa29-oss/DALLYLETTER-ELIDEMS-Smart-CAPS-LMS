import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("dist/public");
const base = "https://dallyletter-elidems-onlineschoolbye-two.vercel.app";
const pages = [
  { route: "/about", title: "About Dallyletter Elidems | African Learning, Open to the World", description: "Learn about Dallyletter Elidems, its Zimbabwe-first and internationally welcoming education technology mission, and its founder and sole creator, Elisha Maposa." },
  { route: "/learners", title: "Online Learning for Learners in Zimbabwe and Beyond | Dallyletter", description: "Explore practical digital learning workflows with Dallyletter Elidems: lessons, practice, assignments, classes, study support and progress tools for learners." },
  { route: "/educators", title: "Digital Teaching Tools for Educators | Dallyletter Elidems", description: "Discover Dallyletter's educator direction: lesson delivery, classes, assignments, learner engagement, feedback and connected teaching workflows." },
  { route: "/schools", title: "Digital Learning and School Workflows | Dallyletter Elidems", description: "Explore Dallyletter Elidems for schools and educational organisations: role-based workspaces, academic oversight, teacher workflows and operational visibility." },
  { route: "/resources", title: "Study Resources and Practical Learning Guides | Dallyletter", description: "Read practical study guidance from Dallyletter Elidems: active recall, spaced practice, weekly planning, assignment habits and exam preparation." },
  { route: "/resources/study-plan", title: "A Simple 7-Day Study Plan for Learners | Dallyletter", description: "Use this practical seven-day study plan to organise topics, practise recall, solve questions and review difficult areas without last-minute cramming." }
];
const template = await readFile(path.join(root, "index.html"), "utf8");
const replace = (html, pattern, value) => {
  if (!pattern.test(html)) throw new Error("Expected metadata tag not found: " + pattern);
  return html.replace(pattern, value);
};
for (const page of pages) {
  const canonical = base + page.route;
  let html = template;
  html = replace(html, /<title>[^<]*<\/title>/, `<title>${page.title}</title>`);
  html = replace(html, /<meta name="description" content="[^"]*"\s*\/>/, `<meta name="description" content="${page.description}" />`);
  html = replace(html, /<link rel="canonical" href="[^"]*"\s*\/>/, `<link rel="canonical" href="${canonical}" />`);
  html = replace(html, /<meta property="og:url" content="[^"]*"\s*\/>/, `<meta property="og:url" content="${canonical}" />`);
  html = replace(html, /<meta property="og:title" content="[^"]*"\s*\/>/, `<meta property="og:title" content="${page.title}" />`);
  html = replace(html, /<meta property="og:description" content="[^"]*"\s*\/>/, `<meta property="og:description" content="${page.description}" />`);
  html = replace(html, /<meta name="twitter:title" content="[^"]*"\s*\/>/, `<meta name="twitter:title" content="${page.title}" />`);
  html = replace(html, /<meta name="twitter:description" content="[^"]*"\s*\/>/, `<meta name="twitter:description" content="${page.description}" />`);
  const schema = { "@context": "https://schema.org", "@type": "WebPage", name: page.title, description: page.description, url: canonical, isPartOf: { "@type": "WebSite", name: "Dallyletter Elidems", url: base + "/" }, author: { "@type": "Person", name: "Elisha Maposa" } };
  html = html.replace(/<\/head>/, `<script type="application/ld+json">${JSON.stringify(schema)}</script>\n  </head>`);
  const output = path.join(root, page.route.slice(1), "index.html");
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, html);
  console.log(`Prerendered ${page.route}`);
}
