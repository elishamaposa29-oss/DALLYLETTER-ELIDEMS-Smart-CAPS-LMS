import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = new URL(process.env.SHOWCASE_SITE_URL || "https://elishamaposa29-oss-dallyletter-elid-gamma.vercel.app/");
const authAllowedOrigin = new URL(process.env.SHOWCASE_AUTH_ALLOWED_ORIGIN || "https://elishamaposa29-oss-dallyletter-elid-gamma.vercel.app/").origin;
if (baseUrl.protocol !== "https:" || baseUrl.username || baseUrl.password) throw new Error("SHOWCASE_SITE_URL must be a public HTTPS URL without embedded credentials.");
const out = path.resolve("showcase-captures");
const privateOut = path.join(out, "authenticated");
await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(out, { recursive: true });
await fs.rm(privateOut, { recursive: true, force: true });
await fs.mkdir(privateOut, { recursive: true });

const results = [];
const googleIdentityErrors = [];
const isGoogleIdentityConsoleError = (value) => /\[GSI_LOGGER\].*given origin is not allowed for the given client ID/i.test(String(value));
const isGenericGoogle403ConsoleError = (value) => /Failed to load resource:.*status of 403/i.test(String(value));
function classifyRuntimeErrors(runtimeErrors, google403Responses, pageLabel) {
  const googleConsoleErrors = runtimeErrors.filter(isGoogleIdentityConsoleError);
  let generic403Budget = google403Responses.length;
  const remaining = runtimeErrors.filter((error) => {
    if (isGoogleIdentityConsoleError(error)) return false;
    if (generic403Budget > 0 && isGenericGoogle403ConsoleError(error)) {
      generic403Budget -= 1;
      return false;
    }
    return true;
  });
  if (googleConsoleErrors.length || google403Responses.length) {
    googleIdentityErrors.push({ page: pageLabel, occurrences: googleConsoleErrors.length + google403Responses.length });
  }
  return remaining;
}
const safeName = (value) => value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "") || "page";
const apiBaseUrl = process.env.SHOWCASE_API_BASE_URL || "https://dallyletter-elidems-smart-caps-lms-4.onrender.com";
async function verifyAuthenticatedRole(token, expectedRole) {
  const response = await fetch(new URL("/api/auth/me", apiBaseUrl), {
    headers: { Authorization: "Bearer " + token }
  });
  if (!response.ok) throw new Error("The API rejected the showcase session token: HTTP " + response.status);
  const user = await response.json();
  const actualRole = String(user.role || "").toLowerCase().replace(/[ -]+/g, "_");
  const expectedRoles = {
    learner: ["student"],
    prefect: ["prefect"],
    teacher: ["teacher"],
    manager: ["manager"],
    junior_manager: ["junior_manager"],
    senior_manager: ["senior_manager"],
    admin: ["admin"],
    owner: ["owner", "platform_owner"]
  };
  const validRole = (expectedRoles[expectedRole] || []).includes(actualRole) ||
    (expectedRole === "manager" && user.isManager === true);
  if (!validRole) throw new Error("Expected a " + expectedRole + " showcase account, but the API confirmed role " + (actualRole || "missing"));
  return actualRole;
}
const decodeXml = (value) => value.replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&apos;", "'");
const isProductionPush = process.env.GITHUB_EVENT_NAME === "push" && process.env.GITHUB_REF === "refs/heads/main";
const expectedDeploymentSha = isProductionPush ? (process.env.EXPECTED_DEPLOYMENT_SHA || "").trim() : "";
if (!isProductionPush && process.env.EXPECTED_DEPLOYMENT_SHA) {
  console.log("Skipping exact-production-commit wait for " + (process.env.GITHUB_EVENT_NAME || "local") + " event; PR commits are not deployed to the permanent production hostname.");
}


