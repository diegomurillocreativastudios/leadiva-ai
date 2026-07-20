import "server-only";

import { getServerEnv } from "@/env/server";
import { isVertexConfigured } from "@/server/integrations/vertex-ai/client";
import { BraveSearchProvider } from "@/server/integrations/web-search/brave-provider";
import type { WebSearchProvider } from "@/server/integrations/web-search/contracts";
import {
  fetchWebDocument,
  HostConcurrencyLimiter,
  type DocumentFetchResult,
  type FetchedDocument,
  type WebDocumentFetcherDeps,
} from "@/server/services/web-document-fetcher";

import {
  discoverPrivateWebWithBrave,
  selectPrivateWebDocuments,
  type DiscoveredPrivateWebResult,
  type PrivateWebBraveDiscoveryResult,
} from "./brave-discovery";
import type {
  PrivateWebCandidateRejection,
  VerifiedPrivateWebCandidate,
} from "./contracts";
import { extractPrivateOpportunityDeterministically } from "./deterministic-extractor";
import { evaluatePrivateWebSource, evaluatePrivateWebUrl } from "./domain-policy";
import {
  extractPrivateOpportunitiesWithGemini,
  type GeminiPrivateWebExtractionResult,
} from "./gemini-extractor";
import {
  databasePrivateWebRepository,
  type PrivateWebPersistenceOutcome,
  type PrivateWebRepository,
} from "./persistence";
import { verifyPrivateWebCandidate } from "./verification";

export type PrivateWebServiceConfig = {
  enabled: boolean;
  apiKey?: string;
  maxBraveRequests: number;
  maxProviderResults: number;
  maxUniqueUrls: number;
  maxDocumentFetches: number;
  maxGeminiExtractions: number;
  maxResults: number;
  maxPerDomain: number;
  maxConcurrentSearchesPerUser: number;
  maxSearchesPerHour: number;
  staleExecutionMinutes: number;
  queryMinCoverage: number;
  totalTimeoutMs: number;
  braveTimeoutMs: number;
  searchRequestTimeoutMs: number;
  searchMaxRetries: number;
  fetchConcurrency: number;
  fetchTimeoutMs: number;
  maxDocumentBytes: number;
  maxRedirects: number;
  maxRequestsPerHost: number;
  fetchUserAgent: string;
  robotsCacheTtlMs: number;
  maxRobotsBytes: number;
  maxPdfPages: number;
  maxGeminiOutputTokens: number;
  braveCostPerRequest: number;
};

export const PRIVATE_WEB_HARD_LIMITS = {
  braveRequests: 8,
  providerResults: 160,
  uniqueUrls: 60,
  documentFetches: 10,
  geminiExtractions: 6,
  results: 50,
  perDomain: 3,
  totalTimeoutMs: 180_000,
} as const;

export type PrivateWebSearchResult = {
  executionId: string;
  status: "COMPLETED" | "PARTIALLY_COMPLETED" | "FAILED";
  candidatesFound: number;
  candidatesVerified: number;
  candidatesPartiallyVerified: number;
  candidatesPersisted: number;
  errorCode?: "PRIVATE_WEB_DISABLED" | "BRAVE_NOT_CONFIGURED" | "BRAVE_FAILED" | "PIPELINE_FAILED";
  message?: string;
};

export class PrivateWebSearchAdmissionError extends Error {
  constructor(
    readonly code: "ACTIVE_SEARCH" | "RATE_LIMITED",
    readonly retryAfterSeconds: number,
  ) {
    super(code);
    this.name = "PrivateWebSearchAdmissionError";
  }
}

type GeminiExtractor = typeof extractPrivateOpportunitiesWithGemini;
type DeterministicExtractor = typeof extractPrivateOpportunityDeterministically;

export type PrivateWebServiceDependencies = {
  repository: PrivateWebRepository;
  provider: WebSearchProvider;
  fetchDocument: (
    url: string,
    deps: WebDocumentFetcherDeps,
  ) => Promise<DocumentFetchResult>;
  deterministicExtractor: DeterministicExtractor;
  geminiExtractor: GeminiExtractor;
  vertexConfigured: () => boolean;
  now: () => Date;
};

