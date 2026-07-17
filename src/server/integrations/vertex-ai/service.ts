import "server-only";

import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";

import { getServerEnv } from "@/env/server";
import { areEquivalentUrls, extractDomain } from "@/lib/normalization";
import { db } from "@/server/db";
import {
  searchExecutions,
  searchProfiles,
  searchResults,
} from "@/server/db/schema";
import { searchResultNotDeleted } from "@/server/db/soft-delete";
import { isVertexConfigured } from "./client";
import {
  executePrivateDiscoveryMode,
  resolvePrivateDiscoveryMode,
} from "./discovery-mode";
import { BraveSearchProvider } from "@/server/integrations/web-search/brave-provider";
import {
  discoverPrivateWeb,
  type PrivateWebDiscoveryMetrics,
  type PrivateWebDiscoveryResult,
} from "@/server/integrations/web-search/discover-private-web";
import { buildPrivateRelevanceOptions } from "./filters";
import { searchWithGrounding } from "./grounding";
import {
  mapVerifiedGroundedCandidate,
  type PersistedGroundedSearchResult,
} from "./mapper";
import {
  DIAGNOSTIC_LIMITS,
  PipelineStageError,
  getPipelineFailureStage,
  limitCandidateTraces,
  resolveCandidatesFound,
  resolvePrivateSearchOutcome,
  resolveProviderSearchOutcome,
  shouldPersistVerifiedCandidate,
  isFailedPrivateSearchOutcome,
  type CandidateTrace,
  type PrivateSearchOutcome,
} from "./pipeline-metrics";
import { preparePrivateBatch } from "./prepare";
import { buildDiscoverySearchPlan, getGroundedSearchMode } from "./query";
import {
  verifyGroundedCandidate,
  verifyProviderCandidate,
} from "./verification";

export { buildDefaultPrivateQuery, buildDiscoveryQueries } from "./query";
export type { MappedGroundedSearchResult } from "./mapper";
export type { PrivateSearchOutcome } from "./pipeline-metrics";

export type PrivateSearchMetrics = {
  candidatesCreated: number;
  candidatesUpdated: number;
  candidatesUnchanged: number;
  candidatesDiscarded: number;
  discardCounts: Record<string, number>;
  searchQueries: string[];
  configured: boolean;
  outcome?: PrivateSearchOutcome;
  model?: string;
  promptVersion?: string;
  searchMode?: "PRIVATE_RFP" | "LINKEDIN";
  query?: string;
  queriesExecuted?: number;
  queriesExecutedEstimated?: boolean;
  groundingSources?: number;
  groundingSourcesFound?: number;
  groundingChunksFound?: number;
  groundingDomainsFound?: number;
  groundingUrlsFound?: number;
  groundingUniqueUrlsFound?: number;
  hasGroundingSupports?: boolean;
  rawCandidatesFound?: number;
  normalizedCandidatesFound?: number;
  normalizationOutputItems?: number;
  normalizationInputCandidates?: number;
  normalizationOutputCandidates?: number;
  schemaValidCandidates?: number;
  schemaValidCandidatesBeforeDeduplication?: number;
  schemaInvalidCandidates?: number;
  uniqueNormalizedCandidates?: number;
  candidatesFound?: number;
  candidatesFiltered?: number;
  candidatesDeduplicated?: number;
  acceptedCandidates?: number;
  discoveryTextLength?: number;
  discoveryTextPreview?: string;
  discoveryFinishReason?: string | null;
  discoveryInputTokens?: number;
  discoveryOutputTokens?: number;
  discoveryDurationMs?: number | null;
  providerSearchDurationMs?: number;
  documentFetchDurationMs?: number;
  extractionDurationMs?: number;
  normalizationFinishReason?: string | null;
  normalizationInputTokens?: number;
  normalizationOutputTokens?: number;
  normalizationDurationMs?: number | null;
  normalizationModel?: string | null;
  normalizationPreview?: string;
  normalizationParseError?: string | null;
  normalizationFailureKind?: string | null;
  normalizationRootAdapted?: boolean;
  normalizationOriginalRoot?: string;
  normalizationRetryAttempted?: boolean;
  normalizationRetryReason?: string | null;
  normalizationRetryCandidates?: number;
  normalizationRetryCost?: string | null;
  recoveredFromRawBlocks?: number;
  normalizationValidationErrorsSample?: unknown[];
  pipelineDiagnosis?: string;
  groundingPassesExecuted?: number;
  searchPlanIntents?: unknown[];
  searchFamiliesExecuted?: string[];
  sourcesByFamily?: Record<string, number>;
  domainsByFamily?: Record<string, number>;
  rawCandidatesByFamily?: Record<string, number>;
  normalizedCandidatesByFamily?: Record<string, number>;
  uniqueCandidatesBeforeFilters?: number;
  crossBatchDuplicates?: number;
  passesWithoutNewSources?: number;
  passesWithoutNewCandidates?: number;
  stoppedBy?: string | null;
  candidatesVerified?: number;
  candidatesPartiallyVerified?: number;
  candidatesRejected?: number;
  candidatesSentToVerification?: number;
  persistErrors?: number;
  discardedTraceSample?: CandidateTrace[];
  executionCandidates?: CandidateTrace[];
  discoveryMode?: "GROUNDING_ONLY" | "PROVIDER_SEARCH";
  /** Aliases aligned with the job HTTP response / activity UI. */
  providerResults?: number;
  uniqueUrls?: number;
  uniqueDomains?: number;
  documentsFetched?: number;
  groundingVerifications?: number;
} & Omit<Partial<PrivateWebDiscoveryMetrics>, "discoveryMode">;

export type PrivateSearchResult = {
  executionId: string;
  status: "COMPLETED" | "PARTIALLY_COMPLETED" | "FAILED";
  outcome: PrivateSearchOutcome;
  sourceType: "PRIVATE_WEB" | "LINKEDIN";
  query: string;
  queriesExecuted: number;
  queriesExecutedEstimated?: boolean;
  groundingSourcesFound?: number;
  groundingDomainsFound?: number;
  rawCandidatesFound?: number;
  normalizedCandidatesFound?: number;
  schemaValidCandidates?: number;
  /** Schema-valid candidates before filters / persistence. */
  candidatesFound: number;
  candidatesFiltered?: number;
  candidatesVerified?: number;
  candidatesCreated: number;
  candidatesUpdated: number;
  candidatesUnchanged: number;
  candidatesDiscarded: number;
  discardCounts: Record<string, number>;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: string;
  configured: boolean;
  message?: string;
  discoveryMode?: "GROUNDING_ONLY" | "PROVIDER_SEARCH";
  searchProvider?: string;
  providerResults?: number;
  uniqueUrls?: number;
  uniqueDomains?: number;
  documentsFetched?: number;
  documentsExtracted?: number;
  groundingVerifications?: number;
};

const DEFAULT_PRIVATE_KEYWORDS = [
  "software",
  "consultoría",
  "RFP",
  "términos de referencia",
  "inteligencia artificial",
  "sistema",
] as const;

