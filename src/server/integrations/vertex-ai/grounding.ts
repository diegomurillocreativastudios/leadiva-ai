import "server-only";

import { getServerEnv } from "@/env/server";
import {
  getVertexClient,
  getVertexGroundingClient,
  getVertexGroundingModel,
  getVertexModel,
  isVertexConfigured,
} from "./client";
import {
  chunkDiscoveryQueries,
  deduplicateDiscoveryCandidates,
  mapWithConcurrency,
  mergeDiscoveryPasses,
  type DiscoveryPassResult,
} from "./discovery-fanout";
import {
  countOpportunityBlocks,
  diagnoseGroundingPipeline,
  summarizeGroundingDebug,
} from "./grounding-diagnostics";
import {
  DISCOVER_PRIVATE_PROMPT_VERSION,
  buildFocusedDiscoveryPrompt,
} from "./prompts/discover-private-opportunities.prompt";
import {
  STRUCTURE_GROUNDED_DISCOVERY_PROMPT_VERSION,
  buildStructureGroundedDiscoveryPrompt,
} from "./prompts/structure-grounded-discovery.prompt";
import {
  groundingBatchSchema,
  parseGroundingJsonPayload,
  type GroundingBatch,
} from "./schemas";
import { extractGenerateContentText, isVertexRateLimitError } from "./response";
import { STRUCTURE_DISCOVERY_RESPONSE_SCHEMA } from "./response-schemas";
import {
  assertNoSearchWithControlledGeneration,
  associateCandidatesWithGroundingSources,
  extractGroundingSearchQueries,
  extractGroundingSources,
  hasGroundingSupports,
  isControlledGenerationToolConflict,
  labelGroundingSources,
  type GroundingSource,
  type LabeledGroundingSource,
  type StructuredGroundingCandidate,
} from "./grounding-sources";
import {
  DIAGNOSTIC_LIMITS,
  PipelineStageError,
  truncateDiagnosticText,
} from "./pipeline-metrics";
import {
  adaptNormalizationRoot,
  type NormalizationFailureKind,
  recoverCandidatesFromRawBlocks,
  safeValidationError,
} from "./normalization-recovery";
import {
  buildDiscoveryQueries,
  buildDiscoverySearchPlan,
  type DiscoverySearchPlan,
} from "./query";
import {
  sanitizeGroundedCandidates,
  sanitizeSearchQueries,
} from "./sanitize";
import { partitionStructuredCandidates } from "./structure-candidates";

export type { GroundingBatch };
export { mapGroundedCandidate } from "./mapper";
export type { MappedGroundedSearchResult } from "./mapper";
export { isControlledGenerationToolConflict } from "./grounding-sources";
export { STRUCTURE_DISCOVERY_RESPONSE_SCHEMA } from "./response-schemas";
export { partitionStructuredCandidates } from "./structure-candidates";

type VertexUsage = {
  inputTokens: number;
  outputTokens: number;
};

type GroundingMetadataLike = {
  groundingChunks?: Array<{
    web?: { uri?: string; title?: string; domain?: string };
  }>;
};

function usageTokens(response: {
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
}): VertexUsage {
  const usage = response.usageMetadata;
  return {
    inputTokens: usage?.promptTokenCount ?? 0,
    outputTokens: usage?.candidatesTokenCount ?? 0,
  };
}

function chunkSummariesFromMetadata(metadata: unknown): Array<{
  uri: string | null;
  title: string | null;
  domain: string | null;
}> {
  if (!metadata || typeof metadata !== "object") {
    return [];
  }
  const record = metadata as GroundingMetadataLike;
  return (record.groundingChunks ?? []).map((chunk) => ({
    uri: chunk.web?.uri ?? null,
    title: chunk.web?.title ?? null,
    domain: chunk.web?.domain ?? null,
  }));
}

