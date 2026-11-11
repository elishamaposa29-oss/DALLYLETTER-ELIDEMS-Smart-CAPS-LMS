import fs from "node:fs";
import path from "node:path";

const root = path.resolve("dist/public");
const homepage = path.join(root, "public-site", "index.html");
if (!fs.existsSync(homepage)) throw new Error("Prerendered public homepage is missing");

const css = `
/* Dallyletter public visual system */
:root{--dl-navy:#0f2a5a;--dl-gold:#b38b00;--dl-ink:#17243a;--dl-muted:#61708a;--dl-line:#e1e8f2;--dl-surface:#fff}
.hero{position:relative;overflow:hidden;background:radial-gradient(ellipse at 82% 22%,rgba(179,139,0,.24),transparent 34%),linear-gradient(130deg,#091a38 0%,#0f2a5a 52%,#1b477f 100%);padding:clamp(3.8rem,7vw,6.4rem) 1.25rem}
.hero:after{content:"";position:absolute;inset:0;pointer-events:none;opacity:.14;background-image:linear-gradient(rgba(255,255,255,.18) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.18) 1px,transparent 1px);background-size:44px 44px;mask-image:linear-gradient(90deg,transparent,black)}
.hero .wrap{position:relative;z-index:1;max-width:1160px;display:grid;grid-template-columns:minmax(0,1.05fr) minmax(340px,.95fr);gap:3rem;align-items:center}
.hero-copy{max-width:650px}.hero h1{font-size:clamp(2.55rem,5vw,4.8rem);letter-spacing:-.045em}.hero p{font-size:1.12rem;line-height:1.8;color:#e3ebf8}.eyebrow{display:inline-flex;align-items:center;gap:.55rem;border:1px solid rgba(242,213,107,.4);background:rgba(242,213,107,.09);border-radius:999px;padding:.45rem .8rem;letter-spacing:.1em}
.hero-art{position:relative;min-width:0}.hero-art:before{content:"";position:absolute;inset:8% 5%;background:rgba(70,112,174,.28);filter:blur(44px);border-radius:50%}
.dl-browser{position:relative;background:#f7f9fd;border:1px solid rgba(255,255,255,.6);border-radius:20px;padding:12px;box-shadow:0 30px 80px rgba(0,0,0,.34);transform:perspective(1000px) rotateY(-5deg) rotateX(2deg)}
.dl-browser-bar{height:30px;display:flex;align-items:center;gap:6px;padding:0 7px;color:#73819a;font-size:.68rem}.dl-dot{width:7px;height:7px;border-radius:50%;background:#d5dce8}.dl-address{margin-left:10px;background:#e9eef6;border-radius:6px;padding:4px 12px;flex:1;text-align:center}
.dl-screen{display:grid;grid-template-columns:104px 1fr;min-height:280px;background:#fff;border:1px solid #e4eaf3;border-radius:12px;overflow:hidden;color:#192b49}
.dl-side{background:#0f2a5a;padding:15px 10px;color:#fff}.dl-brand-mini{font-size:.62rem;font-weight:800;letter-spacing:.06em;margin-bottom:24px}.dl-side-line{height:7px;border-radius:8px;background:rgba(255,255,255,.2);margin:13px 0}.dl-side-line.active{background:#e9c65c;width:78%}
.dl-main{padding:18px 16px}.dl-greeting{font-size:.62rem;color:#77859a}.dl-main h3{font-size:1rem;margin:3px 0 12px;color:#172b4d}.dl-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.dl-stat{border:1px solid #e7ecf4;border-radius:9px;padding:10px 8px}.dl-stat b{display:block;font-size:1rem;color:#0f2a5a}.dl-stat span{font-size:.57rem;color:#71809a}.dl-panel{margin-top:10px;border:1px solid #e7ecf4;border-radius:9px;padding:10px}.dl-panel-head{display:flex;justify-content:space-between;font-size:.65rem;font-weight:700;margin-bottom:10px}.dl-course{display:flex;align-items:center;gap:8px;margin:9px 0}.dl-course-icon{width:28px;height:28px;border-radius:8px;background:#edf2fa;display:grid;place-items:center;color:#0f2a5a;font-weight:800;font-size:.68rem}.dl-course-copy{flex:1}.dl-course-copy b{display:block;font-size:.62rem}.dl-course-copy small{font-size:.54rem;color:#77859a}.dl-progress{height:5px;background:#edf0f5;border-radius:8px;overflow:hidden;margin-top:4px}.dl-progress i{display:block;height:100%;background:#b38b00;border-radius:8px}
.dl-preview-note{color:#d8e3f4;font-size:.68rem;text-align:center;margin:.8rem 0 0;letter-spacing:.02em}
.dl-actions .btn{box-shadow:0 8px 22px rgba(0,0,0,.15);padding:.9rem 1.3rem}.dl-actions .btn.secondary{background:rgba(255,255,255,.08)}
.dl-proof{background:#fff;border-bottom:1px solid var(--dl-line)}.dl-proof-inner{max-width:1160px;margin:auto;padding:1.1rem 1.25rem;display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap}.dl-proof-item{display:flex;align-items:center;gap:.55rem;color:#40516c;font-size:.82rem;font-weight:650}.dl-proof-item b{color:#0f2a5a}
.dl-section{max-width:1160px;margin:0 auto;padding:4rem 1.25rem}.dl-section-head{max-width:720px;margin:0 auto 2rem;text-align:center}.dl-kicker{color:#947000;text-transform:uppercase;letter-spacing:.14em;font-size:.72rem;font-weight:800}.dl-section h2{color:#0f2a5a;font-size:clamp(1.8rem,3vw,2.7rem);line-height:1.15;letter-spacing:-.03em;margin:.45rem 0}.dl-section-head p{color:#63718a}
.dl-feature-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem}.dl-feature{background:#fff;border:1px solid var(--dl-line);border-radius:17px;padding:1.35rem;box-shadow:0 10px 30px rgba(19,42,79,.045)}.dl-feature-icon{width:46px;height:46px;border-radius:13px;background:#edf2fa;color:#0f2a5a;display:grid;place-items:center;margin-bottom:1rem}.dl-feature h3{color:#142b50;font-size:1.04rem;margin:.2rem 0}.dl-feature p{color:#63718a;font-size:.9rem;margin:0}
.dl-role-section{background:#edf2f8;border-top:1px solid #e0e7f0;border-bottom:1px solid #e0e7f0}.dl-role-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem}.dl-role{background:white;border:1px solid #dfe7f1;border-radius:16px;padding:1.2rem;min-width:0}.dl-role-top{display:flex;justify-content:space-between;align-items:center;gap:.5rem}.dl-role h3{margin:0;color:#102b55;font-size:1.05rem}.dl-role-tag{font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:#846400;background:#fbf4d9;padding:.35rem .5rem;border-radius:999px}.dl-role-screen{margin:1rem 0;background:#f6f8fc;border:1px solid #e5ebf3;border-radius:10px;padding:12px;min-height:130px}.dl-role-row{display:flex;gap:7px;align-items:center;margin:8px 0}.dl-role-block{height:9px;border-radius:5px;background:#dce4ef;flex:1}.dl-role-block.gold{background:#d6b64f;max-width:32%}.dl-role-bars{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:12px 0}.dl-role-bars i{height:36px;background:linear-gradient(180deg,#d9e3f1,#eff3f8);border-radius:6px}.dl-role p{font-size:.83rem;color:#63718a;margin:.5rem 0 0}
.dl-disclaimer{text-align:center;color:#6c7890;font-size:.72rem;margin:1.25rem auto 0;max-width:760px}
.dl-cta{max-width:1160px;margin:0 auto;padding:0 1.25rem 4rem}.dl-cta-card{border-radius:20px;padding:2.4rem;background:linear-gradient(120deg,#0b2044,#173e78);color:white;display:flex;align-items:center;justify-content:space-between;gap:2rem}.dl-cta-card h2{font-size:clamp(1.6rem,3vw,2.4rem);line-height:1.2;margin:0 0 .5rem}.dl-cta-card p{color:#dbe5f5;margin:0}
@media(max-width:850px){.hero .wrap{grid-template-columns:1fr;gap:2rem}.hero-copy{max-width:760px}.hero-art{max-width:620px;width:100%;margin:auto}.dl-feature-grid,.dl-role-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.dl-role:last-child{grid-column:1/-1}}
@media(max-width:560px){.hero{padding:3.2rem 1rem}.hero .wrap{grid-template-columns:minmax(0,1fr)}.hero h1{font-size:2.5rem}.dl-screen{grid-template-columns:74px 1fr;min-height:235px}.dl-side{padding:12px 8px}.dl-main{padding:12px 9px}.dl-stats{gap:5px}.dl-stat{padding:7px 5px}.dl-stat b{font-size:.85rem}.dl-feature-grid,.dl-role-grid{grid-template-columns:1fr}.dl-role:last-child{grid-column:auto}.dl-section{padding:3rem 1rem}.dl-cta-card{padding:1.6rem;display:block}.dl-cta-card .btn{margin-top:1.2rem}.dl-proof-inner{justify-content:flex-start}.dl-browser{transform:none}}
@media(prefers-reduced-motion:reduce){.dl-browser{transform:none}}
`;