async function assertPublishablePage(page, label) {
  const audit = await page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
    };
    const bodyText = (document.body?.innerText || "").slice(0, 120000);
    const enteredValues = [...document.querySelectorAll("input, textarea, select")]
      .filter(visible)
      .map((element) => ({ type: element.getAttribute("type") || element.tagName.toLowerCase(), value: String(element.value || "") }))
      .filter((item) => item.value.trim().length > 0);
    const visibleAlerts = [...document.querySelectorAll('[role="alert"], [data-sonner-toast], [data-sonner-toast] [data-description]')]
      .filter(visible).map((element) => (element.innerText || "").trim()).filter(Boolean);
    const brokenImages = [...document.images].filter((image) => visible(image) && (!image.complete || image.naturalWidth === 0))
      .map((image) => image.getAttribute("src") || image.alt || "unnamed image");
    const forbiddenText = /(internal server error|stack trace|uncaught (?:exception|error)|failed to fetch|something went wrong|database connection failed|api key|secret key|private key|bearer\s+[a-z0-9._-]{12,}|sk-[a-z0-9]{16,}|gh[pousr]_[a-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i.test(bodyText);
    return { enteredValues, visibleAlerts, brokenImages, forbiddenText, bodyLength: bodyText.length };
  });
  if (audit.enteredValues.length) throw new Error("Capture blocked for " + label + ": visible form fields contain entered values.");
  if (audit.visibleAlerts.length) throw new Error("Capture blocked for " + label + ": visible alert/error content: " + audit.visibleAlerts.join(" | ").slice(0, 300));
  if (audit.forbiddenText) throw new Error("Capture blocked for " + label + ": sensitive text or an obvious application error was detected.");
  if (audit.brokenImages.length) throw new Error("Capture blocked for " + label + ": broken images: " + audit.brokenImages.join(", ").slice(0, 300));
  if (audit.bodyLength < 120) throw new Error("Capture blocked for " + label + ": page content is too sparse to be useful.");
}

