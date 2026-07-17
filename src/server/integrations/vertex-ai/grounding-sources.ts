import {
  areEquivalentUrls,
  extractDomain,
  normalizeUrl,
  unwrapGoogleUrl,
  urlEquivalenceKey,
} from "@/lib/normalization";

export type GroundingSource = {
  url: string;
  normalizedUrl: string;
  equivalenceKey: string;
  title: string | null;
  domain: string | null;
  supportCount: number;
  maxConfidence: number | null;
};

type GroundingMetadataLike = {
  groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
  grounding_chunks?: Array<{ web?: { uri?: string; title?: string } }>;
  groundingSupports?: Array<{
    groundingChunkIndices?: number[];
    confidenceScores?: number[];
  }>;
  grounding_supports?: Array<{
    grounding_chunk_indices?: number[];
    confidence_scores?: number[];
  }>;
  webSearchQueries?: string[];
  web_search_queries?: string[];
};

function readGroundingChunks(
  record: GroundingMetadataLike,
): Array<{ web?: { uri?: string; title?: string } }> {
  return record.groundingChunks ?? record.grounding_chunks ?? [];
}

function readGroundingSupports(
  record: GroundingMetadataLike,
): Array<{
  groundingChunkIndices?: number[];
  confidenceScores?: number[];
}> {
  const supports = record.groundingSupports ?? record.grounding_supports ?? [];
  return supports.map((support) => {
    const normalized = support as {
      groundingChunkIndices?: number[];
      grounding_chunk_indices?: number[];
      confidenceScores?: number[];
      confidence_scores?: number[];
    };
    return {
      groundingChunkIndices:
        normalized.groundingChunkIndices ?? normalized.grounding_chunk_indices,
      confidenceScores:
        normalized.confidenceScores ?? normalized.confidence_scores,
    };
  });
}

export function hasGroundingSupports(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") {
    return false;
  }
  const record = metadata as GroundingMetadataLike;
  return readGroundingSupports(record).length > 0;
}

export function extractGroundingSources(metadata: unknown): GroundingSource[] {
  if (!metadata || typeof metadata !== "object") {
    return [];
  }

  const record = metadata as GroundingMetadataLike;
  const supportsByChunk = new Map<number, { count: number; confidence: number | null }>();
  for (const support of readGroundingSupports(record)) {
    for (const [index, chunkIndex] of (support.groundingChunkIndices ?? []).entries()) {
      const confidence = support.confidenceScores?.[index];
      const current = supportsByChunk.get(chunkIndex) ?? { count: 0, confidence: null };
      supportsByChunk.set(chunkIndex, {
        count: current.count + 1,
        confidence:
          typeof confidence === "number"
            ? Math.max(current.confidence ?? 0, confidence)
            : current.confidence,
      });
    }
  }

  const sources = new Map<string, GroundingSource>();
  for (const [index, chunk] of readGroundingChunks(record).entries()) {
    const uri = chunk.web?.uri;
    if (!uri) {
      continue;
    }

    const unwrapped = unwrapGoogleUrl(uri);
    const equivalenceKey = urlEquivalenceKey(unwrapped);
    if (!equivalenceKey) {
      continue;
    }

    const support = supportsByChunk.get(index);
    const existing = sources.get(equivalenceKey);
    if (existing) {
      existing.supportCount += support?.count ?? 0;
      existing.maxConfidence = Math.max(
        existing.maxConfidence ?? 0,
        support?.confidence ?? 0,
      ) || null;
      if (!existing.title && chunk.web?.title?.trim()) {
        existing.title = chunk.web.title.trim().slice(0, 500);
      }
      continue;
    }

    sources.set(equivalenceKey, {
      url: unwrapped,
      normalizedUrl: normalizeUrl(unwrapped),
      equivalenceKey,
      title: chunk.web?.title?.trim().slice(0, 500) || null,
      domain: extractDomain(unwrapped),
      supportCount: support?.count ?? 0,
      maxConfidence: support?.confidence ?? null,
    });
  }

  return [...sources.values()];
}

