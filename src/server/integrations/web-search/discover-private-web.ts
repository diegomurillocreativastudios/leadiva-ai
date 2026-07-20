import "server-only";

import { extractDomain, normalizeUrl, urlEquivalenceKey } from "@/lib/normalization";
import { isGenericOrListingSourceUrl } from "@/lib/source-url-specificity";
import {
  HostConcurrencyLimiter,
  fetchWebDocument,
  type DocumentFetchResult,
  type FetchedDocument,
  type WebDocumentFetcherDeps,
} from "@/server/services/web-document-fetcher";
import {
  deduplicateDiscoveryCandidates,
  mapWithConcurrency,
} from "@/server/integrations/vertex-ai/discovery-fanout";
import {
  extractOpportunitiesFromDocument,
  type DocumentExtractionResult,
} from "@/server/integrations/vertex-ai/document-extractor";
import { groundingBatchSchema, type GroundingBatch } from "@/server/integrations/vertex-ai/schemas";
import type { DiscoverySearchPlan, SearchIntent } from "@/server/integrations/vertex-ai/query";
import type { GroundingSource } from "@/server/integrations/vertex-ai/grounding-sources";
import type { WebSearchProvider, WebSearchResult } from "./contracts";
import { WebSearchProviderError } from "./contracts";
import {
  deduplicateWebResults,
  selectDiverseResults,
  type SelectedWebResult,
  type SourceRelationship,
} from "./discovery-selection";

export type PrivateWebDiscoveryBudget = {
  maxProviderQueries: number;
  resultsPerQuery: number;
  maxPagesPerQuery: number;
  maxProviderResults: number;
  maxUniqueUrls: number;
  maxUrlsPerDomain: number;
  searchConcurrency: number;
  searchTimeoutMs: number;
  maxConsecutiveEmptyQueries: number;
  maxFetchDocuments: number;
  fetchConcurrency: number;
  fetchTimeoutMs: number;
  maxDocumentBytes: number;
  maxRedirects: number;
  maxRequestsPerHost: number;
  fetchUserAgent: string;
  robotsCacheTtlMs: number;
  maxPdfPages: number;
  maxExtractionDocuments: number;
  extractionConcurrency: number;
  maxExtractionTokens: number;
  targetCandidates: number;
  maxEstimatedCost: number;
  providerCostPerRequest: number;
  country?: string;
  publishedAfter?: string | null;
  publishedBefore?: string | null;
};

export type PrivateWebDiscoveryMetrics = {
  discoveryMode: "PROVIDER_SEARCH";
  searchProvider: string;
  searchProviderQueriesPlanned: number;
  searchProviderQueriesExecuted: number;
  searchProviderRequests: number;
  searchProviderResults: number;
  searchProviderUniqueUrls: number;
  searchProviderUniqueDomains: number;
  searchProviderErrors: Record<string, number>;
  searchProviderRetries: number;
  resultsByQueryFamily: Record<string, number>;
  resultsByDomain: Record<string, number>;
  crossQueryDuplicates: number;
  resultsRejectedByRetrievalClassifier: number;
  resultsSelectedForFetch: number;
  robotsChecks: number;
  robotsDisallowed: number;
  documentsFetchAttempted: number;
  documentsFetchSucceeded: number;
  documentsFetchFailed: number;
  documentsByContentType: Record<string, number>;
  documentBytesDownloaded: number;
  pdfDocumentsProcessed: number;
  pdfDocumentsWithoutText: number;
  documentsSentToExtraction: number;
  documentsExtracted: number;
  extractionFailures: number;
  extractionTokens: number;
  extractionInputTokens: number;
  extractionOutputTokens: number;
  groundingVerificationRequests: number;
  groundingVerificationSucceeded: number;
  groundingVerificationFailed: number;
  normalizationOutputItems: number;
  schemaValidCandidatesBeforeDeduplication: number;
  schemaInvalidCandidates: number;
  uniqueNormalizedCandidates: number;
  estimatedProviderCost: number;
  estimatedVertexCost: number;
  estimatedTotalCost: number;
  /** Total discovery wall time in milliseconds. */
  durationMs: number;
  /** Provider search requests wall time in milliseconds. */
  providerSearchDurationMs: number;
  /** Document fetch wall time in milliseconds. */
  documentFetchDurationMs: number;
  /** Document extraction / normalization wall time in milliseconds. */
  extractionDurationMs: number;
  stoppedBy: string | null;
};

