import { getApiUrl } from "@workspace/api-client-react";

type UploadResult = { mediaUrl: string; storageKey?: string; mimeType?: string; size?: number; sha256?: string };
type DirectTicket = { ticket: string; uploadUrl: string; method: "PUT"; headers: Record<string, string> };

function mediaPath(groupId?: number, suffix = ""): string {
  return "/api/lessons/media" + suffix + (groupId ? "?groupId=" + encodeURIComponent(String(groupId)) : "");
}

function xhrUpload(url: string, file: File, headers: Record<string, string>, onProgress?: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.timeout = 10 * 60 * 1000;
    for (const [name, value] of Object.entries(headers)) request.setRequestHeader(name, value);
    request.upload.onprogress = event => {
      if (event.lengthComputable) onProgress?.(Math.round(event.loaded / event.total * 100));
    };
    request.onload = () => request.status >= 200 && request.status < 300
      ? resolve()
      : reject(new Error("Object storage upload returned HTTP " + request.status));
    request.onerror = () => reject(new Error("Object storage upload failed; retrying through the API."));
    request.ontimeout = () => reject(new Error("Object storage upload timed out; retrying through the API."));
    request.send(file);
  });
}

async function multipartFallback(file: File, token: string | null, groupId?: number, onProgress?: (percent: number) => void): Promise<UploadResult> {
  const request = new XMLHttpRequest();
  const form = new FormData();
  form.append("file", file, file.name);
  const result = await new Promise<UploadResult>((resolve, reject) => {
    request.open("POST", getApiUrl(mediaPath(groupId)));
    if (token) request.setRequestHeader("Authorization", "Bearer " + token);
    request.upload.onprogress = event => {
      if (event.lengthComputable) onProgress?.(Math.round(event.loaded / event.total * 100));
    };
    request.onload = () => {
      let payload: UploadResult & { error?: string } = { mediaUrl: "" };
      try { payload = JSON.parse(request.responseText) as UploadResult & { error?: string }; } catch { /* handled below */ }
      if (request.status >= 200 && request.status < 300 && payload.mediaUrl) resolve(payload);
      else reject(new Error(payload.error || "Media upload failed (" + request.status + ")."));
    };
    request.onerror = () => reject(new Error("Media upload failed. Check your connection and retry."));
    request.ontimeout = () => reject(new Error("Media upload timed out. Retry when your connection is stable."));
    request.send(form);
  });
  return result;
}

/**
 * Prefer a one-time, route-bound presigned object upload. Fall back to the
 * established multipart API route when object storage/CORS is unavailable,
 * preserving the current workflow until the bucket is configured correctly.
 */
