import { getApiUrl } from "@workspace/api-client-react";

type DirectTicket = { ticket: string; uploadUrl: string; method: "PUT"; headers: Record<string, string> };

/** Native file-URI upload helper with route-bound tickets and multipart fallback. */
export async function uploadRouteMedia(
  uri: string,
  fileName: string,
  mimeType: string,
  token: string,
  endpoint: string,
  fields: Record<string, string> = {},
): Promise<any> {
  const auth: Record<string, string> = token ? { Authorization: "Bearer " + token } : {};
  const routeUrl = (suffix: string) => {
    const queryAt = endpoint.indexOf("?");
    const base = queryAt < 0 ? endpoint : endpoint.slice(0, queryAt);
    const query = queryAt < 0 ? "" : endpoint.slice(queryAt);
    return (base.endsWith("/") ? base.slice(0, -1) : base) + suffix + query;
  };
  const fallback = async () => {
    const form = new FormData();
    form.append("file", { uri, name: fileName, type: mimeType } as any);
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    const response = await fetch(getApiUrl(endpoint), { method: "POST", headers: auth, body: form });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || "Media upload failed (" + response.status + ").");
    return payload;
  };

  let blob: Blob;
  try {
    const local = await fetch(uri);
    if (!local.ok) throw new Error("Could not read selected media.");
    blob = await local.blob();
  } catch {
    return fallback();
  }

  let ticket: DirectTicket | null = null;
  try {
    const issued = await fetch(getApiUrl(routeUrl("/direct-upload-ticket")), {
      method: "POST", headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ ...fields, mimeType, size: blob.size, fileName }),
    });
    if (issued.status === 400 || issued.status === 401 || issued.status === 403) {
      const error = await issued.json().catch(() => ({}));
      throw new Error("AUTHORIZATION: " + (error?.error || "You are not authorized to upload this media."));
    }
    if (!issued.ok) return fallback();
    ticket = await issued.json() as DirectTicket;
    if (!ticket.ticket || !ticket.uploadUrl || ticket.method !== "PUT") return fallback();
    const stored = await fetch(ticket.uploadUrl, { method: "PUT", headers: ticket.headers || {}, body: blob });
    if (!stored.ok) throw new Error("Object storage upload failed.");
    const completed = await fetch(getApiUrl(routeUrl("/direct-upload-complete")), {
      method: "POST", headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ ...fields, ticket: ticket.ticket, mimeType, fileName }),
    });
    if (completed.status === 401 || completed.status === 403) {
      const error = await completed.json().catch(() => ({}));
      throw new Error("AUTHORIZATION: " + (error?.error || "You are not authorized to complete this upload."));
    }
    if (!completed.ok) throw new Error("Direct upload verification failed.");
    return await completed.json();
  } catch (error) {
    if (ticket) await fetch(getApiUrl(routeUrl("/direct-upload-abort")), {
      method: "POST", headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ ...fields, ticket: ticket.ticket, mimeType, fileName }),
    }).catch(() => undefined);
    if (error instanceof Error && /^AUTHORIZATION:/i.test(error.message)) throw error;
    return fallback();
  }
}
