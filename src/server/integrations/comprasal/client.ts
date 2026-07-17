import "server-only";

import { getServerEnv } from "@/env/server";
import {
  parseComprasalListResponse,
  type ComprasalPageResult,
} from "./parse-response";
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

async function sleep(ms: number) {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": USER_AGENT,
        },
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });

      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        const error = new ComprasalClientError(
          `COMPRASAL HTTP ${response.status}`,
          response.status,
          retryable,
        );
        if (!retryable || attempt === maxRetries) {
          throw error;
        }
        lastError = error;
        await sleep(400 * 2 ** attempt);
        continue;
      }

      const json: unknown = await response.json();
      return parseComprasalListResponse(json, page, perPage);
    } catch (error) {
      const retryable =
        error instanceof ComprasalClientError
          ? error.retryable
          : error instanceof Error &&
            (error.name === "TimeoutError" ||
              error.name === "AbortError" ||
              /fetch failed|network/i.test(error.message));

      lastError = error instanceof Error ? error : new Error("Unknown error");

      if (!retryable || attempt === maxRetries) {
        throw lastError;
      }

      await sleep(400 * 2 ** attempt);
    }
  }

  throw lastError ?? new ComprasalClientError("COMPRASAL request failed");
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