function buildDiscoveryDebug(params: {
  rawText: string;
  finishReason: string | null;
  searchQueries: string[];
  groundingMetadata: unknown;
  structuredCandidatesFound: number;
  fallbackQueryCount?: number;
  discoveryInputTokens?: number;
  discoveryOutputTokens?: number;
  discoveryDurationMs?: number | null;
  discoveryModel?: string | null;
  normalization?: {
    inputCandidates?: number;
    outputCandidates?: number;
    schemaValidCandidates?: number;
    schemaInvalidCandidates?: number;
    finishReason?: string | null;
    inputTokens?: number;
    outputTokens?: number;
    durationMs?: number | null;
    model?: string | null;
    preview?: string;
    parseError?: string | null;
    failureKind?: NormalizationFailureKind | null;
    rootAdapted?: boolean;
    originalRoot?: "array" | "candidates" | "opportunities" | "results" | "unknown";
    retryAttempted?: boolean;
    retryReason?: string | null;
    retryCandidates?: number;
    retryCost?: string | null;
    recoveredFromRawBlocks?: number;
    validationErrorsSample?: ReturnType<typeof safeValidationError>[];
  };
  fanout?: Pick<NonNullable<GroundingBatch["discoveryDebug"]>,
    | "searchPlanIntents"
    | "searchFamiliesExecuted"
    | "groundingPassesExecuted"
    | "sourcesByFamily"
    | "domainsByFamily"
    | "rawCandidatesByFamily"
    | "normalizedCandidatesByFamily"
    | "uniqueCandidatesBeforeFilters"
    | "crossBatchDuplicates"
    | "passesWithoutNewSources"
    | "passesWithoutNewCandidates"
    | "stoppedBy"
  >;
}) {
  const chunkSummaries = chunkSummariesFromMetadata(params.groundingMetadata);
  const summary = summarizeGroundingDebug({
    rawText: params.rawText,
    finishReason: params.finishReason,
    webSearchQueries: params.searchQueries,
    groundingChunks: chunkSummaries,
    hasGroundingSupports: hasGroundingSupports(params.groundingMetadata),
    fallbackQueryCount: params.fallbackQueryCount,
  });

  const pipelineDiagnosis = diagnoseGroundingPipeline({
    groundingChunksFound: summary.groundingChunksFound,
    discoveryTextLength: summary.discoveryTextLength,
    opportunityBlocksFound: summary.opportunityBlocksFound,
    structuredCandidatesFound: params.structuredCandidatesFound,
    webSearchQueriesCount: params.searchQueries.length,
  });

  return {
    ...summary,
    structuredCandidatesFound: params.structuredCandidatesFound,
    pipelineDiagnosis,
    discoveryInputTokens: params.discoveryInputTokens ?? 0,
    discoveryOutputTokens: params.discoveryOutputTokens ?? 0,
    discoveryDurationMs: params.discoveryDurationMs ?? null,
    discoveryModel: params.discoveryModel ?? null,
    normalizationInputCandidates:
      params.normalization?.inputCandidates ?? summary.opportunityBlocksFound,
    normalizationOutputCandidates:
      params.normalization?.outputCandidates ?? 0,
    schemaValidCandidates:
      params.normalization?.schemaValidCandidates ??
      params.structuredCandidatesFound,
    schemaInvalidCandidates: params.normalization?.schemaInvalidCandidates ?? 0,
    normalizationFinishReason: params.normalization?.finishReason ?? null,
    normalizationInputTokens: params.normalization?.inputTokens ?? 0,
    normalizationOutputTokens: params.normalization?.outputTokens ?? 0,
    normalizationDurationMs: params.normalization?.durationMs ?? null,
    normalizationModel: params.normalization?.model ?? null,
    normalizationPreview: params.normalization?.preview,
    normalizationParseError: params.normalization?.parseError ?? null,
    normalizationFailureKind: params.normalization?.failureKind ?? null,
    normalizationRootAdapted: params.normalization?.rootAdapted ?? false,
    normalizationOriginalRoot: params.normalization?.originalRoot ?? "unknown",
    normalizationRetryAttempted: params.normalization?.retryAttempted ?? false,
    normalizationRetryReason: params.normalization?.retryReason ?? null,
    normalizationRetryCandidates: params.normalization?.retryCandidates ?? 0,
    normalizationRetryCost: params.normalization?.retryCost ?? null,
    recoveredFromRawBlocks: params.normalization?.recoveredFromRawBlocks ?? 0,
    normalizationValidationErrorsSample:
      params.normalization?.validationErrorsSample ?? [],
    ...params.fanout,
  };
}

function emptyConfiguredBatch(params?: {
  sources?: GroundingSource[];
  searchQueries?: string[];
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
  promptVersion?: string;
  discoveryDebug?: GroundingBatch["discoveryDebug"];
}): GroundingBatch {
  return groundingBatchSchema.parse({
    candidates: [],
    citations: (params?.sources ?? []).map((source) => ({
      uri: source.url,
      title: source.title ?? undefined,
    })),
    sources: params?.sources ?? [],
    searchQueries: params?.searchQueries ?? [],
    inputTokens: params?.inputTokens ?? 0,
    outputTokens: params?.outputTokens ?? 0,
    model: params?.model,
    promptVersion: params?.promptVersion,
    discoveryDebug: params?.discoveryDebug,
    configured: true,
  });
}

/**
 * Single Google Search Grounding pass (1–2 intents).
 * Uses the global grounding endpoint and a stronger model than structure.
 */
