import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { rm } from "node:fs/promises";
import { build } from "esbuild";

const output = path.join(tmpdir(), "dallyletter-ai-provider-http-" + process.pid + ".mjs");
const originalFetch = globalThis.fetch;
const originalTimeout = process.env.AI_PROVIDER_TIMEOUT_MS;

try {
  await build({
    entryPoints: [new URL("../src/lib/ai-provider-http.ts", import.meta.url).pathname],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: output,
  });
  const { AIProviderError, requestProviderJson } = await import(pathToFileURL(output).href);

  globalThis.fetch = async () => new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
  assert.deepEqual(await requestProviderJson("test", "https://provider.test", { method: "POST" }), { ok: true });

  for (const [status, expected] of [[401, "invalid_credentials"], [403, "invalid_credentials"], [429, "rate_limited"], [503, "provider_unavailable"], [400, "provider_rejected"]]) {
    globalThis.fetch = async () => new Response("SECRET_PROVIDER_BODY_AND_KEY", { status });
    await assert.rejects(
      requestProviderJson("test", "https://provider.test", { method: "POST" }),
      error => error instanceof AIProviderError && error.code === expected && !String(error).includes("SECRET_PROVIDER_BODY_AND_KEY"),
    );
  }

  globalThis.fetch = async () => new Response("not-json", { status: 200 });
  await assert.rejects(
    requestProviderJson("test", "https://provider.test", { method: "POST" }),
    error => error instanceof AIProviderError && error.code === "invalid_response",
  );

  globalThis.fetch = async () => { throw new Error("network details must not leak"); };
  await assert.rejects(
    requestProviderJson("test", "https://provider.test", { method: "POST" }),
    error => error instanceof AIProviderError && error.code === "network_error" && !String(error).includes("network details"),
  );

  process.env.AI_PROVIDER_TIMEOUT_MS = "1000";
  globalThis.fetch = async (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  });
  await assert.rejects(
    requestProviderJson("test", "https://provider.test", { method: "POST" }),
    error => error instanceof AIProviderError && error.code === "timeout" && error.retryable,
  );

  const callerAbort = new AbortController();
  globalThis.fetch = async (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(new Error("caller cancelled")), { once: true });
  });
  const cancelledRequest = requestProviderJson("test", "https://provider.test", { method: "POST", signal: callerAbort.signal });
  setTimeout(() => callerAbort.abort(), 20);
  await assert.rejects(
    cancelledRequest,
    error => error instanceof AIProviderError && error.code === "cancelled" && !error.retryable,
  );

  console.log("AI_PROVIDER_HTTP_FAILURE_INJECTION: PASS (success, 401/403, 429, 5xx, rejected, malformed JSON, network, timeout, caller cancellation, redaction)");
} finally {
  globalThis.fetch = originalFetch;
  if (originalTimeout === undefined) delete process.env.AI_PROVIDER_TIMEOUT_MS;
  else process.env.AI_PROVIDER_TIMEOUT_MS = originalTimeout;
  await rm(output, { force: true });
}