async function ensurePrivateProfile(params: {
  sourceType: "PRIVATE_WEB" | "LINKEDIN";
  query: string;
  userId?: string;
}) {
  const [existing] = await db
    .select()
    .from(searchProfiles)
    .where(
      and(
        eq(searchProfiles.sourceType, params.sourceType),
        params.userId
          ? eq(searchProfiles.createdByUserId, params.userId)
          : isNull(searchProfiles.createdByUserId),
      ),
    )
    .limit(1);

  if (existing) {
    return existing;
  }

  const [inserted] = await db
    .insert(searchProfiles)
    .values({
      name:
        params.sourceType === "PRIVATE_WEB"
          ? "Sector privado — Grounding"
          : "LinkedIn — Grounding",
      description: `Búsqueda Grounding ${params.sourceType}`,
      sourceType: params.sourceType,
      keywords: [...DEFAULT_PRIVATE_KEYWORDS, params.query.slice(0, 80)],
      createdByUserId: params.userId,
      isActive: true,
    })
    .returning();

  return inserted;
}

async function assertNoOverlappingPrivateSearch(
  sourceType: "PRIVATE_WEB" | "LINKEDIN",
) {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  const [running] = await db
    .select({ id: searchExecutions.id })
    .from(searchExecutions)
    .innerJoin(
      searchProfiles,
      eq(searchExecutions.searchProfileId, searchProfiles.id),
    )
    .where(
      and(
        eq(searchProfiles.sourceType, sourceType),
        eq(searchExecutions.status, "RUNNING"),
        gt(searchExecutions.startedAt, fiveMinutesAgo),
      ),
    )
    .limit(1);

  if (running) {
    throw new Error("PRIVATE_SEARCH_ALREADY_RUNNING");
  }
}

async function findExistingPrivateCandidate(mapped: PersistedGroundedSearchResult) {
  const [existingByUrl] = await db
    .select({
      id: searchResults.id,
      contentHash: searchResults.contentHash,
      verificationStatus: searchResults.verificationStatus,
    })
    .from(searchResults)
    .where(
      and(
        eq(searchResults.normalizedUrl, mapped.normalizedUrl),
        searchResultNotDeleted(),
      ),
    )
    .limit(1);

  if (existingByUrl) {
    return existingByUrl;
  }

  const title = mapped.title.trim();
  const organization = mapped.organizationName?.trim();
  if (!title || title.length < 12 || !organization) {
    return null;
  }

  const [existingByIdentity] = await db
    .select({
      id: searchResults.id,
      contentHash: searchResults.contentHash,
      verificationStatus: searchResults.verificationStatus,
    })
    .from(searchResults)
    .where(
      and(
        eq(searchResults.sourceType, mapped.sourceType),
        searchResultNotDeleted(),
        sql`lower(trim(${searchResults.title})) = ${title.toLowerCase()}`,
        sql`lower(trim(${searchResults.organizationName})) = ${organization.toLowerCase()}`,
      ),
    )
    .limit(1);

  return existingByIdentity ?? null;
}

async function upsertPrivateCandidate(params: {
  executionId: string;
  mapped: PersistedGroundedSearchResult;
}): Promise<"created" | "updated" | "unchanged"> {
  const { mapped, executionId } = params;

  const existing = await findExistingPrivateCandidate(mapped);

  if (existing) {
    if (
      existing.contentHash &&
      mapped.contentHash &&
      existing.contentHash === mapped.contentHash
    ) {
      return "unchanged";
    }

    await db
      .update(searchResults)
      .set({
        searchExecutionId: executionId,
        title: mapped.title,
        snippet: mapped.snippet,
        organizationName: mapped.organizationName,
        category: mapped.category,
        countryCode: mapped.countryCode,
        workMode: mapped.workMode,
        contractingSector: mapped.contractingSector,
        estimatedAmount: mapped.estimatedAmount,
        currency: mapped.currency,
        publishedAt: mapped.publishedAt,
        deadlineAt: mapped.deadlineAt,
        sourceUrl: mapped.sourceUrl,
        sourceOriginalUrl: mapped.sourceOriginalUrl ?? null,
        sourceResolvedUrl: mapped.sourceResolvedUrl ?? null,
        normalizedUrl: mapped.normalizedUrl,
        sourceTitle: mapped.sourceTitle ?? null,
        sourceDomain: mapped.sourceDomain ?? null,
        contentHash: mapped.contentHash,
        preliminaryScore: mapped.preliminaryScore,
        rawData: mapped.rawData,
        amountStatus: mapped.amountStatus ?? "UNKNOWN",
        amountEvidenceText: mapped.amountEvidenceText ?? null,
        amountEvidenceUrl: mapped.amountEvidenceUrl ?? null,
        verificationReason: mapped.verificationReason ?? null,
        titleConfirmed: mapped.titleConfirmed ?? false,
        buyerConfirmed: mapped.buyerConfirmed ?? false,
        amountConfirmed: mapped.amountConfirmed ?? false,
        deadlineConfirmed: mapped.deadlineConfirmed ?? false,
        sourceIsSpecific: mapped.sourceIsSpecific ?? false,
        sourceIsGrounded: mapped.sourceIsGrounded ?? false,
        fieldEvidence: mapped.fieldEvidence ?? null,
        verificationStatus: mapped.verificationStatus,
      })
      .where(eq(searchResults.id, existing.id));

    return "updated";
  }

  await db.insert(searchResults).values({
    searchExecutionId: executionId,
    ...mapped,
    discoveredAt: new Date(),
  });

  return "created";
}

function estimateCost(inputTokens: number, outputTokens: number): string {
  // Flash-Lite ballpark USD — recorded for observability, not billing.
  return (inputTokens * 0.0000001 + outputTokens * 0.0000004).toFixed(6);
}

function providerDiscoveryBudget(
  env: ReturnType<typeof getServerEnv>,
  profileCountries: readonly string[],
) {
  const regionalCountry = profileCountries
    .map((country) => country.trim().toUpperCase())
    .find((country) => /^[A-Z]{2}$/.test(country));
  return {
    maxProviderQueries: env.PRIVATE_WEB_MAX_PROVIDER_QUERIES,
    resultsPerQuery: env.PRIVATE_WEB_RESULTS_PER_QUERY,
    maxPagesPerQuery: env.PRIVATE_WEB_MAX_PAGES_PER_QUERY,
    maxProviderResults: env.PRIVATE_WEB_MAX_PROVIDER_RESULTS,
    maxUniqueUrls: env.PRIVATE_WEB_MAX_UNIQUE_URLS,
    maxUrlsPerDomain: env.PRIVATE_WEB_MAX_URLS_PER_DOMAIN,
    searchConcurrency: env.PRIVATE_WEB_SEARCH_CONCURRENCY,
    searchTimeoutMs: env.PRIVATE_WEB_SEARCH_TIMEOUT_MS,
    maxConsecutiveEmptyQueries:
      env.PRIVATE_WEB_MAX_CONSECUTIVE_EMPTY_QUERIES,
    maxFetchDocuments: env.PRIVATE_WEB_MAX_FETCH_DOCUMENTS,
    fetchConcurrency: env.PRIVATE_WEB_FETCH_CONCURRENCY,
    fetchTimeoutMs: env.PRIVATE_WEB_FETCH_TIMEOUT_MS,
    maxDocumentBytes: env.PRIVATE_WEB_MAX_DOCUMENT_BYTES,
    maxRedirects: env.PRIVATE_WEB_MAX_REDIRECTS,
    maxRequestsPerHost: env.PRIVATE_WEB_MAX_REQUESTS_PER_HOST,
    fetchUserAgent: env.PRIVATE_WEB_FETCH_USER_AGENT,
    robotsCacheTtlMs: env.PRIVATE_WEB_ROBOTS_CACHE_TTL_MS,
    maxPdfPages: env.PRIVATE_WEB_MAX_PDF_PAGES,
    maxExtractionDocuments: env.PRIVATE_WEB_MAX_EXTRACTION_DOCUMENTS,
    extractionConcurrency: env.PRIVATE_WEB_EXTRACTION_CONCURRENCY,
    maxExtractionTokens: env.PRIVATE_WEB_MAX_EXTRACTION_TOKENS,
    targetCandidates: env.PRIVATE_WEB_TARGET_CANDIDATES,
    maxEstimatedCost: env.PRIVATE_WEB_MAX_ESTIMATED_COST,
    providerCostPerRequest: env.BRAVE_SEARCH_COST_PER_REQUEST,
    country: regionalCountry,
  };
}

