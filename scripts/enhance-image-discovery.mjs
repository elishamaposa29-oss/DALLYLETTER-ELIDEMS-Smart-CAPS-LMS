import fs from "node:fs";
import path from "node:path";

const root = path.resolve("dist/public");
const homepage = path.join(root, "public-site", "index.html");
const sitemapPath = path.join(root, "sitemap.xml");
const siteUrl = (process.env.PUBLIC_SITE_URL || "https://elishamaposa29-oss-dallyletter-elid-gamma.vercel.app").replace(/\\/+$/, "");
const images = [
  { src: "/favicon.svg", title: "Dallyletter Elidems official logo", alt: "Dallyletter Elidems navy and gold education technology logo", caption: "Official Dallyletter Elidems brand mark." },
  { src: "/images/learner-dashboard-preview.svg", title: "Dallyletter learner dashboard preview", alt: "Illustrative Dallyletter learner dashboard showing lessons, assignments, progress and study groups", caption: "Public illustrative product preview using fictional sample data; not a live learner account." },
  { src: "/images/prefect-dashboard-preview.svg", title: "Dallyletter prefect dashboard preview", alt: "Illustrative Dallyletter prefect dashboard showing school responsibilities, duties and notices", caption: "Public illustrative product preview using fictional sample data; not a live prefect account." }
];

for (const item of images) {
  const file = path.join(root, item.src.replace(/^\\//, ""));
  if (!fs.existsSync(file)) throw new Error("Missing public image-search asset: " + item.src);
}
let html = fs.readFileSync(homepage, "utf8");
const marker = '<section class="dl-image-discovery"';
if (!html.includes(marker)) {
  const cards = images.slice(1).map(item => '<article class="dl-image-card"><img src="' + item.src + '" alt="' + item.alt + '" width="1200" height="800" loading="lazy" decoding="async"><div><h3>' + item.title + '</h3><p>' + item.caption + '</p></div></article>').join("");
  const section = '<section class="dl-image-discovery" aria-labelledby="dl-image-discovery-title"><div class="dl-image-discovery-inner"><p class="dl-image-kicker">Explore the platform</p><h2 id="dl-image-discovery-title">Inside the Dallyletter learning experience</h2><p class="dl-image-intro">Discover the tools and role-based workspaces that support connected learning and school communities.</p><div class="dl-image-grid">' + cards + '</div><p class="dl-image-note">These are illustrative public previews, not screenshots of real accounts. Actual workspace features depend on role, permissions and release.</p></div></section>';
  const style = '<style id="dl-image-discovery-style">.dl-image-discovery{padding:4.5rem 1.25rem;background:linear-gradient(180deg,#f5f7fb,#fff);border-block:1px solid #e1e8f2}.dl-image-discovery-inner{max-width:1160px;margin:auto}.dl-image-kicker{text-transform:uppercase;letter-spacing:.15em;color:#8b6b00;font-size:.75rem;font-weight:800}.dl-image-discovery h2{color:#0f2a5a;font-size:clamp(1.8rem,4vw,2.8rem);line-height:1.15;margin:.4rem 0}.dl-image-intro{color:#61708a;max-width:720px}.dl-image-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1.25rem;margin-top:2rem}.dl-image-card{overflow:hidden;border:1px solid #dce5f1;border-radius:20px;background:#fff;box-shadow:0 14px 36px rgba(15,42,90,.09)}.dl-image-card img{display:block;width:100%;height:auto;aspect-ratio:3/2;object-fit:cover;background:#eaf0f8}.dl-image-card div{padding:1.1rem 1.25rem}.dl-image-card h3{margin:0;color:#0f2a5a;font-size:1.1rem}.dl-image-card p{margin:.45rem 0 0;color:#61708a;font-size:.88rem}.dl-image-note{margin-top:1.2rem;color:#74839a;font-size:.78rem}@media(max-width:700px){.dl-image-grid{grid-template-columns:1fr}.dl-image-discovery{padding:3rem 1rem}}</style>';
  html = html.replace("</head>", style + "</head>");
  html = html.replace("</main>", section + "</main>");
  fs.writeFileSync(homepage, html, "utf8");
}
let sitemap = fs.readFileSync(sitemapPath, "utf8");
const homeOpen = '<url><loc>' + siteUrl + '/</loc>';
if (!sitemap.includes(homeOpen)) throw new Error("Canonical homepage URL missing from sitemap");
const imageXml = images.map(item => '<image:image><image:loc>' + siteUrl + item.src + '</image:loc><image:title>' + item.title + '</image:title><image:caption>' + item.caption + '</image:caption></image:image>').join("");
const homeStart = sitemap.indexOf(homeOpen);
const homeEnd = sitemap.indexOf("</url>", homeStart);
if (homeEnd < 0) throw new Error("Homepage sitemap entry is malformed");
if (!sitemap.slice(homeStart, homeEnd).includes("/images/learner-dashboard-preview.svg")) {
  sitemap = sitemap.slice(0, homeEnd) + imageXml + sitemap.slice(homeEnd);
  fs.writeFileSync(sitemapPath, sitemap, "utf8");
}
const updated = fs.readFileSync(homepage, "utf8");
for (const required of ["dl-image-discovery", "learner-dashboard-preview.svg", "prefect-dashboard-preview.svg", "fictional sample data"]) {
  if (!updated.includes(required)) throw new Error("Image discovery page requirement missing: " + required);
}
console.log("Published " + images.length + " crawlable brand/product images and added public role-preview cards; no authenticated dashboard captures were exposed.");
