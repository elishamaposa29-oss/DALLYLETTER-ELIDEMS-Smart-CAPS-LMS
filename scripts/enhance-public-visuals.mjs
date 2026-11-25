import fs from "node:fs";
import path from "node:path";

const root = path.resolve("dist/public");
const homepage = path.join(root, "public-site", "index.html");
if (!fs.existsSync(homepage)) throw new Error("Prerendered public homepage is missing");

const css = `
/* Dallyletter public visual system */
:root{--dl-navy:#0f2a5a;--dl-gold:#A87919;--dl-ink:#17243a;--dl-muted:#61708a;--dl-line:#e1e8f2;--dl-surface:#fff}
.hero{position:relative;overflow:hidden;background:radial-gradient(ellipse at 82% 22%,rgba(179,139,0,.24),transparent 34%),linear-gradient(130deg,#091a38 0%,#0f2a5a 52%,#1b477f 100%);padding:clamp(3.8rem,7vw,6.4rem) 1.25rem}
.hero:after{content:"";position:absolute;inset:0;pointer-events:none;opacity:.14;background-image:linear-gradient(rgba(255,255,255,.18) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.18) 1px,transparent 1px);background-size:44px 44px;mask-image:linear-gradient(90deg,transparent,black)}
.hero .wrap{position:relative;z-index:1;max-width:1160px;display:grid;grid-template-columns:minmax(0,1.05fr) minmax(340px,.95fr);gap:3rem;align-items:center}
.hero-copy{max-width:650px}.hero h1{font-size:clamp(2.55rem,5vw,4.8rem);letter-spacing:-.045em}.hero p{font-size:1.12rem;line-height:1.8;color:#e3ebf8}.eyebrow{display:inline-flex;align-items:center;gap:.55rem;border:1px solid rgba(242,213,107,.4);background:rgba(242,213,107,.09);border-radius:999px;padding:.45rem .8rem;letter-spacing:.1em}
.hero-art{position:relative;min-width:0}.hero-art:before{content:"";position:absolute;inset:8% 5%;background:rgba(70,112,174,.28);filter:blur(44px);border-radius:50%}
.dl-browser{position:relative;background:#f7f9fd;border:1px solid rgba(255,255,255,.6);border-radius:20px;padding:12px;box-shadow:0 30px 80px rgba(0,0,0,.34);transform:perspective(1000px) rotateY(-5deg) rotateX(2deg)}
.dl-browser-bar{height:30px;display:flex;align-items:center;gap:6px;padding:0 7px;color:#73819a;font-size:.68rem}.dl-dot{width:7px;height:7px;border-radius:50%;background:#d5dce8}.dl-address{margin-left:10px;background:#e9eef6;border-radius:6px;padding:4px 12px;flex:1;text-align:center}
.dl-screen{display:grid;grid-template-columns:104px 1fr;min-height:280px;background:#fff;border:1px solid #e4eaf3;border-radius:12px;overflow:hidden;color:#192b49}
.dl-side{background:#0f2a5a;padding:15px 10px;color:#fff}.dl-brand-mini{font-size:.62rem;font-weight:800;letter-spacing:.06em;margin-bottom:24px}.dl-side-line{height:7px;border-radius:8px;background:rgba(255,255,255,.2);margin:13px 0}.dl-side-line.active{background:#e9c65c;width:78%}
.dl-main{padding:18px 16px}.dl-greeting{font-size:.62rem;color:#77859a}.dl-main h3{font-size:1rem;margin:3px 0 12px;color:#172b4d}.dl-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.dl-stat{border:1px solid #e7ecf4;border-radius:9px;padding:10px 8px}.dl-stat b{display:block;font-size:1rem;color:#0f2a5a}.dl-stat span{font-size:.57rem;color:#71809a}.dl-panel{margin-top:10px;border:1px solid #e7ecf4;border-radius:9px;padding:10px}.dl-panel-head{display:flex;justify-content:space-between;font-size:.65rem;font-weight:700;margin-bottom:10px}.dl-course{display:flex;align-items:center;gap:8px;margin:9px 0}.dl-course-icon{width:28px;height:28px;border-radius:8px;background:#edf2fa;display:grid;place-items:center;color:#0f2a5a;font-weight:800;font-size:.68rem}.dl-course-copy{flex:1}.dl-course-copy b{display:block;font-size:.62rem}.dl-course-copy small{font-size:.54rem;color:#77859a}.dl-progress{height:5px;background:#edf0f5;border-radius:8px;overflow:hidden;margin-top:4px}.dl-progress i{display:block;height:100%;background:#A87919;border-radius:8px}
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

/* Premium navy-and-gold refinement: additive presentation layer */
:root{--dl-navy:#0f2a5a;--dl-gold:#b38b00;--dl-gold-light:#f2d56b;--dl-ink:#17243a;--dl-muted:#61708a;--dl-line:#dce5f1}
html{scroll-padding-top:88px}
.top{position:sticky;top:0;z-index:60;background:rgba(7,20,43,.96);backdrop-filter:blur(18px);border-bottom:1px solid rgba(242,213,107,.22);box-shadow:0 10px 32px rgba(3,13,31,.16)}
.nav{position:relative;max-width:1240px;min-height:78px;padding:.8rem clamp(1rem,3vw,2rem)}
.brand{display:inline-flex;align-items:center;gap:.2rem;letter-spacing:.045em;font-size:.9rem}
.brand img{filter:drop-shadow(0 4px 12px rgba(242,213,107,.2));transition:transform .3s}
.brand:hover img{transform:rotate(-7deg) scale(1.05)}
.navlinks{align-items:center;gap:clamp(.65rem,1.6vw,1.35rem)}
.navlinks a{font-weight:600;transition:color .2s,background .2s}
.navlinks a:hover,.navlinks a:focus-visible{color:#f2d56b}
.hero{position:relative;background:radial-gradient(ellipse at 76% 18%,rgba(179,139,0,.28),transparent 32%),radial-gradient(ellipse at 8% 92%,rgba(76,139,208,.2),transparent 36%),linear-gradient(132deg,#07172f 0%,#0f2a5a 53%,#173e78 100%);padding:clamp(4rem,7vw,7rem) clamp(1rem,3vw,2rem)}
.hero:before{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(115deg,transparent 20%,rgba(255,255,255,.035) 50%,transparent 78%)}
.hero h1{max-width:760px;text-wrap:balance;text-shadow:0 10px 36px rgba(0,0,0,.22)}
.hero-copy>p{max-width:650px}
.eyebrow{color:#f7df83;border-color:rgba(242,213,107,.5);box-shadow:0 8px 28px rgba(0,0,0,.12)}
.hero .btn{background:linear-gradient(135deg,#f5dc78,#b38b00);color:#101f3a;border:1px solid rgba(255,238,171,.65);box-shadow:0 10px 28px rgba(179,139,0,.25);transition:transform .22s,box-shadow .22s,filter .22s}
.hero .btn:hover,.dl-cta .btn:hover{transform:translateY(-2px);filter:brightness(1.06);box-shadow:0 16px 34px rgba(179,139,0,.34)}
.hero .btn.secondary{background:rgba(255,255,255,.075);border:1px solid rgba(255,255,255,.36);color:#fff;box-shadow:none}
.dl-browser{border:1px solid rgba(242,213,107,.48);box-shadow:0 36px 90px rgba(0,0,0,.4),0 0 0 8px rgba(255,255,255,.035);background:linear-gradient(145deg,#fff,#e9eef7)}
.dl-browser-bar{height:36px}.dl-screen{box-shadow:inset 0 1px rgba(255,255,255,.8)}
.dl-side{background:linear-gradient(180deg,#0b2044,#0f2a5a 70%,#173e78)}
.dl-course-icon{background:linear-gradient(145deg,#fff7d6,#f2e5b2);color:#0f2a5a}
.dl-progress i{background:linear-gradient(90deg,#b38b00,#f2d56b)}
.dl-proof{background:linear-gradient(180deg,#fff,#f8faff)}
.dl-proof-inner{max-width:1240px;padding:1.25rem clamp(1rem,3vw,2rem)}
.dl-proof-item{padding:.45rem .65rem;border:1px solid #e8edf5;border-radius:999px;background:#fff;box-shadow:0 5px 18px rgba(15,42,90,.045)}
.dl-proof-item b{color:#0f2a5a}
.dl-section{max-width:1240px;padding:clamp(3.5rem,6vw,5.2rem) clamp(1rem,3vw,2rem)}
.dl-section h2{color:#0f2a5a;text-wrap:balance}.dl-kicker{color:#8b6b00}
.dl-feature{position:relative;overflow:hidden;background:linear-gradient(155deg,#fff 0%,#fbfcff 100%);border:1px solid #e1e8f2;border-radius:20px;padding:1.5rem;box-shadow:0 12px 34px rgba(15,42,90,.065);transition:transform .28s,border-color .28s,box-shadow .28s}
.dl-feature:before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:linear-gradient(180deg,#b38b00,#f2d56b);opacity:.72}
.dl-feature:hover{border-color:rgba(179,139,0,.55);box-shadow:0 22px 48px rgba(15,42,90,.13);transform:translateY(-6px)}
.dl-feature-icon{background:linear-gradient(145deg,#f8f1d8,#eaf0fa);border:1px solid rgba(179,139,0,.16);box-shadow:inset 0 1px rgba(255,255,255,.9),0 7px 16px rgba(15,42,90,.07)}
.dl-feature h3{color:#0f2a5a}
.dl-role-section{background:radial-gradient(ellipse at 50% 0%,rgba(179,139,0,.08),transparent 55%),linear-gradient(180deg,#f0f4fa,#e8eef7);border-color:#dce5f1}
.dl-role{position:relative;overflow:hidden;border-radius:20px;box-shadow:0 12px 32px rgba(15,42,90,.07);transition:transform .28s,border-color .28s,box-shadow .28s}
.dl-role:hover{border-color:rgba(179,139,0,.58);box-shadow:0 22px 48px rgba(15,42,90,.14);transform:translateY(-6px)}
.dl-role-screen{position:relative;overflow:hidden;background:linear-gradient(145deg,#f9fbff,#edf2f9);border-color:#dfe7f2}
.dl-role-tag{color:#725600;background:linear-gradient(135deg,#fff5ca,#f5e6a7);border:1px solid rgba(179,139,0,.18)}
.dl-role a{display:inline-flex;margin-top:1rem;color:#0f2a5a;font-weight:750;text-decoration:none}
.dl-role a:hover{color:#8b6b00;text-decoration:underline;text-underline-offset:4px}
.dl-cta{max-width:1240px;padding:0 clamp(1rem,3vw,2rem) 4.5rem}
.dl-cta-card{position:relative;overflow:hidden;border:1px solid rgba(242,213,107,.36);background:radial-gradient(ellipse at 90% 0%,rgba(179,139,0,.28),transparent 38%),linear-gradient(125deg,#07172f,#0f2a5a 62%,#1c477e);box-shadow:0 24px 60px rgba(7,23,47,.2)}
.dl-cta-card:after{content:"";position:absolute;right:-80px;bottom:-160px;width:340px;height:340px;border:1px solid rgba(242,213,107,.2);border-radius:50%;box-shadow:0 0 0 26px rgba(242,213,107,.035),0 0 0 52px rgba(242,213,107,.025);pointer-events:none}
.dl-cta-card h2{color:#fff}.dl-cta-card .btn{position:relative;z-index:1;white-space:nowrap;background:linear-gradient(135deg,#f5dc78,#b38b00);color:#101f3a}
.dl-menu-toggle{display:none;align-items:center;gap:.6rem;border:1px solid rgba(242,213,107,.4);border-radius:12px;padding:.65rem .85rem;background:rgba(255,255,255,.07);color:#fff;font:inherit;font-size:.85rem;font-weight:700;cursor:pointer}
.dl-menu-bars,.dl-menu-bars:before,.dl-menu-bars:after{display:block;width:17px;height:2px;background:#f2d56b;border-radius:4px;transition:transform .2s}
.dl-menu-bars{position:relative}.dl-menu-bars:before,.dl-menu-bars:after{content:"";position:absolute;left:0}
.dl-menu-bars:before{top:-5px}.dl-menu-bars:after{top:5px}
.dl-menu-toggle[aria-expanded="true"] .dl-menu-bars{background:transparent}
.dl-menu-toggle[aria-expanded="true"] .dl-menu-bars:before{top:0;transform:rotate(45deg)}
.dl-menu-toggle[aria-expanded="true"] .dl-menu-bars:after{top:0;transform:rotate(-45deg)}
@media(max-width:760px){
 .nav{min-height:70px;flex-wrap:nowrap}.dl-menu-toggle{display:inline-flex;flex-shrink:0}
 .navlinks{display:none;position:absolute;left:1rem;right:1rem;top:calc(100% + 8px);z-index:70;flex-direction:column;align-items:stretch;gap:.2rem;padding:.65rem;border:1px solid rgba(242,213,107,.25);border-radius:16px;background:rgba(7,20,43,.985);box-shadow:0 20px 45px rgba(0,0,0,.3)}
 .navlinks.is-open{display:flex}.navlinks a{padding:.8rem .9rem;border-radius:10px}
 .navlinks a:hover,.navlinks a:focus-visible{background:rgba(242,213,107,.1)}
 .dl-proof-inner{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}
 .dl-proof-item{justify-content:flex-start;flex-wrap:wrap;border-radius:14px}
}
@media(max-width:560px){
 .hero{padding:3.4rem 1rem}.hero h1{font-size:clamp(2.25rem,10vw,3rem);line-height:1.08}.hero p{font-size:1rem}
 .dl-proof-inner{grid-template-columns:1fr 1fr;gap:.55rem;padding:1rem}.dl-proof-item{font-size:.72rem;padding:.55rem}
 .dl-feature,.dl-role{border-radius:17px}.dl-cta-card{padding:1.5rem}.dl-cta-card .btn{display:inline-block;white-space:normal}
}
@media(prefers-reduced-motion:reduce){
 html{scroll-behavior:auto}
 .brand img,.hero .btn,.dl-feature,.dl-role,.dl-feature-icon,.dl-browser{transition:none!important;animation:none!important;transform:none!important}
}

/* Screenshot-aligned phone + laptop composition and gold closing band */
.hero-art{padding:12px 12px 26px 44px}
.dl-browser{width:100%;margin-left:0}
.dl-phone{position:absolute;z-index:3;left:0;bottom:32px;width:158px;padding:8px;border:2px solid #8794a8;border-radius:27px;background:linear-gradient(145deg,#17243a,#050b16);box-shadow:0 22px 48px rgba(0,0,0,.48),inset 0 0 0 1px rgba(255,255,255,.18);transform:rotate(-5deg)}
.dl-phone-notch{height:10px;width:48px;border-radius:0 0 9px 9px;background:#050b16;margin:-1px auto 7px}
.dl-phone-screen{border-radius:17px;overflow:hidden;background:linear-gradient(180deg,#102d5d,#07172f);padding:12px 8px 14px;color:#fff;min-height:248px}
.dl-phone-brand{font-size:.57rem;font-weight:900;letter-spacing:.06em;color:#f2d56b;margin-bottom:12px}
.dl-phone-welcome{font-size:.67rem;font-weight:800;margin-bottom:9px}
.dl-phone-item{display:flex;align-items:center;gap:6px;padding:7px 5px;margin:5px 0;border:1px solid rgba(255,255,255,.1);border-radius:8px;background:rgba(255,255,255,.055);font-size:.56rem}
.dl-phone-item i{width:18px;height:18px;display:grid;place-items:center;border-radius:5px;background:rgba(242,213,107,.14);color:#f2d56b;font-style:normal;font-weight:900}
.dl-region-seal{position:absolute;z-index:4;right:-2px;top:-13px;width:112px;height:112px;display:grid;align-content:center;justify-items:center;text-align:center;border:3px double #7b5b00;border-radius:50%;background:radial-gradient(circle at 35% 25%,#ffeaa0,#d6a91d 68%,#b38b00);color:#18243a;box-shadow:0 10px 24px rgba(0,0,0,.22);font-size:.57rem;font-weight:900;line-height:1.35;letter-spacing:.035em}
.dl-region-seal strong{display:block;font-size:.72rem;line-height:1.2}
.dl-preview-note{margin-left:42px}
.dl-founder-credit{margin:7px 0 0 42px;text-align:center;color:#f2d56b;font-size:.7rem;font-weight:750;letter-spacing:.03em}
.dl-cta-card{background:linear-gradient(110deg,#f5d56a 0%,#dba91d 55%,#b38b00 100%);border:1px solid #f7e39b;color:#101f3a;box-shadow:0 24px 60px rgba(7,23,47,.18)}
.dl-cta-card h2{color:#101f3a}
.dl-cta-card p{color:#263a5d}
.dl-cta-card .btn{background:#0f2a5a;color:#fff;border:1px solid rgba(255,255,255,.2);box-shadow:0 8px 22px rgba(15,42,90,.22)}
.dl-cta-card:after{border-color:rgba(15,42,90,.16);box-shadow:0 0 0 26px rgba(15,42,90,.035),0 0 0 52px rgba(15,42,90,.025)}
@keyframes dl-float{0%,100%{transform:translateY(0) rotate(-5deg)}50%{transform:translateY(-7px) rotate(-5deg)}}
@keyframes dl-rise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
.dl-phone{animation:dl-float 5s ease-in-out infinite}
.hero-copy{animation:dl-rise .65s ease-out both}
.hero-art{animation:dl-rise .8s .08s ease-out both}
.dl-feature{animation:dl-rise .65s ease-out both}
.dl-feature:nth-child(2){animation-delay:.06s}.dl-feature:nth-child(3){animation-delay:.12s}.dl-feature:nth-child(4){animation-delay:.18s}.dl-feature:nth-child(5){animation-delay:.24s}.dl-feature:nth-child(6){animation-delay:.3s}
@media(max-width:560px){
 .hero-art{padding:8px 0 24px 18px}
 .dl-phone{width:112px;left:-3px;bottom:29px;padding:5px;border-radius:21px}
 .dl-phone-notch{height:7px;width:36px;margin-bottom:5px}
 .dl-phone-screen{min-height:190px;padding:9px 6px 10px;border-radius:14px}
 .dl-phone-brand{font-size:.43rem;margin-bottom:8px}.dl-phone-welcome{font-size:.5rem;margin-bottom:6px}
 .dl-phone-item{font-size:.43rem;padding:5px 3px;gap:4px;margin:4px 0}
 .dl-phone-item i{width:14px;height:14px;font-size:.45rem}
 .dl-region-seal{width:78px;height:78px;right:-3px;top:-8px;font-size:.4rem;border-width:2px}
 .dl-region-seal strong{font-size:.5rem}.dl-preview-note,.dl-founder-credit{margin-left:15px}
}
@media(prefers-reduced-motion:reduce){.dl-phone,.hero-copy,.hero-art,.dl-feature{animation:none!important}}


/* Site-wide premium treatment for every generated public information page */
.hero .wrap{display:block;max-width:980px}
.hero .wrap:has(.hero-art){display:grid;grid-template-columns:minmax(0,1.05fr) minmax(340px,.95fr);gap:3rem;align-items:center;max-width:1240px}
.hero:not(:has(.hero-art)){min-height:clamp(300px,38vw,440px);display:flex;align-items:center;background:radial-gradient(ellipse at 88% 12%,rgba(179,139,0,.3),transparent 32%),radial-gradient(ellipse at 10% 100%,rgba(73,130,198,.2),transparent 38%),linear-gradient(130deg,#07172f,#0f2a5a 58%,#1b477f)}
.hero:not(:has(.hero-art)) .wrap{width:100%}
.hero:not(:has(.hero-art)) h1{max-width:900px}
.hero:not(:has(.hero-art)) .eyebrow{display:inline-flex;padding:.55rem .9rem;border:1px solid rgba(242,213,107,.42);border-radius:999px;background:rgba(242,213,107,.1)}
.content{max-width:1240px;padding:0 clamp(1rem,3vw,2rem);margin:clamp(2rem,4vw,3.5rem) auto}
.content section{position:relative;overflow:hidden;margin:1.1rem 0;padding:clamp(1.35rem,3vw,2rem);border:1px solid #dce5f1;border-radius:20px;background:radial-gradient(ellipse at 100% 0%,rgba(179,139,0,.075),transparent 36%),linear-gradient(145deg,#fff,#f9fbff);box-shadow:0 12px 34px rgba(15,42,90,.065);transition:transform .28s,border-color .28s,box-shadow .28s;animation:dl-rise .65s ease-out both}
.content section:before{content:"";position:absolute;inset:0 auto 0 0;width:4px;background:linear-gradient(180deg,#b38b00,#f2d56b)}
.content section:hover{transform:translateY(-4px);border-color:rgba(179,139,0,.48);box-shadow:0 20px 46px rgba(15,42,90,.12)}
.content section h2{margin:0 0 .65rem;color:#0f2a5a;font-size:clamp(1.15rem,2.1vw,1.5rem);letter-spacing:-.02em}
.content section p{max-width:100ch;color:#4e5e78;line-height:1.8}
.content section:nth-of-type(2){animation-delay:.05s}.content section:nth-of-type(3){animation-delay:.1s}.content section:nth-of-type(4){animation-delay:.15s}
.more{position:relative;overflow:hidden;margin:2.2rem 0;padding:clamp(1.4rem,3vw,2.2rem);border:1px solid rgba(242,213,107,.28);border-radius:22px;background:radial-gradient(ellipse at 90% 0%,rgba(179,139,0,.22),transparent 38%),linear-gradient(130deg,#07172f,#0f2a5a 68%,#173e78);box-shadow:0 22px 52px rgba(7,23,47,.18)}
.more h2{color:#fff;font-size:clamp(1.45rem,2.5vw,2rem);margin:0 0 1.1rem}
.links{gap:.75rem}
.links a{display:inline-flex;align-items:center;min-height:44px;padding:.7rem 1rem;border:1px solid rgba(179,139,0,.24);border-radius:13px;background:linear-gradient(145deg,#fff,#f7f9fd);color:#0f2a5a;font-weight:750;box-shadow:0 6px 18px rgba(0,0,0,.1);transition:transform .2s,border-color .2s,box-shadow .2s,background .2s}
.links a:hover,.links a:focus-visible{transform:translateY(-3px);border-color:#f2d56b;background:linear-gradient(135deg,#fff7d6,#fff);box-shadow:0 12px 24px rgba(0,0,0,.17);outline:none}
.more .links a{border-color:rgba(242,213,107,.36);background:rgba(255,255,255,.09);color:#fff;box-shadow:none}
.more .links a:hover,.more .links a:focus-visible{background:linear-gradient(135deg,#f5dc78,#b38b00);color:#101f3a}
.btn{min-height:46px;padding:.82rem 1.25rem;border:1px solid rgba(255,238,171,.62);border-radius:12px;background:linear-gradient(135deg,#f5dc78,#b38b00);color:#101f3a;font-weight:800;box-shadow:0 10px 25px rgba(179,139,0,.2);transition:transform .2s,box-shadow .2s,filter .2s}
.btn:hover,.btn:focus-visible{transform:translateY(-3px);filter:brightness(1.05);box-shadow:0 16px 32px rgba(179,139,0,.3);outline:2px solid rgba(242,213,107,.42);outline-offset:3px}
.btn.secondary{background:rgba(255,255,255,.075);border:1px solid rgba(255,255,255,.42);color:#fff;box-shadow:none}
.btn.secondary:hover,.btn.secondary:focus-visible{background:rgba(255,255,255,.16);border-color:#f2d56b}
.navlinks a{padding:.55rem .7rem;border:1px solid transparent;border-radius:10px;transition:color .2s,background .2s,border-color .2s}
.navlinks a:hover,.navlinks a:focus-visible{background:rgba(242,213,107,.1);border-color:rgba(242,213,107,.22);color:#f2d56b;outline:none}
.footer{position:relative;overflow:hidden;border-top:1px solid rgba(242,213,107,.28);background:radial-gradient(ellipse at 85% 0%,rgba(179,139,0,.18),transparent 38%),linear-gradient(120deg,#06152d,#0f2a5a);padding:2.5rem clamp(1rem,3vw,2rem)}
.footer .wrap{max-width:1240px}
.footer strong{color:#f2d56b;letter-spacing:.04em}
.footer a{color:#f2d56b;text-decoration-thickness:1px;text-underline-offset:4px}
:where(a,button):focus-visible{outline:2px solid #d6ad28;outline-offset:3px}
@media(max-width:850px){.hero .wrap:has(.hero-art){grid-template-columns:1fr;gap:2rem}.hero:not(:has(.hero-art)){min-height:0}}
@media(max-width:760px){.navlinks{gap:.35rem}.navlinks a{width:100%}.content{margin:1.5rem auto}.more{border-radius:17px}}
@media(max-width:560px){.hero:not(:has(.hero-art)){padding:3.4rem 1rem}.content section{padding:1.15rem;border-radius:16px}.links a{width:100%;justify-content:center}.actions .btn{flex:1 1 145px;text-align:center}}
@media(prefers-reduced-motion:reduce){.content section,.links a,.btn,.navlinks a{animation:none!important;transition:none!important;transform:none!important;scroll-behavior:auto!important}}

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

 <div class="dl-phone" aria-label="Illustrative mobile learning app preview">
  <div class="dl-phone-notch"></div><div class="dl-phone-screen">
   <div class="dl-phone-brand">DALLYLETTER<br>ELIDEMS</div><div class="dl-phone-welcome">Welcome back!</div>
   <div class="dl-phone-item"><i>▦</i><span>Dashboard</span></div>
   <div class="dl-phone-item"><i>◇</i><span>My Classes</span></div>
   <div class="dl-phone-item"><i>✎</i><span>Assignments</span></div>
   <div class="dl-phone-item"><i>✓</i><span>Exams & quizzes</span></div>
   <div class="dl-phone-item"><i>✉</i><span>Messages</span></div>
   <div class="dl-phone-item"><i>AI</i><span>AI Tutor</span></div>
  </div>
 </div>
 <div class="dl-region-seal" aria-label="Zimbabwe first, Africa and beyond">BUILT IN<strong>ZIMBABWE</strong>OPEN TO AFRICA<br>& THE WORLD</div>
 <p class="dl-preview-note">Illustrative interface concept · not a live account screenshot</p><p class="dl-founder-credit">Created by Elisha Maposa · Zimbabwe first, not Zimbabwe only</p>
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
 if (html.includes('<div class="navlinks">') && !html.includes('class="dl-menu-toggle"')) {
  html = html.replace('<div class="navlinks">', '<button class="dl-menu-toggle" type="button" aria-expanded="false" aria-controls="dl-navlinks" aria-label="Open navigation"><span class="dl-menu-bars" aria-hidden="true"></span><span>Menu</span></button><div class="navlinks" id="dl-navlinks">');
  html = html.replace("</body>", '<script id="dl-mobile-nav-script">(()=>{const button=document.querySelector(".dl-menu-toggle");const menu=document.getElementById("dl-navlinks");if(!button||!menu)return;const close=()=>{button.setAttribute("aria-expanded","false");button.setAttribute("aria-label","Open navigation");menu.classList.remove("is-open")};button.addEventListener("click",()=>{const open=button.getAttribute("aria-expanded")!=="true";button.setAttribute("aria-expanded",String(open));button.setAttribute("aria-label",open?"Close navigation":"Open navigation");menu.classList.toggle("is-open",open)});menu.querySelectorAll("a").forEach(link=>link.addEventListener("click",close));document.addEventListener("keydown",event=>{if(event.key==="Escape")close()});window.addEventListener("resize",()=>{if(window.innerWidth>760)close()})})();</script></body>');
 }
 if (!html.includes("Dallyletter public visual system")) html = html.replace("</style>", css + "</style>");
 if (file === homepage && !html.includes("dl-role-section")) {
  html = html.replace('<div class="wrap"><div class="eyebrow">', '<div class="wrap"><div class="hero-copy"><div class="eyebrow">');
  html = html.replace('<div class="actions">', '<div class="actions dl-actions">');
  html = html.replace('</div></div></div><div class="content">', '</div></div>' + heroVisual + '</div></div>' + homepageSections + '<div class="content">');
 }
 fs.writeFileSync(file, html, "utf8");
}
if (!fs.readFileSync(homepage, "utf8").includes("dl-role-section")) throw new Error("Homepage visual sections were not injected");
const homepageHtml = fs.readFileSync(homepage, "utf8");
for (const required of ["#0f2a5a", "#b38b00", "dl-menu-toggle", "dl-mobile-nav-script", "dl-role-section", "dl-feature-grid", "Elisha Maposa"]) {
 if (!homepageHtml.includes(required)) throw new Error("Premium landing-page requirement missing: " + required);
}
if (!homepageHtml.includes('aria-controls="dl-navlinks"') || !homepageHtml.includes("prefers-reduced-motion")) throw new Error("Accessible navigation or reduced-motion support is missing");
console.log("Enhanced " + htmlFiles.length + " prerendered public pages with responsive visual styling and homepage product previews.");
