import crypto from "node:crypto";

export const DEFAULT_SITE_URL = "https://elishamaposa29-oss-dallyletter-elid-gamma.vercel.app/";

export function getSiteUrl() {
  const value = process.env.GSC_SITE_URL || DEFAULT_SITE_URL;
  return value.endsWith("/") ? value : value + "/";
}

export function getServiceAccount() {
  const raw = process.env.GSC_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GSC_SERVICE_ACCOUNT_JSON is not configured. Add the complete service-account JSON key as a GitHub Actions secret.');
  const account = JSON.parse(raw);
  if (!account.client_email || !account.private_key) throw new Error("GSC_SERVICE_ACCOUNT_JSON must contain client_email and private_key");
  // Accept both standard JSON PEM newlines and secrets pasted with literal \\n sequences.
  account.private_key = account.private_key
    .replace(/\\r?\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .trim();
  return account;
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

export async function getAccessToken(account) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/webmasters",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  }));
  const unsigned = header + "." + claim;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  let privateKey;
  try {
    privateKey = crypto.createPrivateKey(account.private_key);
  } catch {
    const keyText = account.private_key;
    const headerPresent = /^-----BEGIN (?:PRIVATE KEY|RSA PRIVATE KEY)-----/.test(keyText);
    const footerPresent = /-----END (?:PRIVATE KEY|RSA PRIVATE KEY)-----$/.test(keyText);
    const lineCount = keyText.split("\n").length;
    throw new Error(
      "GSC_SERVICE_ACCOUNT_JSON.private_key is not a valid PEM key. Safe format diagnostics: " +
      JSON.stringify({ headerPresent, footerPresent, characterCount: keyText.length, lineCount }) +
      ". Re-download a new JSON key for the intended Google service account and replace the entire GitHub Actions secret with the raw JSON file contents. Do not paste only client_email/private_key_id, add quotes or Markdown fences, or manually edit the private_key. Never send the private key in chat."
    );
  }
  const assertion = unsigned + "." + signer.sign(privateKey, "base64url");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) throw new Error("Google OAuth failed (" + response.status + "): " + JSON.stringify(payload));
  return payload.access_token;
}

export async function googleApi(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      authorization: "Bearer " + token,
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }
  if (!response.ok) throw new Error("Google API request failed (" + response.status + "): " + JSON.stringify(payload));
  return payload;
}

export async function createGoogleSession() {
  const account = getServiceAccount();
  const token = await getAccessToken(account);
  const siteUrl = getSiteUrl();
  const properties = await googleApi("https://www.googleapis.com/webmasters/v3/sites", token);
  const property = (properties.siteEntry || []).find((entry) => entry.siteUrl === siteUrl);
  if (!property) {
    throw new Error("The service account " + account.client_email + " cannot access the Search Console property " + siteUrl + ". Add this service account as a Full user in Search Console > Settings > Users and permissions, and verify the property first.");
  }
  if (property.permissionLevel === "siteUnverifiedUser") {
    throw new Error("The service account is listed as unverified for " + siteUrl + ". Complete property ownership verification before running reports or submitting the sitemap.");
  }
  console.log("GSC_PROPERTY_ACCESS_VERIFIED: " + siteUrl + " (" + property.permissionLevel + ") for " + account.client_email);
  return { token, siteUrl, permissionLevel: property.permissionLevel };
}
