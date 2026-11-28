#!/usr/bin/env node
/**
 * Reproducible media delivery benchmark.
 *
 * Usage:
 *   MEDIA_BENCH_URL=https://host/path/to/public-or-authorized-media \
 *   MEDIA_BENCH_RUNS=8 node scripts/media-delivery-benchmark.mjs
 *
 * Optional: MEDIA_BENCH_HEADERS='{"Authorization":"Bearer ..."}'
 * The script never prints request headers or credentials.
 */
import { performance } from "node:perf_hooks";

const url = process.env.MEDIA_BENCH_URL;
if (!url) {
  console.error("Set MEDIA_BENCH_URL to one exact media URL.");
  process.exit(2);
}
const runs = Math.min(Math.max(Number(process.env.MEDIA_BENCH_RUNS || 8), 2), 50);
let headers = {};
try {
  headers = process.env.MEDIA_BENCH_HEADERS ? JSON.parse(process.env.MEDIA_BENCH_HEADERS) : {};
} catch {
  console.error("MEDIA_BENCH_HEADERS must be valid JSON.");
  process.exit(2);
}

async function sample(index) {
  const started = performance.now();
  const response = await fetch(url, {
    headers: { ...headers, "Cache-Control": index === 0 ? "no-cache" : "max-age=0" },
    redirect: "manual",
  });
  const body = await response.arrayBuffer();
  const elapsedMs = performance.now() - started;
  return {
    run: index + 1,
    status: response.status,
    elapsedMs: Number(elapsedMs.toFixed(2)),
    decodedBodyBytes: body.byteLength,
    contentLengthHeader: response.headers.get("content-length"),
    contentEncoding: response.headers.get("content-encoding") || "identity",
    cacheStatus: response.headers.get("x-vercel-cache")
      || response.headers.get("cf-cache-status")
      || response.headers.get("x-cache")
      || "not-reported",
    cacheControl: response.headers.get("cache-control") || "not-reported",
    contentRange: response.headers.get("content-range") || null,
  };
}

const results = [];
for (let i = 0; i < runs; i++) {
  results.push(await sample(i));
}
const sorted = results.map(row => row.elapsedMs).sort((a, b) => a - b);
const median = sorted.length % 2
  ? sorted[(sorted.length - 1) / 2]
  : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
const totalDecodedBytes = results.reduce((sum, row) => sum + row.decodedBodyBytes, 0);
const summary = {
  urlOrigin: new URL(url).origin,
  path: new URL(url).pathname,
  samples: results.length,
  medianLatencyMs: Number(median.toFixed(2)),
  minLatencyMs: Number(sorted[0].toFixed(2)),
  maxLatencyMs: Number(sorted.at(-1).toFixed(2)),
  totalDecodedBodyBytes: totalDecodedBytes,
  observedContentEncodings: [...new Set(results.map(row => row.contentEncoding))],
  cacheStatuses: results.map(row => row.cacheStatus),
  note: "Fetch exposes decoded response bytes; use content-length and CDN cache headers for wire/cache evidence. Run against the same object and URL for before/after comparisons.",
  results,
};
console.log(JSON.stringify(summary, null, 2));
if (results.some(row => row.status < 200 || row.status >= 300)) process.exitCode = 1;
