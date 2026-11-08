import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = new URL(process.env.SHOWCASE_SITE_URL || "https://dallyletter-elidems-onlineschoolbye-two.vercel.app/");
const authAllowedOrigin = new URL(process.env.SHOWCASE_AUTH_ALLOWED_ORIGIN || "https://dallyletter-elidems-onlineschoolbye-two.vercel.app/").origin;
if (baseUrl.protocol !== "https:" || baseUrl.username || baseUrl.password) throw new Error("SHOWCASE_SITE_URL must be a public HTTPS URL without embedded credentials.");
const out = path.resolve("showcase-captures");
await fs.mkdir(out, { recursive: true });

const browser = await chromium.launch({ headless: true });
const results = [];
const safeName = (value) => value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "") || "page";
const decodeXml = (value) => value.replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&apos;", "'");

async function discoverPublicPages() {
  const sitemapUrl = new URL("/sitemap.xml", baseUrl);
  const response = await fetch(sitemapUrl, { headers: { accept: "application/xml,text/xml" } });
  if (!response.ok) throw new Error("Sitemap request failed: HTTP " + response.status + " at " + sitemapUrl);
  const xml = await response.text();
  const locations = [...xml.matchAll(/<loc>\s*([\s\S]*?)\s*<\/loc>/gi)].map((match) => decodeXml(match[1].trim()));
  if (!locations.length) throw new Error("No <loc> URLs found in " + sitemapUrl);

  const discovered = new Map();
  for (const value of locations) {
    const url = new URL(value);
    if (url.origin !== baseUrl.origin) continue;
    url.hash = "";
    url.search = "";
    discovered.set(url.href, url);
  }

  // Sign-in is captured separately; private dashboards are never inferred from the public sitemap.
  const loginUrl = new URL("/login", baseUrl);
  discovered.set(loginUrl.href, loginUrl);
  return [...discovered.values()].sort((a, b) => a.pathname.localeCompare(b.pathname));
}

async function verifyBrandLogo(page, contextLabel) {
  const brandLogo = page.locator('img[alt="Dallyletter Elidems logo"]').first();
  await brandLogo.waitFor({ state: "visible", timeout: 10000 });
  const logoLoaded = await brandLogo.evaluate((img) => img.complete && img.naturalWidth > 0);
  if (!logoLoaded) throw new Error("Dallyletter brand logo did not load in " + contextLabel);
}

async function capturePublicPages() {
  const pages = await discoverPublicPages();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  for (const url of pages) {
    const slug = url.pathname.split("/").filter(Boolean).join("-");
    const name = url.pathname === "/" ? "homepage" : safeName(slug);
    try {
      const response = await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 45000 });
      if (response && response.status() >= 400) throw new Error("HTTP " + response.status() + " for " + url.pathname);
      await page.locator("body").waitFor({ state: "visible", timeout: 15000 });
      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      await verifyBrandLogo(page, url.pathname);
      const screenshot = "public-" + name + ".png";
      await page.screenshot({ path: path.join(out, screenshot), fullPage: true, animations: "disabled" });
      results.push({ type: "public", page: name, url: url.href, status: response?.status() ?? "unknown", screenshot });
    } catch (error) {
      results.push({ type: "public", page: name, url: url.href, error: String(error) });
    }
  }
  await context.close();
}

async function captureRole(role, route, email, password) {
  const url = new URL(route, baseUrl);
  if (baseUrl.origin !== authAllowedOrigin) {
    results.push({ type: "dashboard", role, url: url.href, status: "skipped", reason: "Authenticated capture is restricted to the configured production origin." });
    return;
  }
  if (!email || !password) {
    results.push({ type: "dashboard", role, url: url.href, status: "skipped", reason: "Dedicated demo-account secrets are not configured." });
    return;
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  try {
    await page.goto(new URL("/login", baseUrl).href, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    await page.waitForFunction(() => window.location.pathname !== "/login", { timeout: 30000 }).catch(async () => {
      const feedback = await page.locator('[role="alert"], [data-sonner-toast], [role="status"]').allTextContents().catch(() => []);
      throw new Error("Login did not leave /login. Visible feedback: " + feedback.join(" | ").slice(0, 500));
    });
    const dashboardResponse = await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 45000 });
    if (dashboardResponse && dashboardResponse.status() >= 400) throw new Error("Dashboard route returned HTTP " + dashboardResponse.status());
    await page.locator("main, body").first().waitFor({ state: "visible", timeout: 15000 });
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await verifyBrandLogo(page, role + " dashboard");
    const screenshot = "dashboard-" + safeName(role) + ".png";
    await page.screenshot({ path: path.join(out, screenshot), fullPage: true, animations: "disabled" });
    results.push({ type: "dashboard", role, url: url.href, status: "captured", screenshot, title: await page.title() });
  } catch (error) {
    results.push({ type: "dashboard", role, url: url.href, error: String(error) });
  } finally {
    await context.close();
  }
}