export type PrivateWebDiscoveryResult = {
  batch: GroundingBatch;
  metrics: PrivateWebDiscoveryMetrics;
  /** Deduplicated provider results retained only for the bounded execution trace. */
  providerResults?: SelectedWebResult[];
  selectedResults: SelectedWebResult[];
  documents: Array<{
    document: FetchedDocument;
    sourceRelationship: SourceRelationship;
    discoveredByQueries: string[];
    discoveredByFamilies: string[];
  }>;
  candidateMetadata: Array<{
    title: string;
    sourceUrl: string;
    discoveredByQueries: string[];
    discoveredByFamilies: string[];
    sourceRelationship: SourceRelationship;
    duplicateEvidenceCount: number;
    publishedAt: string | null;
    applicationUrl: string | null;
    applicationMethod: string | null;
    evidence: unknown[];
  }>;
  diagnosticTraces?: Array<{
    temporaryId: string;
    title: string | null;
    officialSourceUrl: string;
    sourceDomain: string | null;
    stage: "FETCH" | "EXTRACTION";
    outcome: "ERROR";
    reasonCode: string;
    reason: string;
    discoveredByQueries: string[];
    discoveredByFamilies: string[];
  }>;
  operationalError: WebSearchProviderError | null;
};

type DiscoveryDeps = {
  fetchDocument?: (
    url: string,
    deps: WebDocumentFetcherDeps,
  ) => Promise<DocumentFetchResult>;
  extractDocument?: (
    document: FetchedDocument,
    maxOutputTokens: number,
  ) => Promise<DocumentExtractionResult>;
  now?: () => Date;
};

function emptyMetrics(provider: string, planned: number): PrivateWebDiscoveryMetrics {
  return {
    discoveryMode: "PROVIDER_SEARCH",
    searchProvider: provider,
    searchProviderQueriesPlanned: planned,
    searchProviderQueriesExecuted: 0,
    searchProviderRequests: 0,
    searchProviderResults: 0,
    searchProviderUniqueUrls: 0,
    searchProviderUniqueDomains: 0,
    searchProviderErrors: {},
    searchProviderRetries: 0,
    resultsByQueryFamily: {},
    resultsByDomain: {},
    crossQueryDuplicates: 0,
    resultsRejectedByRetrievalClassifier: 0,
    resultsSelectedForFetch: 0,
    robotsChecks: 0,
    robotsDisallowed: 0,
    documentsFetchAttempted: 0,
    documentsFetchSucceeded: 0,
    documentsFetchFailed: 0,
    documentsByContentType: {},
    documentBytesDownloaded: 0,
    pdfDocumentsProcessed: 0,
    pdfDocumentsWithoutText: 0,
    documentsSentToExtraction: 0,
    documentsExtracted: 0,
    extractionFailures: 0,
    extractionTokens: 0,
    extractionInputTokens: 0,
    extractionOutputTokens: 0,
    groundingVerificationRequests: 0,
    groundingVerificationSucceeded: 0,
    groundingVerificationFailed: 0,
    normalizationOutputItems: 0,
    schemaValidCandidatesBeforeDeduplication: 0,
    schemaInvalidCandidates: 0,
    uniqueNormalizedCandidates: 0,
    estimatedProviderCost: 0,
    estimatedVertexCost: 0,
    estimatedTotalCost: 0,
    durationMs: 0,
    providerSearchDurationMs: 0,
    documentFetchDurationMs: 0,
    extractionDurationMs: 0,
    stoppedBy: null,
  };
}

function addCount(record: Record<string, number>, key: string, amount = 1) {
  record[key] = (record[key] ?? 0) + amount;
}

function providerCost(metrics: PrivateWebDiscoveryMetrics, budget: PrivateWebDiscoveryBudget) {
  metrics.estimatedProviderCost =
    metrics.searchProviderRequests * budget.providerCostPerRequest;
  metrics.estimatedTotalCost =
    metrics.estimatedProviderCost + metrics.estimatedVertexCost;
}

function emptyBatch(params: {
  queries: string[];
  sources?: GroundingSource[];
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
}): GroundingBatch {
  return groundingBatchSchema.parse({
    candidates: [],
    citations: (params.sources ?? []).map((source) => ({
      uri: source.url,
      title: source.title ?? undefined,
    })),
    sources: params.sources ?? [],
    searchQueries: params.queries,
    inputTokens: params.inputTokens ?? 0,
    outputTokens: params.outputTokens ?? 0,
    model: params.model,
    promptVersion: "provider-web-v1",
    configured: true,
  });
}

