import { createGoogleSession } from "./google-search-console-api.mjs";

const session = await createGoogleSession();
console.log("GSC_SERVICE_ACCOUNT_PROPERTY_ACCESS_VERIFIED:", JSON.stringify({
  siteUrl: session.siteUrl,
  permissionLevel: session.permissionLevel
}));
