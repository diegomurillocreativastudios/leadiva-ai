import "server-only";

import { z } from "zod";

import {
  WebSearchProviderError,
  type WebSearchProvider,
  type WebSearchRequest,
  type WebSearchResponse,
  type WebSearchResult,
} from "./contracts";

const BRAVE_WEB_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";

const braveResponseSchema = z
  .object({
    query: z
      .object({ more_results_available: z.boolean().optional() })
      .passthrough()
      .optional(),
    web: z
      .object({
        results: z
          .array(
            z
              .object({
                title: z.string().optional(),
                url: z.string().optional(),
                description: z.string().optional(),
                page_age: z.string().optional(),
              })
              .passthrough(),
          )
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

type BraveSearchProviderOptions = {
  apiKey?: string;
  maxRetries: number;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
  randomImpl?: () => number;
};

function cleanText(value: string | undefined): string | null {
  const cleaned = value
    ?.replace(/<[^>]+>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || null;
}

function normalizePublishedAt(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function retryDelayMs(
  headers: Headers,
  attempt: number,
  random: () => number,
): number {
  const retryAfter = headers.get("retry-after")?.trim();
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(30_000, seconds * 1_000);
    }
    const date = new Date(retryAfter);
    if (!Number.isNaN(date.getTime())) {
      return Math.min(30_000, Math.max(0, date.getTime() - Date.now()));
    }
  }

  const reset = headers.get("x-ratelimit-reset")?.split(",")[0]?.trim();
  const resetSeconds = Number(reset);
  if (Number.isFinite(resetSeconds) && resetSeconds > 0) {
    return Math.min(30_000, resetSeconds * 1_000);
  }

  return Math.min(30_000, 250 * 2 ** attempt + Math.floor(random() * 100));
}

function providerHttpError(status: number, attempts: number): WebSearchProviderError {
  if (status === 401 || status === 403) {
    return new WebSearchProviderError(
      "PROVIDER_UNAUTHORIZED",
      "Brave Search rechazó las credenciales",
      { status, retryable: false, attempts },
    );
  }
  if (status === 429) {
    return new WebSearchProviderError(
      "PROVIDER_RATE_LIMITED",
      "Brave Search agotó temporalmente el límite de solicitudes",
      { status, retryable: true, attempts },
    );
  }
  if (status >= 500) {
    return new WebSearchProviderError(
      "PROVIDER_REQUEST_FAILED",
      `Brave Search respondió HTTP ${status}`,
      { status, retryable: true, attempts },
    );
  }
  return new WebSearchProviderError(
    "PROVIDER_BAD_RESPONSE",
    `Brave Search rechazó la solicitud con HTTP ${status}`,
    { status, retryable: false, attempts },
  );
}

export class BraveSearchProvider implements WebSearchProvider {
  readonly name = "BRAVE";
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleepImpl: (ms: number) => Promise<void>;
  private readonly randomImpl: () => number;

  constructor(private readonly options: BraveSearchProviderOptions) {
    this.apiKey = options.apiKey?.trim() ?? "";
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleepImpl =
      options.sleepImpl ??
      ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.randomImpl = options.randomImpl ?? Math.random;
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  async search(
    request: WebSearchRequest,
    context: {
      signal?: AbortSignal;
      executionId?: string;
      queryFamily?: string;
    } = {},
  ): Promise<WebSearchResponse> {
    if (!this.apiKey) {
      throw new WebSearchProviderError(
        "PROVIDER_NOT_CONFIGURED",
        "BRAVE_SEARCH_API_KEY no está configurada",
        { retryable: false, attempts: 0 },
      );
    }

    const startedAt = Date.now();
    const url = new URL(BRAVE_WEB_SEARCH_URL);
    url.searchParams.set("q", request.query);
    url.searchParams.set("count", String(Math.min(20, request.resultsPerPage)));
    url.searchParams.set("offset", String(Math.max(0, (request.page ?? 1) - 1)));
    url.searchParams.set("safesearch", "moderate");
    url.searchParams.set("spellcheck", "false");
    if (request.language) {
      url.searchParams.set("search_lang", request.language);
    }
    if (request.country?.trim()) {
      url.searchParams.set("country", request.country.trim().toUpperCase());
    }
    if (request.publishedAfter && request.publishedBefore) {
      url.searchParams.set(
        "freshness",
        `${request.publishedAfter.slice(0, 10)}to${request.publishedBefore.slice(0, 10)}`,
      );
    }

    let attempts = 0;
    for (let attempt = 0; attempt <= this.options.maxRetries; attempt += 1) {
      attempts += 1;
      const controller = new AbortController();
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, request.timeoutMs || this.options.timeoutMs);
      const onAbort = () => controller.abort();
      context.signal?.addEventListener("abort", onAbort, { once: true });

      try {
        const response = await this.fetchImpl(url, {
          method: "GET",
          headers: {
            Accept: "application/json",
            "Accept-Encoding": "gzip",
            "X-Subscription-Token": this.apiKey,
          },
          signal: controller.signal,
          cache: "no-store",
        });

        if (!response.ok) {
          const error = providerHttpError(response.status, attempts);
          const shouldRetry =
            error.options.retryable === true &&
            attempt < this.options.maxRetries;
          if (!shouldRetry) {
            throw error;
          }
          const delayMs = retryDelayMs(
            response.headers,
            attempt,
            this.randomImpl,
          );
          console.warn("web_search_provider_retry", {
            provider: this.name,
            executionId: context.executionId,
            queryFamily: context.queryFamily,
            status: response.status,
            attempt: attempt + 1,
            delayMs,
          });
          await this.sleepImpl(delayMs);
          continue;
        }

        let json: unknown;
        try {
          json = await response.json();
        } catch {
          throw new WebSearchProviderError(
            "PROVIDER_BAD_RESPONSE",
            "Brave Search devolvió una respuesta que no es JSON",
            { status: response.status, retryable: false, attempts },
          );
        }
        const parsed = braveResponseSchema.safeParse(json);
        if (!parsed.success) {
          throw new WebSearchProviderError(
            "PROVIDER_BAD_RESPONSE",
            "Brave Search devolvió un JSON con estructura no reconocida",
            { status: response.status, retryable: false, attempts },
          );
        }

        const queryFamily = context.queryFamily ?? "unknown";
        const results: WebSearchResult[] = [];
        for (const [index, item] of (parsed.data.web?.results ?? []).entries()) {
          const title = cleanText(item.title);
          if (!title || !item.url) {
            continue;
          }
          let parsedUrl: URL;
          try {
            parsedUrl = new URL(item.url);
            if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
              continue;
            }
          } catch {
            continue;
          }
          results.push({
            title: title.slice(0, 500),
            url: parsedUrl.toString(),
            snippet: cleanText(item.description)?.slice(0, 2_000) ?? null,
            domain: parsedUrl.hostname.toLowerCase(),
            publishedAt: normalizePublishedAt(item.page_age),
            query: request.query,
            queryFamily,
            rank:
              ((Math.max(1, request.page ?? 1) - 1) *
                Math.min(20, request.resultsPerPage)) +
              index +
              1,
            provider: this.name,
          });
        }

        return {
          results,
          provider: this.name,
          requestCount: attempts,
          retryCount: attempts - 1,
          durationMs: Date.now() - startedAt,
          exhausted:
            parsed.data.query?.more_results_available !== true ||
            results.length < Math.min(20, request.resultsPerPage),
        };
      } catch (error) {
        if (error instanceof WebSearchProviderError) {
          throw error;
        }
        if (timedOut) {
          throw new WebSearchProviderError(
            "PROVIDER_TIMEOUT",
            "Brave Search excedió el tiempo máximo",
            { retryable: false, attempts },
          );
        }
        if (context.signal?.aborted) {
          throw new WebSearchProviderError(
            "PROVIDER_REQUEST_FAILED",
            "La búsqueda fue cancelada",
            { retryable: false, attempts },
          );
        }
        throw new WebSearchProviderError(
          "PROVIDER_REQUEST_FAILED",
          "No se pudo contactar Brave Search",
          { retryable: false, attempts },
        );
      } finally {
        clearTimeout(timeout);
        context.signal?.removeEventListener("abort", onAbort);
      }
    }

    throw new WebSearchProviderError(
      "PROVIDER_EXHAUSTED",
      "Brave Search agotó los reintentos",
      { retryable: false, attempts },
    );
  }
}
