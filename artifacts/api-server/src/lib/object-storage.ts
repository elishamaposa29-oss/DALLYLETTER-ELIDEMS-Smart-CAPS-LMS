import { createHash, createHmac } from "node:crypto";
import { createReadStream } from "node:fs";

export interface MediaObjectStorageProvider {
  readonly name: string;
  readonly supportsByteRanges: boolean;
  readonly supportsStreamingUpload: boolean;
  put(storageKey: string, mimeType: string, localPath: string): Promise<void>;
  get(storageKey: string, range?: string): Promise<Response | null>;
  delete(storageKey: string): Promise<void>;
}

export const s3CompatibleMediaProvider = {
  name: "s3-compatible",
  supportsByteRanges: true,
  supportsStreamingUpload: true,
  put: putObject,
  get: getObject,
  delete: deleteObject,
} satisfies MediaObjectStorageProvider;

type StorageConfig = {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
};

function config(): StorageConfig | null {
  const endpoint = process.env.MEDIA_S3_ENDPOINT?.trim();
  const bucket = process.env.MEDIA_S3_BUCKET?.trim();
  const accessKeyId = process.env.MEDIA_S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.MEDIA_S3_SECRET_ACCESS_KEY?.trim();
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return {
    endpoint: endpoint.replace(/\/$/, ""),
    bucket,
    accessKeyId,
    secretAccessKey,
    region: process.env.MEDIA_S3_REGION?.trim() || "auto",
  };
}

export function isObjectStorageConfigured(): boolean {
  return config() !== null;
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

function encodePath(value: string): string {
  return value.split("/").map(segment => encodeURIComponent(segment)).join("/");
}

function objectUrl(cfg: StorageConfig, key: string): URL {
  const url = new URL(cfg.endpoint);
  url.pathname = url.pathname.replace(/\/$/, "") + "/" + encodePath(cfg.bucket) + "/" + encodePath(key);
  return url;
}

function signRequest(
  cfg: StorageConfig,
  method: string,
  key: string,
  extraHeaders: Record<string, string> = {},
  payloadHash = "UNSIGNED-PAYLOAD",
): { url: URL; headers: Record<string, string> } {
  const url = objectUrl(cfg, key);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const shortDate = amzDate.slice(0, 8);
  const host = url.host;

  const headers: Record<string, string> = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...extraHeaders,
  };
  const canonicalHeaders = Object.entries(headers)
    .map(([name, value]) => [name.toLowerCase(), value.trim().replace(/\s+/g, " ")] as const)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => name + ":" + value + "\n")
    .join("");
  const signedHeaders = Object.keys(headers).map(name => name.toLowerCase()).sort().join(";");
  const canonicalRequest = [
    method,
    url.pathname || "/",
    url.search ? url.search.slice(1) : "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const scope = shortDate + "/" + cfg.region + "/s3/aws4_request";
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonicalRequest)].join("\n");
  const kDate = hmac("AWS4" + cfg.secretAccessKey, shortDate);
  const kRegion = hmac(kDate, cfg.region);
  const kService = hmac(kRegion, "s3");
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");

  return {
    url,
    headers: {
      ...headers,
      Authorization: "AWS4-HMAC-SHA256 " +
        `Credential=${cfg.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

export async function putObject(storageKey: string, mimeType: string, localPath: string): Promise<void> {
  const cfg = config();
  if (!cfg) return;
  // Hash and upload as streams so large lesson videos do not require a full-file Buffer in RAM.
  const payloadHash = await sha256File(localPath);
  const signed = signRequest(cfg, "PUT", `media/${storageKey}`, {
    "content-type": mimeType,
  }, payloadHash);
  const body = createReadStream(localPath);
  const response = await fetch(signed.url, {
    method: "PUT",
    headers: signed.headers,
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  if (!response.ok) throw new Error(`Object storage upload failed: HTTP ${response.status}`);
}

export async function getObject(storageKey: string, range?: string): Promise<Response | null> {
  const cfg = config();
  if (!cfg) return null;
  const signed = signRequest(cfg, "GET", `media/${storageKey}`, range ? { range } : {});
  const response = await fetch(signed.url, { method: "GET", headers: signed.headers });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Object storage read failed: HTTP ${response.status}`);
  return response;
}

