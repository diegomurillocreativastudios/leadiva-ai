import "server-only";

import { getServerEnv } from "@/env/server";

const USER_AGENT =
  "Mozilla/5.0 (compatible; LeadivaBot/0.1; +https://creativastudios.us)";
const PROCESS_DETAIL_MAX_RESPONSE_BYTES = 1_000_000;
const MAX_RETRY_AFTER_MS = 30_000;

export type ComprasalProcessDetailClientErrorCode =
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "UPSTREAM"
  | "TIMEOUT"
  | "NETWORK"
  | "INVALID_CONTENT_TYPE"
  | "RESPONSE_TOO_LARGE"
  | "INVALID_JSON";

export class ComprasalProcessDetailClientError extends Error {
  constructor(
    public readonly code: ComprasalProcessDetailClientErrorCode,
    public readonly status?: number,
    public readonly retryable = false,
  ) {
    super("COMPRASAL process detail request failed");
    this.name = "ComprasalProcessDetailClientError";
  }
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function readRetryAfter(headers: Headers, now = Date.now()): number | null {
  const value = headers.get("retry-after")?.trim();
  if (!value) return null;
  if (/^\d+$/.test(value)) {
    return Math.min(Number(value) * 1_000, MAX_RETRY_AFTER_MS);
  }
  const date = Date.parse(value);
  return Number.isNaN(date)
    ? null
    : Math.min(Math.max(0, date - now), MAX_RETRY_AFTER_MS);
}

async function readBoundedText(
  response: Response,
  maxBytes: number,
): Promise<string> {
  const contentLength = response.headers.get("content-length")?.trim();
  if (
    contentLength &&
    /^\d+$/.test(contentLength) &&
    Number(contentLength) > maxBytes
  ) {
    throw new ComprasalProcessDetailClientError("RESPONSE_TOO_LARGE");
  }

  if (!response.body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      throw new ComprasalProcessDetailClientError("RESPONSE_TOO_LARGE");
    }
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        throw new ComprasalProcessDetailClientError("RESPONSE_TOO_LARGE");
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

export type FetchComprasalProcessDetailOptions = {
  timeoutMs?: number;
  maxRetries?: number;
  maxResponseBytes?: number;
  fetchImpl?: typeof fetch;
  wait?: (ms: number) => Promise<void>;
};

/** Fetches process detail only from a trusted, server-derived process ID. */
export async function fetchComprasalProcessDetail(
  processId: number,
  options: FetchComprasalProcessDetailOptions = {},
): Promise<unknown> {
  if (!Number.isSafeInteger(processId) || processId <= 0) {
    throw new ComprasalProcessDetailClientError("UPSTREAM");
  }

  const env = getServerEnv();
  const timeoutMs = options.timeoutMs ?? env.COMPRASAL_REQUEST_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? env.COMPRASAL_MAX_RETRIES;
  const maxBytes =
    options.maxResponseBytes ?? PROCESS_DETAIL_MAX_RESPONSE_BYTES;
  const fetchImpl = options.fetchImpl ?? fetch;
  const wait = options.wait ?? sleep;
  const url = new URL(
    `${env.COMPRASAL_BASE_URL}/publico/obtener/detalle/procesos/publicos/${processId}`,
  );

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        headers: { Accept: "application/json", "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });
    } catch (error) {
      const isTimeout =
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError");
      const clientError = new ComprasalProcessDetailClientError(
        isTimeout ? "TIMEOUT" : "NETWORK",
        undefined,
        true,
      );
      if (attempt === maxRetries) throw clientError;
      await wait(400 * 2 ** attempt);
      continue;
    }

    if (!response.ok) {
      if (response.status === 404) {
        throw new ComprasalProcessDetailClientError("NOT_FOUND", 404);
      }
      const retryable = response.status === 429 || response.status >= 500;
      const error = new ComprasalProcessDetailClientError(
        response.status === 429 ? "RATE_LIMITED" : "UPSTREAM",
        response.status,
        retryable,
      );
      if (!retryable || attempt === maxRetries) throw error;
      await wait(readRetryAfter(response.headers) ?? 400 * 2 ** attempt);
      continue;
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (
      !contentType.includes("application/json") &&
      !contentType.includes("+json")
    ) {
      throw new ComprasalProcessDetailClientError("INVALID_CONTENT_TYPE");
    }

    const text = await readBoundedText(response, maxBytes);
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new ComprasalProcessDetailClientError("INVALID_JSON");
    }
  }

  throw new ComprasalProcessDetailClientError("UPSTREAM");
}
