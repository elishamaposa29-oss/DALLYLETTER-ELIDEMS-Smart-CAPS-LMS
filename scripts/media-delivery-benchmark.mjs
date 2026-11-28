#!/usr/bin/env node
/**
 * Reproducible media delivery benchmark.
 *
 * Measures cold and warm full downloads and byte-range downloads, including
 * actual HTTP response-body bytes received before decompression, decoded bytes,
 * content encoding, cache headers, time to first byte and total latency.
 *
 * Usage:
 *   MEDIA_BENCH_URL=https://host/path/to/media node scripts/media-delivery-benchmark.mjs
 * Optional:
 *   MEDIA_BENCH_HEADERS='{"Authorization":"Bearer ..."}'
 *   MEDIA_BENCH_RUNS=8
 *   MEDIA_BENCH_RANGE='bytes=0-1048575'
 *   MEDIA_BENCH_INCLUDE_RANGE=false
 *
 * "Encoded bytes" means compressed HTTP response-body bytes observed by this
 * client; it excludes TLS, HTTP headers and transport framing. Billed egress
 * must still be confirmed from Render/CDN provider transfer metrics.
 */
import http from "node:http";
import https from "node:https";
import { performance } from "node:perf_hooks";
import { PassThrough } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";

const rawUrl = process.env.MEDIA_BENCH_URL;
if (!rawUrl) {
  console.error("Set MEDIA_BENCH_URL to one exact media URL.");
  process.exit(2);
}
let parsedUrl;
try {
  parsedUrl = new URL(rawUrl);
  if (!["http:", "https:"].includes(parsedUrl.protocol)) throw new Error("Unsupported protocol");
} catch {
  console.error("MEDIA_BENCH_URL must be an absolute HTTP(S) URL.");
  process.exit(2);
}
const runs = Math.min(Math.max(Number(process.env.MEDIA_BENCH_RUNS || 8), 2), 50);
const rangeHeader = process.env.MEDIA_BENCH_RANGE || "bytes=0-1048575";
const includeRange = process.env.MEDIA_BENCH_INCLUDE_RANGE !== "false";
const timeoutMs = Math.min(Math.max(Number(process.env.MEDIA_BENCH_TIMEOUT_MS || 120000), 1000), 600000);
// Small responses cannot produce a meaningful throughput estimate; timer and
// scheduling noise dominates transfer time for tiny files (e.g. 51-byte PDFs).
const minimumThroughputBytes = Math.min(Math.max(Number(process.env.MEDIA_BENCH_MIN_THROUGHPUT_BYTES || 262144), 1024), 16 * 1024 * 1024);
let headers = {};
try {
  headers = process.env.MEDIA_BENCH_HEADERS ? JSON.parse(process.env.MEDIA_BENCH_HEADERS) : {};
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) throw new Error("headers must be an object");
  for (const key of Object.keys(headers)) {
    if (/^(host|content-length|connection|transfer-encoding)$/i.test(key)) throw new Error("reserved request header");
  }
} catch {
  console.error("MEDIA_BENCH_HEADERS must be a JSON object without transport-controlled headers.");
  process.exit(2);
}

function decoderFor(encoding) {
  const value = String(encoding || "identity").trim().toLowerCase();
  if (!value || value === "identity") return new PassThrough();
  if (value === "br") return createBrotliDecompress();
  if (value === "gzip" || value === "x-gzip") return createGunzip();
  if (value === "deflate") return createInflate();
  throw new Error("Unsupported Content-Encoding: " + value);
}

function requestSample(mode, run) {
  return new Promise((resolve, reject) => {
    const requestHeaders = {
      ...headers,
      "Accept-Encoding": "br, gzip, deflate",
      "User-Agent": "Dallyletter-Media-Benchmark/2.0",
    };
    if (mode === "range") requestHeaders.Range = rangeHeader;
    const cacheClass = run === 0 ? "cold" : "warm";
    if (cacheClass === "cold") {
      requestHeaders["Cache-Control"] = "no-cache";
      requestHeaders.Pragma = "no-cache";
    }
    const transport = parsedUrl.protocol === "https:" ? https : http;
    const started = performance.now();
    let firstByteMs = null;
    let encodedBodyBytes = 0;
    let decodedBodyBytes = 0;
    let settled = false;
    const req = transport.request(parsedUrl, {
      method: "GET",
      headers: requestHeaders,
      timeout: timeoutMs,
    }, response => {
      firstByteMs = performance.now() - started;
      const encoding = String(response.headers["content-encoding"] || "identity");
      let decoder;
      try {
        decoder = decoderFor(encoding);
      } catch (error) {
        response.destroy();
        settled = true;
        reject(error);
        return;
      }
      response.on("data", chunk => { encodedBodyBytes += chunk.length; });
      response.on("error", error => {
        if (!settled) { settled = true; reject(error); }
      });
      decoder.on("data", chunk => { decodedBodyBytes += chunk.length; });
      decoder.on("error", error => {
        response.destroy();
        if (!settled) { settled = true; reject(error); }
      });
      decoder.on("end", () => {
        if (settled) return;
        settled = true;
        const elapsedMs = performance.now() - started;
        const contentLength = response.headers["content-length"];
        const cacheStatus = response.headers["x-vercel-cache"]
          || response.headers["cf-cache-status"]
          || response.headers["x-cache"]
          || response.headers["cdn-cache-status"]
          || "not-reported";
        resolve({
          mode,
          cacheClass,
          run: run + 1,
          status: response.statusCode || 0,
          timeToFirstByteMs: Number((firstByteMs ?? 0).toFixed(2)),
          elapsedMs: Number(elapsedMs.toFixed(2)),
          encodedBodyBytes,
          decodedBodyBytes,
          compressionRatio: decodedBodyBytes > 0 ? Number((encodedBodyBytes / decodedBodyBytes).toFixed(4)) : null,
          compressionSavingsPercent: decodedBodyBytes > 0 ? Number((100 * (1 - encodedBodyBytes / decodedBodyBytes)).toFixed(2)) : null,
          contentLengthHeader: contentLength ?? null,
          contentEncoding: encoding,
          cacheStatus,
          age: response.headers.age ?? null,
          cacheControl: response.headers["cache-control"] ?? "not-reported",
          acceptRanges: response.headers["accept-ranges"] ?? "not-reported",
          contentRange: response.headers["content-range"] ?? null,
          rangeHonored: mode !== "range" || response.statusCode === 206,
          throughputEligible: Math.max(encodedBodyBytes, decodedBodyBytes) >= minimumThroughputBytes,
          encodedMiBPerSecond: elapsedMs > 0 && encodedBodyBytes >= minimumThroughputBytes ? Number((encodedBodyBytes / 1048576 / (elapsedMs / 1000)).toFixed(3)) : null,
          decodedMiBPerSecond: elapsedMs > 0 && decodedBodyBytes >= minimumThroughputBytes ? Number((decodedBodyBytes / 1048576 / (elapsedMs / 1000)).toFixed(3)) : null,
        });
      });
      response.pipe(decoder);
    });
    req.on("timeout", () => req.destroy(new Error("Request timed out after " + timeoutMs + " ms")));
    req.on("error", error => {
      if (!settled) { settled = true; reject(error); }
    });
    req.end();
  });
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function percentile(values, percentileRank) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(percentileRank * sorted.length) - 1))];
}

