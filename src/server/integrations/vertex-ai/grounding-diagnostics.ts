import {
  DIAGNOSTIC_LIMITS,
  countUniqueDomains,
  countUniqueUrls,
  resolveQueriesExecuted,
  truncateDiagnosticText,
} from "./pipeline-metrics";

export type GroundingPipelineDiagnosis =
  | "NO_GROUNDING_SOURCES"
  | "SEARCH_QUERIES_WITHOUT_CHUNKS"
  | "SOURCES_WITHOUT_TEXT"
  | "PARSER_OR_STRUCTURE_FAILED"
  | "OK";

export type GroundingPipelineSnapshot = {
  groundingChunksFound: number;
  discoveryTextLength: number;
  opportunityBlocksFound: number;
  structuredCandidatesFound: number;
  webSearchQueriesCount?: number;
};

const OPPORTUNITY_BLOCK_RE = /\[OPPORTUNITY\][\s\S]*?\[\/OPPORTUNITY\]/gi;
const UNVERIFIED_BLOCK_RE = /\[UNVERIFIED\][\s\S]*?(?=\[(?:OPPORTUNITY|UNVERIFIED)\]|$)/gi;

export function countOpportunityBlocks(rawText: string): number {
  const opportunityMatches = rawText.match(OPPORTUNITY_BLOCK_RE);
  const unverifiedMatches = rawText.match(UNVERIFIED_BLOCK_RE);
  return (opportunityMatches?.length ?? 0) + (unverifiedMatches?.length ?? 0);
}

export function diagnoseGroundingPipeline(
  snapshot: GroundingPipelineSnapshot,
): GroundingPipelineDiagnosis {
  if (snapshot.groundingChunksFound === 0) {
    if ((snapshot.webSearchQueriesCount ?? 0) > 0) {
      return "SEARCH_QUERIES_WITHOUT_CHUNKS";
    }
    return "NO_GROUNDING_SOURCES";
  }

  if (snapshot.discoveryTextLength === 0) {
    return "SOURCES_WITHOUT_TEXT";
  }

  if (snapshot.structuredCandidatesFound === 0) {
    return "PARSER_OR_STRUCTURE_FAILED";
  }

  return "OK";
}

export function summarizeGroundingDebug(params: {
  rawText: string;
  finishReason: string | null;
  webSearchQueries: string[];
  groundingChunks: Array<{
    uri: string | null;
    title: string | null;
    domain: string | null;
  }>;
  hasGroundingSupports?: boolean;
  fallbackQueryCount?: number;
}): {
  discoveryTextLength: number;
  discoveryTextPreview: string;
  finishReason: string | null;
  webSearchQueries: string[];
  groundingChunksFound: number;
  groundingUrlsFound: number;
  groundingUniqueUrlsFound: number;
  groundingDomainsFound: number;
  hasGroundingSupports: boolean;
  queriesExecuted: number;
  queriesExecutedEstimated: boolean;
  groundingChunkSummaries: Array<{
    uri: string | null;
    title: string | null;
    domain: string | null;
  }>;
  opportunityBlocksFound: number;
} {
  const rawText = params.rawText.trim();
  const queries = resolveQueriesExecuted({
    webSearchQueriesCount: params.webSearchQueries.length,
    fallbackQueryCount: params.fallbackQueryCount,
  });

  return {
    discoveryTextLength: rawText.length,
    discoveryTextPreview: truncateDiagnosticText(
      rawText,
      DIAGNOSTIC_LIMITS.rawTextPreviewChars,
    ),
    finishReason: params.finishReason,
    webSearchQueries: params.webSearchQueries.slice(
      0,
      DIAGNOSTIC_LIMITS.webSearchQueries,
    ),
    groundingChunksFound: params.groundingChunks.length,
    groundingUrlsFound: params.groundingChunks.filter((chunk) =>
      Boolean(chunk.uri),
    ).length,
    groundingUniqueUrlsFound: countUniqueUrls(params.groundingChunks),
    groundingDomainsFound: countUniqueDomains(params.groundingChunks),
    hasGroundingSupports: params.hasGroundingSupports ?? false,
    queriesExecuted: queries.queriesExecuted,
    queriesExecutedEstimated: queries.queriesExecutedEstimated,
    groundingChunkSummaries: params.groundingChunks.slice(
      0,
      DIAGNOSTIC_LIMITS.groundingChunkSummaries,
    ),
    opportunityBlocksFound: countOpportunityBlocks(rawText),
  };
}