type CandidateTrace = {
  temporaryId: string;
  searchResultId?: string;
  title: string | null;
  organizationName: string | null;
  summary: string | null;
  officialSourceUrl: string | null;
  sourceDomain: string | null;
  publishedAt?: string | null;
  deadlineAt: string | null;
  estimatedAmount?: string | null;
  currency?: string | null;
  category: string | null;
  evidence?: Array<{ field: string; text: string; url: string; confirmed: boolean }>;
  stage: "FETCH" | "EXTRACTION" | "VERIFICATION" | "PERSISTENCE";
  outcome: "FILTERED" | "REJECTED" | "UNVERIFIED" | "CREATED" | "UPDATED" | "UNCHANGED" | "ERROR";
  reasonCode: string | null;
  reason: string | null;
  retrievalScore?: number;
  preliminaryScore?: number;
  verificationStatus?: string;
  discoveredByQueries: string[];
  discoveredByFamilies: string[];
};

function defaultConfig(): PrivateWebServiceConfig {
  const env = getServerEnv();
  return {
    enabled: env.PRIVATE_WEB_BRAVE_ENABLED,
    apiKey: env.BRAVE_API_KEY,
    maxBraveRequests: env.PRIVATE_WEB_MAX_BRAVE_REQUESTS,
    maxProviderResults: env.PRIVARESULTS,
    maxUniqueUrls: env.PRIVATE_WEB_MAX_UNIQUE_URLS,
    maxDocumentFetches: env.PRIVATE_WEB_MAX_DOCUMENT_FETCHES,
    maxGeminiExtractions: env.PRIVATE_WEB_MAX_GEMINI_EXTRACTIONS,
    maxResults: env.PRIVATE_WEB_MAX_RESULTS,
    maxPerDomain: env.PRIVATE_WEB_MAX_PER_DOMAIN,
    maxConcurrentSearchesPerUser:
      env.PRIVATE_WEB_MAX_CONCURRENT_SEARCHES_PER_USER,
    maxSearchesPerHour: env.PRIVATE_WEB_MAX_SEARCHES_PER_HOUR,
    staleExecutionMinutes: env.PRIVATE_WEB_STALE_EXECUTION_MINUTES,
    queryMinCoverage: env.PRIVATE_WEB_QUERY_MIN_COVERAGE,
    totalTimeoutMs: env.PRIVATE_WEB_TOTAL_TIMEOUT_MS,
    braveTimeoutMs: env.PRIVATE_WEB_BRAVE_TIMEOUT_MS,
    searchRequestTimeoutMs: env.PRIVATE_WEB_SEARCH_TIMEOUT_MS,
    searchMaxRetries: env.PRIVATE_WEB_SEARCH_MAX_RETRIES,
    fetchConcurrency: env.PRIVATE_WEB_FETCH_CONCURRENCY,
    fetchTimeoutMs: env.PRIVATE_WEB_FETCH_TIMEOUT_MS,
    maxDocumentBytes: env.PRIVATE_WEB_MAX_DOCUMENT_BYTES,
    maxRedirects: env.PRIVATE_WEB_MAX_REDIRECTS,
    maxRequestsPerHost: env.PRIVATE_WEB_MAX_REQUESTS_PER_HOST,
    fetchUserAgent: env.PRIVATE_WEB_FETCH_USER_AGENT,
    robotsCacheTtlMs: env.PRIVATE_WEB_ROBOTS_CACHE_TTL_MS,
    maxRobotsBytes: env.PRIVATE_WEB_MAX_ROBOTS_BYTES,
    maxPdfPages: env.PRIVATE_WEB_MAX_PDF_PAGES,
    maxGeminiOutputTokens: env.PRIVATE_WEB_MAX_EXTRACTION_TOKENS,
    braveCostPerRequest: env.BRAVE_SEARCH_COST_PER_REQUEST,
  };
}

function defaultDependencies(config: PrivateWebServiceConfig): PrivateWebServiceDependencies {
  return {
    repository: databasePrivateWebRepository,
    provider: new BraveSearchProvider({
      apiKey: config.apiKey,
      maxRetries: config.searchMaxRetries,
      timeoutMs: config.searchRequestTimeoutMs,
    }),
    fetchDocument: fetchWebDocument,
    deterministicExtractor: extractPrivateOpportunityDeterministically,
    geminiExtractor: extractPrivateOpportunitiesWithGemini,
    vertexConfigured: isVertexConfigured,
    now: () => new Date(),
  };
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const output = new Array<R>(items.length);
  let nextIndex = 0;
  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      const item = items[index];
      if (item !== undefined) output[index] = await worker(item, index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, () =>
      runWorker(),
    ),
  );
  return output;
}

async function raceWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");

  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", abort);
    });
  });
}

function increment(record: Record<string, number>, key: string, by = 1) {
  record[key] = (record[key] ?? 0) + by;
}

