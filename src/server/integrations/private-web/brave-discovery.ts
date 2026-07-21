import { normalizeUrl } from "@/lib/normalization";
import {
  WebSearchProviderError,
  type WebSearchProvider,
  type WebSearchResult,
} from "@/server/integrations/web-search/contracts";
import { evaluateBraveResult } from "./domain-policy";
import {
  evaluatePrivateWebPreliminaryResult,
  type PrivateWebAgeBucket,
} from "./preliminary-scoring";
import {
  planPrivateWebQueries,
  shouldRunAdaptivePrivateWebStage,
  type PrivateWebQueryFamily,
} from "./query-planner";

export type DiscoveredPrivateWebResult = WebSearchResult & {
  normalizedUrl: string;
  retrievalScore: number;
  qualified: boolean;
  preliminaryPositiveSignals: string[];
  preliminaryNegativeSignals: string[];
  ageBucket: PrivateWebAgeBucket;
  freshnessFactor: number;
  inferredDate: string | null;
  inferredDateSource: string | null;
  deadlineExpiredVisible: boolean;
  discoveredByQueries: string[];
  discoveredByFamilies: string[];
};

export type PrivateWebBraveDiscoveryMetrics = {
  plannerVersion: string;
  familiesPlanned: string[];
  familyQueries: Record<string, string>;
  familiesExecuted: string[];
  baseRequests: number;
  paginationRequests: number;
  retries: number;
  totalRequests: number;
  queryAltered: string[];
  yieldByFamily: Record<string, number>;
  qualifiedYieldByFamily: Record<string, number>;
  qualifiedYieldScoreByFamily: Record<string, number>;
  qualifiedYield: number;
  providerResults: number;
  urlsBeforeDedupe: number;
  urlsAfterDedupe: number;
  canonicalDedupe: number;
  rejectedByReason: Record<string, number>;
  durationMs: number;
  terminationCause: string;
  limitsReached: string[];
};

export type PrivateWebBraveDiscoveryResult = {
  results: DiscoveredPrivateWebResult[];
  metrics: PrivateWebBraveDiscoveryMetrics;
  partial: boolean;
  fatalError: string | null;
};

function increment(record: Record<string, number>, key: string, by = 1) {
  record[key] = (record[key] ?? 0) + by;
}

function combineResults(
  results: WebSearchResult[],
  maxUniqueUrls: number,
  query: string,
  now: Date,
) {
  const byUrl = new Map<string, DiscoveredPrivateWebResult>();
  let duplicates = 0;
  for (const result of results) {
    const policy = evaluateBraveResult(result);
    if (!policy.allowed) continue;
    const normalizedUrl = normalizeUrl(result.url);
    const preliminary = evaluatePrivateWebPreliminaryResult({ result, query, now });
    const existing = byUrl.get(normalizedUrl);
    if (existing) {
      duplicates += 1;
      existing.discoveredByQueries = [
        ...new Set([...existing.discoveredByQueries, result.query]),
      ];
      existing.discoveredByFamilies = [
        ...new Set([...existing.discoveredByFamilies, result.queryFamily]),
      ];
      existing.extraSnippets = [
        ...new Set([
          ...(existing.extraSnippets ?? []),
          ...(result.extraSnippets ?? []),
        ]),
      ].slice(0, 5);
      if (preliminary.score > existing.retrievalScore) {
        existing.retrievalScore = preliminary.score;
        existing.qualified = preliminary.qualified;
        existing.preliminaryPositiveSignals = preliminary.positiveSignals;
        existing.preliminaryNegativeSignals = preliminary.negativeSignals;
        existing.ageBucket = preliminary.ageBucket;
        existing.freshnessFactor = preliminary.freshnessFactor;
        existing.inferredDate = preliminary.inferredDate;
        existing.inferredDateSource = preliminary.inferredDateSource;
        existing.deadlineExpiredVisible = preliminary.deadlineExpiredVisible;
      }
      continue;
    }
    if (byUrl.size >= maxUniqueUrls) break;
    byUrl.set(normalizedUrl, {
      ...result,
      normalizedUrl,
      retrievalScore: preliminary.score,
      qualified: preliminary.qualified,
      preliminaryPositiveSignals: preliminary.positiveSignals,
      preliminaryNegativeSignals: preliminary.negativeSignals,
      ageBucket: preliminary.ageBucket,
      freshnessFactor: preliminary.freshnessFactor,
      inferredDate: preliminary.inferredDate,
      inferredDateSource: preliminary.inferredDateSource,
      deadlineExpiredVisible: preliminary.deadlineExpiredVisible,
      discoveredByQueries: [result.query],
      discoveredByFamilies: [result.queryFamily],
    });
  }
  return { results: [...byUrl.values()], duplicates };
}

