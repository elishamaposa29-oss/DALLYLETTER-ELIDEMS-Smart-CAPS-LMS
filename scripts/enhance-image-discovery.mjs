import fs from "node:fs";
import path from "node:path";

const root = path.resolve("dist/public");
const homepage = path.join(root, "public-site", "index.html");
const sitemapPath = path.join(root, "image-sitemap.xml");
const siteUrl = (process.env.PUBLIC_SITE_URL || "https://elishamaposa29-oss-dallyletter-elid-gamma.vercel.app").replace(/\/+$/, "");
const candidates = [
  { role: "learner", src: "https://raw.githubusercontent.com/elishamaposa29-oss/DALLYLETTER-ELIDEMS-Smart-CAPS-LMS/showcase-media/latest/learner-dashboard.png", title: "Dallyletter learner dashboard", alt: "Real Dallyletter learner dashboard screenshot captured from an authenticated learner session" },
  { role: "prefect", src: "https://raw.githubusercontent.com/elishamaposa29-oss/DALLYLETTER-ELIDEMS-Smart-CAPS-LMS/showcase-media/latest/prefect-dashboard.png", title: "Dallyletter prefect dashboard", alt: "Real Dallyletter prefect dashboard screenshot captured from the learner account with Profile Hub prefect permissions" },
  { role: "teacher", src: "https://raw.githubusercontent.com/elishamaposa29-oss/DALLYLETTER-ELIDEMS-Smart-CAPS-LMS/showcase-media/latest/teacher-dashboard.png", title: "Dallyletter teacher workspace", alt: "Real Dallyletter teacher workspace screenshot captured from an authenticated teacher session" }
];

async function isPublicPng(url) {
  try {
    const response = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(10000) });
    return response.ok && /^image\/png(?:;|$)/i.test(response.headers.get("content-type") || "");
  } catch {
    return false;
  }
}

const availability = await Promise.all(candidates.map(async (item) => ({ ...item, public: await isPublicPng(item.src) })));
const roleImages = availability.every((item) => item.public) ? availability : [];
if (!fs.existsSync(homepage)) throw new Error("Prerendered homepage is missing");
if (!fs.existsSync(sitemapPath)) throw new Error("Image sitemap is missing");

let html = fs.readFileSync(homepage, "utf8");
let sitemap = fs.readFileSync(sitemapPath, "utf8");
if (roleImages.length === 3) {
  const section = '<section class="dl-role-showcase" aria-labelledby="dl-role-showcase-title"><div class="dl-role-showcase-inner"><h2 id="dl-role-showcase-title">Real Dallyletter workspaces</h2><div class="dl-role-showcase-grid">' +
    roleImages.map((item) => '<figure><img src="' + item.src + '" alt="' + item.alt + '" width="1200" height="800" loading="lazy" decoding="async"><figcaption>' + item.title + '</figcaption></figure>').join("") +
    '</div></div></section>';
  const style = '<style id="dl-role-showcase-style">.dl-role-showcase{padding:2rem 1.25rem;background:#f6f8fc;border-block:1px solid #e2e8f0}.dl-role-showcase-inner{max-width:1120px;margin:auto}.dl-role-showcase h2{margin:0 0 1rem;color:#0f2a5a;font-size:1.25rem}.dl-role-showcase-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem}.dl-role-showcase figure{margin:0;overflow:hidden;border:1px solid #dce5f1;border-radius:12px;background:#fff}.dl-role-showcase img{display:block;width:100%;aspect-ratio:3/2;object-fit:cover}.dl-role-showcase figcaption{padding:.7rem .85rem;color:#0f2a5a;font-weight:700;font-size:.9rem}@media(max-width:680px){.dl-role-showcase-grid{grid-template-columns:1fr}.dl-role-showcase{padding:1.5rem 1rem}}</style>';
  if (!html.includes("dl-role-showcase")) {
    html = html.replace("</head>", style + "</head>").replace("</main>", section + "</main>");
    fs.writeFileSync(homepage, html, "utf8");
  }
  const homeStart = sitemap.indexOf("<url><loc>" + siteUrl + "/</loc>");
  const homeEnd = sitemap.indexOf("</url>", homeStart);
  if (homeStart < 0 || homeEnd < 0) throw new Error("Canonical homepage image-sitemap entry is missing");
  const imageXml = roleImages.map((item) => '<image:image><image:loc>' + item.src + '</image:loc><image:title>' + item.title + '</image:title></image:image>').join("");
  const entry = sitemap.slice(homeStart, homeEnd);
  if (!entry.includes(roleImages[0].src)) {
    sitemap = sitemap.slice(0, homeEnd) + imageXml + sitemap.slice(homeEnd);
    fs.writeFileSync(sitemapPath, sitemap, "utf8");
  }
  console.log("Added three verified, publicly fetchable real dashboard screenshots to the homepage and image sitemap.");
} else {
  console.log("No role screenshot gallery published: the three real PNG files are not all publicly reachable yet. No mockup or broken image URL was added.");
}