async function discoverGroundingPass(params: {
  discoveryQueries: string[];
  family?: string;
  intentIds?: string[];
  sourceType: "PRIVATE_WEB" | "LINKEDIN";
  interestCategories: string[];
  maxCandidatesPerPass: number;
  passIndex: number;
}): Promise<DiscoveryPassResult> {
  const client = getVertexGroundingClient();
  const model = getVertexGroundingModel();
  const prompt = buildFocusedDiscoveryPrompt({
    discoveryQueries: params.discoveryQueries,
    sourceType: params.sourceType,
    maxCandidates: params.maxCandidatesPerPass,
    interestCategories: params.interestCategories,
    family: params.family,
  });

  const response = await client.models.generateContent({
    model,
    contents: prompt,
    config: (() => {
      const config = {
        // Google Search Grounding is intentionally exploratory; normalization
        // remains deterministic in the separate, tool-free call below.
        temperature: 1.0,
        maxOutputTokens: getServerEnv().SEARCH_GROUNDING_MAX_OUTPUT_TOKENS,
        tools: [{ googleSearch: {} }],
      };
      assertNoSearchWithControlledGeneration(config);
      return config;
    })(),
  });

  const { text, finishReason } = extractGenerateContentText(response);
  if (!text) {
    if (finishReason === "SAFETY" || finishReason === "BLOCKLIST") {
      throw new Error("AI_RESPONSE_BLOCKED");
    }
  }

  const groundingMetadata = response.candidates?.[0]?.groundingMetadata ?? null;
  const sources = extractGroundingSources(groundingMetadata);
  const searchQueries = sanitizeSearchQueries(
    extractGroundingSearchQueries(groundingMetadata),
  );

  return {
    text: text ?? "",
    finishReason,
    sources,
    searchQueries,
    usage: usageTokens(response),
    model,
    passIndex: params.passIndex,
    queriesInPass: params.discoveryQueries,
    family: params.family,
    intentIds: params.intentIds,
  };
}

function isEmptyGroundingPass(pass: DiscoveryPassResult): boolean {
  return (
    pass.sources.length === 0 &&
    pass.searchQueries.length > 0 &&
    pass.text.trim().length === 0
  );
}

async function discoverWithGroundingFanOut(params: {
  discoveryQueries: string[];
  searchPlan?: DiscoverySearchPlan;
  sourceType: "PRIVATE_WEB" | "LINKEDIN";
  interestCategories: string[];
  maxCandidates: number;
}): Promise<DiscoveryPassResult[]> {
  const env = getServerEnv();
  const maxPasses = env.SEARCH_GROUNDING_PASSES;
  const intents = (params.searchPlan?.intents ?? params.discoveryQueries.map((query, index) => ({
    id: `legacy-${index + 1}`,
    family: "project_solution" as const,
    language: "en" as const,
    query,
    priority: 0,
    regional: false,
  }))).slice(0, Math.min(env.SEARCH_MAX_QUERIES, maxPasses * 2));
  const batches = chunkDiscoveryQueries(intents, 2);
  const passes: DiscoveryPassResult[] = [];
  const seenSourceKeys = new Set<string>();
  let consecutivePassesWithoutNewSources = 0;

  for (let passIndex = 0; passIndex < batches.length; passIndex += 1) {
    const intentBatch = batches[passIndex];
    if (!intentBatch || intentBatch.length === 0) {
      continue;
    }
    const batch = intentBatch.map((intent) => intent.query);

    if (passIndex > 0) {
      // Space calls to avoid RPM / Search quota spikes on free tier.
      await new Promise((resolve) => setTimeout(resolve, 1_500));
    }

    try {
      let pass = await discoverGroundingPass({
        discoveryQueries: batch,
        sourceType: params.sourceType,
        interestCategories: params.interestCategories,
        maxCandidatesPerPass: Math.min(5, params.maxCandidates),
        passIndex,
        family: [...new Set(intentBatch.map((intent) => intent.family))].join(","),
        intentIds: intentBatch.map((intent) => intent.id),
      });

      if (isEmptyGroundingPass(pass) && batch[0]) {
        console.warn("grounding_pass_empty_retry", {
          event: "grounding_pass_empty_retry",
          passIndex,
          queries: batch,
          webSearchQueries: pass.searchQueries.length,
        });
        await new Promise((resolve) => setTimeout(resolve, 1_200));
        pass = await discoverGroundingPass({
          discoveryQueries: [batch[0]],
          sourceType: params.sourceType,
          interestCategories: params.interestCategories,
          maxCandidatesPerPass: Math.min(5, params.maxCandidates),
          passIndex,
          family: intentBatch[0]?.family,
          intentIds: intentBatch.slice(0, 1).map((intent) => intent.id),
        });
      }

      passes.push(pass);

      const hasNewSources = pass.sources.some((source) => {
        if (seenSourceKeys.has(source.equivalenceKey)) {
          return false;
        }
        seenSourceKeys.add(source.equivalenceKey);
        return true;
      });
      consecutivePassesWithoutNewSources = hasNewSources
        ? 0
        : consecutivePassesWithoutNewSources + 1;

      const merged = mergeDiscoveryPasses(passes);
      const spentInput = merged.usage.inputTokens;
      const spentOutput = merged.usage.outputTokens;
      const estimatedCost = spentInput * 0.0000001 + spentOutput * 0.0000004;
      if (
        merged.sources.length >= params.maxCandidates ||
        spentInput >= env.SEARCH_MAX_INPUT_TOKENS ||
        spentOutput >= env.SEARCH_MAX_OUTPUT_TOKENS ||
        estimatedCost >= env.SEARCH_MAX_ESTIMATED_COST ||
        consecutivePassesWithoutNewSources >=
          env.SEARCH_MAX_CONSECUTIVE_EMPTY_PASSES
      ) {
        break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isVertexRateLimitError(message)) {
        console.warn("grounding_pass_rate_limited", {
          event: "grounding_pass_rate_limited",
          passIndex,
          passesCompleted: passes.length,
          message: message.slice(0, 300),
        });
        if (passes.length > 0) {
          break;
        }
        throw new Error("AI_RATE_LIMITED");
      }
      // A failed family must not discard useful discoveries from later passes.
      console.warn("grounding_pass_failed", {
        event: "grounding_pass_failed",
        passIndex,
        message: message.slice(0, 300),
      });
      continue;
    }
  }

  if (passes.length === 0) {
    return [];
  }

  return passes;
}