async function pageFor404Probe() {
  const context = await browser.newContext();
  const page = await context.newPage();
  const url = new URL("/__dallyletter-showcase-404-probe__/", baseUrl);
  try {
    const response = await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 45000 });
    if (response?.status() !== 404) {
      return { type: "probe", page: "unknown-route-404", url: url.href, error: "Expected HTTP 404; received " + (response?.status() ?? "no response") };
    }
    return { type: "probe", page: "unknown-route-404", url: url.href, status: 404 };
  } finally {
    await context.close();
  }
}

function buildGallery(manifest) {
  const lines = [
    "# Dallyletter Elidems — latest live UI captures",
    "",
    "- Site: [" + manifest.site + "](" + manifest.site + ")",
    "- Captured: " + manifest.capturedAt,
    "- Source commit: " + (manifest.sourceCommit || "not supplied"),
    "- Workflow run: [" + (manifest.workflowRunUrl || "not supplied") + "](" + (manifest.workflowRunUrl || "") + ")",
    "- Public URLs discovered from sitemap: " + manifest.publicPageCount,
    "",
    "Screenshots reflect the deployed site at capture time. Live page links are canonical URLs; PNG files are included in this workflow artifact.",
    "",
    "## Public pages",
    ""
  ];
  for (const item of manifest.results.filter((result) => result.type === "public")) {
    lines.push("### [" + item.page + "](" + item.url + ")", "");
    if (item.screenshot) lines.push("![" + item.page + "](./" + item.screenshot + ")", "");
    else lines.push("Capture failed: " + item.error, "");
  }
  lines.push("## Authenticated non-owner dashboards", "");
  for (const item of manifest.results.filter((result) => result.type === "dashboard")) {
    lines.push("- **" + item.role + ":** [" + item.url + "](" + item.url + ") — " + (item.status || "failed") + (item.screenshot ? " — " + item.screenshot : "") + (item.error ? " — " + item.error : ""));
  }
  lines.push("", "Owner dashboards are deliberately excluded. Use dedicated non-production showcase accounts only.", "");
  return lines.join("\n");
}

try {
  await capturePublicPages();
  await captureRole("learner", "/student", process.env.SHOWCASE_LEARNER_EMAIL, process.env.SHOWCASE_LEARNER_PASSWORD);
  await captureRole("teacher", "/teacher", process.env.SHOWCASE_TEACHER_EMAIL, process.env.SHOWCASE_TEACHER_PASSWORD);
  await captureRole("manager", "/manager", process.env.SHOWCASE_MANAGER_EMAIL, process.env.SHOWCASE_MANAGER_PASSWORD);
  // Owner authentication and private dashboards are deliberately excluded from showcase automation.
  results.push(await pageFor404Probe());

  const manifest = {
    site: baseUrl.href,
    capturedAt: new Date().toISOString(),
    sourceCommit: process.env.SOURCE_COMMIT || null,
    workflowRunUrl: process.env.SHOWCASE_RUN_URL || null,
    publicPageCount: results.filter((result) => result.type === "public" && result.screenshot).length,
    results
  };
  await fs.writeFile(path.join(out, "capture-manifest.json"), JSON.stringify(manifest, null, 2));
  await fs.writeFile(path.join(out, "README.md"), buildGallery(manifest));
  if (process.env.GITHUB_STEP_SUMMARY) {
    const summary = [
      "# Dallyletter showcase capture",
      "",
      "- Site: " + manifest.site,
      "- Public pages captured: " + manifest.publicPageCount,
      "- Source commit: " + (manifest.sourceCommit || "unknown"),
      "- [Workflow run](" + (manifest.workflowRunUrl || "") + ")",
      "",
      ...results.map((result) => "- " + (result.type || "page") + " / " + (result.page || result.role) + ": " + (result.error ? "FAILED — " + result.error : result.status || "captured") + " — " + (result.url || ""))
    ];
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, summary.join("\n") + "\n");
  }
  console.log(JSON.stringify(manifest, null, 2));
  if (results.some((result) => result.error)) process.exitCode = 1;
} finally {
  await browser.close();
}
