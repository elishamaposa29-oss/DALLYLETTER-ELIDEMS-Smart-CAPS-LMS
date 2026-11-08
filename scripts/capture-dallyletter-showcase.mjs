import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const base = (process.env.SHOWCASE_SITE_URL || "https://dallyletter-elidems-onlineschoolbye-two.vercel.app/").replace(/\/+$/, "");
const out = path.resolve("showcase-captures");
await fs.mkdir(out, { recursive: true });

const browser = await chromium.launch({ headless: true });
const results = [];
const safeName = (value) => value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");

async function capturePublicPages() {
  const pages = [
    ["homepage", "/"],
    ["about", "/about/"],
    ["how-it-works", "/how-it-works/"],
    ["learners", "/learners/"],
    ["educators", "/educators/"],
    ["schools", "/schools/"],
    ["login", "/login"],
  ];
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  for (const [name, route] of pages) {
    try {
      const response = await page.goto(base + route, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.locator("body").waitFor({ state: "visible", timeout: 15000 });
      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      await page.screenshot({ path: path.join(out, `public-${name}.png`), fullPage: true, animations: "disabled" });
      results.push({ page: name, status: response?.status() ?? "unknown", screenshot: `public-${name}.png` });
    } catch (error) {
      results.push({ page: name, error: String(error) });
    }
  }
  await context.close();
}

async function captureRole(role, route, email, password) {
  if (!email || !password) {
    results.push({ role, error: "Required demo-account secrets are missing." });
    return;
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  try {
    await page.goto(base + "/login", { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    await page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 30000 });
    const dashboardResponse = await page.goto(base + route, { waitUntil: "domcontentloaded", timeout: 45000 });
    if (dashboardResponse && dashboardResponse.status() >= 400) throw new Error(`Dashboard route returned HTTP ${dashboardResponse.status()}`);
    await page.locator("main, body").first().waitFor({ state: "visible", timeout: 15000 });
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await page.screenshot({ path: path.join(out, `dashboard-${safeName(role)}.png`), fullPage: true, animations: "disabled" });
    results.push({ role, route, screenshot: `dashboard-${safeName(role)}.png`, title: await page.title() });
  } catch (error) {
    results.push({ role, route, error: String(error) });
  } finally {
    await context.close();
  }
}

try {
  await capturePublicPages();
  await captureRole("learner", "/", process.env.SHOWCASE_LEARNER_EMAIL, process.env.SHOWCASE_LEARNER_PASSWORD);
  await captureRole("teacher", "/teacher", process.env.SHOWCASE_TEACHER_EMAIL, process.env.SHOWCASE_TEACHER_PASSWORD);
  await captureRole("manager", "/manager", process.env.SHOWCASE_MANAGER_EMAIL, process.env.SHOWCASE_MANAGER_PASSWORD);
  // Owner authentication and private dashboards are deliberately excluded from public showcase automation.
  await fs.writeFile(path.join(out, "capture-manifest.json"), JSON.stringify({ site: base, capturedAt: new Date().toISOString(), results }, null, 2));
  console.log(JSON.stringify(results, null, 2));
  if (results.some((result) => result.role && result.error)) process.exitCode = 1;
} finally {
  await browser.close();
}