function canSpendProviderRequest(
  metrics: PrivateWebDiscoveryMetrics,
  budget: PrivateWebDiscoveryBudget,
): boolean {
  return (
    metrics.estimatedTotalCost + budget.providerCostPerRequest <=
    budget.maxEstimatedCost
  );
}

async function searchIntent(
  intent: SearchIntent,
  params: {
    executionId: string;
    provider: WebSearchProvider;
    budget: PrivateWebDiscoveryBudget;
    metrics: PrivateWebDiscoveryMetrics;
    signal?: AbortSignal;
  },
): Promise<{
  results: WebSearchResult[];
  exhausted: boolean;
  error: WebSearchProviderError | null;
  requestExecuted: boolean;
}> {
  const results: WebSearchResult[] = [];
  let exhausted = false;
  let requestExecuted = false;
  for (let page = 1; page <= params.budget.maxPagesPerQuery; page += 1) {
    if (params.signal?.aborted) {
      params.metrics.stoppedBy = "REQUEST_CANCELLED";
      break;
    }
    if (!canSpendProviderRequest(params.metrics, params.budget)) {
      params.metrics.stoppedBy = "MAX_ESTIMATED_COST";
      break;
    }
    try {
      // Reserve the base request before awaiting so concurrent workers cannot
      // both pass the same remaining-cost check.
      params.metrics.searchProviderRequests += 1;
      providerCost(params.metrics, params.budget);
      requestExecuted = true;
      const response = await params.provider.search(
        {
          query: intent.query,
          language: intent.language,
          country: intent.regional ? params.budget.country : undefined,
          page,
          resultsPerPage: params.budget.resultsPerQuery,
          publishedAfter: params.budget.publishedAfter,
          publishedBefore: params.budget.publishedBefore,
          timeoutMs: params.budget.searchTimeoutMs,
        },
        {
          signal: params.signal,
          executionId: params.executionId,
          queryFamily: intent.family,
        },
      );
      params.metrics.searchProviderRequests += Math.max(
        0,
        response.requestCount - 1,
      );
      params.metrics.searchProviderRetries += response.retryCount;
      providerCost(params.metrics, params.budget);
      results.push(...response.results);
      exhausted = response.exhausted;
      if (
        exhausted ||
        params.metrics.searchProviderResults + results.length >=
          params.budget.maxProviderResults
      ) {
        break;
      }
    } catch (error) {
      const providerError =
        error instanceof WebSearchProviderError
          ? error
          : new WebSearchProviderError(
              "PROVIDER_REQUEST_FAILED",
              "El proveedor de búsqueda falló",
            );
      params.metrics.searchProviderRequests += Math.max(
        0,
        (providerError.options.attempts ?? 1) - 1,
      );
      params.metrics.searchProviderRetries += Math.max(
        0,
        (providerError.options.attempts ?? 1) - 1,
      );
      addCount(params.metrics.searchProviderErrors, providerError.code);
      providerCost(params.metrics, params.budget);
      return {
        results,
        exhausted: true,
        error: providerError,
        requestExecuted,
      };
    }
  }
  return { results, exhausted, error: null, requestExecuted };
}

function isFatalProviderError(error: WebSearchProviderError | null): boolean {
  return (
    error?.code === "PROVIDER_NOT_CONFIGURED" ||
    error?.code === "PROVIDER_UNAUTHORIZED"
  );
}

function linkedDocumentUrls(document: FetchedDocument): string[] {
  return document.links.filter(
    (url) =>
      !isGenericOrListingSourceUrl(url) &&
      /\.pdf(?:\?|$)|apply|application|proposal|submit|form|procurement|rfp|rfq|tender|licitaci|convocatoria|proceso|notice|expediente/i.test(
        url,
      ),
  );
}

function isAggregatorIndexDocument(params: {
  sourceRelationship: SourceRelationship;
  document: FetchedDocument;
}): boolean {
  if (
    params.sourceRelationship === "AGGREGATOR" ||
    params.sourceRelationship === "SOCIAL_DISCOVERY"
  ) {
    return true;
  }
  const sourceUrl = params.document.canonicalUrl ?? params.document.finalUrl;
  return isGenericOrListingSourceUrl(sourceUrl);
}

