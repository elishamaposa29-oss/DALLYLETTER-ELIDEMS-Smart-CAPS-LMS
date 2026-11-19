import test from "node:test";
import assert from "node:assert/strict";
import { getApiMediaAuthHeaders, requiresApiMediaAuth } from "../../dallyletter-mobile/components/media-auth.js";
import { setBaseUrl } from "../../../lib/api-client-react/src/custom-fetch.js";
import { createProtectedMediaShareLink, DEFAULT_DALLYLETTER_WEB_URL } from "../../../lib/api-client-react/src/protected-media-share.js";

const api = "https://api.example.test";

test("adds authentication for relative protected media paths", () => {
  assert.equal(requiresApiMediaAuth("/api/lessons/media/123", api), true);
  assert.deepEqual(getApiMediaAuthHeaders("/api/messages/media/123", "test-token", api), { Authorization: "Bearer test-token" });
});

test("adds authentication for absolute URLs on the configured API origin only", () => {
  assert.equal(requiresApiMediaAuth("https://api.example.test/api/assignments/media/123", api), true);
  assert.deepEqual(getApiMediaAuthHeaders("https://api.example.test/api/exercises/media/123", "test-token", api), { Authorization: "Bearer test-token" });
});

test("never forwards the bearer token to an external origin that mimics a protected path", () => {
  const hostile = "https://evil.example/api/lessons/media/123";
  assert.equal(requiresApiMediaAuth(hostile, api), false);
  assert.deepEqual(getApiMediaAuthHeaders(hostile, "test-token", api), {});
  assert.deepEqual(getApiMediaAuthHeaders("https://api.example.test/api/users", "test-token", api), {});
});

test("does not authorize malformed URLs or protocol-confused origins", () => {
  assert.equal(requiresApiMediaAuth("not a URL", api), false);
  assert.equal(requiresApiMediaAuth("http://api.example.test/api/messages/media/123", api), false);
});

test("creates a canonical protected link and sends the authenticated share request", async () => {
  const originalFetch = globalThis.fetch;
  const storageKey = "123e4567-e89b-12d3-a456-426614174000";
  const resourceUrl = "/api/lessons/media/" + storageKey + "?type=image%2Fjpeg";
  const shareToken = "1799999999." + "a".repeat(22);
  let requestedUrl = "";
  let requestedAuthorization = "";
  setBaseUrl(api);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requestedUrl = String(input);
    requestedAuthorization = new Headers(init?.headers).get("authorization") || "";
    return new Response(JSON.stringify({ shareToken }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const link = await createProtectedMediaShareLink({
      resourceUrl,
      title: "Protected image",
      token: "signed-in-session",
      webBaseUrl: DEFAULT_DALLYLETTER_WEB_URL,
    });
    const parsed = new URL(link);
    assert.equal(requestedUrl, "https://api.example.test/api/lessons/media/" + storageKey + "/share");
    assert.equal(requestedAuthorization, "Bearer signed-in-session");
    assert.equal(parsed.origin, DEFAULT_DALLYLETTER_WEB_URL);
    assert.equal(parsed.pathname, "/shared-media");
    assert.equal(parsed.searchParams.get("m"), storageKey);
    assert.equal(parsed.searchParams.get("mt"), "image/jpeg");
    assert.equal(parsed.searchParams.get("t"), "image");
    assert.equal(parsed.searchParams.get("n"), "Protected image");
    assert.equal(parsed.searchParams.get("k"), shareToken);
    assert.equal(parsed.searchParams.has("shareToken"), false);
    assert.equal(parsed.hash, "");
    assert.ok(link.startsWith("https://"), "Shared links must use HTTPS");
  } finally {
    globalThis.fetch = originalFetch;
    setBaseUrl(null);
  }
});

test("rejects external or unsupported media before requesting a public token", async () => {
  const originalFetch = globalThis.fetch;
  let requested = false;
  setBaseUrl(api);
  globalThis.fetch = (async () => {
    requested = true;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  try {
    await assert.rejects(
      createProtectedMediaShareLink({
        resourceUrl: "https://evil.example/api/lessons/media/123e4567-e89b-12d3-a456-426614174000",
        token: "signed-in-session",
        webBaseUrl: DEFAULT_DALLYLETTER_WEB_URL,
      }),
      /Only Dallyletter-hosted media/,
    );
    await assert.rejects(
      createProtectedMediaShareLink({
        resourceUrl: "/api/messages/media/123e4567-e89b-12d3-a456-426614174000",
        token: "signed-in-session",
        webBaseUrl: DEFAULT_DALLYLETTER_WEB_URL,
      }),
      /supported protected lesson-media link/,
    );
    await assert.rejects(
      createProtectedMediaShareLink({
        resourceUrl: "/api/lessons/media/123e4567-e89b-12d3-a456-426614174000",
        token: null,
        webBaseUrl: DEFAULT_DALLYLETTER_WEB_URL,
      }),
      /Sign in/,
    );
    assert.equal(requested, false, "Invalid or unauthenticated share requests must not reach the API");
  } finally {
    globalThis.fetch = originalFetch;
    setBaseUrl(null);
  }
});
