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
  classifyGeminiFailure,
  extractPrivateOpportunitiesWithGemini,
  type GeminiFailureCode,
  type GeminiFailureMetric,
  type GeminiInvalidCandidateIssue,
  type GeminiPrivateWebExtractionResult,
} from "./gemini-extractor";
import {
  databasePrivateWebRepository,
  type PrivateWebPersistenceOutcome,
  type PrivateWebRepository,
} from "./persistence";
import { verifyPrivateWebCandidate } from "./verification";
import { inferPrivateWebDocumentType } from "./preliminary-scoring";
import { PRIVATE_WEB_PLANNER_VERSION } from "./query-planner";

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
  resultDisposition: ResultDisposition | null;
  errorCode?: "PRIVATE_WEB_DISABLED" | "BRAVE_NOT_CONFIGURED" | "BRAVE_FAILED" | "PIPELINE_FAILED";
  message?: string;
};

/**
 * Business disposition, kept separate from the technical execution status.
 *
 * RESULTS_FOUND: at least one result was persisted.
 * ALL_FILTERED: at least one candidate was extracted, but all were rejected.
 * NO_DISCOVERY_RESULTS: Brave produced no eligible sources.
 * NO_VERIFIED_RESULTS: documents were processed without producing a verifiable candidate.
 */
export type ResultDisposition =
  | "RESULTS_FOUND"
  | "ALL_FILTERED"
  | "NO_DISCOVERY_RESULTS"
  | "NO_VERIFIED_RESULTS";

export type SelectionMode = "QUALIFIED" | "FALLBACK_LOW_CONFIDENCE";

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
  titleSource?: string | null;
  braveTitle?: string | null;
  failureStage?: string;
  failureName?: string;
  failureCode?: string;
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
  primaryRejectReason?: string | null;
  secondaryRejectReasons?: string[];
  reason: string | null;
  retrievalScore?: number;
  preliminaryScore?: number;
  verificationStatus?: string;
  discoveredByQueries: string[];
  discoveredByFamilies: string[];
};

export type SelectedDocumentTrace = {
  title: string | null;
  domain: string;
  family: string;
  ranking: number;
  ageBucket: string;
  freshnessFactor: number;
  documentType: "HTML" | "PDF" | "UNKNOWN";
  fetchOutcome: string;
  extractionOutcome: string;
  candidateCount: number;
  primaryRejectReason: string | null;
  secondaryRejectReasons: string[];
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

function boundedTraceText(
  value: string | null | undefined,
  maxLength: number,
): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  return normalized ? normalized.slice(0, maxLength) : null;
}