async function waitForExpectedDeployment() {
  const homepage = new URL("/", baseUrl);
  const deadline = Date.now() + 15 * 60 * 1000;
  let lastObservation = "homepage has not been checked";

  while (true) {
    try {
      const response = await fetch(homepage, { cache: "no-store", headers: { "cache-control": "no-cache" } });
      if (!response.ok) {
        lastObservation = "homepage returned HTTP " + response.status;
      } else {
        const html = await response.text();
        const actual = html.match(/<meta\s+name=["']dallyletter-build-sha["']\s+content=["']([^"']+)["']/i)?.[1] || null;
        if (!expectedDeploymentSha) return actual;
        if (actual === expectedDeploymentSha) {
          console.log("Confirmed deployed Dallyletter build " + actual);
          return actual;
        }
        lastObservation = "expected " + expectedDeploymentSha + "; live build marker is " + (actual || "missing");
      }
    } catch (error) {
      lastObservation = String(error);
    }

    if (Date.now() >= deadline) {
      throw new Error("Timed out waiting for the exact deployed commit. " + lastObservation + ". No screenshots were captured, preventing stale evidence.");
    }
    await new Promise((resolve) => setTimeout(resolve, 15000));
  }
}

const deployedBuildSha = await waitForExpectedDeployment();
const browser = await chromium.launch({ headless: true });

async function discoverPublicPages() {
  const sitemapUrl = new URL("/sitemap.xml", baseUrl);
  const response = await fetch(sitemapUrl, { cache: "no-store", headers: { accept: "application/xml,text/xml", "cache-control": "no-cache" } });
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
  for (const url of pages) {
    const slug = url.pathname.split("/").filter(Boolean).join("-");
    const name = url.pathname === "/" ? "homepage" : safeName(slug);
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 1,
      recordVideo: { dir: privateOut, size: { width: 1440, height: 1000 } }
    });
    const page = await context.newPage();
    const runtimeErrors = [];
    const google403Responses = [];
    page.on("pageerror", (error) => runtimeErrors.push(String(error)));
    page.on("console", (message) => { if (message.type() === "error") runtimeErrors.push(message.text()); });
    page.on("response", (response) => {
      if (response.status() === 403 && /accounts\.google\.com|gsi/i.test(response.url())) google403Responses.push(response.url());
    });
    const video = page.video();
    try {
      const response = await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 45000 });
      if (response && response.status() >= 400) throw new Error("HTTP " + response.status() + " for " + url.pathname);
      await page.locator("body").waitFor({ state: "visible", timeout: 15000 });
      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      await verifyBrandLogo(page, url.pathname);
      const unexpectedErrors = classifyRuntimeErrors(runtimeErrors, google403Responses, url.pathname);
      if (unexpectedErrors.length) throw new Error("Runtime/browser console errors on " + url.pathname + ": " + unexpectedErrors.slice(0, 3).join(" | ").slice(0, 400));
      await assertPublishablePage(page, url.pathname);
      const screenshot = "public-" + name + ".png";
      await page.screenshot({ path: path.join(out, screenshot), fullPage: true, animations: "disabled" });
      // A short, silent UI walkthrough clip: no form entry, no authentication and no user data.
      await page.waitForTimeout(1800);
      await page.evaluate(() => window.scrollTo({ top: Math.min(700, document.body.scrollHeight), behavior: "instant" }));
      await page.waitForTimeout(1800);
      results.push({ type: "public", page: name, url: url.href, status: response?.status() ?? "unknown", screenshot });
    } catch (error) {
      results.push({ type: "public", page: name, url: url.href, error: String(error) });
    } finally {
      await context.close();
      if (video) {
        try {
          const videoPath = "public-" + name + ".webm";
          await video.saveAs(path.join(out, videoPath));
          const item = results.find((result) => result.type === "public" && result.page === name);
          if (item && item.screenshot) item.video = videoPath;
        } catch (error) {
          results.push({ type: "public-video", page: name, url: url.href, error: "Video finalization failed: " + String(error) });
        }
      }
    }
  }
}
async function discoverRoleRoutes(role) {
  const source = await fs.readFile(path.resolve("artifacts/dallyletter/src/App.tsx"), "utf8");
  const routePattern = /<Route path="([^"]+)"([\s\S]*?)(?=<Route path="|<Route component=|<\/Switch>)/g;
  const normalizedRole = role === "learner" ? "student" : role;
  const routes = new Map();
  for (const match of source.matchAll(routePattern)) {
    const routePath = match[1];
    const allowed = match[2].match(/allowedRoles=\{\[([^\]]+)\]\}/);
    if (!allowed) continue;
    const roles = [...allowed[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
    if (!roles.includes(normalizedRole)) continue;
    if (routePath.includes(":")) continue;
    if (!routePath.startsWith("/")) continue;
    routes.set(routePath, { path: routePath, label: routePath.split("/").filter(Boolean).at(-1) || "dashboard", source: "route-registry" });
  }
  return [...routes.values()];
}

async function redactScreenshotContent(page) {
  await page.addStyleTag({ content: `
    input:not([type="checkbox"]):not([type="radio"]), textarea, [contenteditable="true"],
    [data-sensitive], [data-private], [data-testid*="email"], [data-testid*="phone"],
    [data-testid*="balance"], [data-testid*="amount"], [class*="email"], [class*="phone"],
    [class*="balance"], [class*="amount"], table tbody td, [role="grid"] [role="gridcell"] {
      filter: blur(8px) !important;
      user-select: none !important;
    }
  ` });
  await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const value = node.nodeValue || "";
      node.nodeValue = value
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email redacted]")
        .replace(/(?:\+?\d[\d .()/-]{7,}\d)/g, "[phone redacted]");
    }
  });
}