export function extractGroundingSearchQueries(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object") {
    return [];
  }
  const queries =
    (metadata as GroundingMetadataLike).webSearchQueries ??
    (metadata as GroundingMetadataLike).web_search_queries;
  return (queries ?? []).filter(
    (query): query is string => typeof query === "string" && query.trim().length > 0,
  );
}

/** Returns only a real metadata source that exactly supports the candidate URL. */
export function findGroundingSourceForUrl(
  candidateUrl: string,
  sources: readonly GroundingSource[],
): GroundingSource | null {
  return (
    sources.find(
      (source) =>
        source.equivalenceKey === urlEquivalenceKey(candidateUrl) ||
        areEquivalentUrls(source.url, candidateUrl),
    ) ?? null
  );
}

export type LabeledGroundingSource = GroundingSource & {
  sourceId: string;
};

/** Stable IDs for the structuring call — the model must not invent URLs. */
export function labelGroundingSources(
  sources: readonly GroundingSource[],
): LabeledGroundingSource[] {
  return sources.map((source, index) => ({
    ...source,
    sourceId: `source_${index + 1}`,
  }));
}

export type StructuredGroundingCandidate = {
  sourceId: string;
  title: string;
  organizationName?: string | null;
  snippet?: string | null;
  category?: string | null;
  countryCode?: string | null;
  workMode?: string | null;
  contractingSector?: string | null;
  estimatedAmount?: number | null;
  currency?: string | null;
  deadlineAt?: string | null;
};

/**
 * Rebinds model output to real Grounding URIs via sourceId.
 * Invented or unknown sourceIds are dropped — never trust model URLs.
 */
export function associateCandidatesWithGroundingSources(
  structuredCandidates: readonly StructuredGroundingCandidate[],
  labeledSources: readonly LabeledGroundingSource[],
): Array<StructuredGroundingCandidate & { sourceUrl: string }> {
  const byId = new Map(
    labeledSources.map((source) => [source.sourceId, source] as const),
  );
  const accepted: Array<StructuredGroundingCandidate & { sourceUrl: string }> =
    [];
  const seenSourceIds = new Set<string>();

  for (const candidate of structuredCandidates) {
    const sourceId = candidate.sourceId.trim();
    if (!sourceId || seenSourceIds.has(sourceId)) {
      continue;
    }
    const source = byId.get(sourceId);
    if (!source) {
      continue;
    }
    seenSourceIds.add(sourceId);
    accepted.push({
      ...candidate,
      sourceId,
      sourceUrl: source.url,
    });
  }

  return accepted;
}

/** Vertex rejects controlled generation when Search (or incompatible tools) are enabled. */
export function isControlledGenerationToolConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return (
    (normalized.includes("controlled generation") &&
      (normalized.includes("search tool") ||
        normalized.includes("google search") ||
        normalized.includes("tool"))) ||
    (normalized.includes("invalid_argument") &&
      normalized.includes("controlled generation"))
  );
}

export type GenerateContentConfigLike = {
  tools?: Array<{ googleSearch?: unknown; urlContext?: unknown }> | null;
  responseSchema?: unknown;
  responseJsonSchema?: unknown;
  responseMimeType?: string | null;
};

/**
 * Hard guard: Google Search must never be combined with controlled generation.
 * Call before every generateContent that might attach either capability.
 */
export function assertNoSearchWithControlledGeneration(
  config: GenerateContentConfigLike,
): void {
  const hasGoogleSearch = Boolean(
    config.tools?.some((tool) => tool.googleSearch !== undefined),
  );
  const hasControlledGeneration = Boolean(
    config.responseSchema !== undefined ||
      config.responseJsonSchema !== undefined ||
      config.responseMimeType === "application/json",
  );
  if (hasGoogleSearch && hasControlledGeneration) {
    throw new Error(
      "CONTROLLED_GENERATION_WITH_SEARCH: googleSearch cannot be combined with responseSchema, responseJsonSchema, or application/json",
    );
  }
}