const heroVisual = `
<div class="hero-art" aria-label="Illustrative Dallyletter learning workspace preview">
 <div class="dl-browser">
  <div class="dl-browser-bar"><i class="dl-dot"></i><i class="dl-dot"></i><i class="dl-dot"></i><span class="dl-address">workspace.dallyletter</span></div>
  <div class="dl-screen">
   <aside class="dl-side"><div class="dl-brand-mini">DALLYLETTER</div><div class="dl-side-line active"></div><div class="dl-side-line"></div><div class="dl-side-line"></div><div class="dl-side-line"></div><div class="dl-side-line"></div></aside>
   <div class="dl-main"><span class="dl-greeting">YOUR LEARNING SPACE</span><h3>Welcome back, learner</h3>
    <div class="dl-stats"><div class="dl-stat"><b>Lessons</b><span>Study resources</span></div><div class="dl-stat"><b>Practice</b><span>Activities</span></div><div class="dl-stat"><b>Progress</b><span>Learning record</span></div></div>
    <div class="dl-panel"><div class="dl-panel-head"><span>Continue learning</span><span>View all</span></div>
     <div class="dl-course"><span class="dl-course-icon">M</span><div class="dl-course-copy"><b>Mathematics</b><small>Lessons and exercises</small><div class="dl-progress"><i style="width:68%"></i></div></div></div>
     <div class="dl-course"><span class="dl-course-icon">S</span><div class="dl-course-copy"><b>Science</b><small>Study and practice</small><div class="dl-progress"><i style="width:42%"></i></div></div></div>
    </div>
   </div>
  </div>
 </div>
 <p class="dl-preview-note">Illustrative interface concept · not a live account screenshot</p>
</div>`;