async function captureRole(role, route, email, password) {
  const homeUrl = new URL(route, baseUrl);
  if (baseUrl.origin !== authAllowedOrigin) {
    results.push({ type: "dashboard", role, url: homeUrl.href, status: "skipped", reason: "Authenticated capture is restricted to the configured production origin." });
    return;
  }
  if (!email || !password) {
    results.push({ type: "dashboard", role, url: homeUrl.href, status: "missing-demo-account", reason: "Configure SHOWCASE_" + role.toUpperCase() + "_EMAIL and SHOWCASE_" + role.toUpperCase() + "_PASSWORD to capture this role." });
    return;
  }

  // Login is deliberately performed in a non-recording context. Only dedicated showcase accounts are accepted.
  const loginContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  let storageState;
  let authenticatedRole;
  try {
    const loginPage = await loginContext.newPage();
    const loginApiResponses = [];
    const loginRequestFailures = [];
    loginPage.on("response", (response) => {
      const pathname = new URL(response.url()).pathname;
      if (pathname.endsWith("/api/auth/login") || pathname.endsWith("/auth/login")) loginApiResponses.push({ status: response.status(), path: pathname });
    });
    loginPage.on("requestfailed", (request) => {
      const pathname = new URL(request.url()).pathname;
      if (pathname.endsWith("/api/auth/login") || pathname.endsWith("/auth/login")) loginRequestFailures.push({ path: pathname, reason: request.failure()?.errorText || "request failed" });
    });
    await loginPage.goto(new URL("/login", baseUrl).href, { waitUntil: "domcontentloaded", timeout: 45000 });
    await loginPage.getByLabel("Email address").fill(email);
    await loginPage.getByLabel("Password", { exact: true }).fill(password);
    await loginPage.getByRole("button", { name: "Sign In", exact: true }).click();
    await loginPage.waitForFunction(() => {
      const normalizedPath = window.location.pathname.replace(/\/+$/, "") || "/";
      return normalizedPath !== "/login" && Boolean(localStorage.getItem("dallyletter_token"));
    }, { timeout: 30000 }).catch(async () => {
      const feedback = await loginPage.locator('[role="alert"], [data-sonner-toast], [role="status"]').allTextContents().catch(() => []);
      throw new Error("Login did not establish a session. Safe diagnostics: " + JSON.stringify({
        loginApiResponses, loginRequestFailures, visibleFeedback: feedback.join(" | ").slice(0, 300)
      }));
    });
    const loginState = await loginPage.evaluate(() => localStorage.getItem("dallyletter_token"));
    if (!loginState) throw new Error("Login page navigated without persisting an authentication token");
    authenticatedRole = await verifyAuthenticatedRole(loginState, role);
    storageState = await loginContext.storageState();
  } catch (error) {
    results.push({ type: "dashboard", role, url: homeUrl.href, status: "login-failed", error: String(error) });
    return;
  } finally {
    await loginContext.close();
  }

  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    storageState
  });
  const page = await context.newPage();
  const runtimeErrors = [];
  const google403Responses = [];
  page.on("pageerror", (error) => runtimeErrors.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error") runtimeErrors.push(message.text()); });
  page.on("response", (response) => {
    if (response.status() === 403 && /accounts\.google\.com|gsi/i.test(response.url())) google403Responses.push(response.url());
    if (response.status() >= 500) runtimeErrors.push("HTTP " + response.status() + " " + response.url());
  });

  const screenshots = [];
  const routeResults = [];
  try {
    const routeInventory = await discoverRoleRoutes(role);
    const queue = [{ path: route, label: "dashboard", source: "role-home" }, ...routeInventory];
    const seen = new Set();
    const maxPages = Number(process.env.SHOWCASE_MAX_PAGES_PER_ROLE || 100);
    while (queue.length && screenshots.length < maxPages) {
      const item = queue.shift();
      const target = new URL(item.path, baseUrl);
      if (target.origin !== baseUrl.origin || target.search || target.hash) continue;
      const pathname = target.pathname.replace(/\/+$/, "") || "/";
      if (seen.has(pathname)) continue;
      seen.add(pathname);

      let response;
      try {
        response = await page.goto(target.href, { waitUntil: "domcontentloaded", timeout: 35000 });
        if (response && response.status() >= 500) throw new Error("HTTP " + response.status());
        await page.locator("body").waitFor({ state: "visible", timeout: 15000 });
        await page.waitForLoadState("networkidle", { timeout: 7000 }).catch(() => {});
        const actualPath = new URL(page.url()).pathname.replace(/\/+$/, "") || "/";
        if (actualPath !== pathname) {
          routeResults.push({ path: pathname, status: "restricted-or-redirected", actualPath });
          continue;
        }
        const token = await page.evaluate(() => localStorage.getItem("dallyletter_token"));
        if (!token) throw new Error("Authenticated session missing after navigation");
        const currentRole = await verifyAuthenticatedRole(token, role);
        if (currentRole !== authenticatedRole) throw new Error("API-confirmed role changed during route capture");
        const mainText = await page.locator("main").innerText().catch(() => "");
        if (!mainText.trim()) throw new Error("No visible main dashboard content");
        await verifyBrandLogo(page, role + " " + pathname);
        await assertPublishablePage(page, role + " " + pathname);
        const screenshot = safeName("dashboard-" + role + "-" + pathname.replace(/^\//, "").replaceAll("/", "-")) + ".png";
        await redactScreenshotContent(page);\n        await page.screenshot({ path: path.join(privateOut, screenshot), fullPage: true, animations: "disabled" });
        screenshots.push({ path: pathname, label: item.label, screenshot });
        routeResults.push({ path: pathname, status: "captured", screenshot });

        // Discover every visible, same-origin, read-only navigation destination from this feature page.
        const links = await page.locator("a[href]").evaluateAll((anchors) => anchors.map((anchor) => ({
          href: anchor.href,
          label: (anchor.innerText || anchor.getAttribute("aria-label") || "").trim().toLowerCase(),
          visible: !!(anchor.offsetWidth || anchor.offsetHeight || anchor.getClientRects().length)
        })));
        const deny = /logout|sign out|delete|remove|approve|reject|submit|upload|invite|reset password|verify email/i;
        for (const link of links) {
          if (!link.visible || deny.test(link.label)) continue;
          const linked = new URL(link.href, baseUrl);
          if (linked.origin !== baseUrl.origin || linked.search || linked.hash) continue;
          const linkedPath = linked.pathname.replace(/\/+$/, "") || "/";
          if (seen.has(linkedPath) || queue.some((candidate) => candidate.path === linkedPath)) continue;
          if (/^\/(login|register|forgot-password|reset-password|verify-email|suspended)(\/|$)/.test(linkedPath)) continue;
          queue.push({ path: linkedPath, label: link.label || linkedPath, source: "visible-navigation" });
        }
      } catch (error) {
        routeResults.push({ path: pathname, status: "capture-error", error: String(error) });
      }
    }

    const unexpectedErrors = classifyRuntimeErrors(runtimeErrors, google403Responses, role + " dashboard suite");
    if (unexpectedErrors.length) throw new Error("Runtime/browser/API failures: " + unexpectedErrors.slice(0, 5).join(" | ").slice(0, 900));
    results.push({
      type: "dashboard", role, url: homeUrl.href, status: routeResults.some((item) => item.status === "capture-error") ? "partial" : "captured",
      authenticatedRole, pagesCaptured: screenshots.length, routeInventoryCount: routeInventory.length,
      screenshots, routes: routeResults, pageLimitReached: queue.length > 0
    });
  } catch (error) {
    results.push({
      type: "dashboard", role, url: homeUrl.href, status: "capture-failed",
      authenticatedRole, pagesCaptured: screenshots.length, screenshots, routes: routeResults, error: String(error)
    });
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
    "- Deployed build commit: " + (manifest.sourceCommit || "not exposed by deployed site"),
    "- Workflow commit: " + (manifest.workflowCommit || "not supplied"),
    "- Workflow run: [" + (manifest.workflowRunUrl || "not supplied") + "](" + (manifest.workflowRunUrl || "") + ")",
    "- Public pages successfully captured: " + manifest.publicPageCount + " / " + manifest.publicUrlCount + " discovered",
    "",
    "On push-triggered runs, the capture waits for the deployed build marker to match the pushed commit. Screenshots are not taken from an older deployment.",
    "",
    "## Public pages",
    ""
  ];
  for (const item of manifest.results.filter((result) => result.type === "public")) {
    lines.push("### [" + item.page + "](" + item.url + ")", "");
    if (item.screenshot) lines.push("![" + item.page + "](./" + item.screenshot + ")", "");
    if (item.video) lines.push("[Watch short walkthrough](./" + item.video + ")", "");
    else lines.push("Capture failed: " + item.error, "");
  }
  lines.push("## Authenticated non-owner dashboards", "");
  for (const item of manifest.results.filter((result) => result.type === "dashboard")) {
    lines.push("- **" + item.role + ":** [" + item.url + "](" + item.url + ") — " + (item.status || "failed") + (item.authenticatedRole ? " — API-confirmed role: " + item.authenticatedRole : "") + (item.error ? " — " + item.error : ""));
    if (item.walkthroughPages?.length) lines.push("  - Read-only routes shown: " + item.walkthroughPages.join(", "));
  }
  lines.push("",
    "## Private authenticated dashboard and feature screenshots",
    "",
    "This repository is public, so authenticated screenshots are redacted before being included in the workflow artifact under `authenticated/`. They are never copied to the public showcase-media branch. Use dedicated demo accounts populated only with synthetic data; never point this capture at real learner records.",
    "");
  for (const item of manifest.results.filter((result) => result.type === "dashboard")) {
    lines.push("### " + item.role + " — " + (item.pagesCaptured ?? 0) + " pages", "");
    if (item.status === "missing-demo-account") lines.push("Not captured: configure the dedicated role account secrets.", "");
    for (const shot of item.screenshots || []) lines.push("- **" + shot.path + "** — [Open screenshot](./authenticated/" + shot.screenshot + ")");
    lines.push("");
  }
  lines.push("Only dedicated showcase accounts should be used. Private screenshots stay out of public media publication.", "");
  return lines.join("\n");
}

try {
  await capturePublicPages();
  const roleAccounts = [
    ["learner", "/student", process.env.SHOWCASE_LEARNER_EMAIL, process.env.SHOWCASE_LEARNER_PASSWORD],
    ["prefect", "/student", process.env.SHOWCASE_PREFECT_EMAIL, process.env.SHOWCASE_PREFECT_PASSWORD],
    ["teacher", "/teacher", process.env.SHOWCASE_TEACHER_EMAIL, process.env.SHOWCASE_TEACHER_PASSWORD],
    ["junior_manager", "/manager", process.env.SHOWCASE_JUNIOR_MANAGER_EMAIL, process.env.SHOWCASE_JUNIOR_MANAGER_PASSWORD],
    ["senior_manager", "/manager", process.env.SHOWCASE_SENIOR_MANAGER_EMAIL, process.env.SHOWCASE_SENIOR_MANAGER_PASSWORD],
    ["manager", "/manager", process.env.SHOWCASE_MANAGER_EMAIL, process.env.SHOWCASE_MANAGER_PASSWORD],
    ["admin", "/admin", process.env.SHOWCASE_ADMIN_EMAIL, process.env.SHOWCASE_ADMIN_PASSWORD],
    ["owner", "/admin", process.env.SHOWCASE_OWNER_EMAIL, process.env.SHOWCASE_OWNER_PASSWORD]
  ];
  for (const account of roleAccounts) await captureRole(...account);
  if (googleIdentityErrors.length) {
    results.push({
      type: "integration",
      page: "google-sign-in",
      status: "blocked",
      occurrences: googleIdentityErrors.length,
      error: "Google Identity Services rejected the configured production origin. Password-authenticated dashboard captures were allowed to continue; Google sign-in remains unverified."
    });
  }
  results.push(await pageFor404Probe());

  const manifest = {
    site: baseUrl.href,
    capturedAt: new Date().toISOString(),
    sourceCommit: deployedBuildSha,
    workflowCommit: process.env.SOURCE_COMMIT || null,
    workflowRunUrl: process.env.SHOWCASE_RUN_URL || null,
    publicUrlCount: results.filter((result) => result.type === "public").length,
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
      "- Public pages captured: " + manifest.publicPageCount + " / " + manifest.publicUrlCount,
      "- Deployed build commit: " + (manifest.sourceCommit || "not exposed"),
      "- Workflow commit: " + (manifest.workflowCommit || "unknown"),
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
  // Keep authenticated screenshots inside the private GitHub Actions artifact; never publish them to showcase-media.
}
