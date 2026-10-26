import { appendFileSync, writeFileSync } from "node:fs";

const enabled = process.env.MOCK_PROVIDER_MODE === "test";
const capturePath = process.env.MOCK_PROVIDER_CAPTURE || "/tmp/dallyletter-provider-capture.jsonl";
if (enabled) {
  writeFileSync(capturePath, "");
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
    const method = String(init.method || "GET").toUpperCase();
    const bodyText = typeof init.body === "string" ? init.body : "";
    let response;
    if (url.hostname === "api.resend.com" && url.pathname === "/emails" && method === "POST") {
      const body = JSON.parse(bodyText || "{}");
      appendFileSync(capturePath, JSON.stringify({ provider: "resend", body }) + "\n");
      response = { status: 200, body: { id: "mock_resend_" + Date.now() } };
    } else if (url.hostname === "paypal.test" && url.pathname === "/v1/oauth2/token" && method === "POST") {
      response = { status: 200, body: { access_token: "mock-paypal-access-token", token_type: "Bearer" } };
    } else if (url.hostname === "paypal.test" && url.pathname === "/v1/notifications/verify-webhook-signature" && method === "POST") {
      const request = JSON.parse(bodyText || "{}");
      const sig = String(request.webhook_event?.id || "");
      response = { status: 200, body: { verification_status: sig === "mock-valid-signature" ? "SUCCESS" : "FAILURE" } };
    } else {
      throw new Error("Test provider guard blocked unexpected network request: " + method + " " + url.origin + url.pathname);
    }
    return new Response(JSON.stringify(response.body), {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  };
}
