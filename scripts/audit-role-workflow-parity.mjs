#!/usr/bin/env node
/**
 * Static route-to-client inventory for Dallyletter role workflow parity.
 * Discovery aid only: source matches do not prove reachable UI, authorization,
 * persistence, or successful runtime behavior.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const routeRoot = join(root, "artifacts/api-server/src/routes");
const webRoot = join(root, "artifacts/dallyletter/src");
const mobileRoot = join(root, "artifacts/dallyletter-mobile");
const routerIndex = readFileSync(join(routeRoot, "index.ts"), "utf8");
const apiPrefix = "/api";

function filesUnder(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...filesUnder(path));
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) found.push(path);
  }
  return found;
}
function readSafe(path) { try { return readFileSync(path, "utf8"); } catch { return ""; } }
function escapeRegex(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

const imports = [...routerIndex.matchAll(/import\s+(\w+)\s+from\s+["']\.\/([^"']+)["']/g)];
const importMap = new Map(imports.map(match => [match[1], match[2]]));
const mounts = new Map();
for (const match of routerIndex.matchAll(/router\.use\(\s*(?:["'`]([^"'`]+)["'`]\s*,\s*)?(\w+)\s*\)/g)) {
  const routeFile = importMap.get(match[2]);
  if (routeFile) mounts.set(routeFile, match[1] ?? "");
}
const clients = [
  ...filesUnder(webRoot).map(path => ({ path, kind: "web" })),
  ...filesUnder(join(mobileRoot, "app")).map(path => ({ path, kind: "android" })),
  ...filesUnder(join(mobileRoot, "components")).map(path => ({ path, kind: "android" })),
].map(file => ({ ...file, text: readSafe(file.path) }));

const records = [];
for (const file of filesUnder(routeRoot)) {
  const source = readSafe(file);
  const routeName = relative(routeRoot, file).replace(/\.(ts|tsx)$/, "");
  const prefix = mounts.get(routeName) ?? "";
  for (const match of source.matchAll(/router\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g)) {
    const method = match[1].toUpperCase();
    const path = (apiPrefix + prefix + match[2]).replace(/\/+/g, "/");
    const pattern = path.split("/").map(part => part.startsWith(":") ? "[^/\\s\"'`]+" : escapeRegex(part)).join("/");
    const matcher = new RegExp(pattern);
    const web = clients.filter(item => item.kind === "web" && matcher.test(item.text));
    const android = clients.filter(item => item.kind === "android" && matcher.test(item.text));
    records.push({ method, path, source: relative(root, file), web, android });
  }
}
records.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
const lines = [
  "# Role workflow API-to-client static inventory",
  "",
  "Generated: " + new Date().toISOString(),
  "",
  "> Static source matching only. A route reference is not proof of a reachable screen, complete action lifecycle, correct role permission, persistence, or runtime success.",
  "",
  "| Method | API route | Backend source | Web references | Android references |",
  "|---|---|---|---|---|",
  ...records.map(row => "| " + row.method + " | `" + row.path + "` | `" + row.source + "` | " +
    (row.web.length ? row.web.map(item => "`" + relative(root, item.path) + "`").join("<br>") : "**NOT FOUND**") + " | " +
    (row.android.length ? row.android.map(item => "`" + relative(root, item.path) + "`").join("<br>") : "**NOT FOUND**") + " |"),
  "",
  "Total route declarations: **" + records.length + "**.",
  "No web source reference: **" + records.filter(row => !row.web.length).length + "**.",
  "No Android source reference: **" + records.filter(row => !row.android.length).length + "**.",
  "",
  "Review every NOT FOUND row manually. Some endpoints are intentionally server-only, webhook-only, owner-only, or shared through a generic API client; do not add UI solely to eliminate a static warning.",
  "",
];
const output = join(root, "docs/role-workflow-api-client-static-inventory.md");
writeFileSync(output, lines.join("\n"));
console.log("Wrote " + relative(root, output) + " with " + records.length + " route declarations.");