function traceForVerified(
  candidate: VerifiedPrivateWebCandidate,
  provenance: DiscoveredPrivateWebResult,
  temporaryId: string,
): CandidateTrace {
  return {
    temporaryId,
    title: candidate.title,
    titleSource: candidate.titleSource,
    braveTitle: boundedTraceText(provenance.title, 500),
    organizationName: candidate.organizationName,
    summary: boundedTraceText(candidate.description, 500),
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
    primaryRejectReason: null,
    secondaryRejectReasons: [],
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

export function determinePrivateWebResultDisposition(input: {
  status: PrivateWebSearchResult["status"];
  discoveryResults: number;
  documentsProcessed: number;
  extractedCandidates: number;
  persisted: number;
}): ResultDisposition | null {
  if (input.status === "FAILED") return null;
  if (input.persisted > 0) return "RESULTS_FOUND";
  if (input.discoveryResults === 0) return "NO_DISCOVERY_RESULTS";
  if (input.extractedCandidates > 0) return "ALL_FILTERED";
  return "NO_VERIFIED_RESULTS";
}

function addDocumentRejectReasons(
  trace: SelectedDocumentTrace,
  primary: string,
  secondary: readonly string[] = [],
) {
  if (!trace.primaryRejectReason) trace.primaryRejectReason = primary;
  const additions = trace.primaryRejectReason === primary ? secondary : [primary, ...secondary];
  trace.secondaryRejectReasons = [
    ...new Set(
      [...trace.secondaryRejectReasons, ...additions].filter(
        (reason) => reason !== trace.primaryRejectReason,
      ),
    ),
  ].slice(0, 12);
}

export function determinePrivateWebStatus(input: {
  technicalFailureCount: number;
  fetchAttempted: number;
  fetchSucceeded: number;
  extractionAttempted: number;
  extractionSucceeded: number;
  persistenceAttempted: number;
  persistenceFailures: number;
  persisted: number;
  timedOut: boolean;
}): PrivateWebSearchResult["status"] {
  if (input.technicalFailureCount === 0) return "COMPLETED";
  if (input.timedOut && input.extractionSucceeded === 0 && input.persisted === 0) {
    return "FAILED";
  }
  if (
    input.persistenceAttempted > 0 &&
    input.persistenceFailures > 0 &&
    input.persisted === 0
  ) {
    return "FAILED";
  }
  if (
    input.extractionAttempted > 0 &&
    input.extractionSucceeded === 0 &&
    input.persisted === 0
  ) {
    return "FAILED";
  }
  if (
    input.fetchAttempted > 0 &&
    input.fetchSucceeded === 0 &&
    input.persisted === 0
  ) {
    return "FAILED";
  }
  return input.fetchSucceeded > 0 ||
    input.extractionSucceeded > 0 ||
    input.persisted > 0
    ? "PARTIALLY_COMPLETED"
    : "FAILED";
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
  const selectedDocumentTraces: SelectedDocumentTrace[] = [];
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
    plannerVersion: PRIVATE_WEB_PLANNER_VERSION,
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
      resultDisposition: null,
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
      resultDisposition: null,
      errorCode: "PRIVATE_WEB_DISABLED",
      message: "El motor de búsqueda privada no está habilitado.",
    };
  }

  if (!config.apiKey || deps.provider.isConfigured?.() === false) {
    const metrics = {
      ...baseMetrics,
      outcome: "FAILED",
      resultDisposition: null,
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
      resultDisposition: null,
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
        now: deps.now(),
      });

    if (discovery.fatalError && discovery.results.length === 0) {
      const metrics = {
        ...baseMetrics,
        ...discovery.metrics,
        outcome: "FAILED",
        resultDisposition: null,
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
        resultDisposition: null,
        errorCode: "BRAVE_FAILED",
        message: "No se pudo completar la búsqueda privada.",
      };
    }

    const plannedDocuments = Math.min(
      config.maxDocumentFetches,
      PRIVATE_WEB_HARD_LIMITS.documentFetches,
    );
    const selected = selectPrivateWebDocuments({
      results: discovery.results,
      maxDocuments: plannedDocuments,
      maxPerDomain: Math.min(config.maxPerDomain, PRIVATE_WEB_HARD_LIMITS.perDomain),
    });
    const qualifiedDocuments = selected.filter((result) => result.qualified).length;
    const fallbackDocuments = selected.length - qualifiedDocuments;
    const selectionMode: SelectionMode | null =
      selected.length === 0
        ? null
        : qualifiedDocuments > 0
          ? "QUALIFIED"
          : "FALLBACK_LOW_CONFIDENCE";
    selectedDocumentTraces.push(
      ...selected.map(
        (result, index): SelectedDocumentTrace => ({
          title: boundedTraceText(result.title, 180),
          domain: result.domain.slice(0, 253),
          family: (result.discoveredByFamilies[0] ?? result.queryFamily).slice(0, 80),
          ranking: index + 1,
          ageBucket: result.ageBucket,
          freshnessFactor: result.freshnessFactor,
          documentType: inferPrivateWebDocumentType(result),
          fetchOutcome: "NOT_ATTEMPTED",
          extractionOutcome: "NOT_ATTEMPTED",
          candidateCount: 0,
          primaryRejectReason: null,
          secondaryRejectReasons: [],
        }),
      ),
    );
    if (discovery.results.length > selected.length) {
      limitsReached.push("PRIVATE_WEB_MAX_DOCUMENT_FETCHES_OR_DOMAIN_LIMIT");
    }
    const hostLimiter = new HostConcurrencyLimiter(config.maxRequestsPerHost);
    let robotsCacheHits = 0;
    let bytesFetched = 0;
    let htmlFetched = 0;
    let pdfFetched = 0;
    let documentFetchAttempts = 0;
    let successfulFetches = 0;
    let documentsFetchSucceeded = 0;
    const fetched = await mapWithConcurrency(
      selected,
      config.fetchConcurrency,
      async (provenance, index) => {
        const documentTrace = selectedDocumentTraces[index];
        if (totalController.signal.aborted) {
          increment(discardCounts, "TOTAL_TIMEOUT");
          if (documentTrace) {
            documentTrace.fetchOutcome = "NOT_ATTEMPTED_TOTAL_TIMEOUT";
            addDocumentRejectReasons(documentTrace, "TOTAL_TIMEOUT");
          }
          return null;
        }
        documentFetchAttempts += 1;
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
            urlPolicy: evaluatePrivateWebUrl,
          });
        if (!result.ok) {
          increment(discardCounts, result.code);
          if (documentTrace) {
            documentTrace.fetchOutcome = result.code;
            addDocumentRejectReasons(documentTrace, result.code);
          }
          traces.push({
            temporaryId: `fetch-${index + 1}`,
            title: provenance.title,
            titleSource: "BRAVE_RESULT",
            braveTitle: boundedTraceText(provenance.title, 500),
            organizationName: null,
            summary: null,
            officialSourceUrl: provenance.url,
            sourceDomain: provenance.domain,
            deadlineAt: null,
            category: null,
            stage: "FETCH",
            outcome: "ERROR",
            reasonCode: result.code,
            primaryRejectReason: result.code,
            secondaryRejectReasons: [],
            reason: result.detail,
            failureStage: result.parserFailure?.stage,
            failureName: result.parserFailure?.exceptionName,
            failureCode: result.parserFailure?.exceptionCode,
            retrievalScore: provenance.retrievalScore,
            discoveredByQueries: provenance.discoveredByQueries,
            discoveredByFamilies: provenance.discoveredByFamilies,
          });
          return null;
        }
        successfulFetches += 1;
        if (documentTrace) {
          documentTrace.fetchOutcome = "FETCHED";
          documentTrace.documentType =
            result.document.contentType === "application/pdf" ? "PDF" : "HTML";
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
          if (documentTrace) {
            documentTrace.extractionOutcome = "FILTERED_BEFORE_EXTRACTION";
            addDocumentRejectReasons(documentTrace, reason);
          }
          return null;
        }
        documentsFetchSucceeded += 1;
        bytesFetched += result.document.byteLength;
        robotsCacheHits += result.robotsFromCache ? 1 : 0;
        if (result.document.contentType === "application/pdf") pdfFetched += 1;
        else htmlFetched += 1;
        return { provenance, document: result.document, selectedIndex: index };
      },
    );

    const fetchedDocuments = fetched.filter(
      (
        item,
      ): item is {
        provenance: DiscoveredPrivateWebResult;
        document: FetchedDocument;
        selectedIndex: number;
      } =>
        Boolean(item),
    );
    const verified: Array<{
      candidate: VerifiedPrivateWebCandidate;
      provenance: DiscoveredPrivateWebResult;
    }> = [];
    let geminiCalls = 0;
    let geminiSuccesses = 0;
    let geminiInputTokens = 0;
    let geminiOutputTokens = 0;
    let geminiLimitSkipped = 0;
    const geminiFailureCounts = new Map<GeminiFailureCode, number>();
    const geminiInvalidCandidates: GeminiInvalidCandidateIssue[] = [];
    let deterministicCandidates = 0;
    let geminiCandidates = 0;
    let documentsExtracted = 0;
    const candidateRejectReason: Record<string, number> = {};
    const candidateSecondaryRejectReason: Record<string, number> = {};
    const countryDecisions: Array<{ decision: string; confidence: number }> = [];

    for (const [documentIndex, item] of fetchedDocuments.entries()) {
      const documentTrace = selectedDocumentTraces[item.selectedIndex];
      const documentRejectReasons: string[] = [];
      if (totalController.signal.aborted) {
        increment(discardCounts, "TOTAL_TIMEOUT");
        if (documentTrace) {
          documentTrace.extractionOutcome = "NOT_ATTEMPTED_TOTAL_TIMEOUT";
          addDocumentRejectReasons(documentTrace, "TOTAL_TIMEOUT");
        }
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
        if (documentTrace) documentTrace.candidateCount += 1;
        const result = verifyPrivateWebCandidate({
          candidate: deterministic,
          document: item.document,
          query: input.query,
          now: deps.now(),
          minQueryCoverage: config.queryMinCoverage,
          braveResult: {
            title: item.provenance.title,
            url: item.provenance.url,
          },
        });
        if ("verificationStatus" in result) {
          if (documentTrace) {
            documentTrace.extractionOutcome = "VERIFIED";
            documentTrace.primaryRejectReason = null;
            documentTrace.secondaryRejectReasons = [];
          }
          verified.push({ candidate: result, provenance: item.provenance });
          countryDecisions.push({
            decision: result.countryEvidence.decision,
            confidence: result.countryEvidence.confidence,
          });
          continue;
        }
        deterministicRejection = result;
        documentRejectReasons.push(
          result.primaryRejectReason,
          ...result.secondaryRejectReasons,
        );
        increment(candidateRejectReason, result.reasonCode);
        for (const reason of result.secondaryRejectReasons) {
          increment(candidateSecondaryRejectReason, reason);
        }
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
        if (documentTrace) {
          documentTrace.extractionOutcome = "NO_VERIFIED_CANDIDATE";
          addDocumentRejectReasons(
            documentTrace,
            documentRejectReasons[0] ?? reason,
            documentRejectReasons.slice(1),
          );
        }
        increment(discardCounts, reason);
        traces.push({
          temporaryId: `extract-${documentIndex + 1}`,
          title: deterministic?.title ?? item.document.title,
          titleSource: deterministic?.titleSource ?? item.document.titleSource ?? null,
          braveTitle: boundedTraceText(item.provenance.title, 500),
          organizationName: deterministic?.organizationName ?? null,
          summary: boundedTraceText(deterministic?.description, 500),
          officialSourceUrl: item.document.canonicalUrl ?? item.document.finalUrl,
          sourceDomain: item.provenance.domain,
          deadlineAt: deterministic?.deadlineAt ?? null,
          category: deterministic?.category ?? null,
          stage: "EXTRACTION",
          outcome: "REJECTED",
          reasonCode: reason,
          primaryRejectReason:
            deterministicRejection?.primaryRejectReason ?? reason,
          secondaryRejectReasons:
            deterministicRejection?.secondaryRejectReasons ?? [],
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
        if (documentTrace) {
          documentTrace.extractionOutcome = "NOT_ATTEMPTED_TOTAL_TIMEOUT";
          addDocumentRejectReasons(documentTrace, "TOTAL_TIMEOUT");
        }
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
      } catch (error) {
        const code = totalController.signal.aborted
          ? "TIMEOUT"
          : classifyGeminiFailure(error);
        geminiFailureCounts.set(code, (geminiFailureCounts.get(code) ?? 0) + 1);
        increment(
          discardCounts,
          code === "TIMEOUT" ? "TOTAL_TIMEOUT" : "GEMINI_EXTRACTION_FAILED",
        );
        console.error("private_web_gemini_extraction_failed", {
          executionId: execution.id,
          documentIndex,
          code,
        });
        if (documentTrace) {
          documentTrace.extractionOutcome = "GEMINI_FAILED";
          addDocumentRejectReasons(documentTrace, code);
        }
        continue;
      }
      geminiInputTokens += extraction.inputTokens;
      geminiOutputTokens += extraction.outputTokens;
      geminiCandidates += extraction.candidates.length;
      const invalidCandidates = extraction.invalidCandidates ?? [];
      geminiInvalidCandidates.push(...invalidCandidates);
      if (invalidCandidates.length > 0) {
        increment(
          discardCounts,
          "GEMINI_INVALID_CANDIDATE",
          invalidCandidates.length,
        );
      }
      if (documentTrace) {
        documentTrace.candidateCount +=
          extraction.candidates.length + invalidCandidates.length;
      }
      if (extraction.failureKind) {
        increment(discardCounts, extraction.failureKind);
        geminiFailureCounts.set(
          "INVALID_RESPONSE",
          (geminiFailureCounts.get("INVALID_RESPONSE") ?? 0) + 1,
        );
        console.warn("private_web_gemini_invalid_response", {
          executionId: execution.id,
          documentIndex,
          code: "INVALID_RESPONSE",
        });
        if (documentTrace) {
          documentTrace.extractionOutcome = "INVALID_RESPONSE";
          addDocumentRejectReasons(documentTrace, "INVALID_RESPONSE");
        }
      } else {
        geminiSuccesses += 1;
      }
      let verifiedThisDocument = false;
      for (const geminiCandidate of extraction.candidates) {
        const result = verifyPrivateWebCandidate({
          candidate: geminiCandidate,
          document: item.document,
          query: input.query,
          now: deps.now(),
          minQueryCoverage: config.queryMinCoverage,
          braveResult: {
            title: item.provenance.title,
            url: item.provenance.url,
          },
        });
        if ("verificationStatus" in result) {
          verifiedThisDocument = true;
          verified.push({ candidate: result, provenance: item.provenance });
          countryDecisions.push({
            decision: result.countryEvidence.decision,
            confidence: result.countryEvidence.confidence,
          });
        } else {
          documentRejectReasons.push(
            result.primaryRejectReason,
            ...result.secondaryRejectReasons,
          );
          increment(discardCounts, result.reasonCode);
          increment(candidateRejectReason, result.reasonCode);
          for (const reason of result.secondaryRejectReasons) {
            increment(candidateSecondaryRejectReason, reason);
          }
          traces.push({
            temporaryId: `gemini-${documentIndex + 1}-${geminiCandidate.title.slice(0, 40)}`,
            title: geminiCandidate.title,
            titleSource: geminiCandidate.titleSource,
            braveTitle: boundedTraceText(item.provenance.title, 500),
            organizationName: geminiCandidate.organizationName,
            summary: boundedTraceText(geminiCandidate.description, 500),
            officialSourceUrl: item.document.canonicalUrl ?? item.document.finalUrl,
            sourceDomain: item.provenance.domain,
            deadlineAt: geminiCandidate.deadlineAt,
            category: geminiCandidate.category,
            stage: "VERIFICATION",
            outcome: "REJECTED",
            reasonCode: result.reasonCode,
            primaryRejectReason: result.primaryRejectReason,
            secondaryRejectReasons: result.secondaryRejectReasons,
            reason: result.reason,
            retrievalScore: item.provenance.retrievalScore,
            discoveredByQueries: item.provenance.discoveredByQueries,
            discoveredByFamilies: item.provenance.discoveredByFamilies,
          });
          if (result.countryEvidence) {
            countryDecisions.push({
              decision: result.countryEvidence.decision,
              confidence: result.countryEvidence.confidence,
            });
          }
        }
      }
      if (documentTrace && !extraction.failureKind) {
        if (verifiedThisDocument) {
          documentTrace.extractionOutcome = "VERIFIED";
          documentTrace.primaryRejectReason = null;
          documentTrace.secondaryRejectReasons = [];
        } else {
          documentTrace.extractionOutcome =
            extraction.candidates.length > 0 || invalidCandidates.length > 0
              ? "NO_VERIFIED_CANDIDATE"
              : "NO_CANDIDATE";
          const primary =
            documentRejectReasons[0] ??
            (invalidCandidates.length > 0
              ? "GEMINI_INVALID_CANDIDATE"
              : "NO_CANDIDATE");
          addDocumentRejectReasons(
            documentTrace,
            primary,
            documentRejectReasons.slice(1),
          );
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
    let persistenceAttempts = 0;
    for (const [index, item] of candidates.entries()) {
      if (totalController.signal.aborted) {
        increment(discardCounts, "TOTAL_TIMEOUT");
        break;
      }
      let persistence: PrivateWebPersistenceOutcome;
      persistenceAttempts += 1;
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
    const geminiFailures: GeminiFailureMetric[] = [...geminiFailureCounts]
      .map(([code, count]) => ({ code, count }))
      .sort((left, right) => left.code.localeCompare(right.code));
    const extractionFailures = geminiFailures.reduce(
      (sum, failure) => sum + failure.count,
      0,
    );
    const technicalFailures: Record<string, number> = {};
    if (discovery.partial) technicalFailures.BRAVE_PARTIAL = 1;
    if (discardCounts.TOTAL_TIMEOUT) {
      technicalFailures.TOTAL_TIMEOUT = discardCounts.TOTAL_TIMEOUT;
    }
    if (geminiFailures.length > 0) {
      technicalFailures.GEMINI_EXTRACTION_FAILED = geminiFailures.reduce(
        (sum, failure) => sum + failure.count,
        0,
      );
    }
    if (discardCounts.PERSIST_ERROR) {
      technicalFailures.PERSIST_ERROR = discardCounts.PERSIST_ERROR;
    }
    if (discardCounts.NETWORK_ERROR) {
      technicalFailures.DOCUMENT_NETWORK_ERROR = discardCounts.NETWORK_ERROR;
    }
    if (discardCounts.TIMEOUT) {
      technicalFailures.DOCUMENT_TIMEOUT = discardCounts.TIMEOUT;
    }
    if (discardCounts.ROBOTS_UNAVAILABLE) {
      technicalFailures.ROBOTS_UNAVAILABLE = discardCounts.ROBOTS_UNAVAILABLE;
    }
    if (discardCounts.PDF_PARSE_FAILED) {
      technicalFailures.PDF_PARSE_FAILED = discardCounts.PDF_PARSE_FAILED;
    }
    if (discardCounts.PDF_PASSWORD_PROTECTED) {
      technicalFailures.PDF_PASSWORD_PROTECTED =
        discardCounts.PDF_PASSWORD_PROTECTED;
    }
    if (discardCounts.PDF_TRUNCATED) {
      technicalFailures.PDF_TRUNCATED = discardCounts.PDF_TRUNCATED;
    }
    if (discardCounts.PDF_UNSUPPORTED) {
      technicalFailures.PDF_UNSUPPORTED = discardCounts.PDF_UNSUPPORTED;
    }
    if (discardCounts.PDF_TOO_LARGE) {
      technicalFailures.PDF_TOO_LARGE = discardCounts.PDF_TOO_LARGE;
    }
    if (discardCounts.PDF_INVALID_SIGNATURE) {
      technicalFailures.PDF_INVALID_SIGNATURE =
        discardCounts.PDF_INVALID_SIGNATURE;
    }
    if (discardCounts.DOCUMENT_TOO_LARGE) {
      technicalFailures.DOCUMENT_TOO_LARGE = discardCounts.DOCUMENT_TOO_LARGE;
    }
    if (discardCounts.UNSUPPORTED_CONTENT_ENCODING) {
      technicalFailures.UNSUPPORTED_CONTENT_ENCODING =
        discardCounts.UNSUPPORTED_CONTENT_ENCODING;
    }
    if (discardCounts.HTTP_ERROR) {
      technicalFailures.DOCUMENT_HTTP_ERROR = discardCounts.HTTP_ERROR;
    }
    if (discardCounts.DNS_FAILED) {
      technicalFailures.DOCUMENT_DNS_FAILED = discardCounts.DNS_FAILED;
    }
    if (discardCounts.TOO_MANY_REDIRECTS) {
      technicalFailures.DOCUMENT_REDIRECT_FAILED =
        discardCounts.TOO_MANY_REDIRECTS;
    }
    const fetchesNotAttempted = Math.max(0, selected.length - documentFetchAttempts);
    if (fetchesNotAttempted > 0) {
      technicalFailures.DOCUMENT_FETCH_NOT_ATTEMPTED = fetchesNotAttempted;
    }
    const technicalPartialReasons = [
      ...(discovery.partial ? ["BRAVE_PARTIAL"] : []),
      ...(discardCounts.TOTAL_TIMEOUT ? ["TOTAL_TIMEOUT"] : []),
      ...(geminiFailures.length > 0 ? ["GEMINI_EXTRACTION_FAILED"] : []),
      ...(discardCounts.PERSIST_ERROR ? ["PERSIST_ERROR"] : []),
      ...(discardCounts.NETWORK_ERROR ? ["DOCUMENT_NETWORK_ERROR"] : []),
      ...(discardCounts.TIMEOUT ? ["DOCUMENT_TIMEOUT"] : []),
      ...(discardCounts.ROBOTS_UNAVAILABLE ? ["ROBOTS_UNAVAILABLE"] : []),
      ...(discardCounts.PDF_PARSE_FAILED ? ["PDF_PARSE_FAILED"] : []),
      ...(discardCounts.PDF_PASSWORD_PROTECTED
        ? ["PDF_PASSWORD_PROTECTED"]
        : []),
      ...(discardCounts.PDF_TRUNCATED ? ["PDF_TRUNCATED"] : []),
      ...(discardCounts.PDF_UNSUPPORTED ? ["PDF_UNSUPPORTED"] : []),
      ...(discardCounts.PDF_TOO_LARGE ? ["PDF_TOO_LARGE"] : []),
      ...(discardCounts.PDF_INVALID_SIGNATURE ? ["PDF_INVALID_SIGNATURE"] : []),
      ...(discardCounts.DOCUMENT_TOO_LARGE ? ["DOCUMENT_TOO_LARGE"] : []),
      ...(discardCounts.UNSUPPORTED_CONTENT_ENCODING
        ? ["UNSUPPORTED_CONTENT_ENCODING"]
        : []),
      ...(discardCounts.HTTP_ERROR ? ["DOCUMENT_HTTP_ERROR"] : []),
      ...(discardCounts.DNS_FAILED ? ["DOCUMENT_DNS_FAILED"] : []),
      ...(discardCounts.TOO_MANY_REDIRECTS
        ? ["DOCUMENT_REDIRECT_FAILED"]
        : []),
      ...(fetchesNotAttempted > 0 ? ["DOCUMENT_FETCH_NOT_ATTEMPTED"] : []),
    ];
    // Budget and selection caps remain observable in `limitKinds`; only
    // technical failures make an execution partial.
    const partialReasons = [...new Set(technicalPartialReasons)];
    const status = determinePrivateWebStatus({
      technicalFailureCount: Object.values(technicalFailures).reduce(
        (sum, count) => sum + count,
        0,
      ),
      fetchAttempted: documentFetchAttempts,
      fetchSucceeded: successfulFetches,
      extractionAttempted: geminiCalls,
      extractionSucceeded: geminiSuccesses,
      persistenceAttempted: persistenceAttempts,
      persistenceFailures: discardCounts.PERSIST_ERROR ?? 0,
      persisted,
      timedOut: Boolean(
        totalController.signal.aborted || discardCounts.TOTAL_TIMEOUT,
      ),
    });
    const resultDisposition = determinePrivateWebResultDisposition({
      status,
      discoveryResults: discovery.results.length,
      documentsProcessed: documentsExtracted,
      extractedCandidates: deterministicCandidates + geminiCandidates,
      persisted,
    });
    const braveEstimatedCost =
      discovery.metrics.totalRequests * config.braveCostPerRequest;
    const geminiEstimatedCost =
      geminiInputTokens * 0.0000001 + geminiOutputTokens * 0.0000004;
    const metrics = {
      ...baseMetrics,
      ...discovery.metrics,
      outcome: status,
      resultDisposition,
      searchProviderResults: discovery.metrics.providerResults,
      searchProviderUniqueUrls: discovery.metrics.urlsAfterDedupe,
      searchProviderUniqueDomains: new Set(discovery.results.map((item) => item.domain)).size,
      domains,
      canonicalDedupe:
        discovery.metrics.canonicalDedupe +
        Math.max(0, verified.length - bestByUrl.size),
      plannedDocuments,
      selectedDocuments: selected.length,
      selectionMode,
      qualifiedDocuments,
      fallbackDocuments,
      attemptedDocuments: documentFetchAttempts,
      successfulFetches,
      fetchAttempted: documentFetchAttempts,
      fetchSucceeded: successfulFetches,
      fetchFailed: Math.max(0, documentFetchAttempts - successfulFetches),
      pdfParseFailed: discardCounts.PDF_PARSE_FAILED ?? 0,
      pdfNoText: discardCounts.PDF_NO_EXTRACTABLE_TEXT ?? 0,
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
      extractionAttempts: geminiCalls,
      extractionSuccesses: geminiSuccesses,
      extractionFailures,
      extractionAttempted: geminiCalls,
      extractionSucceeded: geminiSuccesses,
      geminiFailures,
      geminiInvalidCandidates,
      technicalFailures,
      candidatesFound: candidates.length,
      candidateExtracted: deterministicCandidates + geminiCandidates,
      candidateRejected: Object.values(candidateRejectReason).reduce(
        (sum, count) => sum + count,
        0,
      ),
      candidateRejectReason,
      candidateSecondaryRejectReason,
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
        documentFetches: documentFetchAttempts,
        documentsFetched: successfulFetches,
        geminiExtractions: geminiCalls,
        resultsPersisted: persisted,
      },
      estimatedCosts: {
        brave: braveEstimatedCost.toFixed(6),
        gemini: geminiEstimatedCost.toFixed(6),
      },
      selectedDocumentTraces,
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
      resultDisposition,
    };
  } catch {
    const metrics = {
      ...baseMetrics,
      outcome: "FAILED",
      resultDisposition: null,
      terminationCause: "PIPELINE_FAILED",
      discardCounts,
      durationMs: Date.now() - pipelineStartedAt,
      limitsReached,
      selectedDocumentTraces,
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
      resultDisposition: null,
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