function traceForVerified(
  candidate: VerifiedPrivateWebCandidate,
  provenance: DiscoveredPrivateWebResult,
  temporaryId: string,
): CandidateTrace {
  return {
    temporaryId,
    title: candidate.title,
    organizationName: candidate.organizationName,
    summary: candidate.description,
    officialSourceUrl: candidate.sourceUrl,
    sourceDomain: candidate.sourceDomain,
    publishedAt: candidate.publishedAt,
    deadlineAt: candidate.deadlineAt,
    estimatedAmount: candidate.estimatedAmount,
    currency: candidate.currency,
    category: candidate.category,
    evidence: candidate.evidence.slice(0, 12),
    stage: "VERIFICATION",
    outcome:
      candidate.verificationStatus === "PARTIALLY_VERIFIED"
        ? "UNVERIFIED"
        : "UNCHANGED",
    reasonCode:
      candidate.verificationStatus === "PARTIALLY_VERIFIED"
        ? "PARTIALLY_VERIFIED"
        : null,
    reason: candidate.verificationReason,
    retrievalScore: provenance.retrievalScore,
    preliminaryScore: candidate.preliminaryScore,
    verificationStatus: candidate.verificationStatus,
    discoveredByQueries: provenance.discoveredByQueries,
    discoveredByFamilies: provenance.discoveredByFamilies,
  };
}

function shouldTryGemini(rejection: PrivateWebCandidateRejection | null): boolean {
  if (!rejection) return true;
  return [
    "MISSING_BUYER",
    "MISSING_SCOPE",
    "MISSING_EXTERNAL_INTENT",
    "PUBLIC_OR_UNKNOWN_SECTOR",
    "TEMPORAL_STATUS_UNKNOWN",
  ].includes(rejection.reasonCode);
}

function pipelineOutcome(input: {
  status: PrivateWebSearchResult["status"];
  persisted: number;
  rejected: number;
}): string {
  if (input.status === "FAILED") return "FAILED";
  if (input.persisted === 0 && input.rejected > 0) return "COMPLETED_ALL_FILTERED";
  return input.status === "PARTIALLY_COMPLETED"
    ? "PARTIALLY_COMPLETED"
    : "COMPLETED";
}