export async function discoverPrivateWebWithBrave(input: {
  provider: WebSearchProvider;
  executionId: string;
  query: string;
  maxRequests: number;
  maxProviderResults: number;
  maxUniqueUrls: number;
  timeoutMs: number;
  requestTimeoutMs: number;
  now?: Date;
}): Promise<PrivateWebBraveDiscoveryResult> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const totalTimer = setTimeout(() => controller.abort(), input.timeoutMs);
  const plan = planPrivateWebQueries(input.query);
  const now = input.now ?? new Date();
  const rawResults: WebSearchResult[] = [];
  const executed: PrivateWebQueryFamily[] = [];
  const moreByFamily = new Map<string, boolean>();
  const yieldByFamily: Record<string, number> = {};
  const qualifiedYieldByFamily: Record<string, number> = {};
  const qualifiedYieldScoreByFamily: Record<string, number> = {};
  const rejectedByReason: Record<string, number> = {};
  const altered: string[] = [];
  const limitsReached: string[] = [];
  let requestCount = 0;
  let retryCount = 0;
  let baseRequests = 0;
  let paginationRequests = 0;
  let partial = false;
  let fatalError: string | null = null;
  let terminationCause = "COMPLETED";
  let successfulResponses = 0;

  const execute = async (family: PrivateWebQueryFamily, page: 1 | 2) => {
    if (requestCount >= input.maxRequests || controller.signal.aborted) return false;
    try {
      const response = await input.provider.search(
        {
          query: family.query,
          language: "es",
          page,
          resultsPerPage: 20,
          freshness: family.freshness,
          timeoutMs: input.requestTimeoutMs,
        },
        {
          executionId: input.executionId,
          queryFamily: family.id,
          signal: controller.signal,
          maxAttempts: input.maxRequests - requestCount,
        },
      );
      requestCount += response.requestCount;
      successfulResponses += 1;
      retryCount += response.retryCount;
      if (page === 1) baseRequests += response.requestCount;
      else paginationRequests += response.requestCount;
      if (response.queryAltered) altered.push(response.queryAltered.slice(0, 400));
      moreByFamily.set(family.id, response.moreResultsAvailable === true);
      const allowed = response.results.filter((result) => {
        const policy = evaluateBraveResult(result);
        if (!policy.allowed) increment(rejectedByReason, policy.reason);
        return policy.allowed;
      });
      increment(yieldByFamily, family.id, allowed.length);
      const qualified = allowed
        .map((result) =>
          evaluatePrivateWebPreliminaryResult({
            result,
            query: input.query,
            now,
          }),
        )
        .filter((classification) => classification.qualified);
      increment(qualifiedYieldByFamily, family.id, qualified.length);
      increment(
        qualifiedYieldScoreByFamily,
        family.id,
        qualified.reduce((sum, classification) => sum + classification.score, 0),
      );
      rawResults.push(...response.results);
      if (rawResults.length >= input.maxProviderResults) {
        rawResults.length = input.maxProviderResults;
        limitsReached.push("PRIVARESULTS");
        terminationCause = "RAW_RESULT_LIMIT";
      }
      return true;
    } catch (error) {
      const attempts =
        error instanceof WebSearchProviderError
          ? Math.max(1, error.options.attempts ?? 1)
          : 1;
      requestCount = Math.min(input.maxRequests, requestCount + attempts);
      retryCount += Math.max(0, attempts - 1);
      if (page === 1) baseRequests += attempts;
      else paginationRequests += attempts;
      partial = true;
      const code =
        error instanceof WebSearchProviderError
          ? error.code
          : "PROVIDER_REQUEST_FAILED";
      increment(rejectedByReason, code);
      if (
        code === "PROVIDER_NOT_CONFIGURED" ||
        code === "PROVIDER_UNAUTHORIZED"
      ) {
        fatalError = code;
        terminationCause = code;
      }
      return false;
    }
  };

  try {
    for (const family of plan.initial) {
      if (requestCount >= input.maxRequests || fatalError || terminationCause === "RAW_RESULT_LIMIT") break;
      executed.push(family);
      await execute(family, 1);
    }

    let combined = combineResults(
      rawResults,
      input.maxUniqueUrls,
      input.query,
      now,
    );
    if (
      !fatalError &&
      terminationCause !== "RAW_RESULT_LIMIT" &&
      shouldRunAdaptivePrivateWebStage({
        qualifiedYield: combined.results.filter((result) => result.qualified).length,
      })
    ) {
      for (const family of plan.adaptive) {
        if (requestCount >= input.maxRequests || fatalError) break;
        executed.push(family);
        await execute(family, 1);
      }
    }

    const bestFamilies = [...executed]
      .filter(
        (family) =>
          moreByFamily.get(family.id) === true &&
          (qualifiedYieldByFamily[family.id] ?? 0) > 0,
      )
      .sort(
        (left, right) =>
          (qualifiedYieldByFamily[right.id] ?? 0) -
            (qualifiedYieldByFamily[left.id] ?? 0) ||
          (qualifiedYieldScoreByFamily[right.id] ?? 0) -
            (qualifiedYieldScoreByFamily[left.id] ?? 0),
      )
      .slice(0, 2);
    for (const family of bestFamilies) {
      if (requestCount >= input.maxRequests || fatalError || terminationCause === "RAW_RESULT_LIMIT") break;
      await execute(family, 2);
    }

    combined = combineResults(
      rawResults,
      input.maxUniqueUrls,
      input.query,
      now,
    );
    if (successfulResponses === 0 && requestCount > 0) {
      fatalError = fatalError ?? "PROVIDER_REQUEST_FAILED";
      terminationCause = fatalError;
    }
    if (combined.results.length >= input.maxUniqueUrls) {
      limitsReached.push("PRIVATE_WEB_MAX_UNIQUE_URLS");
      terminationCause = "UNIQUE_URL_LIMIT";
    } else if (requestCount >= input.maxRequests) {
      limitsReached.push("PRIVATE_WEB_MAX_BRAVE_REQUESTS");
      terminationCause = "REQUEST_LIMIT";
    } else if (controller.signal.aborted) {
      limitsReached.push("PRIVATE_WEB_BRAVE_TIMEOUT_MS");
      terminationCause = "TIMEOUT";
      partial = true;
    } else if (partial && successfulResponses > 0) {
      terminationCause = "PARTIAL_PROVIDER_ERROR";
    }
    return {
      results: combined.results,
      partial,
      fatalError,
      metrics: {
        plannerVersion: plan.plannerVersion,
        familiesPlanned: [...plan.initial, ...plan.adaptive].map((family) => family.id),
        familyQueries: Object.fromEntries(
          [...plan.initial, ...plan.adaptive].map((family) => [
            family.id,
            family.query,
          ]),
        ),
        familiesExecuted: executed.map((family) => family.id),
        baseRequests,
        paginationRequests,
        retries: retryCount,
        totalRequests: requestCount,
        queryAltered: [...new Set(altered)],
        yieldByFamily,
        qualifiedYieldByFamily,
        qualifiedYieldScoreByFamily,
        qualifiedYield: combined.results.filter((result) => result.qualified).length,
        providerResults: rawResults.length,
        urlsBeforeDedupe: rawResults.length,
        urlsAfterDedupe: combined.results.length,
        canonicalDedupe: combined.duplicates,
        rejectedByReason,
        durationMs: Date.now() - startedAt,
        terminationCause,
        limitsReached: [...new Set(limitsReached)],
      },
    };
  } finally {
    clearTimeout(totalTimer);
  }
}

export function selectPrivateWebDocuments(input: {
  results: DiscoveredPrivateWebResult[];
  maxDocuments: number;
  maxPerDomain: number;
}): DiscoveredPrivateWebResult[] {
  const domainCounts = new Map<string, number>();
  return [...input.results]
    .sort(
      (left, right) =>
        right.retrievalScore - left.retrievalScore || left.rank - right.rank,
    )
    .filter((result) => {
      const count = domainCounts.get(result.domain) ?? 0;
      if (count >= input.maxPerDomain) return false;
      domainCounts.set(result.domain, count + 1);
      return true;
    })
    .slice(0, input.maxDocuments);
}
