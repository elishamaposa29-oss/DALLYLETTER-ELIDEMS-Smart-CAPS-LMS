import fs from "node:fs";
import path from "node:path";

const root = path.resolve("dist/public");
if (!fs.existsSync(root)) throw new Error("Public build output is missing");

const css = \`
/* Dallyletter premium public navigation and landing polish */
:root{--dl-navy:#0f2a5a;--dl-gold:#b38b00;--dl-gold-soft:#f7edc9;--dl-ink:#17243a;--dl-muted:#61708a}
.top{position:sticky;top:0;z-index:60;background:rgba(15,42,90,.97);backdrop-filter:blur(16px);box-shadow:0 8px 24px rgba(5,20,48,.12)}
.nav{max-width:1240px;min-height:76px;flex-wrap:nowrap;gap:1.25rem}
.brand{display:inline-flex;align-items:center;white-space:nowrap;letter-spacing:.035em;font-size:.92rem}
.brand img{width:42px;height:42px;filter:drop-shadow(0 5px 12px rgba(0,0,0,.18))}
.navlinks{flex:1;min-width:0;justify-content:flex-end;align-items:center;gap:.85rem}
.nav-primary{display:flex;align-items:center;justify-content:flex-end;gap:clamp(.45rem,1vw,.9rem)}
.navlinks a,.nav-more summary{font-size:.82rem;font-weight:650;white-space:nowrap;transition:color .2s,opacity .2s}
.navlinks a:hover,.nav-more summary:hover{color:#f5d979}
.nav-more{position:relative}.nav-more summary{list-style:none;cursor:pointer;color:#fff;padding:.35rem .15rem}
.nav-more summary::-webkit-details-marker{display:none}.nav-more summary:after{content:"⌄";margin-left:.35rem;color:#f0d477}
.nav-more-menu{position:absolute;right:0;top:calc(100% + .75rem);min-width:210px;display:grid;gap:.15rem;padding:.55rem;background:#fff;border:1px solid #e5eaf2;border-radius:13px;box-shadow:0 18px 48px rgba(5,20,48,.22)}
.nav-more-menu a{color:#18345f;padding:.62rem .7rem;border-radius:8px}.nav-more-menu a:hover{color:#0f2a5a;background:#f4f6fa}
.nav-actions{display:flex;align-items:center;gap:.55rem;white-space:nowrap}
.nav-actions a,.nav-mobile-actions a{border-radius:999px;padding:.58rem .9rem;font-size:.8rem;font-weight:800;text-decoration:none}
.nav-login{color:#fff;border:1px solid rgba(255,255,255,.45)}.nav-join{background:#b38b00;color:#101f3b;box-shadow:0 7px 18px rgba(179,139,0,.22)}
.nav-toggle{display:none;border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.08);color:#fff;border-radius:12px;width:44px;height:44px;align-items:center;justify-content:center;cursor:pointer}
.nav-toggle-lines{display:grid;gap:5px}.nav-toggle-lines i{display:block;width:19px;height:2px;border-radius:3px;background:currentColor;transition:transform .2s,opacity .2s}
.nav-toggle[aria-expanded=true] .nav-toggle-lines i:first-child{transform:translateY(7px) rotate(45deg)}.nav-toggle[aria-expanded=true] .nav-toggle-lines i:nth-child(2){opacity:0}.nav-toggle[aria-expanded=true] .nav-toggle-lines i:last-child{transform:translateY(-7px) rotate(-45deg)}
.nav-mobile-actions{display:none}
.hero{background:radial-gradient(ellipse at 82% 18%,rgba(179,139,0,.22),transparent 34%),linear-gradient(128deg,#091a38 0%,#0f2a5a 56%,#1b477f 100%)}
.hero .wrap{max-width:1240px}.hero-copy{max-width:690px}.hero .eyebrow{color:#f4d979;border-color:rgba(243,216,128,.42);background:rgba(243,216,128,.1);font-size:.72rem}
.hero h1{max-width:720px;text-wrap:balance}.hero-copy>p{max-width:650px}
.dl-founder-credit{display:flex;align-items:center;gap:.5rem;margin:1.05rem 0 0;color:#dce7f8;font-size:.84rem}
.dl-founder-credit a{color:#f4d979;font-weight:800;text-decoration:none;text-underline-offset:4px}.dl-founder-credit a:hover{text-decoration:underline}
.dl-actions .btn{border:1px solid transparent;background:#b38b00;color:#101f3b;font-weight:850;border-radius:11px;box-shadow:0 10px 26px rgba(179,139,0,.2)}
.dl-actions .btn.secondary{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.55);color:#fff;box-shadow:none}
.dl-actions .btn:hover{box-shadow:0 14px 32px rgba(179,139,0,.3)}
.dl-browser{border-color:rgba(255,255,255,.72);box-shadow:0 34px 90px rgba(0,0,0,.38),0 0 0 1px rgba(179,139,0,.18)}
.dl-proof-item b{color:#0f2a5a}.dl-kicker{color:#8d6c00}.dl-section h2{color:#0f2a5a}
.dl-feature:hover,.dl-role:hover{border-color:rgba(179,139,0,.58);box-shadow:0 18px 42px rgba(15,42,90,.13)}
.dl-feature-icon{background:#f7f1df;color:#0f2a5a}.dl-role-tag{color:#755b00;background:#f7edc9}
.dl-cta-card{background:radial-gradient(circle at 90% 15%,rgba(179,139,0,.2),transparent 32%),linear-gradient(120deg,#0b2044,#173e78);border:1px solid rgba(179,139,0,.3)}
.dl-cta-card .btn{background:#b38b00;color:#101f3b}.footer{background:#081a38}
@media(max-width:1040px){.nav{gap:.75rem}.navlinks{gap:.55rem}.nav-primary{gap:.55rem}.navlinks a,.nav-more summary{font-size:.76rem}.nav-actions a{padding:.55rem .7rem}}
@media(max-width:820px){
 .nav{min-height:68px;flex-wrap:wrap;gap:.5rem;padding:.7rem 1rem}.nav-toggle{display:flex;margin-left:auto}
 .nav-actions{display:none}.navlinks{display:none;position:absolute;top:100%;left:0;right:0;flex:0 0 100%;width:100%;padding:1rem 1.1rem 1.25rem;background:#0f2a5a;border-top:1px solid rgba(255,255,255,.15);box-shadow:0 18px 32px rgba(5,20,48,.22);align-items:stretch;gap:.75rem}
 .navlinks[data-open=true]{display:flex;flex-direction:column}.nav-primary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.35rem}
 .nav-primary>a,.nav-more summary{display:block;padding:.72rem .7rem;border-radius:9px;background:rgba(255,255,255,.055);font-size:.9rem}
 .nav-more{width:100%}.nav-more summary:after{float:right}.nav-more-menu{position:static;min-width:0;margin-top:.35rem;background:#fff;box-shadow:none}
 .nav-more-menu a{font-size:.88rem}.nav-mobile-actions{display:flex;gap:.55rem;padding-top:.65rem;border-top:1px solid rgba(255,255,255,.16)}
 .nav-mobile-actions .nav-login{color:#fff}.nav-mobile-actions .nav-join{background:#b38b00;color:#101f3b}
}
@media(max-width:560px){
 .brand{font-size:.78rem}.brand img{width:38px;height:38px}.hero{padding:3.35rem 1rem}
 .hero h1{font-size:clamp(2.35rem,10vw,3rem);line-height:1.06}.hero-copy>p{font-size:1rem;line-height:1.7}
 .dl-actions{display:grid;grid-template-columns:1fr 1fr;gap:.65rem}.dl-actions .btn{text-align:center;padding:.85rem .65rem;font-size:.88rem}
 .dl-founder-credit{font-size:.78rem;flex-wrap:wrap}.dl-proof-inner{gap:.75rem}.dl-proof-item{font-size:.77rem}
}
@media(prefers-reduced-motion:reduce){.top{backdrop-filter:none}.nav-toggle-lines i{transition:none}}
\`;

const motionScript = '<script id="dl-premium-navigation">(()=>{const button=document.querySelector(".nav-toggle");const menu=document.querySelector("#primary-navigation");if(!button||!menu)return;const close=()=>{button.setAttribute("aria-expanded","false");button.setAttribute("aria-label","Open navigation");menu.dataset.open="false";};button.addEventListener("click",()=>{const open=button.getAttribute("aria-expanded")!=="true";button.setAttribute("aria-expanded",String(open));button.setAttribute("aria-label",open?"Close navigation":"Open navigation");menu.dataset.open=String(open);});menu.querySelectorAll("a").forEach(link=>link.addEventListener("click",close));document.addEventListener("keydown",event=>{if(event.key==="Escape"){close();const details=menu.querySelector(".nav-more");if(details)details.open=false;}});document.addEventListener("click",event=>{if(!menu.contains(event.target)&&!button.contains(event.target))close();});})();</script>';

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.isFile() && entry.name.endsWith(".html")) files.push(full);
  }
  return files;
}

const htmlFiles = walk(root);
if (!htmlFiles.length) throw new Error("No prerendered public HTML files were found");
let navCount = 0;

for (const file of htmlFiles) {
  let html = fs.readFileSync(file, "utf8");
  const navStart = html.indexOf('<nav class="nav" aria-label="Main navigation">');
  if (navStart < 0) throw new Error("Expected public navigation is missing from " + file);
  const navEnd = html.indexOf("</nav>", navStart);
  if (navEnd < 0) throw new Error("Public navigation is malformed in " + file);
  const originalNav = html.slice(navStart, navEnd + 6);
  if (originalNav.includes('class="nav-toggle"')) continue;
  const brand = originalNav.match(/<a class="brand"[\s\S]*?<\/a>/)?.[0];
  const linkBlock = originalNav.match(/<div class="navlinks">([\s\S]*?)<\/div>/)?.[1];
  if (!brand || !linkBlock) throw new Error("Could not safely parse existing navigation in " + file);
  const links = [...linkBlock.matchAll(/<a href="([^"]+)">([^<]+)<\/a>/g)].map(m => ({ href:m[1], label:m[2] }));
  if (links.length < 6) throw new Error("Existing public navigation links were not found in " + file);
  const primaryLabels = new Set(["About","How it works","Learners","Educators","Schools"]);
  const primary = links.filter(link => primaryLabels.has(link.label));
  const more = links.filter(link => !primaryLabels.has(link.label));
  const anchor = link => '<a href="' + link.href + '">' + link.label + '</a>';
  const rebuilt = '<nav class="nav" aria-label="Main navigation">' + brand +
    '<button class="nav-toggle" type="button" aria-controls="primary-navigation" aria-expanded="false" aria-label="Open navigation"><span class="nav-toggle-lines" aria-hidden="true"><i></i><i></i><i></i></span></button>' +
    '<div class="navlinks" id="primary-navigation" data-open="false"><div class="nav-primary">' + primary.map(anchor).join("") +
    '<details class="nav-more"><summary>Explore</summary><div class="nav-more-menu">' + more.map(anchor).join("") + '</div></details></div>' +
    '<div class="nav-mobile-actions"><a class="nav-login" href="/login">Sign in</a><a class="nav-join" href="/register">Get started</a></div></div>' +
    '<div class="nav-actions"><a class="nav-login" href="/login">Sign in</a><a class="nav-join" href="/register">Get started</a></div></nav>';
  for (const link of links) if (!rebuilt.includes('href="' + link.href + '"')) throw new Error("Navigation link was lost: " + link.href);
  html = html.slice(0, navStart) + rebuilt + html.slice(navEnd + 6);

  if (file.endsWith(path.join("public-site", "index.html")) && !html.includes("dl-founder-credit")) {
    html = html.replace(/(<div class="actions dl-actions">[\s\S]*?<\/div>)/, '$1<p class="dl-founder-credit">Created by <a href="/founder-story/">Elisha Maposa</a> · Zimbabwe-first education technology</p>');
  }
  if (!html.includes("Dallyletter premium public navigation and landing polish")) html = html.replace("</style>", css + "\n</style>");
  if (file.endsWith(path.join("public-site", "index.html")) && !html.includes("dl-premium-navigation")) html = html.replace("</body>", motionScript + "\n</body>");
  fs.writeFileSync(file, html, "utf8");
  navCount++;
}

const homepage = fs.readFileSync(path.join(root, "public-site", "index.html"), "utf8");
for (const marker of ["Dallyletter premium public navigation and landing polish","nav-toggle","primary-navigation","nav-mobile-actions","dl-founder-credit","Elisha Maposa","prefers-reduced-motion","dl-premium-navigation"]) {
  if (!homepage.includes(marker)) throw new Error("Landing-page acceptance check failed: " + marker);
}
for (const route of ["/about/","/founder-story/","/how-it-works/","/learners/","/educators/","/managers/","/schools/","/mathematics/","/past-papers/","/zimbabwe/","/africa/"]) {
  if (!homepage.includes('href="' + route + '"')) throw new Error("A public navigation route was lost: " + route);
}
console.log("Polished " + navCount + " public pages with responsive navigation, branded CTAs and visible creator attribution.");
