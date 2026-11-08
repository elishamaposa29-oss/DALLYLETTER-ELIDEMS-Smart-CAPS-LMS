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
    ["founder-story", "/founder-story/"],
    ["learners", "/learners/"],
    ["educators", "/educators/"],
    ["schools", "/schools/"],
    ["organisations", "/organisations/"],
    ["zimbabwe", "/zimbabwe/"],
    ["south-africa", "/south-africa/"],
    ["africa", "/africa/"],
    ["global-learning", "/global-learning/"],
    ["primary-learning", "/primary-learning/"],
    ["secondary-learning", "/secondary-learning/"],
    ["syllabus-support", "/syllabus-support/"],
    ["managers", "/managers/"],
    ["past-papers", "/past-papers/"],
    ["o-level", "/o-level/"],
    ["exam-preparation", "/exam-preparation/"],
    ["mathematics", "/mathematics/"],
    ["english", "/english/"],
    ["science", "/science/"],
    ["biology", "/biology/"],
    ["chemistry", "/chemistry/"],
    ["physics", "/physics/"],
    ["geography", "/geography/"],
    ["history", "/history/"],
    ["computer-studies", "/computer-studies/"],
    ["business-studies", "/business-studies/"],
    ["accounting", "/accounting/"],
    ["study-notes", "/study-notes/"],
    ["video-learning", "/video-learning/"],
    ["login", "/login"],
  ];
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  for (const [name, route] of pages) {
    try {
      const response = await page.goto(base + route, { waitUntil: "domcontentloaded", timeout: 45000 });
      if (response && response.status() >= 400) throw new Error(`HTTP ${response.status()} for ${route}`);
      await page.locator("body").waitFor({ state: "visible", timeout: 15000 });
      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      const brandLogo = page.locator('img[alt="Dallyletter Elidems logo"]').first();
      await brandLogo.waitFor({ state: "visible", timeout: 10000 });
      const logoLoaded = await brandLogo.evaluate((img) => img.complete && img.naturalWidth > 0);
      if (!logoLoaded) throw new Error("Dallyletter brand logo did not load");
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
    results.push({ role, status: "skipped", reason: "Dedicated demo-account secrets are not configured." });
    return;
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  try {
    await page.goto(base + "/login", { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    await page.waitForFunction(() => window.location.pathname !== "/login", { timeout: 30000 }).catch(async () => {
      const feedback = await page.locator('[role="alert"], [data-sonner-toast], [role="status"]').allTextContents().catch(() => []);
      throw new Error("Login did not leave /login. Visible feedback: " + feedback.join(" | ").slice(0, 500));
    });
    const dashboardResponse = await page.goto(base + route, { waitUntil: "domcontentloaded", timeout: 45000 });
    if (dashboardResponse && dashboardResponse.status() >= 400) throw new Error(`Dashboard route returned HTTP ${dashboardResponse.status()}`);
    await page.locator("main, body").first().waitFor({ state: "visible", timeout: 15000 });
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    const brandLogo = page.locator('img[alt="Dallyletter Elidems logo"]').first();
    await brandLogo.waitFor({ state: "visible", timeout: 10000 });
    const logoLoaded = await brandLogo.evaluate((img) => img.complete && img.naturalWidth > 0);
    if (!logoLoaded) throw new Error("Dallyletter brand logo did not load in the authenticated dashboard");
    await page.screenshot({ path: path.join(out, `dashboard-${safeName(role)}.png`), fullPage: true, animations: "disabled" });
    results.push({ role, route, screenshot: `dashboard-${safeName(role)}.png`, title: await page.title() });
  } catch (error) {
    results.push({ role, route, error: String(error) });
  } finally {
    await context.close();
  }
}

async function pageFor404Probe() {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    const response = await page.goto(base + "/__dallyletter-pr-404-probe__/", { waitUntil: "domcontentloaded", timeout: 45000 });
    if (response?.status() !== 404) {
      return { page: "unknown-route-404", error: "Expected HTTP 404 for an unknown route; received " + (response?.status() ?? "no response") };
    }
    return { page: "unknown-route-404", status: 404 };
  } finally {
    await context.close();
  }
}

try {
  await capturePublicPages();
  await captureRole("learner", "/student", process.env.SHOWCASE_LEARNER_EMAIL, process.env.SHOWCASE_LEARNER_PASSWORD);
  await captureRole("teacher", "/teacher", process.env.SHOWCASE_TEACHER_EMAIL, process.env.SHOWCASE_TEACHER_PASSWORD);
  await captureRole("manager", "/manager", process.env.SHOWCASE_MANAGER_EMAIL, process.env.SHOWCASE_MANAGER_PASSWORD);
  // Owner authentication and private dashboards are deliberately excluded from public showcase automation.
  results.push(await pageFor404Probe());
  await fs.writeFile(path.join(out, "capture-manifest.json"), JSON.stringify({ site: base, capturedAt: new Date().toISOString(), results }, null, 2));
  console.log(JSON.stringify(results, null, 2));
  if (results.some((result) => result.error)) process.exitCode = 1;
} finally {
  await browser.close();
}
