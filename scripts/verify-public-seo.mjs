import fs from "node:fs";
import path from "node:path";
const root=path.resolve("dist/public);
const sitemap=fs.readFileSync(path.join(root,"sitemap.xml"),"utf8");
const urls=[...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1]);
if(urls.length<10) throw new Error("Expected at least 10 sitemap URLs; got "+urls.length);
const titles=new Set();
for(const url of urls){
 const route=new URL(url).pathname;
 const file=route==="/" ? path.join(root,"public-site","index.html") : path.join(root,route,"index.html");
 if(!fs.existsSync(file)) throw new Error("Missing prerendered page: "+url);
 const html=fs.readFileSync(file,"utf8");
 const title=html.match(/<title>(.*?)<\/title>/)?.[1];
 const description=html.match(/<meta name="description" content="([^"]+)"/)?.[1];
 const canonical=html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
 if(!title||!description||!canonical) throw new Error("Missing metadata: "+url);
 if(canonical!==url) throw new Error("Canonical mismatch: "+url+" -> "+canonical);
 if(titles.has(title)) throw new Error("Duplicate title: "+title);
 titles.add(title);
 if(!html.includes("<h1>")||!html.includes('property="og:image"')||!html.includes('name="twitter:card" content="summary_large_image"')) throw new Error("Missing page content or social metadata: "+url);
}
if(!fs.readFileSync(path.join(root,"robots.txt"),"utf8").includes("/sitemap.xml")) throw new Error("robots.txt sitemap reference missing");
console.log("SEO verification passed for "+urls.length+" unique prerendered pages.");
