export * from "./generated/api";
export * from "./generated/api.schemas";
export { setBaseUrl, setAuthTokenGetter, getApiUrl } from "./custom-fetch";
export type { AuthTokenGetter } from "./custom-fetch";

export { createProtectedMediaShareLink } from "./protected-media-share";
export type { CreateProtectedMediaShareLinkOptions, ProtectedMediaKind } from "./protected-media-share";
