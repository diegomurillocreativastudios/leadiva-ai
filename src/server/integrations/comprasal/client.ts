import "server-only";

import { getServerEnv } from "@/env/server";
import {
  parseComprasalListResponse,
  type ComprasalPageResult,
} from "./parse-response";
import {
  parseComprasalAvailableResponse,
  type ComprasalAvailablePage,
} from "./available-schemas";
import type { ComprasalProcess } from "./schemas";

export type { ComprasalPageResult } from "./parse-response";
export { parseComprasalListResponse } from "./parse-response";

const USER_AGENT =
  "Mozilla/5.0 (compatible; LeadivaBot/0.1; +https://creativastudios.us)";

export class ComprasalClientError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "ComprasalClientError";
  }
}

export type ComprasalAwardReportClientErrorCode =
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "UPSTREAM"
  | "TIMEOUT"
  | "NETWORK"
  | "INVALID_CONTENT_TYPE"
  | "RESPONSE_TOO_LARGE"
  | "INVALID_JSON";

export class ComprasalAwardReportClientError extends Error {
  constructor(
    public readonly code: ComprasalAwardReportClientErrorCode,
    public readonly status?: number,
    public readonly retryable = false,
  ) {
    super("COMPRASAL award report request failed");
    this.name = "ComprasalAwardReportClientError";
  }
}

const COMPRASAL_AWARD_REPORT_MAX_RESPONSE_BYTES = 1_000_000;
const MAX_RETRY_AFTER_MS = 30_000;

async function sleep(ms: number) {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function retryAfterMs(headers: Headers, now = Date.now()): number | null {
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

async function readBoundedResponseText(
  response: Response,
  maxBytes: number,
): Promise<string> {
  const contentLength = response.headers.get("content-length")?.trim();
  if (
    contentLength &&
    /^\d+$/.test(contentLength) &&
    Number(contentLength) > maxBytes
  ) {
    throw new ComprasalAwardReportClientError("RESPONSE_TOO_LARGE");
  }

  if (!response.body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      throw new ComprasalAwardReportClientError("RESPONSE_TOO_LARGE");
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
        throw new ComprasalAwardReportClientError("RESPONSE_TOO_LARGE");
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

export type FetchComprasalAwardReportOptions = {
  timeoutMs?: number;
  maxRetries?: number;
  maxResponseBytes?: number;
  fetchImpl?: typeof fetch;
  wait?: (ms: number) => Promise<void>;
};

/** Fetches one award report without accepting an externally supplied URL. */
export async function fetchComprasalAwardReport(
  processId: number,
  options: FetchComprasalAwardReportOptions = {},
): Promise<unknown> {
  if (!Number.isSafeInteger(processId) || processId <= 0) {
    throw new ComprasalAwardReportClientError("UPSTREAM");
  }

  const env = getServerEnv();
  const timeoutMs = options.timeoutMs ?? env.COMPRASAL_REQUEST_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? env.COMPRASAL_MAX_RETRIES;
  const maxBytes =
    options.maxResponseBytes ?? COMPRASAL_AWARD_REPORT_MAX_RESPONSE_BYTES;
  const fetchImpl = options.fetchImpl ?? fetch;
  const wait = options.wait ?? sleep;
  const url = new URL(
    `${env.COMPRASAL_BASE_URL}/publico/obtener/informe-adjudicacion/${processId}`,
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
      const clientError = new ComprasalAwardReportClientError(
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
        throw new ComprasalAwardReportClientError("NOT_FOUND", 404);
      }
      const retryable = response.status === 429 || response.status >= 500;
      const code = response.status === 429 ? "RATE_LIMITED" : "UPSTREAM";
      const clientError = new ComprasalAwardReportClientError(
        code,
        response.status,
        retryable,
      );
      if (!retryable || attempt === maxRetries) throw clientError;
      await wait(retryAfterMs(response.headers) ?? 400 * 2 ** attempt);
      continue;
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (
      !contentType.includes("application/json") &&
      !contentType.includes("+json")
    ) {
      throw new ComprasalAwardReportClientError("INVALID_CONTENT_TYPE");
    }

    const text = await readBoundedResponseText(response, maxBytes);
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new ComprasalAwardReportClientError("INVALID_JSON");
    }
  }

  throw new ComprasalAwardReportClientError("UPSTREAM");
}

async function fetchComprasalJson(params: {
  url: URL;
  timeoutMs: number;
  maxRetries: number;
  signal?: AbortSignal;
  onRetry?: () => void;
}): Promise<{ json: unknown; headers: Headers }> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= params.maxRetries; attempt += 1) {
    if (attempt > 0) params.onRetry?.();
    try {
      const response = await fetch(params.url, {
        method: "GET",
        headers: { Accept: "application/json", "User-Agent": USER_AGENT },
        signal: params.signal
          ? AbortSignal.any([
              params.signal,
              AbortSignal.timeout(params.timeoutMs),
            ])
          : AbortSignal.timeout(params.timeoutMs),
        cache: "no-store",
      });
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        const error = new ComprasalClientError(
          `COMPRASAL HTTP ${response.status}`,
          response.status,
          retryable,
        );
        if (!retryable || attempt === params.maxRetries) throw error;
        lastError = error;
        await sleep(400 * 2 ** attempt);
        continue;
      }
      return { json: (await response.json()) as unknown, headers: response.headers };
    } catch (error) {
      const retryable =
        !params.signal?.aborted &&
        (error instanceof ComprasalClientError
          ? error.retryable
          : error instanceof Error &&
            (error.name === "TimeoutError" ||
              error.name === "AbortError" ||
              /fetch failed|network/i.test(error.message)));
      lastError = error instanceof Error ? error : new Error("Unknown error");
      if (!retryable || attempt === params.maxRetries) throw lastError;
      await sleep(400 * 2 ** attempt);
    }
  }
  throw lastError ?? new ComprasalClientError("COMPRASAL request failed");
}