export async function runPrivateWebSearchWithDependencies(
  input: { userId: string; query: string },
  config: PrivateWebServiceConfig,
  deps: PrivateWebServiceDependencies,
): Promise<PrivateWebSearchResult> {
  const pipelineStartedAt = Date.now();
  const totalTimeoutMs = Math.min(
    config.totalTimeoutMs,
    PRIVATE_WEB_HARD_LIMITS.totalTimeoutMs,
  );
  const absoluteDeadlineMs = pipelineStartedAt + totalTimeoutMs;
  const totalController = new AbortController();
  const totalTimer = setTimeout(() => totalController.abort(), totalTimeoutMs);
  let admission: Awaited<ReturnType<PrivateWebRepository["startExecution"]>>;
  try {
    admission = await deps.repository.startExecution({
      userId: input.userId,
      query: input.query,
      now: deps.now(),
      maxConcurrent: config.maxConcurrentSearchesPerUser,
      maxPerHour: config.maxSearchesPerHour,
      staleExecutionMinutes: config.staleExecutionMinutes,
    });
  } catch (error) {
    clearTimeout(totalTimer);
    throw error;
  }
  if (admission.kind !== "STARTED") {
    clearTimeout(totalTimer);
    throw new PrivateWebSearchAdmissionError(
      admission.kind === "ACTIVE_LIMIT" ? "ACTIVE_SEARCH" : "RATE_LIMITED",
      admission.retryAfterSeconds,
    );
  }
  const execution = { id: admission.executionId };
  const traces: CandidateTrace[] = [];
  const discardCounts: Record<string, number> = {};
  const limitsReached: string[] = [];
  let finished = false;
  let pendingFinish: Parameters<PrivateWebRepository["finishExecution"]>[0] | null = null;

  const closeExecution = async (finish: {
    status: PrivateWebSearchResult["status"];
    metrics: Record<string, unknown>;
    queriesExecuted?: number;
    candidatesFound?: number;
    candidatesDiscarded?: number;
    opportunitiesCreated?: number;
    inputTokens?: number;
    outputTokens?: number;
    estimatedCost?: string;
    errorMessage?: string | null;
  }) => {
    if (finished) return;
    pendingFinish = {
      executionId: execution.id,
      status: finish.status,
      queriesExecuted: finish.queriesExecuted ?? 0,
      candidatesFound: finish.candidatesFound ?? 0,
      candidatesDiscarded: finish.candidatesDiscarded ?? 0,
      opportunitiesCreated: finish.opportunitiesCreated ?? 0,
      inputTokens: finish.inputTokens ?? 0,
      outputTokens: finish.outputTokens ?? 0,
      estimatedCost: finish.estimatedCost ?? "0",
      metrics: finish.metrics,
      errorMessage: finish.errorMessage ?? null,
    };
    for (let attempt = 0; attempt < 3 && !finished; attempt += 1) {
      try {
        await deps.repository.finishExecution(pendingFinish);
        finished = true;
      } catch {
        if (attempt < 2) await Promise.resolve();
      }
    }
  };

  const baseMetrics = {
    query: input.query,
    searchMode: "PRIVATE_WEB_BRAVE",
    discoveryMode: "BRAVE_ONLY",
    searchProvider: "BRAVE",
    plannedWork: {
      braveRequests: Math.min(config.maxBraveRequests, PRIVATE_WEB_HARD_LIMITS.braveRequests),
      documentFetches: Math.min(config.maxDocumentFetches, PRIVATE_WEB_HARD_LIMITS.documentFetches),
      geminiExtractions: Math.min(config.maxGeminiExtractions, PRIVATE_WEB_HARD_LIMITS.geminiExtractions),
      results: Math.min(config.maxResults, PRIVATE_WEB_HARD_LIMITS.results),
    },
  };

  try {
  if (!config.enabled) {
    const metrics = {
      ...baseMetrics,
      outcome: "FAILED",
      terminationCause: "FEATURE_DISABLED",
      durationMs: Date.now() - pipelineStartedAt,
      executionCandidates: [],
      limitsReached: [],
    };
    await closeExecution({
      status: "FAILED",
      metrics,
      errorMessage: "PRIVATE_WEB_DISABLED",
    });
    return {
      executionId: execution.id,
      status: "FAILED",
      candidatesFound: 0,
      candidatesVerified: 0,
      candidatesPartiallyVerified: 0,
      candidatesPersisted: 0,
      errorCode: "PRIVATE_WEB_DISABLED",
      message: "El motor de búsqueda privada no está habilitado.",
    };
  }

  if (!config.apiKey || deps.provider.isConfigured?.() === false) {
    const metrics = {
      ...baseMetrics,
      outcome: "FAILED",
      terminationCause: "BRAVE_NOT_CONFIGURED",
      durationMs: Date.now() - pipelineStartedAt,
      executionCandidates: [],
      limitsReached: [],
    };
    await closeExecution({
      status: "FAILED",
      metrics,
      errorMessage: "BRAVE_NOT_CONFIGURED",
    });
    return {
      executionId: execution.id,
      status: "FAILED",
      candidatesFound: 0,
      candidatesVerified: 0,
      candidatesPartiallyVerified: 0,
      candidatesPersisted: 0,
      errorCode: "BRAVE_NOT_CONFIGURED",
      message: "El buscador privado no está configurado.",
    };
  }

  if (Date.now() >= absoluteDeadlineMs) {
    throw new DOMException("The operation was aborted", "AbortError");
  }
    const discovery: PrivateWebBraveDiscoveryResult =
      await discoverPrivateWebWithBrave({
        provider: deps.provider,
        executionId: execution.id,
        query: input.query,
        maxRequests: Math.min(config.maxBraveRequests, PRIVATE_WEB_HARD_LIMITS.braveRequests),
        maxProviderResults: Math.min(
          config.maxProviderResults,
          PRIVATE_WEB_HARD_LIMITS.providerResults,
        ),
        maxUniqueUrls: Math.min(config.maxUniqueUrls, PRIVATE_WEB_HARD_LIMITS.uniqueUrls),
        timeoutMs: Math.max(
          1,
          Math.min(config.braveTimeoutMs, absoluteDeadlineMs - Date.now()),
        ),
        requestTimeoutMs: config.searchRequestTimeoutMs,
      });

    if (discovery.fatalError && discovery.results.length === 0) {
      const metrics = {
        ...baseMetrics,
        ...discovery.metrics,
        outcome: "FAILED",
        durationMs: Date.now() - pipelineStartedAt,
        executionCandidates: [],
      };
      await closeExecution({
        status: "FAILED",
        metrics,
        queriesExecuted: discovery.metrics.totalRequests,
        estimatedCost: (
          discovery.metrics.totalRequests * config.braveCostPerRequest
        ).toFixed(6),
        errorMessage: "BRAVE_FAILED",
      });
      return {
        executionId: execution.id,
        status: "FAILED",
        candidatesFound: 0,
        candidatesVerified: 0,
        candidatesPartiallyVerified: 0,
        candidatesPersisted: 0,
        errorCode: "BRAVE_FAILED",
        message: "No se pudo completar la búsqueda privada.",
      };
    }

    const selected = selectPrivateWebDocuments({
      results: discovery.results,
      maxDocuments: Math.min(
        config.maxDocumentFetches,
        PRIVATE_WEB_HARD_LIMITS.documentFetches,
      ),
      maxPerDomain: Math.min(config.maxPerDomain, PRIVATE_WEB_HARD_LIMITS.perDomain),
    });
    if (discovery.results.length > selected.length) {
      limitsReached.push("PRIVATE_WEB_MAX_DOCUMENT_FETCHES_OR_DOMAIN_LIMIT");
    }
    const hostLimiter = new HostConcurrencyLimiter(config.maxRequestsPerHost);
    let robotsCacheHits = 0;
    let bytesFetched = 0;
    let htmlFetched = 0;
    let pdfFetched = 0;
    let documentsFetchSucceeded = 0;
    const fetched = await mapWithConcurrency(
      selected,
      config.fetchConcurrency,
      async (provenance, index) => {
        if (totalController.signal.aborted) {
          increment(discardCounts, "TOTAL_TIMEOUT");
          return null;
        }
        const result = await deps.fetchDocument(provenance.url, {
            timeoutMs: Math.max(
              1,
              Math.min(config.fetchTimeoutMs, absoluteDeadlineMs - Date.now()),
            ),
            maxRedirects: config.maxRedirects,
            maxDocumentBytes: config.maxDocumentBytes,
            maxPdfPages: config.maxPdfPages,
            userAgent: config.fetchUserAgent,
            robotsCacheTtlMs: config.robotsCacheTtlMs,
            maxRobotsBytes: config.maxRobotsBytes,
            signal: totalController.signal,
            now: deps.now,
            requestGate: (url, task) => hostLimiter.run(url, task),
            urlPolicy: (url) => evaluatePrivateWebUrl(url).allowed,
          });
        if (!result.ok) {
          increment(discardCounts, result.code);
          traces.push({
            temporaryId: `fetch-${index + 1}`,
            title: provenance.title,
            organizationName: null,
            summary: provenance.snippet,
            officialSourceUrl: provenance.url,
            sourceDomain: provenance.domain,
            deadlineAt: null,
            category: null,
            stage: "FETCH",
            outcome: "ERROR",
            reasonCode: result.code,
            reason: result.detail,
            retrievalScore: provenance.retrievalScore,
            discoveredByQueries: provenance.discoveredByQueries,
            discoveredByFamilies: provenance.discoveredByFamilies,
          });
          return null;
        }
        const finalPolicy = evaluatePrivateWebSource({
          url: result.document.finalUrl,
          title: result.document.title,
          text: result.document.text,
        });
        const canonicalPolicy = result.document.canonicalUrl
          ? evaluatePrivateWebSource({
              url: result.document.canonicalUrl,
              title: result.document.title,
              text: result.document.text,
            })
          : { allowed: true as const };
        if (!finalPolicy.allowed || !canonicalPolicy.allowed) {
          const reason = !finalPolicy.allowed
            ? finalPolicy.reason
            : canonicalPolicy.allowed
              ? "NO_OPPORTUNITY_SIGNAL"
              : canonicalPolicy.reason;
          increment(discardCounts, reason);
          return null;
        }
        documentsFetchSucceeded += 1;
        bytesFetched += result.document.byteLength;
        robotsCacheHits += result.robotsFromCache ? 1 : 0;
        if (result.document.contentType === "application/pdf") pdfFetched += 1;
        else htmlFetched += 1;
        return { provenance, document: result.document };
      },
    );

    const fetchedDocuments = fetched.filter(
      (item): item is { provenance: DiscoveredPrivateWebResult; document: FetchedDocument } =>
        Boolean(item),
    );
    const verified: Array<{
      candidate: VerifiedPrivateWebCandidate;
      provenance: DiscoveredPrivateWebResult;
    }> = [];
    let geminiCalls = 0;
    let geminiInputTokens = 0;
    let geminiOutputTokens = 0;
    let geminiLimitSkipped = 0;
    let deterministicCandidates = 0;
    let geminiCandidates = 0;
    let documentsExtracted = 0;
    const countryDecisions: Array<{ decision: string; confidence: number }> = [];

    for (const [documentIndex, item] of fetchedDocuments.entries()) {
      if (totalController.signal.aborted) {
        increment(discardCounts, "TOTAL_TIMEOUT");
        break;
      }
      documentsExtracted += 1;
      const deterministic = deps.deterministicExtractor({
        document: item.document,
        query: input.query,
      });
      let deterministicRejection: PrivateWebCandidateRejection | null = null;
      if (deterministic) {
        deterministicCandidates += 1;
        const result = verifyPrivateWebCandidate({
          candidate: deterministic,
          document: item.document,
          query: input.query,
          now: deps.now(),
          minQueryCoverage: config.queryMinCoverage,
        });
        if ("verificationStatus" in result) {
          verified.push({ candidate: result, provenance: item.provenance });
          countryDecisions.push({
            decision: result.countryEvidence.decision,
            confidence: result.countryEvidence.confidence,
          });
          continue;
        }
        deterministicRejection = result;
        if (result.countryEvidence) {
          countryDecisions.push({
            decision: result.countryEvidence.decision,
            confidence: result.countryEvidence.confidence,
          });
        }
      }

      const geminiLimit = Math.min(
        config.maxGeminiExtractions,
        PRIVATE_WEB_HARD_LIMITS.geminiExtractions,
      );
      const geminiEligible =
        deps.vertexConfigured() && shouldTryGemini(deterministicRejection);
      if (geminiCalls >= geminiLimit || !geminiEligible) {
        if (geminiCalls >= geminiLimit && geminiEligible) {
          geminiLimitSkipped += 1;
        }
        const reason = deterministicRejection?.reasonCode ?? "EXTRACTION_INCOMPLETE";
        increment(discardCounts, reason);
        traces.push({
          temporaryId: `extract-${documentIndex + 1}`,
          title: deterministic?.title ?? item.document.title,
          organizationName: deterministic?.organizationName ?? null,
          summary: deterministic?.description ?? null,
          officialSourceUrl: item.document.canonicalUrl ?? item.document.finalUrl,
          sourceDomain: item.provenance.domain,
          deadlineAt: deterministic?.deadlineAt ?? null,
          category: deterministic?.category ?? null,
          stage: "EXTRACTION",
          outcome: "REJECTED",
          reasonCode: reason,
          reason:
            deterministicRejection?.reason ??
            "El extractor determinista no confirmó todos los campos y Gemini no estaba disponible.",
          retrievalScore: item.provenance.retrievalScore,
          discoveredByQueries: item.provenance.discoveredByQueries,
          discoveredByFamilies: item.provenance.discoveredByFamilies,
        });
        continue;
      }

      // The SDK receives the real signal below. Avoid starting a billable call
      // when too little wall-clock budget remains for a useful response.
      if (absoluteDeadlineMs - Date.now() < 2_000) {
        increment(discardCounts, "TOTAL_TIMEOUT");
        limitsReached.push("PRIVATE_WEB_TOTAL_TIMEOUT_MS");
        break;
      }

      geminiCalls += 1;
      let extraction: GeminiPrivateWebExtractionResult;
      try {
        extraction = await raceWithAbort(
          deps.geminiExtractor({
            document: item.document,
            query: input.query,
            maxOutputTokens: config.maxGeminiOutputTokens,
            signal: totalController.signal,
          }),
          totalController.signal,
        );
      } catch {
        increment(
          discardCounts,
          totalController.signal.aborted
            ? "TOTAL_TIMEOUT"
            : "GEMINI_EXTRACTION_FAILED",
        );
        continue;
      }
      geminiInputTokens += extraction.inputTokens;
      geminiOutputTokens += extraction.outputTokens;
      geminiCandidates += extraction.candidates.length;
      if (extraction.failureKind) increment(discardCounts, extraction.failureKind);
      for (const geminiCandidate of extraction.candidates) {
        const result = verifyPrivateWebCandidate({
          candidate: geminiCandidate,
          document: item.document,
          query: input.query,
          now: deps.now(),
          minQueryCoverage: config.queryMinCoverage,
        });
        if ("verificationStatus" in result) {
          verified.push({ candidate: result, provenance: item.provenance });
          countryDecisions.push({
            decision: result.countryEvidence.decision,
            confidence: result.countryEvidence.confidence,
          });
        } else {
          increment(discardCounts, result.reasonCode);
          if (result.countryEvidence) {
            countryDecisions.push({
              decision: result.countryEvidence.decision,
              confidence: result.countryEvidence.confidence,
            });
          }
        }
      }
    }

    if (geminiLimitSkipped > 0) {
      limitsReached.push("PRIVATE_WEB_MAX_GEMINI_EXTRACTIONS");
    }
    const bestByUrl = new Map<
      string,
      { candidate: VerifiedPrivateWebCandidate; provenance: DiscoveredPrivateWebResult }
    >();
    for (const item of verified) {
      const existing = bestByUrl.get(item.candidate.normalizedUrl);
      if (
        !existing ||
        item.candidate.verificationStatus === "VERIFIED" &&
          existing.candidate.verificationStatus !== "VERIFIED" ||
        item.candidate.preliminaryScore > existing.candidate.preliminaryScore
      ) {
        bestByUrl.set(item.candidate.normalizedUrl, item);
      } else {
        increment(discardCounts, "CANONICAL_DUPLICATE");
      }
    }
    const candidates = [...bestByUrl.values()]
      .sort(
        (left, right) =>
          right.candidate.preliminaryScore - left.candidate.preliminaryScore,
      )
      .slice(0, Math.min(config.maxResults, PRIVATE_WEB_HARD_LIMITS.results));
    if (bestByUrl.size > candidates.length) {
      limitsReached.push("PRIVATE_WEB_MAX_RESULTS");
      increment(discardCounts, "RESULT_LIMIT", bestByUrl.size - candidates.length);
    }

    let persisted = 0;
    let created = 0;
    let updated = 0;
    let unchanged = 0;
    let partialCandidates = 0;
    for (const [index, item] of candidates.entries()) {
      if (totalController.signal.aborted) {
        increment(discardCounts, "TOTAL_TIMEOUT");
        break;
      }
      let persistence: PrivateWebPersistenceOutcome;
      try {
        persistence = await deps.repository.persistCandidate({
          userId: input.userId,
          executionId: execution.id,
          candidate: item.candidate,
          rank: index + 1,
        });
      } catch {
        increment(discardCounts, "PERSIST_ERROR");
        continue;
      }
      if (persistence.kind !== "PERSISTED") {
        increment(discardCounts, persistence.kind);
        continue;
      }
      persisted += 1;
      if (persistence.outcome === "CREATED") created += 1;
      else if (persistence.outcome === "UPDATED") updated += 1;
      else unchanged += 1;
      if (item.candidate.verificationStatus === "PARTIALLY_VERIFIED") {
        partialCandidates += 1;
      }
      traces.push({
        ...traceForVerified(
          item.candidate,
          item.provenance,
          `result-${persistence.id}`,
        ),
        searchResultId: persistence.id,
        stage: "PERSISTENCE",
        outcome:
          item.candidate.verificationStatus === "PARTIALLY_VERIFIED"
            ? "UNVERIFIED"
            : persistence.outcome,
      });
    }

    const rejected = Object.values(discardCounts).reduce((sum, count) => sum + count, 0);
    const domains = Object.fromEntries(
      [...new Set(discovery.results.map((item) => item.domain))].map((domain) => [
        domain,
        discovery.results.filter((item) => item.domain === domain).length,
      ]),
    );
    const limitKinds = [
      ...new Set([
        ...discovery.metrics.limitsReached,
        ...limitsReached,
        ...(totalController.signal.aborted ? ["PRIVATE_WEB_TOTAL_TIMEOUT_MS"] : []),
      ]),
    ];
    const technicalPartialReasons = [
      ...(discovery.partial ? ["BRAVE_PARTIAL"] : []),
      ...(discardCounts.TOTAL_TIMEOUT ? ["TOTAL_TIMEOUT"] : []),
      ...(discardCounts.GEMINI_EXTRACTION_FAILED ? ["GEMINI_EXTRACTION_FAILED"] : []),
      ...(discardCounts.PERSIST_ERROR ? ["PERSIST_ERROR"] : []),
      ...(discardCounts.NETWORK_ERROR ? ["DOCUMENT_NETWORK_ERROR"] : []),
      ...(discardCounts.TIMEOUT ? ["DOCUMENT_TIMEOUT"] : []),
      ...(discardCounts.ROBOTS_UNAVAILABLE ? ["ROBOTS_UNAVAILABLE"] : []),
    ];
    const partialReasons = [...new Set([...limitKinds, ...technicalPartialReasons])];
    const materiallyIncomplete = partialReasons.length > 0;
    const status: PrivateWebSearchResult["status"] = materiallyIncomplete
      ? persisted > 0
        ? "PARTIALLY_COMPLETED"
        : "FAILED"
      : "COMPLETED";
    const braveEstimatedCost =
      discovery.metrics.totalRequests * config.braveCostPerRequest;
    const geminiEstimatedCost =
      geminiInputTokens * 0.0000001 + geminiOutputTokens * 0.0000004;
    const metrics = {
      ...baseMetrics,
      ...discovery.metrics,
      outcome: pipelineOutcome({ status, persisted, rejected }),
      searchProviderResults: discovery.metrics.providerResults,
      searchProviderUniqueUrls: discovery.metrics.urlsAfterDedupe,
      searchProviderUniqueDomains: new Set(discovery.results.map((item) => item.domain)).size,
      domains,
      canonicalDedupe:
        discovery.metrics.canonicalDedupe +
        Math.max(0, verified.length - bestByUrl.size),
      documentsSelected: selected.length,
      documentsFetchSucceeded,
      documentsExtracted,
      documentsHtml: htmlFetched,
      documentsPdf: pdfFetched,
      bytesFetched,
      robots: {
        cacheHits: robotsCacheHits,
        failures:
          (discardCounts.ROBOTS_DISALLOWED ?? 0) +
          (discardCounts.ROBOTS_UNAVAILABLE ?? 0),
      },
      extractionMethods: {
        deterministicCandidates,
        geminiCandidates,
      },
      geminiCalls,
      candidatesFound: candidates.length,
      candidatesVerified: candidates.filter(
        (item) => item.candidate.verificationStatus === "VERIFIED",
      ).length,
      candidatesPartiallyVerified: partialCandidates,
      candidatesFiltered: rejected,
      candidatesDiscarded: rejected,
      candidatesCreated: created,
      candidatesUpdated: updated,
      candidatesUnchanged: unchanged,
      countryEvidence: countryDecisions,
      discardCounts,
      cacheHits: robotsCacheHits,
      durationMs: Date.now() - pipelineStartedAt,
      terminationCause: totalController.signal.aborted || discardCounts.TOTAL_TIMEOUT
        ? "TOTAL_TIMEOUT"
        : discovery.metrics.terminationCause,
      limitReached: limitKinds.length > 0,
      limitKinds,
      limitsReached: limitKinds,
      partialReasons,
      completedWork: {
        braveRequests: discovery.metrics.totalRequests,
        documentFetches: selected.length,
        documentsFetched: documentsFetchSucceeded,
        geminiExtractions: geminiCalls,
        resultsPersisted: persisted,
      },
      estimatedCosts: {
        brave: braveEstimatedCost.toFixed(6),
        gemini: geminiEstimatedCost.toFixed(6),
      },
      executionCandidates: traces.slice(0, 100),
    };
    await closeExecution({
      status,
      metrics,
      queriesExecuted: discovery.metrics.totalRequests,
      candidatesFound: candidates.length,
      candidatesDiscarded: rejected,
      opportunitiesCreated: created,
      inputTokens: geminiInputTokens,
      outputTokens: geminiOutputTokens,
      estimatedCost: (braveEstimatedCost + geminiEstimatedCost).toFixed(6),
      errorMessage: status === "FAILED" ? "PIPELINE_INCOMPLETE" : null,
    });
    return {
      executionId: execution.id,
      status,
      candidatesFound: candidates.length,
      candidatesVerified: candidates.length - partialCandidates,
      candidatesPartiallyVerified: partialCandidates,
      candidatesPersisted: persisted,
    };
  } catch {
    const metrics = {
      ...baseMetrics,
      outcome: "FAILED",
      terminationCause: "PIPELINE_FAILED",
      discardCounts,
      durationMs: Date.now() - pipelineStartedAt,
      limitsReached,
      executionCandidates: traces.slice(0, 100),
    };
    await closeExecution({
      status: "FAILED",
      metrics,
      candidatesDiscarded: Object.values(discardCounts).reduce(
        (sum, count) => sum + count,
        0,
      ),
      errorMessage: "PIPELINE_FAILED",
    });
    return {
      executionId: execution.id,
      status: "FAILED",
      candidatesFound: 0,
      candidatesVerified: 0,
      candidatesPartiallyVerified: 0,
      candidatesPersisted: 0,
      errorCode: "PIPELINE_FAILED",
      message: "No se pudo completar la búsqueda privada.",
    };
  } finally {
    if (!finished && pendingFinish) {
      await closeExecution(pendingFinish);
    }
    if (!finished) {
      console.error("PRIVATE_WEB_EXECUTION_CLOSE_FAILED", {
        executionId: execution.id,
      });
    }
    clearTimeout(totalTimer);
  }
}

export async function searchPrivateWeb(input: {
  userId: string;
  query: string;
}): Promise<PrivateWebSearchResult> {
  const config = defaultConfig();
  return runPrivateWebSearchWithDependencies(
    input,
    config,
    defaultDependencies(config),
  );
}

export { defaultConfig as getPrivateWebServiceConfig };
