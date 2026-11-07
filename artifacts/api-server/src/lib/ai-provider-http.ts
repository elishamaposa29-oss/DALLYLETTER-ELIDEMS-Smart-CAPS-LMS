export type AIProviderFailureCode =
  | "timeout"
  | "network_error"
  | "rate_limited"
  | "invalid_credentials"
  | "provider_unavailable"
  | "invalid_response"
  | "provider_rejected"
  | "configuration_unavailable";

export class AIProviderError extends Error {
  constructor(
    public readonly provider: string,
    public readonly code: AIProviderFailureCode,
    public readonly statusCode?: number,
  ) {
    super(code);
    this.name = "AIProviderError";
  }

  get retryable(): boolean {
    return ["timeout", "network_error", "rate_limited", "provider_unavailable"].includes(this.code);
  }
}

/** Provider responses are never copied into thrown messages or application logs. */
export async function requestProviderJson(
  provider: string,
  url: string,
  init: RequestInit,
): Promise<unknown> {
  const configuredTimeout = Number(process.env.AI_PROVIDER_TIMEOUT_MS || 20000);
  const timeoutMs = Number.isFinite(configuredTimeout)
    ? Math.min(60000, Math.max(1000, configuredTimeout))
    : 20000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetch(url, { ...init, signal: controller.signal });
    } catch {
      throw new AIProviderError(provider, controller.signal.aborted ? "timeout" : "network_error");
    }
    if (!response.ok) {
      const status = response.status;
      const code: AIProviderFailureCode = status === 401 || status === 403
        ? "invalid_credentials"
        : status === 429
          ? "rate_limited"
          : status >= 500
            ? "provider_unavailable"
            : "provider_rejected";
      throw new AIProviderError(provider, code, status);
    }
    try {
      return await response.json() as unknown;
    } catch {
      throw new AIProviderError(provider, "invalid_response", response.status);
    }
  } finally {
    clearTimeout(timeout);
  }
}

