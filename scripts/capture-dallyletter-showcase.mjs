import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = new URL(process.env.SHOWCASE_SITE_URL || "https://elishamaposa29-oss-dallyletter-elid-gamma.vercel.app/");
const authAllowedOrigin = new URL(process.env.SHOWCASE_AUTH_ALLOWED_ORIGIN || "https://elishamaposa29-oss-dallyletter-elid-gamma.vercel.app/").origin;
if (baseUrl.protocol !== "https:" || baseUrl.username || baseUrl.password) throw new Error("SHOWCASE_SITE_URL must be a public HTTPS URL without embedded credentials.");
const out = path.resolve("showcase-captures");
const privateOut = path.join(process.env.RUNNER_TEMP || "/tmp", "dallyletter-private-showcase");
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
  const validRole =
    expectedRole === "learner" ? ["student", "prefect"].includes(actualRole) :
    expectedRole === "teacher" ? actualRole === "teacher" :
    expectedRole === "manager" ? ["manager", "senior_manager", "junior_manager"].includes(actualRole) || user.isManager === true :
    false;
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
  // Authenticate in a non-recording context so credentials are never written into a video.
  const loginContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  let storageState;
  let authenticatedRole;
  try {
    const loginPage = await loginContext.newPage();
    const loginApiResponses = [];
    const loginRequestFailures = [];
    loginPage.on("response", (response) => {
      const pathname = new URL(response.url()).pathname;
      if (pathname.endsWith("/api/auth/login") || pathname.endsWith("/auth/login")) {
        loginApiResponses.push({ status: response.status(), path: pathname });
      }
    });
    loginPage.on("requestfailed", (request) => {
      const pathname = new URL(request.url()).pathname;
      if (pathname.endsWith("/api/auth/login") || pathname.endsWith("/auth/login")) {
        loginRequestFailures.push({ path: pathname, reason: request.failure()?.errorText || "request failed" });
      }
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
      const formState = await loginPage.evaluate(() => ({
        emailLength: document.querySelector('input[name="email"]')?.value?.length ?? 0,
        passwordLength: document.querySelector('input[name="password"]')?.value?.length ?? 0,
        submitDisabled: document.querySelector('button[type="submit"]')?.disabled ?? null
      })).catch(() => ({ emailLength: null, passwordLength: null, submitDisabled: null }));
      throw new Error("Login did not establish a session and leave /login. Safe diagnostics: " + JSON.stringify({
        formState,
        loginApiResponses,
        loginRequestFailures,
        visibleFeedback: feedback.join(" | ").slice(0, 300)
      }));
    });
    const loginState = await loginPage.evaluate(() => ({
      token: localStorage.getItem("dallyletter_token"),
      pathname: window.location.pathname
    }));
    if (!loginState.token) throw new Error("Login page navigated without persisting an authentication token");
    authenticatedRole = await verifyAuthenticatedRole(loginState.token, role);
    storageState = await loginContext.storageState();
  } catch (error) {
    results.push({ type: "dashboard", role, url: url.href, error: String(error) });
    return;
  } finally {
    await loginContext.close();
  }

  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    storageState,
    recordVideo: { dir: privateOut, size: { width: 1440, height: 1000 } }
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
  const video = page.video();
  try {
    const dashboardResponse = await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 45000 });
    if (dashboardResponse && dashboardResponse.status() >= 400) throw new Error("Dashboard route returned HTTP " + dashboardResponse.status());
    await page.locator("main, body").first().waitFor({ state: "visible", timeout: 15000 });
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    const actualPath = new URL(page.url()).pathname.replace(/\/+$/, "") || "/";
    const expectedPath = url.pathname.replace(/\/+$/, "") || "/";
    if (actualPath !== expectedPath) throw new Error("Expected " + expectedPath + " but authentication redirected to " + actualPath);
    const dashboardToken = await page.evaluate(() => localStorage.getItem("dallyletter_token"));
    if (!dashboardToken) throw new Error("Dashboard page has no persisted authenticated session");
    if (await page.locator('input[type="password"]').count()) throw new Error("Login form is still visible; dashboard authentication was not established");
    const dashboardRole = await verifyAuthenticatedRole(dashboardToken, role);
    if (dashboardRole !== authenticatedRole) throw new Error("Authenticated role changed between login and dashboard capture");
    const dashboardContent = await page.locator("main").innerText().catch(() => "");
    if (!dashboardContent.trim()) throw new Error("Authenticated dashboard has no visible main content");
    await verifyBrandLogo(page, role + " dashboard");
    const unexpectedErrors = classifyRuntimeErrors(runtimeErrors, google403Responses, role + " dashboard");
    if (unexpectedErrors.length) throw new Error("Runtime/browser console errors in " + role + " dashboard: " + unexpectedErrors.slice(0, 3).join(" | ").slice(0, 400));
    await assertPublishablePage(page, role + " dashboard");
    const screenshot = "dashboard-" + safeName(role) + ".png";
    await page.screenshot({ path: path.join(privateOut, screenshot), fullPage: true, animations: "disabled" });
    // Discover real, visible read-only learning/workflow links from this role's own navigation.
    // Never submit forms or open settings, payment, account, approval, delete or logout actions.
    const links = await page.locator("a[href]").evaluateAll((anchors) => anchors.map((anchor) => ({
      href: anchor.href,
      label: (anchor.innerText || anchor.getAttribute("aria-label") || "").trim().toLowerCase(),
      visible: !!(anchor.offsetWidth || anchor.offsetHeight || anchor.getClientRects().length)
    })));
    const allow = /lesson|class|assignment|quiz|exercise|study|group|attendance|record.?book|report|progress|achievement|resource|subject|dashboard|calendar|timetable|live|video|course|material|library/i;
    const deny = /logout|sign out|delete|remove|edit|settings|profile|password|payment|billing|wallet|payout|transfer|approve|reject|submit|upload|invite|user management|owner|admin/i;
    const seen = new Set([url.pathname]);
    const walkthrough = [];
    for (const link of links) {
      if (!link.visible || !allow.test(link.label) || deny.test(link.label)) continue;
      const target = new URL(link.href, baseUrl);
      if (target.origin !== baseUrl.origin || target.search || target.hash || seen.has(target.pathname)) continue;
      seen.add(target.pathname);
      walkthrough.push({ href: target.href, label: link.label });
      if (walkthrough.length === 5) break;
    }

    for (const item of walkthrough) {
      const response = await page.goto(item.href, { waitUntil: "domcontentloaded", timeout: 30000 });
      if (response && response.status() >= 400) throw new Error("Role walkthrough route returned HTTP " + response.status() + ": " + item.href);
      await page.locator("main, body").first().waitFor({ state: "visible", timeout: 12000 });
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
      await verifyBrandLogo(page, role + " " + item.label);
      await assertPublishablePage(page, role + " " + item.label);
      await page.waitForTimeout(1200);
    }
    const unexpectedWalkthroughErrors = classifyRuntimeErrors(runtimeErrors, google403Responses, role + " walkthrough");
    if (unexpectedWalkthroughErrors.length) throw new Error("Runtime/browser/API failure during role walkthrough: " + unexpectedWalkthroughErrors.slice(0, 5).join(" | ").slice(0, 900));
    await page.waitForTimeout(500);
    results.push({
      type: "dashboard", role, url: url.href, status: "verified-private", authenticatedRole,
      walkthroughPages: [url.pathname, ...walkthrough.map((item) => new URL(item.href).pathname)],
      title: await page.title()
    });
  } catch (error) {
    results.push({ type: "dashboard", role, url: url.href, error: String(error) });
  } finally {
    await context.close();
    const videoPath = path.join(privateOut, "private-dashboard-" + safeName(role) + ".webm");
    if (video) {
      try {
        await video.saveAs(videoPath);
        const roleResult = results.find((item) => item.type === "dashboard" && item.role === role);
        if (!roleResult || roleResult.error) await fs.rm(videoPath, { force: true });
      } catch (error) {
        results.push({ type: "dashboard-video", role, url: url.href, error: "Private video finalization failed: " + String(error) });
      }
    }
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
  lines.push("", "Authenticated dashboard screenshots and videos are used only for in-run verification, stored in ephemeral runner storage, and deleted before artifact upload. Public artifacts contain no private dashboard imagery, credentials, or Owner-only views. Use dedicated showcase accounts only.", "");
  return lines.join("\n");
}

try {
  await capturePublicPages();
  await captureRole("learner", "/student", process.env.SHOWCASE_LEARNER_EMAIL, process.env.SHOWCASE_LEARNER_PASSWORD);
  await captureRole("teacher", "/teacher", process.env.SHOWCASE_TEACHER_EMAIL, process.env.SHOWCASE_TEACHER_PASSWORD);
  await captureRole("manager", "/manager", process.env.SHOWCASE_MANAGER_EMAIL, process.env.SHOWCASE_MANAGER_PASSWORD);
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
  await fs.rm(privateOut, { recursive: true, force: true });
}
