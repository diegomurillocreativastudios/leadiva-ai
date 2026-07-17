/**
 * Pure metrics / outcome helpers for the private Grounding search pipeline.
 *
 * candidatesFound = schema-valid candidates from the JSON normalization stage,
 * before filtering, verification, deduplication, and persistence.
 */

export class PipelineStageError extends Error {
  readonly stage: "DISCOVERY" | "NORMALIZATION" | "PERSISTENCE";
  readonly diagnostics: Record<string, unknown> | null;

  constructor(
    message: string,
    stage: "DISCOVERY" | "NORMALIZATION" | "PERSISTENCE",
    diagnostics: Record<string, unknown> | null = null,
  ) {
    super(message);
    this.name = "PipelineStageError";
    this.stage = stage;
    this.diagnostics = diagnostics;
  }
}

export function getPipelineFailureStage(
  error: unknown,
): "DISCOVERY" | "NORMALIZATION" | "PERSISTENCE" | null {
  if (error instanceof PipelineStageError) {
    return error.stage;
  }
  if (!(error instanceof Error)) {
    return null;
  }
  const message = error.message;
  if (
    message === "AI_RESPONSE_EMPTY" ||
    message === "AI_RESPONSE_INVALID_JSON" ||
    message === "AI_RESPONSE_INVALID" ||
    message === "AI_RESPONSE_BLOCKED"
  ) {
    return "NORMALIZATION";
  }
  return "DISCOVERY";
}

export const PRIVATE_SEARCH_OUTCOMES = [
  "COMPLETED_WITH_RESULTS",
  "COMPLETED_NO_GROUNDING_SOURCES",
  "COMPLETED_EMPTY_DISCOVERY_RESPONSE",
  "COMPLETED_NO_NORMALIZED_CANDIDATES",
  "COMPLETED_ALL_FILTERED",
  "COMPLETED_ALL_UNVERIFIED",
  "COMPLETED_ALL_DUPLICATES",
  "COMPLETED_ALL_UNCHANGED",
  "COMPLETED_WITH_PERSISTED_RESULTS",
  "FAILED_DISCOVERY",
  "FAILED_NORMALIZATION",
  "FAILED_PERSISTENCE",
  "VERTEX_NOT_CONFIGURED",
  "PROVIDER_NOT_CONFIGURED",
  "COMPLETED_NO_PROVIDER_RESULTS",
  "COMPLETED_NO_UNIQUE_URLS",
  "COMPLETED_NO_RELEVANT_SEARCH_RESULTS",
  "COMPLETED_NO_FETCHABLE_DOCUMENTS",
  "COMPLETED_NO_EXTRACTED_CANDIDATES",
  "FAILED_PROVIDER_AUTH",
  "FAILED_PROVIDER_RATE_LIMIT",
  "FAILED_PROVIDER",
  "FAILED_DOCUMENT_FETCH",
  "FAILED_EXTRACTION",
] as const;

export type PrivateSearchOutcome = (typeof PRIVATE_SEARCH_OUTCOMES)[number];

export const CANDIDATE_TRACE_STAGES = [
  "PROVIDER_RESULT",
  "FETCH",
  "EXTRACTION",
  "DISCOVERY",
  "NORMALIZATION",
  "FILTERING",
  "VERIFICATION",
  "DEDUPLICATION",
  "PERSISTENCE",
] as const;

export type CandidateTraceStage = (typeof CANDIDATE_TRACE_STAGES)[number];

export const CANDIDATE_TRACE_OUTCOMES = [
  "DISCOVERED",
  "SELECTED",
  "FILTERED",
  "ACCEPTED",
  "REJECTED",
  "UNVERIFIED",
  "VERIFIED",
  "UNCHANGED",
  "CREATED",
  "UPDATED",
  "ERROR",
] as const;

export type CandidateTraceOutcome = (typeof CANDIDATE_TRACE_OUTCOMES)[number];

export type CandidateTrace = {
  temporaryId: string;
  title?: string;
  organizationName?: string;
  summary?: string;
  officialSourceUrl?: string;
  applicationUrl?: string;
  sourceDomain?: string;
  deadlineAt?: string;
  category?: string;
  stage: CandidateTraceStage;
  outcome: CandidateTraceOutcome;
  reasonCode?: string;
  reason?: string;
  retrievalScore?: number;
  preliminaryScore?: number;
  verificationStatus?: string;
  discoveredByQueries?: string[];
  discoveredByFamilies?: string[];
};

