export function normalizeGoogleSiteVerificationToken(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const tag = raw.match(/<meta\\b[^>]*>/i)?.[0];
  if (!tag) return raw;

  if (!/\\bname\\s*=\\s*["']google-site-verification["']/i.test(tag)) {
    throw new Error("GOOGLE_SITE_VERIFICATION must be a Search Console token or a google-site-verification meta tag");
  }

  const content = tag.match(/\\bcontent\\s*=\\s*["']([^"']+)["']/i)?.[1]?.trim();
  if (!content) {
    throw new Error("GOOGLE_SITE_VERIFICATION meta tag is missing its content attribute");
  }

  return content;
}