export async function fetchComprasalPage(options?: {
  page?: number;
  perPage?: number;
  idInstitucion?: number;
  timeoutMs?: number;
  maxRetries?: number;
}): Promise<ComprasalPageResult> {
  const env = getServerEnv();
  const page = options?.page ?? 1;
  const perPage = options?.perPage ?? 50;
  const timeoutMs = options?.timeoutMs ?? env.COMPRASAL_REQUEST_TIMEOUT_MS;
  const maxRetries = options?.maxRetries ?? env.COMPRASAL_MAX_RETRIES;

  const url = new URL(
    `${env.COMPRASAL_BASE_URL}/publico/obtener/procesos/publicos`,
  );
  url.searchParams.set("pagination", "true");
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(perPage));
  if (options?.idInstitucion) {
    url.searchParams.set("id_institucion", String(options.idInstitucion));
  }

  const response = await fetchComprasalJson({ url, timeoutMs, maxRetries });
  return parseComprasalListResponse(response.json, page, perPage);
}

export async function fetchComprasalAvailablePage(options: {
  page: number;
  perPage: number;
  timeoutMs?: number;
  maxRetries?: number;
  signal?: AbortSignal;
  onRetry?: () => void;
}): Promise<ComprasalAvailablePage> {
  const env = getServerEnv();
  const url = new URL(
    `${env.COMPRASAL_BASE_URL}/publico/obtener/procesos/disponibles`,
  );
  url.searchParams.set("page", String(options.page));
  url.searchParams.set("per_page", String(options.perPage));
  const response = await fetchComprasalJson({
    url,
    timeoutMs: options.timeoutMs ?? env.COMPRASAL_REQUEST_TIMEOUT_MS,
    maxRetries: options.maxRetries ?? env.COMPRASAL_MAX_RETRIES,
    signal: options.signal,
    onRetry: options.onRetry,
  });
  return parseComprasalAvailableResponse(response.json, response.headers);
}

/** @deprecated prefer fetchComprasalPage */
export async function fetchComprasalProcesses(options?: {
  page?: number;
  perPage?: number;
  idInstitucion?: number;
}): Promise<ComprasalProcess[]> {
  const page = await fetchComprasalPage(options);
  return page.items;
}
