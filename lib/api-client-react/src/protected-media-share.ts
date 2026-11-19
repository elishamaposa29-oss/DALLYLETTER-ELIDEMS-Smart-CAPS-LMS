import { getApiUrl } from "./custom-fetch";

export const DEFAULT_DALLYLETTER_WEB_URL = "https://elishamaposa29-oss-dallyletter-elid-gamma.vercel.app";

export type ProtectedMediaKind = "audio" | "video" | "image" | "document";

export interface CreateProtectedMediaShareLinkOptions {
  resourceUrl: string;
  title?: string;
  token: string | null | undefined;
  webBaseUrl: string;
  type?: ProtectedMediaKind;
}

/** The single client entry point for creating Dallyletter's existing expiring protected-media links. */
export async function createProtectedMediaShareLink(options: CreateProtectedMediaShareLinkOptions): Promise<string> {
  if (!options.token) throw new Error("Sign in before creating a protected share link.");
  const apiBase = new URL(getApiUrl("/"), options.webBaseUrl);
  const target = new URL(options.resourceUrl, apiBase);
  const webOrigin = new URL(options.webBaseUrl).origin;
  if (target.origin !== apiBase.origin && target.origin !== webOrigin) {
    throw new Error("Only Dallyletter-hosted media can be shared through a protected link.");
  }
  const match = target.pathname.match(/^\/api\/lessons\/media\/([a-f0-9-]{36})$/i);
  if (!match) throw new Error("This item does not have a supported protected lesson-media link.");
  const resourcePath = target.pathname + target.search;
  const response = await fetch(getApiUrl("/api/lessons/media/" + match[1] + "/share"), {
    method: "POST",
    headers: { Authorization: "Bearer " + options.token },
  });
  const data = await response.json().catch(() => ({})) as { shareToken?: unknown; error?: string };
  if (!response.ok || typeof data.shareToken !== "string") {
    throw new Error(data.error || "Dallyletter could not create the protected share link.");
  }
  const mimeType = target.searchParams.get("type")?.toLowerCase() || "";
  const inferredType: ProtectedMediaKind = options.type || (
    mimeType.startsWith("image/") ? "image" :
    mimeType.startsWith("video/") ? "video" :
    mimeType.startsWith("audio/") ? "audio" : "document"
  );
  const page = new URL("/shared-media", options.webBaseUrl);
  page.searchParams.set("m", match[1]);
  page.searchParams.set("t", inferredType);
  const originalMime = target.searchParams.get("type");
  if (originalMime) page.searchParams.set("mt", originalMime);
  if (options.title) page.searchParams.set("n", options.title.slice(0, 80));
  page.searchParams.set("k", data.shareToken);
  return page.toString();
}