function groundingSourcesForDocuments(
  documents: PrivateWebDiscoveryResult["documents"],
): GroundingSource[] {
  const sources = new Map<string, GroundingSource>();
  for (const item of documents) {
    const sourceUrl = item.document.canonicalUrl ?? item.document.finalUrl;
    const key = urlEquivalenceKey(sourceUrl);
    if (!key || sources.has(key)) {
      continue;
    }
    sources.set(key, {
      url: sourceUrl,
      normalizedUrl: normalizeUrl(sourceUrl),
      equivalenceKey: key,
      title: item.document.title,
      domain: extractDomain(sourceUrl),
      supportCount: Math.max(1, item.discoveredByQueries.length),
      maxConfidence: null,
    });
  }
  return [...sources.values()];
}

export async function discoverPrivateWeb(params: {
  executionId: string;
  searchPlan: DiscoverySearchPlan;
  provider: WebSearchProvider;
  budget: PrivateWebDiscoveryBudget;
  signal?: AbortSignal;
  deps?: DiscoveryDeps;
}): Promise<PrivateWebDiscoveryResult> {
  const startedAt = Date.now();
  const intents = params.searchPlan.intents.slice(
    0,
    params.budget.maxProviderQueries,
  );
  const metrics = emptyMetrics(params.provider.name, intents.length);
  const rawResults: WebSearchResult[] = [];
  const executedQueries: string[] = [];
  let consecutiveEmpty = 0;
  let operationalError: WebSearchProviderError | null = null;

  if (params.provider.isConfigured?.() === false) {
    operationalError = new WebSearchProviderError(
      "PROVIDER_NOT_CONFIGURED",
      "El proveedor de búsqueda no está configurado",
      { retryable: false, attempts: 0 },
    );
    metrics.searchProviderErrors.PROVIDER_NOT_CONFIGURED = 1;
    metrics.stoppedBy = "PROVIDER_NOT_CONFIGURED";
    metrics.durationMs = Date.now() - startedAt;
    return {
      batch: emptyBatch({ queries: [] }),
      metrics,
      providerResults: [],
      selectedResults: [],
      documents: [],
      candidateMetadata: [],
      diagnosticTraces: [],
      operationalError,
    };
  }

  let searchStart = 0;
  const providerSearchStartedAt = performance.now();
  while (searchStart < intents.length && !operationalError) {
    if (params.signal?.aborted || metrics.stoppedBy === "MAX_ESTIMATED_COST") {
      metrics.stoppedBy ??= "REQUEST_CANCELLED";
      break;
    }
    // Probe one intent first so a bad API key cannot fan out across concurrent
    // requests. Once authenticated, subsequent waves use configured concurrency.
    const waveSize = searchStart === 0 ? 1 : params.budget.searchConcurrency;
    const wave = intents.slice(searchStart, searchStart + waveSize);
    searchStart += wave.length;
    const settled = await Promise.allSettled(
      wave.map((intent) =>
        searchIntent(intent, {
          executionId: params.executionId,
          provider: params.provider,
          budget: params.budget,
          metrics,
          signal: params.signal,
        }),
      ),
    );
    for (const [index, item] of settled.entries()) {
      const intent = wave[index];
      if (!intent) {
        continue;
      }
      if (item.status === "rejected") {
        addCount(metrics.searchProviderErrors, "PROVIDER_REQUEST_FAILED");
        consecutiveEmpty += 1;
        continue;
      }
      const response = item.value;
      if (response.requestExecuted) {
        metrics.searchProviderQueriesExecuted += 1;
        executedQueries.push(intent.query);
      }
      if (isFatalProviderError(response.error)) {
        operationalError = response.error;
        metrics.stoppedBy = response.error?.code ?? "PROVIDER_FATAL";
        break;
      }
      if (response.results.length === 0) {
        consecutiveEmpty += 1;
      } else {
        consecutiveEmpty = 0;
      }
      for (const result of response.results) {
        if (rawResults.length >= params.budget.maxProviderResults) {
          metrics.stoppedBy = "MAX_PROVIDER_RESULTS";
          break;
        }
        rawResults.push(result);
        addCount(metrics.resultsByQueryFamily, result.queryFamily);
        addCount(metrics.resultsByDomain, result.domain);
      }
    }
    metrics.searchProviderResults = rawResults.length;
    if (rawResults.length >= params.budget.maxProviderResults) {
      metrics.stoppedBy = "MAX_PROVIDER_RESULTS";
      break;
    }
    if (consecutiveEmpty >= params.budget.maxConsecutiveEmptyQueries) {
      metrics.stoppedBy = "CONSECUTIVE_EMPTY_QUERIES";
      break;
    }
  }

  metrics.providerSearchDurationMs = Math.round(
    performance.now() - providerSearchStartedAt,
  );

  const deduped = deduplicateWebResults(rawResults);
  metrics.crossQueryDuplicates = deduped.duplicates;
  metrics.searchProviderUniqueUrls = deduped.results.length;
  metrics.searchProviderUniqueDomains = new Set(
    deduped.results.map((result) => result.domain),
  ).size;
  if (deduped.results.length > params.budget.maxUniqueUrls) {
    deduped.results.length = params.budget.maxUniqueUrls;
    metrics.searchProviderUniqueUrls = deduped.results.length;
    metrics.stoppedBy ??= "MAX_UNIQUE_URLS";
  }
  metrics.resultsRejectedByRetrievalClassifier = deduped.results.filter(
    (result) => result.retrieval.recommendation === "SKIP",
  ).length;
  const selectedResults = selectDiverseResults(deduped.results, {
    maxResults: params.budget.maxFetchDocuments,
    maxPerDomain: params.budget.maxUrlsPerDomain,
    maxPerOrganization: 2,
  });
  metrics.resultsSelectedForFetch = selectedResults.length;

  if (operationalError) {
    metrics.durationMs = Date.now() - startedAt;
    return {
      batch: emptyBatch({ queries: executedQueries }),
      metrics,
      providerResults: deduped.results,
      selectedResults,
      documents: [],
      candidateMetadata: [],
      diagnosticTraces: [],
      operationalError,
    };
  }

  const fetchDocument = params.deps?.fetchDocument ?? fetchWebDocument;
  const hostLimiter = new HostConcurrencyLimiter(
    params.budget.maxRequestsPerHost,
  );
  const fetchDeps: WebDocumentFetcherDeps = {
    timeoutMs: params.budget.fetchTimeoutMs,
    maxRedirects: params.budget.maxRedirects,
    maxDocumentBytes: params.budget.maxDocumentBytes,
    maxPdfPages: params.budget.maxPdfPages,
    userAgent: params.budget.fetchUserAgent,
    robotsCacheTtlMs: params.budget.robotsCacheTtlMs,
    signal: params.signal,
    now: params.deps?.now,
    requestGate: (url, task) => hostLimiter.run(url, task),
  };
  const fetched: PrivateWebDiscoveryResult["documents"] = [];
  const diagnosticTraces: NonNullable<
    PrivateWebDiscoveryResult["diagnosticTraces"]
  > = [];
  const fetchedKeys = new Set<string>();
  let unexpectedFetchErrors = 0;
  const documentFetchStartedAt = performance.now();

  const fetchSelections = async (
    selections: Array<{
      url: string;
      sourceRelationship: SourceRelationship;
      discoveredByQueries: string[];
      discoveredByFamilies: string[];
    }>,
  ) => {
    const remaining = Math.max(
      0,
      params.budget.maxFetchDocuments - metrics.documentsFetchAttempted,
    );
    const limited = selections.slice(0, remaining);
    const results = await mapWithConcurrency(
      limited,
      params.budget.fetchConcurrency,
      async (selection) => {
        metrics.documentsFetchAttempted += 1;
        metrics.robotsChecks += 1;
        let result: DocumentFetchResult;
        try {
          result = await fetchDocument(selection.url, fetchDeps);
        } catch {
          unexpectedFetchErrors += 1;
          result = {
            ok: false,
            code: "NETWORK_ERROR",
            detail: "El servicio de recuperación falló inesperadamente",
          };
        }
        return {
          selection,
          result,
        };
      },
    );
    for (const item of results) {
      if (!item.result.ok) {
        metrics.documentsFetchFailed += 1;
        if (item.result.code === "ROBOTS_DISALLOWED") {
          metrics.robotsDisallowed += 1;
        }
        if (item.result.code === "PDF_NO_EXTRACTABLE_TEXT") {
          metrics.pdfDocumentsWithoutText += 1;
        }
        const providerResult = selectedResults.find(
          (result) => urlEquivalenceKey(result.url) === urlEquivalenceKey(item.selection.url),
        );
        diagnosticTraces.push({
          temporaryId: `fetch-${diagnosticTraces.length + 1}`,
          title: providerResult?.title ?? null,
          officialSourceUrl: item.selection.url,
          sourceDomain: extractDomain(item.selection.url),
          stage: "FETCH",
          outcome: "ERROR",
          reasonCode: item.result.code,
          reason: item.result.detail.slice(0, 800),
          discoveredByQueries: item.selection.discoveredByQueries,
          discoveredByFamilies: item.selection.discoveredByFamilies,
        });
        continue;
      }
      const document = item.result.document;
      const key = urlEquivalenceKey(
        document.canonicalUrl ?? document.finalUrl,
      );
      if (!key || fetchedKeys.has(key)) {
        continue;
      }
      fetchedKeys.add(key);
      metrics.documentsFetchSucceeded += 1;
      metrics.documentBytesDownloaded += document.byteLength;
      addCount(metrics.documentsByContentType, document.contentType);
      if (document.contentType === "application/pdf") {
        metrics.pdfDocumentsProcessed += 1;
      }
      fetched.push({
        document,
        sourceRelationship: item.selection.sourceRelationship,
        discoveredByQueries: item.selection.discoveredByQueries,
        discoveredByFamilies: item.selection.discoveredByFamilies,
      });
    }
  };

  const reservedForLinks = params.budget.maxFetchDocuments > 3 ? 2 : 0;
  const initialLimit = Math.max(
    1,
    params.budget.maxFetchDocuments - reservedForLinks,
  );
  await fetchSelections(
    selectedResults.slice(0, initialLimit).map((result) => ({
      url: result.url,
      sourceRelationship: result.sourceRelationship,
      discoveredByQueries: result.discoveredByQueries,
      discoveredByFamilies: result.discoveredByFamilies,
    })),
  );

  const linked = fetched.flatMap((item) =>
    linkedDocumentUrls(item.document).map((url) => ({
      url,
      sourceRelationship: "LINKED_OFFICIAL" as const,
      discoveredByQueries: item.discoveredByQueries,
      discoveredByFamilies: item.discoveredByFamilies,
    })),
  );
  await fetchSelections(
    linked.filter((item) => {
      const key = urlEquivalenceKey(item.url);
      return Boolean(key && !fetchedKeys.has(key));
    }),
  );
  if (metrics.documentsFetchAttempted < params.budget.maxFetchDocuments) {
    await fetchSelections(
      selectedResults.slice(initialLimit).map((result) => ({
        url: result.url,
        sourceRelationship: result.sourceRelationship,
        discoveredByQueries: result.discoveredByQueries,
        discoveredByFamilies: result.discoveredByFamilies,
      })),
    );
  }
  if (
    metrics.documentsFetchAttempted > 0 &&
    metrics.documentsFetchSucceeded === 0 &&
    unexpectedFetchErrors === metrics.documentsFetchAttempted
  ) {
    metrics.stoppedBy = "FAILED_DOCUMENT_FETCH";
  }
  metrics.documentFetchDurationMs = Math.round(
    performance.now() - documentFetchStartedAt,
  );

  const extractDocument =
    params.deps?.extractDocument ??
    ((document, maxOutputTokens) =>
      extractOpportunitiesFromDocument({ document, maxOutputTokens }));
  const allCandidates: GroundingBatch["candidates"] = [];
  const candidateMetadata: PrivateWebDiscoveryResult["candidateMetadata"] = [];
  let model = "";
  let promptVersion = "provider-web-v1";
  const extractionStartedAt = performance.now();

  const extractionDocuments = fetched.slice(
    0,
    params.budget.maxExtractionDocuments,
  );
  for (
    let start = 0;
    start < extractionDocuments.length;
    start += params.budget.extractionConcurrency
  ) {
    if (allCandidates.length >= params.budget.targetCandidates) {
      metrics.stoppedBy ??= "TARGET_CANDIDATES";
      break;
    }
    if (metrics.estimatedTotalCost >= params.budget.maxEstimatedCost) {
      metrics.stoppedBy ??= "MAX_ESTIMATED_COST";
      break;
    }
    const wave = extractionDocuments.slice(
      start,
      start + params.budget.extractionConcurrency,
    );
    const extractableWave = wave.filter((item) => {
      if (!isAggregatorIndexDocument(item)) {
        return true;
      }
      const sourceUrl = item.document.canonicalUrl ?? item.document.finalUrl;
      const officialLinks = linkedDocumentUrls(item.document);
      diagnosticTraces.push({
        temporaryId: `aggregator-${diagnosticTraces.length + 1}`,
        title: item.document.title,
        officialSourceUrl: sourceUrl,
        sourceDomain: extractDomain(sourceUrl),
        stage: "EXTRACTION",
        outcome: "ERROR",
        reasonCode: "AGGREGATOR_INDEX_PAGE",
        reason:
          "Página índice o agregadora: no se convierte directamente en oportunidad.",
        discoveredByQueries: item.discoveredByQueries,
        discoveredByFamilies: item.discoveredByFamilies,
      });
      if (officialLinks.length === 0) {
        const hasLinkedOfficial = fetched.some(
          (other) =>
            other.sourceRelationship === "LINKED_OFFICIAL" &&
            other.discoveredByQueries.some((query) =>
              item.discoveredByQueries.includes(query),
            ),
        );
        if (!hasLinkedOfficial) {
          diagnosticTraces.push({
            temporaryId: `aggregator-link-${diagnosticTraces.length + 1}`,
            title: item.document.title,
            officialSourceUrl: sourceUrl,
            sourceDomain: extractDomain(sourceUrl),
            stage: "EXTRACTION",
            outcome: "ERROR",
            reasonCode: "OFFICIAL_LINK_NOT_FOUND",
            reason:
              "No se encontró un enlace oficial específico desde la página agregadora.",
            discoveredByQueries: item.discoveredByQueries,
            discoveredByFamilies: item.discoveredByFamilies,
          });
        }
      }
      return false;
    });
    if (extractableWave.length === 0) {
      continue;
    }
    metrics.documentsSentToExtraction += extractableWave.length;
    const settled = await Promise.allSettled(
      extractableWave.map((item) =>
        extractDocument(item.document, params.budget.maxExtractionTokens),
      ),
    );
    for (const [settledIndex, item] of settled.entries()) {
      if (item.status === "rejected") {
        metrics.extractionFailures += 1;
        const sourceDocument = extractableWave[settledIndex];
        if (sourceDocument) {
          diagnosticTraces.push({
            temporaryId: `extraction-${diagnosticTraces.length + 1}`,
            title: sourceDocument.document.title,
            officialSourceUrl:
              sourceDocument.document.canonicalUrl ??
              sourceDocument.document.finalUrl,
            sourceDomain: extractDomain(sourceDocument.document.finalUrl),
            stage: "EXTRACTION",
            outcome: "ERROR",
            reasonCode: "EXTRACTION_FAILED",
            reason: "El analizador no pudo procesar el documento recuperado.",
            discoveredByQueries: sourceDocument.discoveredByQueries,
            discoveredByFamilies: sourceDocument.discoveredByFamilies,
          });
        }
        continue;
      }
      const extraction = item.value;
      if (!extraction.failureKind) {
        metrics.documentsExtracted += 1;
      }
      metrics.normalizationOutputItems += extraction.outputItems;
      metrics.schemaValidCandidatesBeforeDeduplication +=
        extraction.schemaValidCandidatesBeforeDeduplication;
      metrics.schemaInvalidCandidates += extraction.schemaInvalidCandidates;
      metrics.extractionInputTokens += extraction.inputTokens;
      metrics.extractionOutputTokens += extraction.outputTokens;
      metrics.extractionTokens += extraction.inputTokens + extraction.outputTokens;
      metrics.estimatedVertexCost +=
        extraction.inputTokens * 0.0000001 +
        extraction.outputTokens * 0.0000004;
      providerCost(metrics, params.budget);
      const sourceDocument = extractableWave[settledIndex];
      if (extraction.failureKind) {
        metrics.extractionFailures += 1;
        if (sourceDocument) {
          diagnosticTraces.push({
            temporaryId: `extraction-${diagnosticTraces.length + 1}`,
            title: sourceDocument.document.title,
            officialSourceUrl:
              sourceDocument.document.canonicalUrl ??
              sourceDocument.document.finalUrl,
            sourceDomain: extractDomain(sourceDocument.document.finalUrl),
            stage: "EXTRACTION",
            outcome: "ERROR",
            reasonCode: `EXTRACTION_${extraction.failureKind}`,
            reason: "El documento no produjo candidatos estructurados válidos.",
            discoveredByQueries: sourceDocument.discoveredByQueries,
            discoveredByFamilies: sourceDocument.discoveredByFamilies,
          });
        }
      } else if (
        sourceDocument &&
        extraction.candidates.length === 0
      ) {
        diagnosticTraces.push({
          temporaryId: `extraction-${diagnosticTraces.length + 1}`,
          title: sourceDocument.document.title,
          officialSourceUrl:
            sourceDocument.document.canonicalUrl ??
            sourceDocument.document.finalUrl,
          sourceDomain: extractDomain(sourceDocument.document.finalUrl),
          stage: "EXTRACTION",
          outcome: "ERROR",
          reasonCode: "SPECIFIC_OPPORTUNITY_NOT_FOUND",
          reason:
            "La página oficial no contiene una oportunidad concreta con título, organización y señal de contratación.",
          discoveredByQueries: sourceDocument.discoveredByQueries,
          discoveredByFamilies: sourceDocument.discoveredByFamilies,
        });
      }
      model = extraction.model;
      promptVersion = extraction.promptVersion;
      for (const [candidateIndex, candidate] of extraction.candidates.entries()) {
        const draft = extraction.drafts[candidateIndex];
        const hasConcreteSignal =
          Boolean(candidate.title?.trim()) &&
          Boolean(candidate.organizationName?.trim()) &&
          Boolean(
            candidate.snippet ||
              candidate.deadlineAt ||
              draft?.applicationUrl ||
              draft?.applicationMethod,
          );
        if (!hasConcreteSignal) {
          diagnosticTraces.push({
            temporaryId: `extraction-${diagnosticTraces.length + 1}`,
            title: candidate.title,
            officialSourceUrl: candidate.sourceUrl,
            sourceDomain: extractDomain(candidate.sourceUrl),
            stage: "EXTRACTION",
            outcome: "ERROR",
            reasonCode: "SPECIFIC_OPPORTUNITY_NOT_FOUND",
            reason:
              "El candidato carece de título, organización o señal concreta de contratación.",
            discoveredByQueries: sourceDocument?.discoveredByQueries ?? [],
            discoveredByFamilies: sourceDocument?.discoveredByFamilies ?? [],
          });
          continue;
        }
        candidateMetadata.push({
          title: candidate.title,
          sourceUrl: candidate.sourceUrl,
          discoveredByQueries: sourceDocument?.discoveredByQueries ?? [],
          discoveredByFamilies: sourceDocument?.discoveredByFamilies ?? [],
          sourceRelationship:
            sourceDocument?.sourceRelationship ?? "UNKNOWN",
          duplicateEvidenceCount: Math.max(
            0,
            (sourceDocument?.discoveredByQueries.length ?? 1) - 1,
          ),
          publishedAt: draft?.publishedAt ?? null,
          applicationUrl: draft?.applicationUrl ?? null,
          applicationMethod: draft?.applicationMethod ?? null,
          evidence: draft?.evidence ?? [],
        });
        allCandidates.push(candidate);
      }
    }
  }
  metrics.extractionDurationMs = Math.round(
    performance.now() - extractionStartedAt,
  );

  const uniqueCandidates = deduplicateDiscoveryCandidates(allCandidates);
  metrics.uniqueNormalizedCandidates = uniqueCandidates.candidates.length;
  if (!metrics.stoppedBy) {
    if (rawResults.length === 0) {
      metrics.stoppedBy = "NO_PROVIDER_RESULTS";
    } else if (deduped.results.length === 0) {
      metrics.stoppedBy = "NO_UNIQUE_URLS";
    } else if (selectedResults.length === 0) {
      metrics.stoppedBy = "NO_RELEVANT_SEARCH_RESULTS";
    } else if (fetched.length === 0) {
      metrics.stoppedBy = "NO_FETCHABLE_DOCUMENTS";
    } else if (uniqueCandidates.candidates.length === 0) {
      metrics.stoppedBy = "NO_EXTRACTED_CANDIDATES";
    } else {
      metrics.stoppedBy = "DISCOVERY_COMPLETE";
    }
  }
  metrics.durationMs = Date.now() - startedAt;

  const sources = groundingSourcesForDocuments(fetched);
  const batch = groundingBatchSchema.parse({
    ...emptyBatch({
      queries: executedQueries,
      sources,
      inputTokens: metrics.extractionInputTokens,
      outputTokens: metrics.extractionOutputTokens,
      model,
    }),
    candidates: uniqueCandidates.candidates,
    promptVersion,
  });

  return {
    batch,
    metrics,
    providerResults: deduped.results,
    selectedResults,
    documents: fetched,
    candidateMetadata,
    diagnosticTraces,
    operationalError,
  };
}
