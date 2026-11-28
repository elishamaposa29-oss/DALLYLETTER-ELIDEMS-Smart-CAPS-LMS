#!/usr/bin/env node
/**
 * Reproducible full-download, Range, compression and cold/warm delivery probe.
 *
 * Usage:
 *   MEDIA_BENCH_URL=https://host/path/to/media \
 *   MEDIA_BENCH_RUNS=8 node scripts/media-delivery-benchmark.mjs
 *
 * Optional:
 *   MEDIA_BENCH_HEADERS='{"Authorization":"Bearer ..."}'
 *   MEDIA_BENCH_RANGE='bytes=0-1048575'
 *   MEDIA_BENCH_INCLUDE_RANGE=false
 *
 * The script never prints request headers or credentials. Fetch exposes decoded
 * response bytes; Content-Length is retained separately as the server-reported
 * encoded/wire-size hint. For definitive network accounting, compare hosting/CDN
 * transfer metrics over the same request set.
 */
import { performance } from "node:perf_hooks";

const url = process.env.MEDIA_BENCH_URL;
if (!url) {
  console.error("Set MEDIA_BENCH_URL to one exact media URL.");
  process.exit(2);
}
let parsedUrl;
try {
  parsedUrl = new URL(url);
  if (!["http:", "https:"].includes(parsedUrl.protocol)) throw new Error("Unsupported protocol");
} catch {
  console.error("MEDIA_BENCH_URL must be an absolute HTTP(S) URL.");
  process.exit(2);
}
const runs = Math.min(Math.max(Number(process.env.MEDIA_BENCH_RUNS || 8), 2), 50);
const rangeHeader = process.env.MEDIA_BENCH_RANGE || "bytes=0-1048575";
const includeRange = process.env.MEDIA_BENCH_INCLUDE_RANGE !== "false";
let headers = {};
try {
  headers = process.env.MEDIA_BENCH_HEADERS ? JSON.parse(process.env.MEDIA_BENCH_HEADERS) : {};
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) throw new Error("headers must be an object");
} catch {
  console.error("MEDIA_BENCH_HEADERS must be a JSON object.");
  process.exit(2);
}

async function sample(index, mode) {
  const requestHeaders = { ...headers };
  if (mode === "range") requestHeaders.Range = rangeHeader;
  if (index === 0) requestHeaders["Cache-Control"] = "no-cache";
  const started = performance.now();
  const response = await fetch(parsedUrl, {
    headers: requestHeaders,
    redirect: "manual",
  });
  const body = await response.arrayBuffer();
  const elapsedMs = performance.now() - started;
  const decodedBodyBytes = body.byteLength;
  const contentLength = response.headers.get("content-length");
  return {
    mode,
    run: index + 1,
    status: response.status,
    elapsedMs: Number(elapsedMs.toFixed(2)),
    decodedBodyBytes,
    decodedMiB: Number((decodedBodyBytes / 1024 / 1024).toFixed(4)),
    contentLengthHeader: contentLength,
    serverReportedLengthBytes: contentLength && /^\d+$/.test(contentLength) ? Number(contentLength) : null,
    contentEncoding: response.headers.get("content-encoding") || "identity-or-decoded-by-fetch",
    cacheStatus: response.headers.get("x-vercel-cache")
      || response.headers.get("cf-cache-status")
      || response.headers.get("x-cache")
      || "not-reported",
    cacheControl: response.headers.get("cache-control") || "not-reported",
    acceptRanges: response.headers.get("accept-ranges") || "not-reported",
    contentRange: response.headers.get("content-range") || null,
    rangeHonored: mode !== "range" || response.status === 206,
    decodedMiBPerSecond: elapsedMs > 0 ? Number((decodedBodyBytes / 1024 / 1024 / (elapsedMs / 1000)).toFixed(3)) : null,
  };
}

async function runMode(mode) {
  const results = [];
  for (let i = 0; i < runs; i++) results.push(await sample(i, mode));
  const sorted = results.map(row => row.elapsedMs).sort((a, b) => a - b);
  const median = sorted.length % 2
    ? sorted[(sorted.length - 1) / 2]
    : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  return {
    mode,
    samples: results.length,
    medianLatencyMs: Number(median.toFixed(2)),
    minLatencyMs: Number(sorted[0].toFixed(2)),
    maxLatencyMs: Number(sorted.at(-1).toFixed(2)),
    totalDecodedBodyBytes: results.reduce((sum, row) => sum + row.decodedBodyBytes, 0),
    totalServerReportedLengthBytes: results.reduce((sum, row) => sum + (row.serverReportedLengthBytes ?? 0), 0),
    observedContentEncodings: [...new Set(results.map(row => row.contentEncoding))],
    cacheStatuses: results.map(row => row.cacheStatus),
    rangeResponses: results.filter(row => row.status === 206).length,
    rangeIgnoredResponses: results.filter(row => mode === "range" && row.status !== 206).length,
    results,
  };
}

try {
  const full = await runMode("full");
  const range = includeRange ? await runMode("range") : null;
  const all = [...full.results, ...(range?.results ?? [])];
  const summary = {
    urlOrigin: parsedUrl.origin,
    path: parsedUrl.pathname,
    requestedRunsPerMode: runs,
    rangeHeader: includeRange ? rangeHeader : null,
    modes: [full, ...(range ? [range] : [])],
    note: "Decoded bytes are measured from the response body. Content-Length is reported separately and may be absent or altered by intermediaries. Confirm billed egress from Render/CDN provider metrics; this probe does not claim cost savings.",
  };
  console.log(JSON.stringify(summary, null, 2));
  if (all.some(row => row.status < 200 || row.status >= 300)) process.exitCode = 1;
  if (range?.results.some(row => row.status === 200)) process.exitCode = 1;
} catch (error) {
  console.error("Media benchmark failed:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
}
