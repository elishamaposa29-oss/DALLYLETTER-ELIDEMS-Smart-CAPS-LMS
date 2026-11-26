const PROTECTED_MEDIA_PATH = /^\/api\/(?:lessons|messages|assignments|exercises)\/media\//i;

export function requiresApiMediaAuth(url: string, apiBaseUrl: string): boolean {
  try {
    const api = new URL(apiBaseUrl);
    const target = new URL(url, apiBaseUrl);
    return target.origin === api.origin && PROTECTED_MEDIA_PATH.test(target.pathname);
  } catch {
    return false;
  }
}

export function getApiMediaAuthHeaders(url: string, token: string | null | undefined, apiBaseUrl: string): Record<string, string> {
  return token && requiresApiMediaAuth(url, apiBaseUrl) ? { Authorization: "Bearer " + token } : {};
}
