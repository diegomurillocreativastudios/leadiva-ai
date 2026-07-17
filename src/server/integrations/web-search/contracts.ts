export type WebSearchRequest = {
  query: string;
  language?: "es" | "en";
  country?: string;
  page?: number;
  resultsPerPage: number;
  publishedAfter?: string | null;
  publishedBefore?: string | null;
  timeoutMs: number;
};

export type WebSearchResult = {
  title: string;
  url: string;
  snippet: string | null;
  domain: string;
  publishedAt: string | null;
  query: string;
  queryFamily: string;
  rank: number;
  provider: string;
};

export type WebSearchResponse = {
  results: WebSearchResult[];
  provider: string;
  requestCount: number;
  retryCount: number;
  durationMs: number;
  exhausted: boolean;
};

export interface WebSearchProvider {
  readonly name: string;
  isConfigured?(): boolean;
  search(
    request: WebSearchRequest,
    context?: {
      signal?: AbortSignal;
      executionId?: string;
      queryFamily?: string;
    },
  ): Promise<WebSearchResponse>;
}

export const WEB_SEARCH_ERROR_CODES = [
  "PROVIDER_NOT_CONFIGURED",
  "PROVIDER_UNAUTHORIZED",
  "PROVIDER_RATE_LIMITED",
  "PROVIDER_TIMEOUT",
  "PROVIDER_BAD_RESPONSE",
  "PROVIDER_REQUEST_FAILED",
  "PROVIDER_EXHAUSTED",
] as const;

export type WebSearchErrorCode = (typeof WEB_SEARCH_ERROR_CODES)[number];

export class WebSearchProviderError extends Error {
  constructor(
    public readonly code: WebSearchErrorCode,
    message: string,
    public readonly options: {
      status?: number;
      retryable?: boolean;
      attempts?: number;
    } = {},
  ) {
    super(message);
    this.name = "WebSearchProviderError";
  }
}
