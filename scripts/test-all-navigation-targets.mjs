import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const webRoot = join(root, "artifacts/dallyletter/src");
const mobileRoot = join(root, "artifacts/dallyletter-mobile");
const mobileAppRoot = join(mobileRoot, "app");

function sourceFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(path));
    else if (/\.(tsx?|jsx?)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) files.push(path);
  }
  return files;
}

function normalizePath(value) {
  let path = String(value || "").trim();
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  path = path.replace(/\$\{[^}]+\}/g, "__dynamic__");
  path = path.split(/[?#]/, 1)[0].replace(/\/{2,}/g, "/");
  path = path.length > 1 ? path.replace(/\/+$/, "") : path;
  if (/\.(?:png|jpe?g|webp|svg|ico|pdf|csv|xlsx?|docx?|mp4|webm|mp3|wav|json|xml|txt|css|js)$/i.test(path)) return null;
  if (path.startsWith("/api/")) return null;
  return path || "/";
}

function routePattern(path) {
  const segments = path.split("/").filter(Boolean);
  return new RegExp("^/" + segments.map(segment => {
    if (segment === "*") return ".*";
    if (segment.startsWith(":")) return "[^/]+";
    return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }).join("/") + "/?$");
}

function extractTargets(source) {
  const patterns = [
    /\b(?:href|to)\s*=\s*\{?\s*["'`]([^"'`]+)["'`]\s*\}?/g,
    /\b(?:href|to)\s*:\s*["'`]([^"'`]+)["'`]/g,
    /\b(?:router\.)?(?:push|replace|navigate|setLocation)\s*\(\s*["'`]([^"'`]+)["'`]/g,
    /\bwindow\.location(?:\.(?:assign|replace))?\s*\(\s*["'`]([^"'`]+)["'`]/g,
    /\b(?:window\.)?location(?:\.href)?\s*=\s*["'`]([^"'`]+)["'`]/g,
    /\bpathname\s*:\s*["'`]([^"'`]+)["'`]/g,
  ];
  const targets = [];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const suffix = source.slice(match.index + match[0].length);
      const rawTarget = /^\s*\+/.test(suffix) ? match[1] + "__dynamic__" : match[1];
      const path = normalizePath(rawTarget);
      if (path) targets.push(path);
    }
  }
  return targets;
}

const appSource = readFileSync(join(webRoot, "App.tsx"), "utf8");
const webRoutes = [...appSource.matchAll(/<Route\s+path=["']([^"']+)["']/g)].map(match => match[1]);
const webRouteMatchers = webRoutes.map(path => ({ path, matcher: routePattern(path) }));
const webFiles = sourceFiles(webRoot);
const webReferences = [];
for (const file of webFiles) {
  const source = readFileSync(file, "utf8");
  for (const target of extractTargets(source)) {
    if (!webRouteMatchers.some(route => route.matcher.test(target))) {
      webReferences.push({ file: relative(root, file), target });
    }
  }
}
assert.deepEqual(webReferences, [], "Web navigation targets must resolve to registered routes: " + JSON.stringify(webReferences, null, 2));

function expoRoutePath(file) {
  let relativePath = relative(mobileAppRoot, file).replace(/\\/g, "/").replace(/\.(tsx?|jsx?)$/, "");
  const parts = relativePath.split("/");
  if (parts.some(part => part.startsWith("_") || part.startsWith("+"))) return null;
  const last = parts.at(-1);
  if (last === "index") parts.pop();
  const visible = parts.filter(part => !(part.startsWith("(") && part.endsWith(")")));
  return "/" + visible.map(part => part.replace(/^\[\[\.\.\.(.+)\]\]$/, ":$1").replace(/^\.\.\.(.+)$/, ":$1").replace(/^\[(.+)\]$/, ":$1")).filter(Boolean).join("/");
}

const mobileRouteFiles = sourceFiles(mobileAppRoot);
const mobileRoutes = mobileRouteFiles.map(expoRoutePath).filter(Boolean);
const mobileRouteMatchers = mobileRoutes.map(path => ({ path, matcher: routePattern(path) }));
const mobileSources = [
  ...mobileRouteFiles,
  ...sourceFiles(join(mobileRoot, "components")),
];
const mobileReferences = [];
for (const file of mobileSources) {
  const source = readFileSync(file, "utf8");
  for (const target of extractTargets(source)) {
    if (!mobileRouteMatchers.some(route => route.matcher.test(target))) {
      mobileReferences.push({ file: relative(root, file), target });
    }
  }
}
assert.deepEqual(mobileReferences, [], "Android navigation targets must resolve to Expo Router screens: " + JSON.stringify(mobileReferences, null, 2));

console.log("Navigation target audit passed: " + webRoutes.length + " web routes, " + webReferences.length + " unresolved web destinations, " + mobileRoutes.length + " Android routes, " + mobileReferences.length + " unresolved Android destinations.");