function providerOutcome(params: {
  discovery: PrivateWebDiscoveryResult;
  candidatesFound: number;
  candidatesFiltered: number;
  candidatesSentToVerification: number;
  candidatesVerified: number;
  candidatesCreated: number;
  candidatesUpdated: number;
  candidatesUnchanged: number;
  discardCounts: Record<string, number>;
}) {
  const metrics = params.discovery.metrics;
  return resolveProviderSearchOutcome({
    operationalErrorCode: params.discovery.operationalError?.code,
    stoppedBy: metrics.stoppedBy,
    providerResults: metrics.searchProviderResults,
    uniqueUrls: metrics.searchProviderUniqueUrls,
    selectedForFetch: metrics.resultsSelectedForFetch,
    documentsFetchAttempted: metrics.documentsFetchAttempted,
    documentsFetchSucceeded: metrics.documentsFetchSucceeded,
    documentsSentToExtraction: metrics.documentsSentToExtraction,
    documentsExtracted: metrics.documentsExtracted,
    extractionFailures: metrics.extractionFailures,
    candidatesFound: params.candidatesFound,
    candidatesFiltered: params.candidatesFiltered,
    candidatesSentToVerification: params.candidatesSentToVerification,
    candidatesVerified: params.candidatesVerified,
    candidatesCreated: params.candidatesCreated,
    candidatesUpdated: params.candidatesUpdated,
    candidatesUnchanged: params.candidatesUnchanged,
    discardCounts: params.discardCounts,
    providerErrors: metrics.searchProviderErrors,
  });
}

