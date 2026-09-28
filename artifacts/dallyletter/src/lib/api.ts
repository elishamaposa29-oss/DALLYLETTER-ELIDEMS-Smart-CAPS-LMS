import { getApiUrl } from "@workspace/api-client-react";

export async function authenticatedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = localStorage.getItem("dallyletter_token");
  if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(getApiUrl(path), { ...init, headers });
}

export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await authenticatedFetch(path, init);
  const payload = await response.json().catch(() => null) as { error?: string } | T | null;
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
      ? payload.error
      : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return payload as T;
}