export const DIAGNOSTIC_LIMITS = {
  rawTextPreviewChars: 1_500,
  normalizationPreviewChars: 2_000,
  discardedTraceSample: 25,
  executionCandidates: 50,
  groundingChunkSummaries: 30,
  webSearchQueries: 20,
} as const;

export type ResolvePrivateSearchOutcomeInput = {
  configured: boolean;
  failureStage?: "DISCOVERY" | "NORMALIZATION" | "PERSISTENCE" | null;
  groundingSourcesFound: number;
  discoveryTextLength: number;
  candidatesFound: number;
  candidatesFiltered: number;
  candidatesSentToVerification: number;
  candidatesVerified: number;
  candidatesCreated: number;
  candidatesUpdated: number;
  candidatesUnchanged: number;
  discardCounts: Record<string, number>;
};

/**
 * Schema-valid normalized candidates entering filters.
 * Not created+updated; not raw discovery blocks.
 */
export function resolveCandidatesFound(params: {
  schemaValidCandidates: number;
}): number {
  return Math.max(0, params.schemaValidCandidates);
}

export function resolveQueriesExecuted(params: {
  webSearchQueriesCount: number;
  fallbackQueryCount?: number;
}): {
  queriesExecuted: number;
  queriesExecutedEstimated: boolean;
} {
  if (params.webSearchQueriesCount > 0) {
    return {
      queriesExecuted: params.webSearchQueriesCount,
      queriesExecutedEstimated: false,
    };
  }

  const fallback = Math.max(0, params.fallbackQueryCount ?? 0);
  return {
    queriesExecuted: fallback,
    queriesExecutedEstimated: fallback > 0,
  };
}

export function countUniqueDomains(
  chunks: Array<{ domain?: string | null; uri?: string | null }>,
): number {
  const domains = new Set<string>();
  for (const chunk of chunks) {
    const domain = chunk.domain?.trim().toLowerCase();
    if (domain) {
      domains.add(domain);
      continue;
    }
    const uri = chunk.uri?.trim();
    if (!uri) {
      continue;
    }
    try {
      const host = new URL(uri).hostname.toLowerCase();
      if (host) {
        domains.add(host);
      }
    } catch {
      // ignore invalid URIs in diagnostics
    }
  }
  return domains.size;
}

export function countUniqueUrls(
  chunks: Array<{ uri?: string | null }>,
): number {
  const urls = new Set<string>();
  for (const chunk of chunks) {
    const uri = chunk.uri?.trim().toLowerCase();
    if (uri) {
      urls.add(uri);
    }
  }
  return urls.size;
}