export async function runGroundedSearch(params: {
  sourceType: "PRIVATE_WEB" | "LINKEDIN";
  query?: string;
  userId?: string;
  interestCategories?: string[];
}): Promise<PrivateSearchResult> {
  const env = getServerEnv();
  const discoveryMode = resolvePrivateDiscoveryMode(
    params.sourceType,
    env.PRIVATE_WEB_DISCOVERY_MODE,
  );
  const searchPlan = buildDiscoverySearchPlan({
    interestCategories: params.interestCategories,
    maxIntents:
      discoveryMode === "PROVIDER_SEARCH"
        ? env.PRIVATE_WEB_MAX_PROVIDER_QUERIES
        : env.SEARCH_MAX_QUERIES,
    regionalShare: env.SEARCH_REGIONAL_SHARE,
    customQuery: params.query,
  });
  const query = searchPlan.intents.map((intent) => intent.query).join("\n");

  await assertNoOverlappingPrivateSearch(params.sourceType);

  const profile = await ensurePrivateProfile({
    sourceType: params.sourceType,
    query,
    userId: params.userId,
  });

  const relevance = buildPrivateRelevanceOptions({
    interestCategories: params.interestCategories,
    profileKeywords: profile.keywords,
    excludedKeywords: profile.excludedKeywords,
  });

  const [execution] = await db
    .insert(searchExecutions)
    .values({
      searchProfileId: profile.id,
      status: "RUNNING",
      startedAt: new Date(),
    })
    .returning();

  const runStartedAt = Date.now();
  const searchMode = getGroundedSearchMode(params.sourceType);
  console.info("search_execution_started", {
    executionId: execution.id,
    stage: "DISCOVERY",
    event: "search_execution_started",
    sourceType: params.sourceType,
    searchMode,
    discoveryMode,
    query,
  });

  let candidatesCreated = 0;
  let candidatesUpdated = 0;
  let candidatesUnchanged = 0;
  let candidatesDiscarded = 0;
  let candidatesVerified = 0;
  let candidatesPartiallyVerified = 0;
  let candidatesRejected = 0;
  let persistErrors = 0;
  const discardCounts: Record<string, number> = {};
  const candidateTraces: CandidateTrace[] = [];

  const bumpDiscard = (reason: string, count = 1) => {
    discardCounts[reason] = (discardCounts[reason] ?? 0) + count;
    candidatesDiscarded += count;
  };

  const pushTrace = (trace: CandidateTrace) => {
    candidateTraces.push(trace);
  };

  try {
    if (discoveryMode === "PROVIDER_SEARCH") {
      console.info("provider_search_started", {
        executionId: execution.id,
        stage: "DISCOVERY",
        event: "provider_search_started",
        query: query.slice(0, 300),
        discoveryMode,
      });
    } else {
      console.info("grounding_request_started", {
        executionId: execution.id,
        stage: "DISCOVERY",
        event: "grounding_request_started",
        query: query.slice(0, 300),
      });
    }

    const selectedDiscovery = await executePrivateDiscoveryMode(discoveryMode, {
      grounding: async () => ({
        providerDiscovery: null as PrivateWebDiscoveryResult | null,
        batch: await searchWithGrounding({
          sourceType: params.sourceType,
          query,
          interestCategories: params.interestCategories,
          maxCandidates: env.SEARCH_MAX_CANDIDATES,
          searchPlan,
        }),
      }),
      provider: async () => {
        if (env.BRAVE_SEARCH_API_KEY && !isVertexConfigured()) {
          // Avoid paying Brave for documents that cannot be extracted.
          return {
            providerDiscovery: null as PrivateWebDiscoveryResult | null,
            batch: await searchWithGrounding({
              sourceType: params.sourceType,
              query,
              interestCategories: params.interestCategories,
              maxCandidates: env.SEARCH_MAX_CANDIDATES,
              searchPlan,
            }),
          };
        }
        const provider = new BraveSearchProvider({
          apiKey: env.BRAVE_SEARCH_API_KEY,
          maxRetries: env.PRIVATE_WEB_SEARCH_MAX_RETRIES,
          timeoutMs: env.PRIVATE_WEB_SEARCH_TIMEOUT_MS,
        });
        const providerDiscovery = await discoverPrivateWeb({
          executionId: execution.id,
          searchPlan,
          provider,
          budget: providerDiscoveryBudget(env, profile.countries),
        });
        return { providerDiscovery, batch: providerDiscovery.batch };
      },
    });
    const { batch, providerDiscovery } = selectedDiscovery;

    if (providerDiscovery) {
      for (const [index, result] of (
        providerDiscovery.providerResults ?? []
      ).entries()) {
        const selected = providerDiscovery.selectedResults.some((item) =>
          areEquivalentUrls(item.url, result.url),
        );
        pushTrace({
          temporaryId: `provider-${index}`,
          title: result.title,
          summary: result.snippet ?? undefined,
          officialSourceUrl: result.url,
          sourceDomain: result.domain,
          stage: selected ? "FETCH" : "PROVIDER_RESULT",
          outcome: selected ? "SELECTED" : "FILTERED",
          reasonCode: selected
            ? undefined
            : result.retrieval.recommendation === "SKIP"
              ? "RETRIEVAL_SKIPPED"
              : "NOT_SELECTED_FOR_FETCH",
          reason: selected
            ? undefined
            : result.retrieval.recommendation === "SKIP"
              ? "El resultado no mostró señales suficientes de una convocatoria activa."
              : "El resultado quedó fuera del límite de recuperación o de diversidad por dominio.",
          retrievalScore: result.retrieval.score,
          discoveredByQueries: result.discoveredByQueries,
          discoveredByFamilies: result.discoveredByFamilies,
        });
      }
      for (const trace of providerDiscovery.diagnosticTraces ?? []) {
        pushTrace({
          ...trace,
          title: trace.title ?? undefined,
          sourceDomain: trace.sourceDomain ?? undefined,
        });
      }
    }

    if (providerDiscovery?.operationalError) {
      const outcome = providerOutcome({
        discovery: providerDiscovery,
        candidatesFound: 0,
        candidatesFiltered: 0,
        candidatesSentToVerification: 0,
        candidatesVerified: 0,
        candidatesCreated: 0,
        candidatesUpdated: 0,
        candidatesUnchanged: 0,
        discardCounts: {},
      });
      const failed = isFailedPrivateSearchOutcome(outcome);
      const metrics: PrivateSearchMetrics = {
        ...providerDiscovery.metrics,
        candidatesCreated: 0,
        candidatesUpdated: 0,
        candidatesUnchanged: 0,
        candidatesDiscarded: 0,
        discardCounts: {},
        searchQueries: [],
        configured: false,
        outcome,
        query: query.slice(0, 500),
        candidatesFound: 0,
        normalizedCandidatesFound: 0,
        schemaValidCandidates: 0,
        executionCandidates: limitCandidateTraces(
          candidateTraces,
          DIAGNOSTIC_LIMITS.executionCandidates,
        ),
      };
      const estimatedCost = providerDiscovery.metrics.estimatedTotalCost.toFixed(6);
      await db
        .update(searchExecutions)
        .set({
          status: failed ? "FAILED" : "COMPLETED",
          queriesExecuted:
            providerDiscovery.metrics.searchProviderQueriesExecuted,
          candidatesFound: 0,
          candidatesDiscarded: 0,
          inputTokens: 0,
          outputTokens: 0,
          estimatedCost,
          metrics,
          errorMessage: failed
            ? providerDiscovery.operationalError.message.slice(0, 2_000)
            : null,
          completedAt: new Date(),
        })
        .where(eq(searchExecutions.id, execution.id));

      return {
        executionId: execution.id,
        status: failed ? "FAILED" : "COMPLETED",
        outcome,
        sourceType: params.sourceType,
        query,
        queriesExecuted:
          providerDiscovery.metrics.searchProviderQueriesExecuted,
        candidatesFound: 0,
        candidatesCreated: 0,
        candidatesUpdated: 0,
        candidatesUnchanged: 0,
        candidatesDiscarded: 0,
        discardCounts: {},
        inputTokens: 0,
        outputTokens: 0,
        estimatedCost,
        configured: false,
        message: providerDiscovery.operationalError.message,
        discoveryMode,
        searchProvider: providerDiscovery.metrics.searchProvider,
        providerResults: 0,
        uniqueUrls: 0,
        uniqueDomains: 0,
        documentsFetched: 0,
        documentsExtracted: 0,
        groundingVerifications: 0,
      };
    }

    const debug = batch.discoveryDebug;
    const normalizationOutputItems =
      providerDiscovery?.metrics.normalizationOutputItems ??
      debug?.normalizationOutputCandidates ??
      0;
    const schemaValidCandidatesBeforeDeduplication =
      providerDiscovery?.metrics.schemaValidCandidatesBeforeDeduplication ??
      debug?.schemaValidCandidates ??
      batch.candidates.length;
    const schemaInvalidCandidates =
      providerDiscovery?.metrics.schemaInvalidCandidates ??
      debug?.schemaInvalidCandidates ??
      0;
    const uniqueNormalizedCandidates =
      providerDiscovery?.metrics.uniqueNormalizedCandidates ??
      batch.candidates.length;
    const crossBatchDuplicates = providerDiscovery
      ? Math.max(
          0,
          schemaValidCandidatesBeforeDeduplication - uniqueNormalizedCandidates,
        )
      : (debug?.crossBatchDuplicates ?? 0);
    // Documented aliases:
    // - schemaValidCandidates === schemaValidCandidatesBeforeDeduplication
    // - normalizedCandidatesFound === uniqueNormalizedCandidates (post-dedupe)
    const schemaValidCandidates = schemaValidCandidatesBeforeDeduplication;
    const candidatesFound = resolveCandidatesFound({
      schemaValidCandidates: uniqueNormalizedCandidates,
    });
    const queriesExecuted =
      providerDiscovery?.metrics.searchProviderQueriesExecuted ??
      debug?.queriesExecuted ??
      batch.searchQueries.length;
    const queriesExecutedEstimated = providerDiscovery
      ? false
      : (debug?.queriesExecutedEstimated ?? false);
    const groundingSourcesFound =
      providerDiscovery ? 0 : (debug?.groundingChunksFound ?? batch.sources.length);
    const groundingDomainsFound = providerDiscovery
      ? 0
      : (debug?.groundingDomainsFound ?? 0);

    if (discoveryMode === "PROVIDER_SEARCH") {
      console.info("provider_search_completed", {
        executionId: execution.id,
        stage: "DISCOVERY",
        event: "provider_search_completed",
        durationMs:
          providerDiscovery?.metrics.providerSearchDurationMs ??
          providerDiscovery?.metrics.durationMs ??
          0,
        count: providerDiscovery?.metrics.searchProviderResults ?? 0,
        searchProvider: providerDiscovery?.metrics.searchProvider ?? null,
      });
      console.info("provider_results_extracted", {
        executionId: execution.id,
        stage: "DISCOVERY",
        event: "provider_results_extracted",
        count: providerDiscovery?.metrics.searchProviderUniqueUrls ?? 0,
        uniqueDomains:
          providerDiscovery?.metrics.searchProviderUniqueDomains ?? 0,
        queriesExecuted,
        durationMs: providerDiscovery?.metrics.documentFetchDurationMs ?? 0,
      });
    } else {
      console.info("grounding_request_completed", {
        executionId: execution.id,
        stage: "DISCOVERY",
        event: "grounding_request_completed",
        durationMs: debug?.discoveryDurationMs ?? null,
        count: groundingSourcesFound,
        model: batch.model ?? null,
        finishReason: debug?.finishReason ?? null,
      });

      console.info("grounding_sources_extracted", {
        executionId: execution.id,
        stage: "DISCOVERY",
        event: "grounding_sources_extracted",
        count: groundingSourcesFound,
        groundingDomainsFound,
        queriesExecuted,
        queriesExecutedEstimated,
      });
    }

    console.info("normalization_completed", {
      executionId: execution.id,
      stage: "NORMALIZATION",
      event: "normalization_completed",
      count: uniqueNormalizedCandidates,
      normalizationOutputItems,
      schemaValidCandidatesBeforeDeduplication,
      schemaValidCandidates,
      schemaInvalidCandidates,
      uniqueNormalizedCandidates,
      crossBatchDuplicates,
      normalizationFailureKind: debug?.normalizationFailureKind ?? null,
      normalizationRootAdapted: debug?.normalizationRootAdapted ?? false,
      normalizationOriginalRoot: debug?.normalizationOriginalRoot,
      normalizationRetryAttempted: debug?.normalizationRetryAttempted ?? false,
      normalizationRetryReason: debug?.normalizationRetryReason ?? null,
      normalizationRetryCandidates: debug?.normalizationRetryCandidates ?? 0,
      normalizationRetryCost: debug?.normalizationRetryCost ?? null,
      recoveredFromRawBlocks: debug?.recoveredFromRawBlocks ?? 0,
      normalizationValidationErrorsSample:
        debug?.normalizationValidationErrorsSample ?? [],
      durationMs:
        providerDiscovery?.metrics.extractionDurationMs ??
        debug?.normalizationDurationMs ??
        null,
    });

    console.info("schema_validation_completed", {
      executionId: execution.id,
      stage: "NORMALIZATION",
      event: "schema_validation_completed",
      count: schemaValidCandidatesBeforeDeduplication,
      schemaValidCandidatesBeforeDeduplication,
      schemaInvalidCandidates,
      uniqueNormalizedCandidates,
      crossBatchDuplicates,
    });

    if (!batch.configured) {
      const outcome = resolvePrivateSearchOutcome({
        configured: false,
        groundingSourcesFound: 0,
        discoveryTextLength: 0,
        candidatesFound: 0,
        candidatesFiltered: 0,
        candidatesSentToVerification: 0,
        candidatesVerified: 0,
        candidatesCreated: 0,
        candidatesUpdated: 0,
        candidatesUnchanged: 0,
        discardCounts: {},
      });
      const metrics: PrivateSearchMetrics = {
        candidatesCreated: 0,
        candidatesUpdated: 0,
        candidatesUnchanged: 0,
        candidatesDiscarded: 0,
        discardCounts: {},
        searchQueries: [],
        configured: false,
        outcome,
        candidatesFound: 0,
        query,
        discoveryMode,
        searchProvider:
          discoveryMode === "PROVIDER_SEARCH" ? "BRAVE" : undefined,
        executionCandidates: limitCandidateTraces(
          candidateTraces,
          DIAGNOSTIC_LIMITS.executionCandidates,
        ),
      };

      await db
        .update(searchExecutions)
        .set({
          status: "COMPLETED",
          queriesExecuted: 0,
          candidatesFound: 0,
          candidatesDiscarded: 0,
          inputTokens: 0,
          outputTokens: 0,
          estimatedCost: "0",
          metrics,
          errorMessage: null,
          completedAt: new Date(),
        })
        .where(eq(searchExecutions.id, execution.id));

      console.info("search_execution_completed", {
        executionId: execution.id,
        stage: "PERSISTENCE",
        event: "search_execution_completed",
        outcome,
        durationMs: Date.now() - runStartedAt,
      });

      return {
        executionId: execution.id,
        status: "COMPLETED",
        outcome,
        sourceType: params.sourceType,
        query,
        queriesExecuted: 0,
        candidatesFound: 0,
        candidatesCreated: 0,
        candidatesUpdated: 0,
        candidatesUnchanged: 0,
        candidatesDiscarded: 0,
        discardCounts: {},
        inputTokens: 0,
        outputTokens: 0,
        estimatedCost: "0",
        configured: false,
        message:
          "Vertex AI no configurado. Define GCP_PROJECT_ID y autentica con ADC.",
        discoveryMode,
        searchProvider:
          discoveryMode === "PROVIDER_SEARCH" ? "BRAVE" : undefined,
      };
    }

    const limited = batch.candidates.slice(0, env.SEARCH_MAX_CANDIDATES);
    const prepared = preparePrivateBatch({
      sourceType: params.sourceType,
      candidates: limited,
      query,
      citations: batch.citations,
      groundingSources: batch.sources,
      relevance,
    });
    const providerMetadataFor = (candidate: (typeof limited)[number]) =>
      providerDiscovery?.candidateMetadata.find(
        (metadata) =>
          metadata.title === candidate.title &&
          areEquivalentUrls(metadata.sourceUrl, candidate.sourceUrl),
      ) ?? null;

    const filterDiscardCount = prepared.discarded.length;
    const candidatesDeduplicated = prepared.discardCounts.DUPLICATE_IN_BATCH;
    const candidatesFiltered = filterDiscardCount;

    if (prepared.discarded.length > 0) {
      console.info("filtering_completed", {
        executionId: execution.id,
        stage: "FILTERING",
        event: "filtering_completed",
        count: candidatesFiltered,
        discardCounts: prepared.discardCounts,
        samples: prepared.discarded.slice(0, 10).map((item) => ({
          title: item.title,
          organizationName: item.organizationName,
          officialSourceUrl: item.officialSourceUrl,
          reasonCode: item.reason,
          reason: item.detail,
        })),
      });
    } else {
      console.info("filtering_completed", {
        executionId: execution.id,
        stage: "FILTERING",
        event: "filtering_completed",
        count: 0,
        discardCounts: prepared.discardCounts,
      });
    }

    for (const [reason, count] of Object.entries(prepared.discardCounts)) {
      if (count > 0) {
        bumpDiscard(reason, count);
      }
    }

    for (const [index, item] of prepared.discarded.entries()) {
      const metadata = providerMetadataFor(item.candidate);
      pushTrace({
        temporaryId: `filter-${index}`,
        title: item.title,
        organizationName: item.organizationName,
        summary: item.candidate.snippet ?? undefined,
        officialSourceUrl: item.officialSourceUrl,
        applicationUrl: metadata?.applicationUrl ?? undefined,
        sourceDomain: extractDomain(item.candidate.sourceUrl) ?? undefined,
        deadlineAt: item.candidate.deadlineAt ?? undefined,
        category: item.candidate.category ?? undefined,
        stage:
          item.reason === "DUPLICATE_IN_BATCH" ? "DEDUPLICATION" : "FILTERING",
        outcome: "FILTERED",
        reasonCode: item.reason,
        reason: item.detail,
        discoveredByQueries: metadata?.discoveredByQueries ?? [],
        discoveredByFamilies: metadata?.discoveredByFamilies ?? [],
      });
    }

    console.info("deduplication_completed", {
      executionId: execution.id,
      stage: "DEDUPLICATION",
      event: "deduplication_completed",
      count: candidatesDeduplicated,
    });

    const verificationStartedAt = performance.now();
    for (const [index, item] of prepared.accepted.entries()) {
      try {
        const providerCandidateMetadata = providerMetadataFor(item.candidate);
        let verification;
        if (providerDiscovery) {
          const forceGrounding = Boolean(
            providerCandidateMetadata &&
              (providerCandidateMetadata.sourceRelationship ===
                "AGGREGATOR" ||
                providerCandidateMetadata.sourceRelationship ===
                  "SOCIAL_DISCOVERY" ||
                (!providerCandidateMetadata.applicationMethod &&
                  !providerCandidateMetadata.applicationUrl)),
          );
          const providerVerification = await verifyProviderCandidate({
            candidate: item.candidate,
            source: item.groundingSource,
            allowGrounding:
              providerDiscovery.metrics.groundingVerificationRequests <
                env.PRIVATE_WEB_MAX_GROUNDING_VERIFICATIONS &&
              providerDiscovery.metrics.estimatedTotalCost <
                env.PRIVATE_WEB_MAX_ESTIMATED_COST,
            forceGrounding,
          });
          verification = providerVerification.verification;
          if (providerVerification.groundingRequested) {
            console.info("grounding_request_started", {
              executionId: execution.id,
              stage: "VERIFICATION",
              event: "grounding_request_started",
              purpose: "directed_verification",
              candidateTitle: item.candidate.title.slice(0, 200),
            });
            providerDiscovery.metrics.groundingVerificationRequests += 1;
            console.info("grounding_request_completed", {
              executionId: execution.id,
              stage: "VERIFICATION",
              event: "grounding_request_completed",
              purpose: "directed_verification",
              durationMs: providerVerification.groundingDurationMs ?? 0,
              groundingSucceeded: providerVerification.groundingSucceeded,
            });
            if (providerVerification.groundingSucceeded) {
              providerDiscovery.metrics.groundingVerificationSucceeded += 1;
              console.info("grounding_sources_extracted", {
                executionId: execution.id,
                stage: "VERIFICATION",
                event: "grounding_sources_extracted",
                purpose: "directed_verification",
                count: 1,
              });
            } else {
              providerDiscovery.metrics.groundingVerificationFailed += 1;
            }
            batch.inputTokens += providerVerification.groundingInputTokens;
            batch.outputTokens += providerVerification.groundingOutputTokens;
            providerDiscovery.metrics.estimatedVertexCost +=
              providerVerification.groundingInputTokens * 0.0000001 +
              providerVerification.groundingOutputTokens * 0.0000004;
            providerDiscovery.metrics.estimatedTotalCost =
              providerDiscovery.metrics.estimatedProviderCost +
              providerDiscovery.metrics.estimatedVertexCost;
            if (
              providerDiscovery.metrics.estimatedTotalCost >=
              env.PRIVATE_WEB_MAX_ESTIMATED_COST
            ) {
              providerDiscovery.metrics.stoppedBy = "MAX_ESTIMATED_COST";
            }
          }
        } else {
          verification = await verifyGroundedCandidate({
            candidate: item.candidate,
            groundingSource: item.groundingSource,
          });
        }
        if (!shouldPersistVerifiedCandidate(verification.status)) {
          bumpDiscard(
            verification.status === "REJECTED"
              ? "REJECTED"
              : "PARTIALLY_VERIFIED",
          );
          pushTrace({
            temporaryId: `verify-${index}`,
            title: item.candidate.title,
            organizationName: item.candidate.organizationName ?? undefined,
            summary:
              verification.payload?.description ??
              item.candidate.snippet ??
              undefined,
            officialSourceUrl:
              verification.resolvedSourceUrl ?? item.candidate.sourceUrl,
            applicationUrl:
              providerCandidateMetadata?.applicationUrl ?? undefined,
            sourceDomain:
              verification.sourceDomain ??
              extractDomain(item.candidate.sourceUrl) ??
              undefined,
            deadlineAt:
              verification.payload?.deadline ??
              item.candidate.deadlineAt ??
              undefined,
            category:
              verification.payload?.category ??
              item.candidate.category ??
              undefined,
            stage: "VERIFICATION",
            outcome:
              verification.status === "PARTIALLY_VERIFIED"
                ? "UNVERIFIED"
                : "REJECTED",
            reasonCode: verification.status,
            reason: verification.reason ?? undefined,
            preliminaryScore: item.mapped.preliminaryScore ?? undefined,
            verificationStatus: verification.status,
            discoveredByQueries:
              providerCandidateMetadata?.discoveredByQueries ?? [],
            discoveredByFamilies:
              providerCandidateMetadata?.discoveredByFamilies ?? [],
          });
        }
        if (verification.status === "VERIFIED") {
          candidatesVerified += 1;
        } else if (verification.status === "PARTIALLY_VERIFIED") {
          candidatesPartiallyVerified += 1;
        } else {
          candidatesRejected += 1;
        }
        if (verification.status !== "VERIFIED") {
          console.info("grounded_search_candidate_rejected", {
            executionId: execution.id,
            stage: "VERIFICATION",
            event: "grounded_search_candidate_rejected",
            reasonCode: verification.status,
            originalUrl: verification.originalSourceUrl,
            resolvedUrl: verification.resolvedSourceUrl,
            reason: verification.reason,
            verifier: verification.verifier,
          });
          // Rejected or partial evidence remains observable in metrics/traces,
          // but must not become a search_results row.
          continue;
        }
        const mapped = mapVerifiedGroundedCandidate(
          params.sourceType,
          item.candidate,
          verification,
          {
            query,
            preliminaryScore: item.mapped.preliminaryScore,
            discoveryMetadata: providerCandidateMetadata,
          },
        );

        const outcome = await upsertPrivateCandidate({
          executionId: execution.id,
          mapped,
        });
        if (outcome === "created") {
          candidatesCreated += 1;
          pushTrace({
            temporaryId: `persist-${index}`,
            title: mapped.title,
            organizationName: mapped.organizationName ?? undefined,
            summary: mapped.snippet ?? undefined,
            officialSourceUrl: mapped.sourceUrl,
            applicationUrl:
              providerCandidateMetadata?.applicationUrl ?? undefined,
            sourceDomain: mapped.sourceDomain ?? undefined,
            deadlineAt: mapped.deadlineAt?.toISOString(),
            category: mapped.category ?? undefined,
            stage: "PERSISTENCE",
            outcome: "CREATED",
            preliminaryScore: mapped.preliminaryScore ?? undefined,
            verificationStatus: mapped.verificationStatus,
            discoveredByQueries:
              providerCandidateMetadata?.discoveredByQueries ?? [],
            discoveredByFamilies:
              providerCandidateMetadata?.discoveredByFamilies ?? [],
          });
        } else if (outcome === "updated") {
          candidatesUpdated += 1;
          pushTrace({
            temporaryId: `persist-${index}`,
            title: mapped.title,
            organizationName: mapped.organizationName ?? undefined,
            summary: mapped.snippet ?? undefined,
            officialSourceUrl: mapped.sourceUrl,
            applicationUrl:
              providerCandidateMetadata?.applicationUrl ?? undefined,
            sourceDomain: mapped.sourceDomain ?? undefined,
            deadlineAt: mapped.deadlineAt?.toISOString(),
            category: mapped.category ?? undefined,
            stage: "PERSISTENCE",
            outcome: "UPDATED",
            preliminaryScore: mapped.preliminaryScore ?? undefined,
            verificationStatus: mapped.verificationStatus,
            discoveredByQueries:
              providerCandidateMetadata?.discoveredByQueries ?? [],
            discoveredByFamilies:
              providerCandidateMetadata?.discoveredByFamilies ?? [],
          });
        } else {
          candidatesUnchanged += 1;
          pushTrace({
            temporaryId: `persist-${index}`,
            title: mapped.title,
            organizationName: mapped.organizationName ?? undefined,
            summary: mapped.snippet ?? undefined,
            officialSourceUrl: mapped.sourceUrl,
            applicationUrl:
              providerCandidateMetadata?.applicationUrl ?? undefined,
            sourceDomain: mapped.sourceDomain ?? undefined,
            deadlineAt: mapped.deadlineAt?.toISOString(),
            category: mapped.category ?? undefined,
            stage: "PERSISTENCE",
            outcome: "UNCHANGED",
            preliminaryScore: mapped.preliminaryScore ?? undefined,
            verificationStatus: mapped.verificationStatus,
            discoveredByQueries:
              providerCandidateMetadata?.discoveredByQueries ?? [],
            discoveredByFamilies:
              providerCandidateMetadata?.discoveredByFamilies ?? [],
          });
        }
      } catch (error) {
        persistErrors += 1;
        bumpDiscard("PERSIST_ERROR");
        pushTrace({
          temporaryId: `persist-error-${index}`,
          title: item.candidate.title,
          organizationName: item.candidate.organizationName ?? undefined,
          officialSourceUrl: item.candidate.sourceUrl,
          stage: "PERSISTENCE",
          outcome: "ERROR",
          reasonCode: "PERSIST_ERROR",
          reason:
            error instanceof Error ? error.message.slice(0, 300) : "unknown",
        });
        console.warn("grounded_search_candidate_error", {
          executionId: execution.id,
          stage: "PERSISTENCE",
          event: "grounded_search_candidate_error",
          reasonCode: "PERSIST_ERROR",
          errorName: error instanceof Error ? error.name : "Error",
          errorMessage:
            error instanceof Error ? error.message.slice(0, 300) : "unknown",
          originalUrl: item.candidate.sourceUrl,
        });
      }
    }

    console.info("verification_completed", {
      executionId: execution.id,
      stage: "VERIFICATION",
      event: "verification_completed",
      count: prepared.accepted.length,
      candidatesVerified,
      candidatesPartiallyVerified,
      candidatesRejected,
      durationMs: Math.round(performance.now() - verificationStartedAt),
    });

    console.info("persistence_completed", {
      executionId: execution.id,
      stage: "PERSISTENCE",
      event: "persistence_completed",
      candidatesCreated,
      candidatesUpdated,
      candidatesUnchanged,
      persistErrors,
    });

    const estimatedCost = providerDiscovery
      ? providerDiscovery.metrics.estimatedTotalCost.toFixed(6)
      : estimateCost(batch.inputTokens, batch.outputTokens);
    const outcome = providerDiscovery
      ? providerOutcome({
          discovery: providerDiscovery,
          candidatesFound,
          candidatesFiltered,
          candidatesSentToVerification: prepared.accepted.length,
          candidatesVerified,
          candidatesCreated,
          candidatesUpdated,
          candidatesUnchanged,
          discardCounts,
        })
      : resolvePrivateSearchOutcome({
          configured: true,
          groundingSourcesFound,
          discoveryTextLength: debug?.discoveryTextLength ?? 0,
          candidatesFound,
          candidatesFiltered,
          candidatesSentToVerification: prepared.accepted.length,
          candidatesVerified,
          candidatesCreated,
          candidatesUpdated,
          candidatesUnchanged,
          discardCounts,
        });

    const metrics: PrivateSearchMetrics = {
      candidatesCreated,
      candidatesUpdated,
      candidatesUnchanged,
      candidatesDiscarded,
      discardCounts,
      searchQueries: batch.searchQueries,
      configured: true,
      outcome,
      model: batch.model,
      promptVersion: batch.promptVersion,
      searchMode,
      query: query.slice(0, 500),
      queriesExecuted,
      queriesExecutedEstimated,
      groundingSources: providerDiscovery ? 0 : batch.sources.length,
      groundingSourcesFound,
      groundingChunksFound: providerDiscovery
        ? 0
        : (debug?.groundingChunksFound ?? batch.sources.length),
      groundingDomainsFound,
      groundingUrlsFound: debug?.groundingUrlsFound,
      groundingUniqueUrlsFound: debug?.groundingUniqueUrlsFound,
      hasGroundingSupports: providerDiscovery
        ? false
        : debug?.hasGroundingSupports,
      rawCandidatesFound:
        providerDiscovery?.metrics.normalizationOutputItems ??
        debug?.opportunityBlocksFound ??
        0,
      normalizedCandidatesFound: uniqueNormalizedCandidates,
      normalizationOutputItems,
      normalizationInputCandidates:
        providerDiscovery?.metrics.documentsSentToExtraction ??
        debug?.normalizationInputCandidates,
      normalizationOutputCandidates: normalizationOutputItems,
      schemaValidCandidates,
      schemaValidCandidatesBeforeDeduplication,
      schemaInvalidCandidates,
      uniqueNormalizedCandidates,
      candidatesFound,
      candidatesFiltered,
      candidatesDeduplicated,
      acceptedCandidates: candidatesCreated + candidatesUpdated,
      discoveryTextLength: debug?.discoveryTextLength,
      discoveryTextPreview: debug?.discoveryTextPreview,
      discoveryFinishReason: debug?.finishReason ?? null,
      discoveryInputTokens: debug?.discoveryInputTokens,
      discoveryOutputTokens: debug?.discoveryOutputTokens,
      discoveryDurationMs:
        providerDiscovery?.metrics.durationMs ??
        debug?.discoveryDurationMs ??
        null,
      providerSearchDurationMs:
        providerDiscovery?.metrics.providerSearchDurationMs,
      documentFetchDurationMs:
        providerDiscovery?.metrics.documentFetchDurationMs,
      extractionDurationMs: providerDiscovery?.metrics.extractionDurationMs,
      normalizationFinishReason: debug?.normalizationFinishReason ?? null,
      normalizationInputTokens: debug?.normalizationInputTokens,
      normalizationOutputTokens: debug?.normalizationOutputTokens,
      normalizationDurationMs:
        providerDiscovery?.metrics.extractionDurationMs ??
        debug?.normalizationDurationMs ??
        null,
      normalizationModel: debug?.normalizationModel ?? null,
      normalizationPreview: debug?.normalizationPreview,
      normalizationParseError: debug?.normalizationParseError ?? null,
      normalizationFailureKind: debug?.normalizationFailureKind ?? null,
      pipelineDiagnosis: debug?.pipelineDiagnosis,
      searchPlanIntents: debug?.searchPlanIntents,
      searchFamiliesExecuted: debug?.searchFamiliesExecuted,
      groundingPassesExecuted: debug?.groundingPassesExecuted,
      sourcesByFamily: debug?.sourcesByFamily,
      domainsByFamily: debug?.domainsByFamily,
      rawCandidatesByFamily: debug?.rawCandidatesByFamily,
      normalizedCandidatesByFamily: debug?.normalizedCandidatesByFamily,
      uniqueCandidatesBeforeFilters: uniqueNormalizedCandidates,
      crossBatchDuplicates,
      passesWithoutNewSources: debug?.passesWithoutNewSources,
      passesWithoutNewCandidates: debug?.passesWithoutNewCandidates,
      stoppedBy: providerDiscovery?.metrics.stoppedBy ?? debug?.stoppedBy,
      discoveryMode,
      searchProvider: providerDiscovery?.metrics.searchProvider,
      ...(providerDiscovery?.metrics ?? {}),
      // Aliases aligned with the job HTTP response / activity UI.
      providerResults:
        providerDiscovery?.metrics.searchProviderResults ?? 0,
      uniqueUrls: providerDiscovery?.metrics.searchProviderUniqueUrls ?? 0,
      uniqueDomains:
        providerDiscovery?.metrics.searchProviderUniqueDomains ?? 0,
      documentsFetched:
        providerDiscovery?.metrics.documentsFetchSucceeded ?? 0,
      groundingVerifications:
        providerDiscovery?.metrics.groundingVerificationRequests ?? 0,
      candidatesVerified,
      candidatesPartiallyVerified,
      candidatesRejected,
      candidatesSentToVerification: prepared.accepted.length,
      persistErrors,
      discardedTraceSample: limitCandidateTraces(
        candidateTraces.filter((trace) =>
          ["FILTERED", "REJECTED", "UNVERIFIED", "ERROR"].includes(
            trace.outcome,
          ),
        ),
        DIAGNOSTIC_LIMITS.discardedTraceSample,
      ),
      executionCandidates: limitCandidateTraces(
        candidateTraces,
        DIAGNOSTIC_LIMITS.executionCandidates,
      ),
    };
    const executionStatus = isFailedPrivateSearchOutcome(outcome)
      ? "FAILED"
      : "COMPLETED";

    await db
      .update(searchExecutions)
      .set({
        status: executionStatus,
        queriesExecuted,
        candidatesFound,
        candidatesDiscarded,
        inputTokens: batch.inputTokens,
        outputTokens: batch.outputTokens,
        estimatedCost,
        metrics,
        errorMessage:
          executionStatus === "FAILED" ? outcome : null,
        completedAt: new Date(),
      })
      .where(eq(searchExecutions.id, execution.id));

    console.info("search_execution_completed", {
      executionId: execution.id,
      stage: "PERSISTENCE",
      event: "search_execution_completed",
      outcome,
      candidatesFound,
      candidatesCreated,
      candidatesUpdated,
      candidatesUnchanged,
      candidatesVerified,
      candidatesDiscarded,
      durationMs: Date.now() - runStartedAt,
    });

    return {
      executionId: execution.id,
      status: executionStatus,
      outcome,
      sourceType: params.sourceType,
      query,
      queriesExecuted,
      queriesExecutedEstimated,
      groundingSourcesFound,
      groundingDomainsFound,
      rawCandidatesFound:
        providerDiscovery?.metrics.normalizationOutputItems ??
        debug?.opportunityBlocksFound ??
        0,
      normalizedCandidatesFound:
        providerDiscovery?.metrics.uniqueNormalizedCandidates ??
        batch.candidates.length,
      schemaValidCandidates,
      candidatesFound,
      candidatesFiltered,
      candidatesVerified,
      candidatesCreated,
      candidatesUpdated,
      candidatesUnchanged,
      candidatesDiscarded,
      discardCounts,
      inputTokens: batch.inputTokens,
      outputTokens: batch.outputTokens,
      estimatedCost,
      configured: true,
      discoveryMode,
      searchProvider: providerDiscovery?.metrics.searchProvider,
      providerResults: providerDiscovery?.metrics.searchProviderResults,
      uniqueUrls: providerDiscovery?.metrics.searchProviderUniqueUrls,
      uniqueDomains: providerDiscovery?.metrics.searchProviderUniqueDomains,
      documentsFetched: providerDiscovery?.metrics.documentsFetchSucceeded,
      documentsExtracted: providerDiscovery?.metrics.documentsExtracted,
      groundingVerifications:
        providerDiscovery?.metrics.groundingVerificationRequests,
      message:
        executionStatus === "FAILED"
          ? `La búsqueda terminó con ${outcome}`
          : undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Grounding failed";
    const failureStage = getPipelineFailureStage(error) ?? "DISCOVERY";
    const diagnostics =
      error instanceof PipelineStageError ? error.diagnostics : null;
    const groundingSourcesFound =
      typeof diagnostics?.groundingChunksFound === "number"
        ? diagnostics.groundingChunksFound
        : 0;
    const discoveryTextLength =
      typeof diagnostics?.discoveryTextLength === "number"
        ? diagnostics.discoveryTextLength
        : 0;
    const outcome = resolvePrivateSearchOutcome({
      configured: isVertexConfigured(),
      failureStage,
      groundingSourcesFound,
      discoveryTextLength,
      candidatesFound: 0,
      candidatesFiltered: 0,
      candidatesSentToVerification: 0,
      candidatesVerified: 0,
      candidatesCreated,
      candidatesUpdated,
      candidatesUnchanged,
      discardCounts,
    });

    await db
      .update(searchExecutions)
      .set({
        status: "FAILED",
        errorMessage: message.slice(0, 2000),
        candidatesFound: 0,
        candidatesDiscarded,
        queriesExecuted:
          typeof diagnostics?.queriesExecuted === "number"
            ? diagnostics.queriesExecuted
            : 0,
        metrics: {
          candidatesCreated,
          candidatesUpdated,
          candidatesUnchanged,
          candidatesDiscarded,
          discardCounts,
          searchQueries: Array.isArray(diagnostics?.webSearchQueries)
            ? (diagnostics.webSearchQueries as string[])
            : [],
          configured: isVertexConfigured(),
          outcome,
          query: query.slice(0, 500),
          candidatesFound: 0,
          groundingSourcesFound,
          groundingChunksFound: groundingSourcesFound,
          groundingDomainsFound:
            typeof diagnostics?.groundingDomainsFound === "number"
              ? diagnostics.groundingDomainsFound
              : undefined,
          discoveryTextLength,
          discoveryTextPreview:
            typeof diagnostics?.discoveryTextPreview === "string"
              ? diagnostics.discoveryTextPreview
              : undefined,
          discoveryFinishReason:
            typeof diagnostics?.finishReason === "string" ||
            diagnostics?.finishReason === null
              ? (diagnostics.finishReason as string | null)
              : undefined,
          normalizationParseError:
            typeof diagnostics?.normalizationParseError === "string"
              ? diagnostics.normalizationParseError
              : message.slice(0, 500),
          normalizationFailureKind:
            typeof diagnostics?.normalizationFailureKind === "string"
              ? diagnostics.normalizationFailureKind
              : undefined,
          pipelineDiagnosis:
            typeof diagnostics?.pipelineDiagnosis === "string"
              ? diagnostics.pipelineDiagnosis
              : undefined,
          persistErrors,
          discardedTraceSample: limitCandidateTraces(
            candidateTraces,
            DIAGNOSTIC_LIMITS.discardedTraceSample,
          ),
          executionCandidates: limitCandidateTraces(
            candidateTraces,
            DIAGNOSTIC_LIMITS.executionCandidates,
          ),
        } satisfies PrivateSearchMetrics,
        completedAt: new Date(),
      })
      .where(eq(searchExecutions.id, execution.id));

    console.error("search_execution_completed", {
      executionId: execution.id,
      stage: failureStage,
      event: "search_execution_completed",
      outcome,
      durationMs: Date.now() - runStartedAt,
      errorName: error instanceof Error ? error.name : "Error",
      errorMessage: message.slice(0, 300),
    });

    throw error;
  }
}

export async function getLatestPrivateSearch(
  sourceType: "PRIVATE_WEB" | "LINKEDIN" = "PRIVATE_WEB",
  userId?: string,
) {
  const [row] = await db
    .select({
      id: searchExecutions.id,
      status: searchExecutions.status,
      queriesExecuted: searchExecutions.queriesExecuted,
      candidatesFound: searchExecutions.candidatesFound,
      candidatesDiscarded: searchExecutions.candidatesDiscarded,
      inputTokens: searchExecutions.inputTokens,
      outputTokens: searchExecutions.outputTokens,
      estimatedCost: searchExecutions.estimatedCost,
      metrics: searchExecutions.metrics,
      errorMessage: searchExecutions.errorMessage,
      startedAt: searchExecutions.startedAt,
      completedAt: searchExecutions.completedAt,
      createdAt: searchExecutions.createdAt,
      profileName: searchProfiles.name,
    })
    .from(searchExecutions)
    .innerJoin(
      searchProfiles,
      eq(searchExecutions.searchProfileId, searchProfiles.id),
    )
    .where(
      and(
        eq(searchProfiles.sourceType, sourceType),
        inArray(searchExecutions.status, [
          "COMPLETED",
          "PARTIALLY_COMPLETED",
          "FAILED",
          "RUNNING",
        ]),
        userId ? eq(searchProfiles.createdByUserId, userId) : undefined,
      ),
    )
    .orderBy(desc(searchExecutions.createdAt))
    .limit(1);

  return row ?? null;
}

export { isVertexConfigured } from "./client";
export { searchWithGrounding } from "./grounding";