export async function headObject(storageKey: string): Promise<{ size: number; mimeType: string | null } | null> {
  const cfg = config();
  if (!cfg) return null;
  const signed = signRequest(cfg, "HEAD", `media/${storageKey}`);
  const response = await fetch(signed.url, { method: "HEAD", headers: signed.headers });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Object storage metadata read failed: HTTP ${response.status}`);
  const rawSize = response.headers.get("content-length");
  const size = rawSize && /^\d+$/.test(rawSize) ? Number(rawSize) : NaN;
  if (!Number.isSafeInteger(size) || size < 0) throw new Error("Object storage returned invalid content length");
  return { size, mimeType: response.headers.get("content-type") };
}

export async function deleteObject(storageKey: string): Promise<void> {
  const cfg = config();
  if (!cfg) return;
  const signed = signRequest(cfg, "DELETE", `media/${storageKey}`, {}, sha256(""));
  const response = await fetch(signed.url, { method: "DELETE", headers: signed.headers });
  if (!response.ok && response.status !== 404) throw new Error(`Object storage delete failed: HTTP ${response.status}`);
}


export interface PresignedMediaRequest {
  url: string;
  method: "PUT" | "GET";
  headers: Record<string, string>;
  expiresAt: number;
}

function presignObject(
  cfg: StorageConfig,
  method: "PUT" | "GET",
  key: string,
  expiresInSeconds: number,
  contentType?: string,
): PresignedMediaRequest {
  if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > 900) {
    throw new Error("Presigned media URL expiry must be between 1 and 900 seconds");
  }
  const url = objectUrl(cfg, key);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const shortDate = amzDate.slice(0, 8);
  const scope = shortDate + "/" + cfg.region + "/s3/aws4_request";
  const signedHeaders = contentType && method === "PUT" ? "content-type;host" : "host";
  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": cfg.accessKeyId + "/" + scope,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresInSeconds),
    "X-Amz-SignedHeaders": signedHeaders,
  };
  const canonicalQuery = Object.entries(query)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v))
    .join("&");
  const canonicalHeaders = contentType && method === "PUT"
    ? "content-type:" + contentType.trim().replace(/\s+/g, " ") + "\nhost:" + url.host + "\n"
    : "host:" + url.host + "\n";
  const canonicalRequest = [method, url.pathname || "/", canonicalQuery, canonicalHeaders, signedHeaders, "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonicalRequest)].join("\n");
  const kDate = hmac("AWS4" + cfg.secretAccessKey, shortDate);
  const kRegion = hmac(kDate, cfg.region);
  const kService = hmac(kRegion, "s3");
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");
  url.search = canonicalQuery + "&X-Amz-Signature=" + signature;
  return {
    url: url.toString(),
    method,
    headers: contentType && method === "PUT" ? { "Content-Type": contentType } : {},
    expiresAt: Math.floor(now.getTime() / 1000) + expiresInSeconds,
  };
}

export function createPresignedMediaUpload(storageKey: string, mimeType: string, expiresInSeconds = 300): PresignedMediaRequest {
  const cfg = config();
  if (!cfg) throw new Error("S3-compatible media storage is not configured");
  return presignObject(cfg, "PUT", "media/" + storageKey, expiresInSeconds, mimeType);
}

export function createPresignedPrivateMediaRead(storageKey: string, expiresInSeconds = 120): PresignedMediaRequest {
  const cfg = config();
  if (!cfg) throw new Error("S3-compatible media storage is not configured");
  return presignObject(cfg, "GET", "media/" + storageKey, expiresInSeconds);
}