/**
 * Call 2: structured normalization without tools.
 * sourceId binds candidates to real Grounding URIs — never trust model URLs.
 * Invalid items are dropped individually so one bad candidate does not discard the batch.
 */
async function structureGroundedDiscovery(params: {
  rawText: string;
  groundedSources: LabeledGroundingSource[];
  maxCandidates: number;
  interestCategories: string[];
  opportunityBlocksFound: number;
  repair?: boolean;
}): Promise<{
  candidates: StructuredGroundingCandidate[];
  usage: VertexUsage;
  finishReason: string | null;
  durationMs: number;
  model: string;
  normalizationInputCandidates: number;
  normalizationOutputCandidates: number;
  schemaValidCandidates: number;
  schemaInvalidCandidates: number;
  rawResponsePreview: string;
  parseError: string | null;
  failureKind: NormalizationFailureKind | null;
  rootAdapted: boolean;
  originalRoot: "array" | "candidates" | "opportunities" | "results" | "unknown";
  validationErrorsSample: ReturnType<typeof safeValidationError>[];
}> {
  const client = getVertexClient();
  const model = getVertexModel();
  const prompt = buildStructureGroundedDiscoveryPrompt({
    rawText: params.rawText,
    groundedSources: params.groundedSources,
    maxCandidates: params.maxCandidates,
    interestCategories: params.interestCategories,
    currentDate: new Date().toISOString().slice(0, 10),
    repair: params.repair,
  });

  const startedAt = performance.now();
  let response;
  try {
    const config = {
      temperature: 0,
      maxOutputTokens: getServerEnv().SEARCH_NORMALIZATION_MAX_OUTPUT_TOKENS,
      responseMimeType: "application/json" as const,
      responseJsonSchema: STRUCTURE_DISCOVERY_RESPONSE_SCHEMA,
    };
    assertNoSearchWithControlledGeneration(config);
    response = await client.models.generateContent({
      model,
      contents: prompt,
      config,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Vertex failed";
    throw new PipelineStageError(message, "NORMALIZATION");
  }

  const durationMs = Math.round(performance.now() - startedAt);
  const { text, finishReason } = extractGenerateContentText(response);
  if (!text) {
    if (finishReason === "SAFETY" || finishReason === "BLOCKLIST") {
      throw new PipelineStageError("AI_RESPONSE_BLOCKED", "NORMALIZATION");
    }
    throw new PipelineStageError("AI_RESPONSE_EMPTY", "NORMALIZATION");
  }

  let parsedJson: unknown;
  try {
    parsedJson = parseGroundingJsonPayload(text);
  } catch {
    throw new PipelineStageError("AI_RESPONSE_INVALID_JSON", "NORMALIZATION");
  }

  const root = adaptNormalizationRoot(parsedJson);
  if (!root.items) {
    throw new PipelineStageError("NORMALIZATION_WRONG_ROOT", "NORMALIZATION");
  }
  const rawCandidates = root.items;
  const { valid: candidates, invalidCount: schemaInvalidCandidates } =
    partitionStructuredCandidates(rawCandidates);

  return {
    candidates,
    usage: usageTokens(response),
    finishReason,
    durationMs,
    model,
    normalizationInputCandidates: params.opportunityBlocksFound,
    normalizationOutputCandidates: rawCandidates.length,
    schemaValidCandidates: candidates.length,
    schemaInvalidCandidates,
    rawResponsePreview: truncateDiagnosticText(
      text,
      DIAGNOSTIC_LIMITS.normalizationPreviewChars,
    ),
    parseError: null,
    failureKind:
      rawCandidates.length === 0
        ? "EMPTY_OPPORTUNITIES_ARRAY"
        : candidates.length === 0
          ? "MODEL_DISCARDED_ALL"
          : schemaInvalidCandidates > 0
            ? "ITEMS_PARTIALLY_INVALID"
            : null,
    rootAdapted: root.adapted,
    originalRoot: root.originalRoot,
    validationErrorsSample: rawCandidates
      .map((raw, index) => ({ raw, index }))
      .filter(({ raw }) => !partitionStructuredCandidates([raw]).valid.length)
      .slice(0, 10)
      .map(({ raw, index }) => safeValidationError(raw, index)),
  };
}

function logDiscoveryDiagnostics(params: {
  query: string;
  discoveryDebug: NonNullable<GroundingBatch["discoveryDebug"]>;
}) {
  const debug = params.discoveryDebug;
  console.info("grounding_discovery_debug", {
    event: "grounding_discovery_debug",
    query: params.query.slice(0, 300),
    finishReason: debug.finishReason,
    discoveryTextLength: debug.discoveryTextLength,
    groundingChunksFound: debug.groundingChunksFound,
    opportunityBlocksFound: debug.opportunityBlocksFound,
    structuredCandidatesFound: debug.structuredCandidatesFound,
    pipelineDiagnosis: debug.pipelineDiagnosis,
    webSearchQueries: debug.webSearchQueries,
    groundingChunkSummaries: debug.groundingChunkSummaries,
    discoveryTextPreview: debug.discoveryTextPreview,
  });

  if (debug.pipelineDiagnosis === "NO_GROUNDING_SOURCES") {
    console.warn("Grounding no recuperó fuentes web.");
  } else if (debug.pipelineDiagnosis === "SEARCH_QUERIES_WITHOUT_CHUNKS") {
    console.warn(
      "Google Search ejecutó consultas pero Vertex no devolvió groundingChunks.",
    );
  } else if (debug.pipelineDiagnosis === "SOURCES_WITHOUT_TEXT") {
    console.warn(
      "Grounding encontró fuentes, pero el modelo no generó contenido.",
    );
  } else if (debug.pipelineDiagnosis === "PARSER_OR_STRUCTURE_FAILED") {
    console.error(
      "El problema está en el parser o en el formato de salida, no en Search.",
    );
  } else {
    console.info(
      `Grounding encontró ${debug.groundingChunksFound} fuentes. Continuar con extracción.`,
    );
  }
}

async function generateGroundedOnce(params: {
  sourceType: "PRIVATE_WEB" | "LINKEDIN";
  query: string;
  searchPlan?: DiscoverySearchPlan;
  interestCategories: string[];
  maxCandidates: number;
}): Promise<GroundingBatch> {
  const discoveryQueries = params.searchPlan?.intents.map((intent) => intent.query) ?? (params.query.includes("\n")
    ? params.query
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    : buildDiscoveryQueries(params.interestCategories));

  const discoveryStartedAt = Date.now();
  let discoveryPasses: DiscoveryPassResult[];
  try {
    discoveryPasses = await discoverWithGroundingFanOut({
      discoveryQueries,
      searchPlan: params.searchPlan,
      sourceType: params.sourceType,
      interestCategories: params.interestCategories,
      maxCandidates: params.maxCandidates,
    });
  } catch (error) {
    if (error instanceof PipelineStageError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : "Grounding failed";
    throw new PipelineStageError(message, "DISCOVERY");
  }
  const discoveryDurationMs = Date.now() - discoveryStartedAt;
  const discovery = mergeDiscoveryPasses(discoveryPasses);
  const sources = discovery.sources;
  const searchQueries = discovery.searchQueries;
  const promptVersion = `${DISCOVER_PRIVATE_PROMPT_VERSION}+${STRUCTURE_GROUNDED_DISCOVERY_PROMPT_VERSION}`;
  const opportunityBlocksFound = countOpportunityBlocks(discovery.text);

  if (sources.length === 0) {
    const discoveryDebug = buildDiscoveryDebug({
      rawText: discovery.text,
      finishReason: discovery.finishReason,
      searchQueries,
      groundingMetadata: {
        groundingChunks: [],
        webSearchQueries: searchQueries,
      },
      structuredCandidatesFound: 0,
      fallbackQueryCount: discoveryQueries.length,
      discoveryInputTokens: discovery.usage.inputTokens,
      discoveryOutputTokens: discovery.usage.outputTokens,
      discoveryDurationMs,
      discoveryModel: discovery.model,
      normalization: {
        inputCandidates: opportunityBlocksFound,
        outputCandidates: 0,
        schemaValidCandidates: 0,
        schemaInvalidCandidates: 0,
        failureKind: null,
      },
    });
    logDiscoveryDiagnostics({ query: params.query, discoveryDebug });
    console.info("grounding_no_grounded_sources", {
      event: "grounding_no_grounded_sources",
      reason: discoveryDebug.pipelineDiagnosis,
      model: discovery.model,
      query: params.query.slice(0, 300),
      opportunityBlocksFound,
      discoveryTextLength: discovery.text.trim().length,
      passesExecuted: discovery.passIndex,
      webSearchQueries: searchQueries.length,
      queriesExecuted: discoveryDebug.queriesExecuted,
      queriesExecutedEstimated: discoveryDebug.queriesExecutedEstimated,
    });
    return emptyConfiguredBatch({
      sources: [],
      searchQueries,
      inputTokens: discovery.usage.inputTokens,
      outputTokens: discovery.usage.outputTokens,
      model: discovery.model,
      promptVersion,
      discoveryDebug,
    });
  }

  // Normalize each grounded pass independently. A malformed or empty batch
  // cannot erase candidates discovered by another family.
  let normalizationRetryConsumed = false;
  const normalizePass = async (pass: DiscoveryPassResult) => {
    const rawBlocks = countOpportunityBlocks(pass.text);
    if (pass.sources.length === 0 || !pass.text.trim()) {
      return {
        pass,
        candidates: [],
        structured: null,
        error: null as string | null,
        failureKind: rawBlocks > 0 ? "INPUT_EMPTY" as const : null,
        retryAttempted: false,
        retryCandidates: 0,
        retryCost: null as string | null,
        recoveredFromRawBlocks: 0,
      };
    }
    const request = (repair = false) =>
      structureGroundedDiscovery({
        rawText: pass.text,
        groundedSources: labelGroundingSources(pass.sources),
        maxCandidates: Math.min(5, params.maxCandidates),
        interestCategories: params.interestCategories,
        opportunityBlocksFound: rawBlocks,
        repair,
      });
    const asCandidates = (structured: Awaited<ReturnType<typeof structureGroundedDiscovery>>) =>
      sanitizeGroundedCandidates(
        associateCandidatesWithGroundingSources(
          structured.candidates.map((candidate) =>
            !candidate.sourceId && pass.sources.length === 1
              ? { ...candidate, sourceId: "source_1" }
              : candidate,
          ),
          labelGroundingSources(pass.sources),
        ),
        Math.min(5, params.maxCandidates),
      );

    let structured: Awaited<ReturnType<typeof structureGroundedDiscovery>> | null = null;
    let firstError: string | null = null;
    try {
      structured = await request();
      const candidates = asCandidates(structured);
      if (candidates.length > 0 || rawBlocks === 0) {
        return { pass, candidates, structured, error: null, failureKind: structured.failureKind, retryAttempted: false, retryCandidates: 0, retryCost: null, recoveredFromRawBlocks: 0 };
      }
    } catch (error) {
      firstError = error instanceof Error ? error.message.slice(0, 500) : "Normalization failed";
    }

    // Exactly one tool-free repair attempt when grounded blocks exist but the
    // primary normalizer returned nothing usable.
    let retry: Awaited<ReturnType<typeof structureGroundedDiscovery>> | null = null;
    const retryAllowed = !normalizationRetryConsumed;
    if (retryAllowed) {
      normalizationRetryConsumed = true;
      try {
        retry = await request(true);
        const candidates = asCandidates(retry);
        if (candidates.length > 0) {
          return {
            pass,
            candidates,
            structured: retry,
            error: firstError,
            failureKind: retry.failureKind,
            retryAttempted: true,
            retryCandidates: candidates.length,
            retryCost: (retry.usage.inputTokens * 0.0000001 + retry.usage.outputTokens * 0.0000004).toFixed(6),
            recoveredFromRawBlocks: 0,
          };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 500) : "Normalization failed";
        firstError = firstError ? `${firstError}; retry: ${message}` : message;
      }
    }

    const recovered = recoverCandidatesFromRawBlocks({
      rawText: pass.text,
      sources: pass.sources,
      maxCandidates: Math.min(5, params.maxCandidates),
    });
    return {
      pass,
      candidates: recovered,
      structured: retry ?? structured,
      error: firstError,
      failureKind: firstError ? "NORMALIZATION_REQUEST_FAILED" as const : "MODEL_DISCARDED_ALL" as const,
      retryAttempted: retryAllowed,
      retryCandidates: retry ? asCandidates(retry).length : 0,
      retryCost: retry
        ? (retry.usage.inputTokens * 0.0000001 + retry.usage.outputTokens * 0.0000004).toFixed(6)
        : retryAllowed
          ? "0.000000"
          : null,
      recoveredFromRawBlocks: recovered.length,
    };
  };
  const normalizedPasses = await mapWithConcurrency(
    discoveryPasses,
    getServerEnv().SEARCH_GROUNDING_CONCURRENCY,
    normalizePass,
  );
  const allCandidates = normalizedPasses.flatMap((result) => result.candidates);
  const deduped = deduplicateDiscoveryCandidates(allCandidates);
  const candidates = deduped.candidates.slice(0, params.maxCandidates);
  const structured = normalizedPasses.find((result) => result.structured)?.structured ?? null;
  const normalizationOutputCandidates = normalizedPasses.reduce(
    (total, result) => total + (result.structured?.normalizationOutputCandidates ?? 0),
    0,
  );
  const schemaValidCandidates = normalizedPasses.reduce(
    (total, result) => total + (result.structured?.schemaValidCandidates ?? 0),
    0,
  );
  const schemaInvalidCandidates = normalizedPasses.reduce(
    (total, result) => total + (result.structured?.schemaInvalidCandidates ?? 0),
    0,
  );
  const normalizationInputTokens = normalizedPasses.reduce(
    (total, result) => total + (result.structured?.usage.inputTokens ?? 0),
    0,
  );
  const normalizationOutputTokens = normalizedPasses.reduce(
    (total, result) => total + (result.structured?.usage.outputTokens ?? 0),
    0,
  );
  const normalizationDurationMs = normalizedPasses.reduce(
    (total, result) => total + (result.structured?.durationMs ?? 0),
    0,
  );
  const normalizationValidationErrorsSample = normalizedPasses
    .flatMap((result) => result.structured?.validationErrorsSample ?? [])
    .slice(0, 10);
  const normalizationRetryAttempted = normalizedPasses.some(
    (result) => result.retryAttempted,
  );
  const normalizationRetryCandidates = normalizedPasses.reduce(
    (total, result) => total + result.retryCandidates,
    0,
  );
  const recoveredFromRawBlocks = normalizedPasses.reduce(
    (total, result) => total + result.recoveredFromRawBlocks,
    0,
  );
  const sourcesByFamily: Record<string, number> = {};
  const domainsByFamily: Record<string, number> = {};
  const rawCandidatesByFamily: Record<string, number> = {};
  const normalizedCandidatesByFamily: Record<string, number> = {};
  const seenSourceKeys = new Set<string>();
  let passesWithoutNewSources = 0;
  let passesWithoutNewCandidates = 0;
  for (const result of normalizedPasses) {
    const family = result.pass.family ?? "legacy";
    sourcesByFamily[family] = (sourcesByFamily[family] ?? 0) + result.pass.sources.length;
    domainsByFamily[family] = Math.max(
      domainsByFamily[family] ?? 0,
      new Set(result.pass.sources.map((source) => source.domain).filter(Boolean)).size,
    );
    rawCandidatesByFamily[family] = (rawCandidatesByFamily[family] ?? 0) + countOpportunityBlocks(result.pass.text);
    normalizedCandidatesByFamily[family] = (normalizedCandidatesByFamily[family] ?? 0) + result.candidates.length;
    const hasNewSource = result.pass.sources.some((source) => {
      if (seenSourceKeys.has(source.equivalenceKey)) return false;
      seenSourceKeys.add(source.equivalenceKey);
      return true;
    });
    if (!hasNewSource) passesWithoutNewSources += 1;
    if (result.candidates.length === 0) passesWithoutNewCandidates += 1;
  }
  const fanout = {
    searchPlanIntents: params.searchPlan?.intents ?? [],
    searchFamiliesExecuted: [...new Set(discoveryPasses.map((pass) => pass.family ?? "legacy"))],
    groundingPassesExecuted: discoveryPasses.length,
    sourcesByFamily,
    domainsByFamily,
    rawCandidatesByFamily,
    normalizedCandidatesByFamily,
    uniqueCandidatesBeforeFilters: candidates.length,
    crossBatchDuplicates: deduped.duplicates,
    passesWithoutNewSources,
    passesWithoutNewCandidates,
    stoppedBy:
      discoveryPasses.length >= getServerEnv().SEARCH_GROUNDING_PASSES
        ? "MAX_GROUNDING_PASSES"
        : "PLAN_EXHAUSTED",
  };

  const discoveryDebug = buildDiscoveryDebug({
    rawText: discovery.text,
    finishReason: discovery.finishReason,
    searchQueries,
    groundingMetadata: {
      groundingChunks: sources.map((source) => ({
        web: {
          uri: source.url,
          title: source.title ?? undefined,
          domain: source.domain ?? undefined,
        },
      })),
      webSearchQueries: searchQueries,
      groundingSupports:
        sources.some((source) => source.supportCount > 0) ? [{}] : [],
    },
    structuredCandidatesFound: candidates.length,
    fallbackQueryCount: discoveryQueries.length,
    discoveryInputTokens: discovery.usage.inputTokens,
    discoveryOutputTokens: discovery.usage.outputTokens,
    discoveryDurationMs,
    discoveryModel: discovery.model,
    fanout,
    normalization: {
      inputCandidates: opportunityBlocksFound,
      outputCandidates: normalizationOutputCandidates,
      schemaValidCandidates,
      schemaInvalidCandidates,
      finishReason: structured?.finishReason ?? null,
      inputTokens: normalizationInputTokens,
      outputTokens: normalizationOutputTokens,
      durationMs: normalizationDurationMs,
      model: structured?.model ?? null,
      preview: structured?.rawResponsePreview,
      parseError: normalizedPasses.find((result) => result.error)?.error ?? null,
      failureKind:
        normalizedPasses.find((result) => result.failureKind)?.failureKind ?? null,
      rootAdapted: normalizedPasses.some(
        (result) => result.structured?.rootAdapted,
      ),
      originalRoot: structured?.originalRoot ?? "unknown",
      retryAttempted: normalizationRetryAttempted,
      retryReason: normalizationRetryAttempted
        ? "ZERO_NORMALIZED_WITH_RAW_BLOCKS"
        : null,
      retryCandidates: normalizationRetryCandidates,
      retryCost: normalizedPasses
        .filter((result) => result.retryCost)
        .map((result) => result.retryCost)
        .at(0) ?? null,
      recoveredFromRawBlocks,
      validationErrorsSample: normalizationValidationErrorsSample,
    },
  });
  logDiscoveryDiagnostics({ query: params.query, discoveryDebug });

  try {
    return groundingBatchSchema.parse({
      candidates,
      citations: sources.map((source) => ({
        uri: source.url,
        title: source.title ?? undefined,
      })),
      sources,
      searchQueries,
      inputTokens:
        discovery.usage.inputTokens + normalizationInputTokens,
      outputTokens:
        discovery.usage.outputTokens + normalizationOutputTokens,
      model: discovery.model,
      promptVersion,
      discoveryDebug,
      configured: true,
    });
  } catch {
    throw new PipelineStageError("AI_RESPONSE_INVALID", "NORMALIZATION");
  }
}

/**
 * Google Search Grounding discovery (Search) + separate structured normalization.
 * Without GCP_PROJECT_ID returns an empty configured=false batch (no invented leads).
 */
export async function searchWithGrounding(params: {
  sourceType: "PRIVATE_WEB" | "LINKEDIN";
  query: string;
  interestCategories?: string[];
  maxCandidates?: number;
  searchPlan?: DiscoverySearchPlan;
}): Promise<GroundingBatch> {
  const env = getServerEnv();
  const maxCandidates = Math.min(
    params.maxCandidates ?? env.SEARCH_MAX_CANDIDATES,
    env.SEARCH_MAX_CANDIDATES,
  );

  if (!isVertexConfigured()) {
    return groundingBatchSchema.parse({
      candidates: [],
      citations: [],
      sources: [],
      searchQueries: [],
      inputTokens: 0,
      outputTokens: 0,
      configured: false,
    });
  }

  const interestCategories = params.interestCategories ?? [
    "SOFTWARE",
    "IT",
    "CONSULTING",
    "AI",
  ];

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await generateGroundedOnce({
        sourceType: params.sourceType,
        query: params.query,
        interestCategories,
        maxCandidates,
        searchPlan:
          params.searchPlan ??
          buildDiscoverySearchPlan({
            interestCategories,
            maxIntents: env.SEARCH_MAX_QUERIES,
            regionalShare: env.SEARCH_REGIONAL_SHARE,
          }),
      });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Grounding failed");

      if (isControlledGenerationToolConflict(lastError)) {
        console.error("grounding_configuration_incompatible", {
          event: "grounding_configuration_incompatible",
          reason: "CONTROLLED_GENERATION_WITH_SEARCH",
          model: getVertexModel(),
          message: lastError.message,
        });
        throw lastError;
      }

      if (isVertexRateLimitError(lastError.message)) {
        // Do not burn remaining quota with rapid retries.
        if (attempt === 0) {
          console.warn("grounding_rate_limited_backoff", {
            event: "grounding_rate_limited_backoff",
            attempt,
          });
          await new Promise((resolve) => setTimeout(resolve, 8_000));
          continue;
        }
        throw new Error("AI_RATE_LIMITED");
      }

      const retriable = /(?:503|timeout|ECONNRESET|ECONNREFUSED)/i.test(
        lastError.message,
      );

      if (!retriable) {
        throw lastError;
      }

      if (attempt < 1) {
        await new Promise((resolve) => setTimeout(resolve, 1_200));
      }
    }
  }

  throw lastError ?? new Error("AI_RESPONSE_INVALID");
}