export async function uploadLessonMedia(
  file: File,
  token: string | null,
  options: { groupId?: number; onProgress?: (percent: number) => void } = {},
): Promise<UploadResult> {
  const auth: Record<string, string> = token ? { Authorization: "Bearer " + token } : {};
  let ticket: DirectTicket | null = null;

  try {
    const response = await fetch(getApiUrl(mediaPath(options.groupId, "/direct-upload-ticket")), {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ mimeType: file.type, size: file.size }),
    });
    if (response.status === 401 || response.status === 403 || response.status === 400) {
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error("AUTHORIZATION: " + (payload?.error || "You are not authorized to upload this media."));
    }
    if (!response.ok) return await multipartFallback(file, token, options.groupId, options.onProgress);
    ticket = await response.json() as DirectTicket;
    if (!ticket.ticket || !ticket.uploadUrl || ticket.method !== "PUT") {
      return await multipartFallback(file, token, options.groupId, options.onProgress);
    }
  } catch (error) {
    if (error instanceof Error && /^AUTHORIZATION:/i.test(error.message)) throw error;
    return await multipartFallback(file, token, options.groupId, options.onProgress);
  }

  try {
    await xhrUpload(ticket.uploadUrl, file, ticket.headers || {}, options.onProgress);
    const completed = await fetch(getApiUrl(mediaPath(options.groupId, "/direct-upload-complete")), {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ ticket: ticket.ticket, mimeType: file.type }),
    });
    if (completed.status === 401 || completed.status === 403) {
      const payload = await completed.json().catch(() => null) as { error?: string } | null;
      throw new Error("AUTHORIZATION: " + (payload?.error || "You are not authorized to complete this upload."));
    }
    if (!completed.ok) return await multipartFallback(file, token, options.groupId, options.onProgress);
    const result = await completed.json() as UploadResult;
    if (!result.mediaUrl) return await multipartFallback(file, token, options.groupId, options.onProgress);
    options.onProgress?.(100);
    return result;
  } catch (error) {
    // Remove an uploaded-but-unpublished object before falling back to the
    // existing API upload path. If deletion is temporarily unavailable, the
    // server's expiry sweeper retains and retries the cleanup.
    if (ticket) {
      await fetch(getApiUrl(mediaPath(options.groupId, "/direct-upload-abort")), {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ ticket: ticket.ticket, mimeType: file.type }),
      }).catch(() => undefined);
    }
    if (error instanceof Error && /^AUTHORIZATION:/i.test(error.message)) throw error;
    return await multipartFallback(file, token, options.groupId, options.onProgress);
  }
}


/** Upload through a route-specific, one-time ticket while preserving the existing
 * multipart route as the compatibility path when object storage is unavailable. */
export async function uploadRouteMedia<T extends Record<string, unknown>>(
  file: File,
  token: string | null,
  endpoint: string,
  fields: Record<string, string> = {},
): Promise<T> {
  const auth: Record<string, string> = token ? { Authorization: "Bearer " + token } : {};
  const ticketUrl = endpoint.replace(/\/$/, "") + "/direct-upload-ticket";
  const completeUrl = endpoint.replace(/\/$/, "") + "/direct-upload-complete";
  const abortUrl = endpoint.replace(/\/$/, "") + "/direct-upload-abort";
  const fallback = async (): Promise<T> => {
    const form = new FormData();
    form.append("file", file, file.name);
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    const response = await fetch(getApiUrl(endpoint), { method: "POST", headers: auth, body: form });
    const payload = await response.json().catch(() => ({})) as T & { error?: string };
    if (!response.ok) throw new Error(payload.error || "Media upload failed (" + response.status + ").");
    return payload;
  };
  let ticket: DirectTicket | null = null;
  try {
    const response = await fetch(getApiUrl(ticketUrl), {
      method: "POST", headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ ...fields, mimeType: file.type, size: file.size }),
    });
    if (response.status === 401 || response.status === 403 || response.status === 400) {
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error("AUTHORIZATION: " + (payload?.error || "You are not authorized to upload this media."));
    }
    if (!response.ok) return await fallback();
    ticket = await response.json() as DirectTicket;
    if (!ticket.ticket || !ticket.uploadUrl || ticket.method !== "PUT") return await fallback();
    await xhrUpload(ticket.uploadUrl, file, ticket.headers || {});
    const completed = await fetch(getApiUrl(completeUrl), {
      method: "POST", headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ ...fields, ticket: ticket.ticket, mimeType: file.type }),
    });
    if (completed.status === 401 || completed.status === 403) {
      const payload = await completed.json().catch(() => null) as { error?: string } | null;
      throw new Error("AUTHORIZATION: " + (payload?.error || "You are not authorized to complete this upload."));
    }
    if (!completed.ok) throw new Error("Direct upload verification failed.");
    return await completed.json() as T;
  } catch (error) {
    if (ticket) await fetch(getApiUrl(abortUrl), {
      method: "POST", headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ ...fields, ticket: ticket.ticket, mimeType: file.type }),
    }).catch(() => undefined);
    if (error instanceof Error && /^AUTHORIZATION:/i.test(error.message)) throw error;
    return await fallback();
  }
}