const homepageSections = `
<section class="dl-proof" aria-label="Dallyletter platform focus"><div class="dl-proof-inner">
 <div class="dl-proof-item"><b>Zimbabwe first</b><span>Built from local context</span></div>
 <div class="dl-proof-item"><b>South Africa</b><span>Important regional focus</span></div>
 <div class="dl-proof-item"><b>Africa + global</b><span>Open to wider learning communities</span></div>
 <div class="dl-proof-item"><b>Role-based</b><span>Learners · educators · schools</span></div>
</div></section>
<section class="dl-section"><div class="dl-section-head"><span class="dl-kicker">One connected learning journey</span><h2>More than a place to read notes</h2><p>Bring teaching preparation, learner practice and feedback into a continuous learning process.</p></div>
 <div class="dl-feature-grid">
  <article class="dl-feature"><div class="dl-feature-icon" aria-hidden="true">▤</div><h3>Lessons and learning resources</h3><p>Organise educator-provided lessons and materials so learners can study with clearer direction.</p></article>
  <article class="dl-feature"><div class="dl-feature-icon" aria-hidden="true">✎</div><h3>Exercises and assignments</h3><p>Give learners opportunities to practise, demonstrate understanding and submit work.</p></article>
  <article class="dl-feature"><div class="dl-feature-icon" aria-hidden="true">✓</div><h3>Feedback and improvement</h3><p>Connect marking and educator feedback with the next learning step.</p></article>
  <article class="dl-feature"><div class="dl-feature-icon" aria-hidden="true">◷</div><h3>Classes and study groups</h3><p>Support learning communities with class activity and peer collaboration where enabled.</p></article>
  <article class="dl-feature"><div class="dl-feature-icon" aria-hidden="true">▥</div><h3>Attendance and records</h3><p>Help authorised school teams follow participation and maintain learning evidence.</p></article>
  <article class="dl-feature"><div class="dl-feature-icon" aria-hidden="true">◎</div><h3>Progress and achievements</h3><p>Make learner activity and development easier to review over time.</p></article>
 </div>
</section>
<section class="dl-role-section"><div class="dl-section"><div class="dl-section-head"><span class="dl-kicker">A workspace for every role</span><h2>Different people. Connected learning.</h2><p>Role-based workspaces are designed around the tasks each part of a learning community needs to complete.</p></div>
 <div class="dl-role-grid">
  <article class="dl-role"><div class="dl-role-top"><h3>Learner workspace</h3><span class="dl-role-tag">Study</span></div><div class="dl-role-screen" aria-hidden="true"><div class="dl-role-row"><i class="dl-role-block gold"></i><i class="dl-role-block"></i></div><div class="dl-role-bars"><i></i><i></i><i></i><i></i></div><div class="dl-role-row"><i class="dl-role-block"></i></div><div class="dl-role-row"><i class="dl-role-block gold"></i><i class="dl-role-block"></i></div></div><p>Access lessons, practise with exercises, submit assignments and follow learning activity.</p><a href="/student">Open learner workspace →</a></article>
  <article class="dl-role"><div class="dl-role-top"><h3>Teacher workspace</h3><span class="dl-role-tag">Teach</span></div><div class="dl-role-screen" aria-hidden="true"><div class="dl-role-row"><i class="dl-role-block gold"></i><i class="dl-role-block"></i></div><div class="dl-role-bars"><i></i><i></i><i></i><i></i></div><div class="dl-role-row"><i class="dl-role-block"></i><i class="dl-role-block gold"></i></div><div class="dl-role-row"><i class="dl-role-block"></i></div></div><p>Prepare lessons and activities, review learner work and provide feedback.</p><a href="/teacher">Open teacher workspace →</a></article>
  <article class="dl-role"><div class="dl-role-top"><h3>Manager workspace</h3><span class="dl-role-tag">Coordinate</span></div><div class="dl-role-screen" aria-hidden="true"><div class="dl-role-row"><i class="dl-role-block gold"></i><i class="dl-role-block"></i></div><div class="dl-role-bars"><i></i><i></i><i></i><i></i></div><div class="dl-role-row"><i class="dl-role-block"></i></div><div class="dl-role-row"><i class="dl-role-block gold"></i><i class="dl-role-block"></i></div></div><p>Coordinate authorised school workflows, review activity and support reporting.</p><a href="/manager">Open manager workspace →</a></article>
 </div><p class="dl-disclaimer">These are illustrative layout concepts, not screenshots or representations of live account data. Workspace access requires sign-in and depends on verified account roles and permissions.</p>
</div></section>
<section class="dl-cta"><div class="dl-cta-card"><div><h2>Make learning easier to organise and continue.</h2><p>Explore Dallyletter Elidems or create an account to get started.</p></div><a class="btn" href="/register">Create your account →</a></div></section>
`;

const htmlFiles = [];
function walk(dir) {
 for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) walk(full);
  else if (entry.isFile() && entry.name.endsWith(".html") && !full.endsWith(path.join("public", "404.html"))) htmlFiles.push(full);
 }
}
walk(root);
for (const file of htmlFiles) {
 let html = fs.readFileSync(file, "utf8");
 if (!html.includes("Dallyletter public visual system")) html = html.replace("</style>", css + "</style>");
 if (file === homepage && !html.includes("dl-role-section")) {
  html = html.replace('<div class="wrap"><div class="eyebrow">', '<div class="wrap"><div class="hero-copy"><div class="eyebrow">');
  html = html.replace('<div class="actions">', '<div class="actions dl-actions">');
  html = html.replace('</div></div></div><div class="content">', '</div></div>' + heroVisual + '</div></div>' + homepageSections + '<div class="content">');
 }
 fs.writeFileSync(file, html, "utf8");
}
if (!fs.readFileSync(homepage, "utf8").includes("dl-role-section")) throw new Error("Homepage visual sections were not injected");
console.log("Enhanced " + htmlFiles.length + " prerendered public pages with responsive visual styling and homepage product previews.");