async function runMode(mode) {
  const results = [];
  for (let i = 0; i < runs; i++) results.push(await requestSample(mode, i));
  const cold = results.filter(row => row.cacheClass === "cold");
  const warm = results.filter(row => row.cacheClass === "warm");
  const summarize = rows => ({
    samples: rows.length,
    medianLatencyMs: Number(median(rows.map(row => row.elapsedMs)).toFixed(2)),
    p95LatencyMs: Number(percentile(rows.map(row => row.elapsedMs), 0.95).toFixed(2)),
    medianTimeToFirstByteMs: Number(median(rows.map(row => row.timeToFirstByteMs)).toFixed(2)),
    p95TimeToFirstByteMs: Number(percentile(rows.map(row => row.timeToFirstByteMs), 0.95).toFixed(2)),
    totalEncodedBodyBytes: rows.reduce((sum, row) => sum + row.encodedBodyBytes, 0),
    totalDecodedBodyBytes: rows.reduce((sum, row) => sum + row.decodedBodyBytes, 0),
    compressionRatio: rows.reduce((sum, row) => sum + row.encodedBodyBytes, 0) /
      Math.max(1, rows.reduce((sum, row) => sum + row.decodedBodyBytes, 0)),
    compressionSavingsPercent: Number((100 * (1 - rows.reduce((sum, row) => sum + row.encodedBodyBytes, 0) /
      Math.max(1, rows.reduce((sum, row) => sum + row.decodedBodyBytes, 0)))).toFixed(2)),
    measuredClientVisibleEgressMiB: Number((rows.reduce((sum, row) => sum + row.encodedBodyBytes, 0) / 1048576).toFixed(4)),
    cacheStatuses: [...new Set(rows.map(row => row.cacheStatus))],
    contentEncodings: [...new Set(rows.map(row => row.contentEncoding))],
  });
  return {
    mode,
    cold: summarize(cold),
    warm: summarize(warm),
    totalEncodedBodyBytes: results.reduce((sum, row) => sum + row.encodedBodyBytes, 0),
    totalDecodedBodyBytes: results.reduce((sum, row) => sum + row.decodedBodyBytes, 0),
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
    minimumThroughputSampleBytes: minimumThroughputBytes,
    throughputMethodology: "Per-sample MiB/s is omitted (null) below the configured minimum payload size because fixed request/timer overhead dominates tiny transfers. Use representative media payloads for throughput comparisons.",
    rangeHeader: includeRange ? rangeHeader : null,
    modes: [full, ...(range ? [range] : [])],
    totalEncodedResponseBodyBytes: all.reduce((sum, row) => sum + row.encodedBodyBytes, 0),
    totalDecodedResponseBodyBytes: all.reduce((sum, row) => sum + row.decodedBodyBytes, 0),
    measuredClientVisibleEgressMiB: Number((all.reduce((sum, row) => sum + row.encodedBodyBytes, 0) / 1048576).toFixed(4)),
    aggregateCompressionRatio: all.reduce((sum, row) => sum + row.encodedBodyBytes, 0) /
      Math.max(1, all.reduce((sum, row) => sum + row.decodedBodyBytes, 0)),
    note: "Encoded bytes are actual compressed HTTP response-body bytes received by this client; decoded bytes are counted after decompression. The egress MiB figure is client-visible body transfer, not provider-billed egress. Neither includes TLS/HTTP overhead. Throughput values are omitted for payloads below minimumThroughputSampleBytes to avoid misleading rates from tiny fixtures. Confirm billed Render/CDN egress in provider metrics; this script does not claim production cost savings.",
  };
  console.log(JSON.stringify(summary, null, 2));
  if (all.some(row => row.status < 200 || row.status >= 300)) process.exitCode = 1;
  if (range?.results.some(row => row.status !== 206)) process.exitCode = 1;
} catch (error) {
  console.error("Media benchmark failed:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
}