export function truncateDiagnosticText(
  value: string | null | undefined,
  maxChars: number,
): string {
  if (!value) {
    return "";
  }
  const trimmed = value.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxChars)}…`;
}

export function limitCandidateTraces(
  traces: CandidateTrace[],
  limit: number = DIAGNOSTIC_LIMITS.discardedTraceSample,
): CandidateTrace[] {
  return traces.slice(0, Math.max(0, limit));
}

/** Private discovery may write to search_results only after full verification. */
export function shouldPersistVerifiedCandidate(
  status: "VERIFIED" | "PARTIALLY_VERIFIED" | "REJECTED",
): boolean {
  return status === "VERIFIED";
}

export function classifyNormalizationFailure(
  errorMessage: string,
): "EMPTY_RESPONSE" | "INVALID_JSON" | "INVALID_SCHEMA" | "VERTEX_ERROR" {
  if (errorMessage === "AI_RESPONSE_EMPTY") {
    return "EMPTY_RESPONSE";
  }
  if (errorMessage === "AI_RESPONSE_INVALID_JSON") {
    return "INVALID_JSON";
  }
  if (
    errorMessage === "AI_RESPONSE_INVALID" ||
    errorMessage === "AI_RESPONSE_BLOCKED"
  ) {
    return "INVALID_SCHEMA";
  }
  return "VERTEX_ERROR";
}

export function resolvePrivateSearchOutcome(
  input: ResolvePrivateSearchOutcomeInput,
): PrivateSearchOutcome {
  if (!input.configured) {
    return "VERTEX_NOT_CONFIGURED";
  }

  if (input.failureStage === "DISCOVERY") {
    return "FAILED_DISCOVERY";
  }
  if (input.failureStage === "NORMALIZATION") {
    return "FAILED_NORMALIZATION";
  }
  if (input.failureStage === "PERSISTENCE") {
    return "FAILED_PERSISTENCE";
  }

  if (input.groundingSourcesFound === 0) {
    return "COMPLETED_NO_GROUNDING_SOURCES";
  }

  if (input.discoveryTextLength === 0) {
    return "COMPLETED_EMPTY_DISCOVERY_RESPONSE";
  }

  if (input.candidatesFound === 0) {
    return "COMPLETED_NO_NORMALIZED_CANDIDATES";
  }

  if (
    input.candidatesSentToVerification === 0 &&
    input.candidatesFiltered >= input.candidatesFound
  ) {
    const onlyDuplicates =
      (input.discardCounts.DUPLICATE_IN_BATCH ?? 0) > 0 &&
      (input.discardCounts.DUPLICATE_IN_BATCH ?? 0) >= input.candidatesFound &&
      Object.entries(input.discardCounts)
        .filter(([key]) => key !== "DUPLICATE_IN_BATCH")
        .every(([, count]) => count === 0);

    if (onlyDuplicates) {
      return "COMPLETED_ALL_DUPLICATES";
    }
    return "COMPLETED_ALL_FILTERED";
  }

  if (
    input.candidatesSentToVerification > 0 &&
    input.candidatesVerified === 0 &&
    input.candidatesCreated === 0 &&
    input.candidatesUpdated === 0 &&
    input.candidatesUnchanged === 0
  ) {
    return "COMPLETED_ALL_UNVERIFIED";
  }

  if (
    input.candidatesCreated === 0 &&
    input.candidatesUpdated === 0 &&
    input.candidatesUnchanged > 0
  ) {
    return "COMPLETED_ALL_UNCHANGED";
  }

  if (input.candidatesCreated > 0 || input.candidatesUpdated > 0) {
    return "COMPLETED_WITH_PERSISTED_RESULTS";
  }

  return "COMPLETED_WITH_RESULTS";
}

export type ResolveProviderSearchOutcomeInput = {
  operationalErrorCode?: string | null;
  stoppedBy?: string | null;
  providerResults: number;
  uniqueUrls: number;
  selectedForFetch: number;
  documentsFetchAttempted: number;
  documentsFetchSucceeded: number;
  documentsSentToExtraction: number;
  documentsExtracted: number;
  extractionFailures: number;
  candidatesFound: number;
  candidatesFiltered: number;
  candidatesSentToVerification: number;
  candidatesVerified: number;
  candidatesCreated: number;
  candidatesUpdated: number;
  candidatesUnchanged: number;
  discardCounts: Record<string, number>;
  providerErrors: Record<string, number>;
};

export function resolveProviderSearchOutcome(
  input: ResolveProviderSearchOutcomeInput,
): PrivateSearchOutcome {
  if (input.operationalErrorCode === "PROVIDER_NOT_CONFIGURED") {
    return "PROVIDER_NOT_CONFIGURED";
  }
  if (input.operationalErrorCode === "PROVIDER_UNAUTHORIZED") {
    return "FAILED_PROVIDER_AUTH";
  }
  if (
    input.providerResults === 0 &&
    (input.providerErrors.PROVIDER_RATE_LIMITED ?? 0) > 0
  ) {
    return "FAILED_PROVIDER_RATE_LIMIT";
  }
  if (
    input.providerResults === 0 &&
    Object.values(input.providerErrors).some((count) => count > 0)
  ) {
    return "FAILED_PROVIDER";
  }
  if (input.providerResults === 0) {
    return "COMPLETED_NO_PROVIDER_RESULTS";
  }
  if (input.uniqueUrls === 0) {
    return "COMPLETED_NO_UNIQUE_URLS";
  }
  if (input.selectedForFetch === 0) {
    return "COMPLETED_NO_RELEVANT_SEARCH_RESULTS";
  }
  if (input.stoppedBy === "FAILED_DOCUMENT_FETCH") {
    return "FAILED_DOCUMENT_FETCH";
  }
  if (
    input.documentsFetchAttempted > 0 &&
    input.documentsFetchSucceeded === 0
  ) {
    return "COMPLETED_NO_FETCHABLE_DOCUMENTS";
  }
  if (
    input.documentsSentToExtraction > 0 &&
    input.documentsExtracted === 0 &&
    input.extractionFailures >= input.documentsSentToExtraction
  ) {
    return "FAILED_EXTRACTION";
  }
  if (input.candidatesFound === 0) {
    return "COMPLETED_NO_EXTRACTED_CANDIDATES";
  }
  if (
    input.candidatesSentToVerification === 0 &&
    input.candidatesFiltered >= input.candidatesFound
  ) {
    return "COMPLETED_ALL_FILTERED";
  }
  if (
    input.candidatesSentToVerification > 0 &&
    input.candidatesVerified === 0 &&
    input.candidatesCreated === 0 &&
    input.candidatesUpdated === 0 &&
    input.candidatesUnchanged === 0
  ) {
    return "COMPLETED_ALL_UNVERIFIED";
  }
  if (
    input.candidatesCreated === 0 &&
    input.candidatesUpdated === 0 &&
    input.candidatesUnchanged > 0
  ) {
    return "COMPLETED_ALL_UNCHANGED";
  }
  if (input.candidatesCreated > 0 || input.candidatesUpdated > 0) {
    return "COMPLETED_WITH_PERSISTED_RESULTS";
  }
  return "COMPLETED_WITH_RESULTS";
}

export function isFailedPrivateSearchOutcome(outcome: PrivateSearchOutcome): boolean {
  return outcome.startsWith("FAILED_");
}

export type PrivatePipelineStageMetrics = {
  queriesExecuted: number;
  queriesExecutedEstimated: boolean;
  groundingChunksFound: number;
  groundingSourcesFound: number;
  groundingDomainsFound: number;
  groundingUrlsFound: number;
  groundingUniqueUrlsFound: number;
  hasGroundingSupports: boolean;
  discoveryFinishReason: string | null;
  discoveryTextLength: number;
  discoveryInputTokens: number;
  discoveryOutputTokens: number;
  discoveryDurationMs: number | null;
  discoveryModel: string | null;
  rawOpportunitiesDetected: number;
  normalizationInputCandidates: number;
  normalizationOutputCandidates: number;
  schemaValidCandidates: number;
  schemaInvalidCandidates: number;
  normalizationFinishReason: string | null;
  normalizationInputTokens: number;
  normalizationOutputTokens: number;
  normalizationDurationMs: number | null;
  normalizationModel: string | null;
  normalizationParseError: string | null;
  normalizationFailureKind:
    | "EMPTY_RESPONSE"
    | "INVALID_JSON"
    | "INVALID_SCHEMA"
    | "VERTEX_ERROR"
    | "EMPTY_ARRAY"
    | null;
  candidatesFound: number;
  candidatesFiltered: number;
  candidatesSentToVerification: number;
  candidatesVerified: number;
  candidatesPartiallyVerified: number;
  candidatesRejected: number;
  candidatesDeduplicated: number;
  candidatesCreated: number;
  candidatesUpdated: number;
  candidatesUnchanged: number;
  candidatesDiscarded: number;
  persistErrors: number;
};

export function buildPipelineOutcomeSnapshot(
  stages: Pick<
    PrivatePipelineStageMetrics,
    | "groundingSourcesFound"
    | "discoveryTextLength"
    | "candidatesFound"
    | "candidatesFiltered"
    | "candidatesSentToVerification"
    | "candidatesVerified"
    | "candidatesCreated"
    | "candidatesUpdated"
    | "candidatesUnchanged"
  > & {
    configured: boolean;
    failureStage?: ResolvePrivateSearchOutcomeInput["failureStage"];
    discardCounts: Record<string, number>;
  },
): PrivateSearchOutcome {
  return resolvePrivateSearchOutcome({
    configured: stages.configured,
    failureStage: stages.failureStage ?? null,
    groundingSourcesFound: stages.groundingSourcesFound,
    discoveryTextLength: stages.discoveryTextLength,
    candidatesFound: stages.candidatesFound,
    candidatesFiltered: stages.candidatesFiltered,
    candidatesSentToVerification: stages.candidatesSentToVerification,
    candidatesVerified: stages.candidatesVerified,
    candidatesCreated: stages.candidatesCreated,
    candidatesUpdated: stages.candidatesUpdated,
    candidatesUnchanged: stages.candidatesUnchanged,
    discardCounts: stages.discardCounts,
  });
}
