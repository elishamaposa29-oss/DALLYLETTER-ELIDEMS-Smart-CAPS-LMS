import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { rm } from "node:fs/promises";
import { build } from "esbuild";

const output = path.join(tmpdir(), "dallyletter-ai-provider-model-" + process.pid + ".mjs");
const originalFetch = globalThis.fetch;
const originalSettings = globalThis.__AI_TEST_SETTINGS__;
const originalKey = process.env.GEMINI_API_KEY;
const originalModel = process.env.GEMINI_MODEL;
const requests = [];
try {
  await build({
    entryPoints: [new URL("../src/lib/ai-provider.ts", import.meta.url).pathname],
    bundle: true, platform: "node", format: "esm", outfile: output,
    plugins: [{ name: "ai-provider-test-db", setup(build) {
      build.onResolve({ filter: /^@workspace\\/db$/ }, () => ({ path: "db-stub", namespace: "ai-test" }));
      build.onLoad({ filter: /.*/, namespace: "ai-test" }, () => ({ contents: 'export const platformSettingsTable = {}; export const db = { select: () => ({ from: async () => globalThis.__AI_TEST_SETTINGS__ || [] }) };', loader: "js" }));
    }}],
  });
  globalThis.__AI_TEST_SETTINGS__ = [{ key: "ai_provider", value: "gemini" }, { key: "gemini_api_key", value: "db-test-key" }, { key: "gemini_model", value: "gemini-db-test" }];
  process.env.GEMINI_API_KEY = "environment-key-must-not-win";
  process.env.GEMINI_MODEL = "gemini-env-test";
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const body = JSON.parse(String(init.body || "{}"));
    requests.push({ url, body });
    const prompt = body.contents?.[0]?.parts?.[0]?.text || "";
    let text = "ELIDEMS AI test response";
    if (prompt.includes("multiple choice questions")) text = JSON.stringify({ title: "Test quiz", questions: [{ question: "What is 2 + 2?", difficulty: "easy", options: [{ text: "4", isCorrect: true }, { text: "5", isCorrect: false }], explanation: "Basic addition." }] });
    else if (prompt.includes("careful content-safety reviewer")) text = JSON.stringify({ flagged: true, reason: "Test flag", severity: "medium", categories: ["harassment"] });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const { getAIProvider, invalidateAICache } = await import(pathToFileURL(output).href);
  let ai = await getAIProvider();
  assert.equal(ai.name, "gemini");
  assert.equal(ai.model, "gemini-db-test", "database model setting must override environment model");
  assert.equal(await ai.chat([{ role: "user", content: "Test AI chat" }]), "ELIDEMS AI test response");
  const poll = await ai.generatePoll("addition", "Grade 3", "Mathematics", 1);
  assert.equal(poll.questions.length, 1);
  await ai.chat([{ role: "user", content: "Assess AI exercise marking readiness" }]);
  await ai.chat([{ role: "user", content: "Mark this learner exercise" }]);
  const moderation = await ai.moderateContent("A test message for moderation");
  assert.equal(moderation.flagged, true);
  assert.equal(moderation.categories[0], "harassment");
  assert.equal(await ai.analyzeData({ sample: 1 }, "Summarize this data"), "ELIDEMS AI test response");
  assert.equal(requests.length, 6);
  for (const request of requests) { assert.equal(request.url.pathname, "/v1beta/models/gemini-db-test:generateContent"); assert.equal(request.url.searchParams.get("key"), "db-test-key"); }
  globalThis.__AI_TEST_SETTINGS__ = [{ key: "ai_provider", value: "gemini" }, { key: "gemini_api_key", value: "db-test-key" }];
  invalidateAICache(); ai = await getAIProvider();
  assert.equal(ai.model, "gemini-env-test", "environment model must be used when database model is absent");
  delete process.env.GEMINI_MODEL; invalidateAICache(); ai = await getAIProvider();
  assert.equal(ai.model, "gemini-3.8-flash", "stable default must be used when no model override exists");
  console.log("AI_PROVIDER_MODEL_AND_WORKFLOWS: PASS (DB/env/default model precedence, DB key precedence, chat, poll, exercise readiness/marking calls, moderation, analysis)");
} finally {
  globalThis.fetch = originalFetch;
  if (originalSettings === undefined) delete globalThis.__AI_TEST_SETTINGS__; else globalThis.__AI_TEST_SETTINGS__ = originalSettings;
  if (originalKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalKey;
  if (originalModel === undefined) delete process.env.GEMINI_MODEL; else process.env.GEMINI_MODEL = originalModel;
  await rm(output, { force: true });
}
