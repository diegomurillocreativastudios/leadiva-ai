import { z } from "zod";

/** Tolerant extraction contract; canonical GroundedCandidate is still enforced later. */
export const normalizedCandidateDraftSchema = z
  .object({
    sourceId: z.string().trim().optional().nullable(),
    title: z.string().trim().min(3).max(500).optional().nullable(),
    organizationName: z.string().trim().max(250).optional().nullable(),
    officialSourceUrl: z.string().trim().max(2_000).optional().nullable(),
    applicationUrl: z.string().trim().max(2_000).optional().nullable(),
    snippet: z.string().trim().max(2_000).optional().nullable(),
    category: z.string().trim().max(80).optional().nullable(),
    countryCode: z.string().trim().max(20).optional().nullable(),
    workMode: z.string().trim().max(40).optional().nullable(),
    contractingSector: z.string().trim().max(40).optional().nullable(),
    estimatedAmount: z.union([z.number(), z.string()]).optional().nullable(),
    currency: z.string().trim().max(20).optional().nullable(),
    deadlineAt: z.string().trim().max(120).optional().nullable(),
    publishedAt: z.string().trim().max(120).optional().nullable(),
    verificationStatus: z.string().trim().max(40).optional().nullable(),
  })
  .passthrough();

export type NormalizedCandidateDraft = z.infer<
  typeof normalizedCandidateDraftSchema
>;

export const groundedCandidateSchema = z
  .object({
    title: z.string().trim().min(3).max(500),
    organizationName: z.string().trim().max(250).optional().nullable(),
    sourceUrl: z.string().url(),
    snippet: z.string().trim().max(2000).optional().nullable(),
    category: z
      .enum(["SOFTWARE", "IT", "CONSULTING", "AI", "OTHER"])
      .optional()
      .nullable(),
    countryCode: z
      .string()
      .trim()
      .length(2)
      .toUpperCase()
      .optional()
      .nullable(),
    workMode: z
      .enum(["ONSITE", "REMOTE", "HYBRID", "UNKNOWN"])
      .optional()
      .nullable(),
    contractingSector: z
      .enum(["PUBLIC", "PRIVATE", "UNKNOWN"])
      .optional()
      .nullable(),
    estimatedAmount: z.number().nonnegative().max(1_000_000_000).optional().nullable(),
    currency: z
      .string()
      .trim()
      .length(3)
      .toUpperCase()
      .optional()
      .nullable(),
    deadlineAt: z.string().datetime().optional().nullable(),
  })
  .strict();

export type GroundedCandidate = z.infer<typeof groundedCandidateSchema>;

export const groundingCitationSchema = z
  .object({
    uri: z.string().url().optional(),
    title: z.string().max(500).optional(),
  })
  .strict();

export const groundingSourceSchema = z
  .object({
    url: z.string().url(),
    normalizedUrl: z.string().min(1).max(1000),
    equivalenceKey: z.string().min(1).max(1000),
    title: z.string().max(500).nullable(),
    domain: z.string().max(255).nullable(),
    supportCount: z.number().int().nonnegative(),
    maxConfidence: z.number().min(0).max(1).nullable(),
  })
  .strict();

export const opportunityAmountStatuses = [
  "PUBLISHED",
  "RANGE_PUBLISHED",
  "NOT_PUBLISHED",
  "UNKNOWN",
] as const;

export const verificationEvidenceSchema = z.object({
  field: z.enum(["title", "buyer", "amount", "deadline"]),
  text: z.string().trim().min(1).max(800),
  url: z.string().url(),
  confirmed: z.boolean(),
});

export const verifiedOpportunitySchema = z
  .object({
    projectName: z.string().trim().min(3).max(500).nullable(),
    description: z.string().trim().max(3000).nullable(),
    buyerName: z.string().trim().max(250).nullable(),
    category: z.enum(["SOFTWARE", "IT", "CONSULTING", "AI", "OTHER"]),
    amountStatus: z.enum(opportunityAmountStatuses),
    amountValue: z.number().nonnegative().max(1_000_000_000).nullable(),
    amountMin: z.number().nonnegative().max(1_000_000_000).nullable(),
    amountMax: z.number().nonnegative().max(1_000_000_000).nullable(),
    amountCurrency: z.string().trim().length(3).toUpperCase().nullable(),
    publicationDate: z.string().datetime().nullable(),
    deadline: z.string().datetime().nullable(),
    sourceTitle: z.string().trim().max(500).nullable(),
    sourceIsSpecific: z.boolean(),
    isSingleOpportunity: z.boolean(),
    titleConfirmed: z.boolean(),
    buyerConfirmed: z.boolean(),
    amountConfirmed: z.boolean(),
    deadlineConfirmed: z.boolean(),
    rejectionReason: z.string().trim().max(1000).nullable(),
    evidence: z.array(verificationEvidenceSchema).max(4),
  })
  .strict();

export type VerifiedOpportunityPayload = z.infer<typeof verifiedOpportunitySchema>;

export const groundingDiscoveryDebugSchema = z
  .object({
    discoveryTextLength: z.number().int().nonnegative(),
    discoveryTextPreview: z.string().max(2000),
    finishReason: z.string().max(80).nullable(),
    webSearchQueries: z.array(z.string().max(500)).max(20),
    groundingChunksFound: z.number().int().nonnegative(),
    groundingUrlsFound: z.number().int().nonnegative().optional(),
    groundingUniqueUrlsFound: z.number().int().nonnegative().optional(),
    groundingDomainsFound: z.number().int().nonnegative().optional(),
    hasGroundingSupports: z.boolean().optional(),
    queriesExecuted: z.number().int().nonnegative().optional(),
    queriesExecutedEstimated: z.boolean().optional(),
    groundingChunkSummaries: z
      .array(
        z.object({
          uri: z.string().nullable(),
          title: z.string().nullable(),
          domain: z.string().nullable(),
        }),
      )
      .max(30),
    opportunityBlocksFound: z.number().int().nonnegative(),
    structuredCandidatesFound: z.number().int().nonnegative(),
    pipelineDiagnosis: z.enum([
      "NO_GROUNDING_SOURCES",
      "SEARCH_QUERIES_WITHOUT_CHUNKS",
      "SOURCES_WITHOUT_TEXT",
      "PARSER_OR_STRUCTURE_FAILED",
      "OK",
    ]),
    discoveryInputTokens: z.number().int().nonnegative().optional(),
    discoveryOutputTokens: z.number().int().nonnegative().optional(),
    discoveryDurationMs: z.number().int().nonnegative().nullable().optional(),
    discoveryModel: z.string().max(120).nullable().optional(),
    normalizationInputCandidates: z.number().int().nonnegative().optional(),
    normalizationOutputCandidates: z.number().int().nonnegative().optional(),
    schemaValidCandidates: z.number().int().nonnegative().optional(),
    schemaValidCandidatesBeforeDeduplication: z
      .number()
      .int()
      .nonnegative()
      .optional(),
    schemaInvalidCandidates: z.number().int().nonnegative().optional(),
    normalizationOutputItems: z.number().int().nonnegative().optional(),
    uniqueNormalizedCandidates: z.number().int().nonnegative().optional(),
    crossBatchDuplicates: z.number().int().nonnegative().optional(),
    normalizationFinishReason: z.string().max(80).nullable().optional(),
    normalizationInputTokens: z.number().int().nonnegative().optional(),
    normalizationOutputTokens: z.number().int().nonnegative().optional(),
    normalizationDurationMs: z
      .number()
      .int()
      .nonnegative()
      .nullable()
      .optional(),
    normalizationModel: z.string().max(120).nullable().optional(),
    normalizationPreview: z.string().max(2500).optional(),
    normalizationParseError: z.string().max(500).nullable().optional(),
    normalizationFailureKind: z
      .enum([
        "EMPTY_MODEL_RESPONSE",
        "EMPTY_OPPORTUNITIES_ARRAY",
        "INVALID_JSON",
        "WRONG_ROOT_REJECTED",
        "ITEMS_PARTIALLY_INVALID",
        "MODEL_DISCARDED_ALL",
        "NORMALIZATION_REQUEST_FAILED",
        "INPUT_EMPTY",
        "INPUT_TRUNCATED",
      ])
      .nullable()
      .optional(),
    normalizationRootAdapted: z.boolean().optional(),
    normalizationOriginalRoot: z
      .enum(["array", "candidates", "opportunities", "results", "unknown"])
      .optional(),
    normalizationRetryAttempted: z.boolean().optional(),
    normalizationRetryReason: z.string().max(120).nullable().optional(),
    normalizationRetryCandidates: z.number().int().nonnegative().optional(),
    normalizationRetryCost: z.string().max(30).nullable().optional(),
    recoveredFromRawBlocks: z.number().int().nonnegative().optional(),
    normalizationValidationErrorsSample: z
      .array(
        z.object({
          index: z.number().int().nonnegative(),
          title: z.string().nullable(),
          organizationName: z.string().nullable(),
          fields: z.array(z.string()),
          sourceDomain: z.string().nullable(),
        }),
      )
      .max(10)
      .optional(),
    searchPlanIntents: z
      .array(
        z.object({
          id: z.string(),
          family: z.string(),
          language: z.enum(["es", "en"]),
          query: z.string(),
          priority: z.number(),
          regional: z.boolean(),
        }),
      )
      .max(50)
      .optional(),
    searchFamiliesExecuted: z.array(z.string()).max(20).optional(),
    groundingPassesExecuted: z.number().int().nonnegative().optional(),
    sourcesByFamily: z
      .record(z.string(), z.number().int().nonnegative())
      .optional(),
    domainsByFamily: z
      .record(z.string(), z.number().int().nonnegative())
      .optional(),
    rawCandidatesByFamily: z
      .record(z.string(), z.number().int().nonnegative())
      .optional(),
    normalizedCandidatesByFamily: z
      .record(z.string(), z.number().int().nonnegative())
      .optional(),
    uniqueCandidatesBeforeFilters: z.number().int().nonnegative().optional(),
    passesWithoutNewSources: z.number().int().nonnegative().optional(),
    passesWithoutNewCandidates: z.number().int().nonnegative().optional(),
    stoppedBy: z.string().max(120).nullable().optional(),
  })
  .optional();

export const groundingBatchSchema = z.object({
  candidates: z.array(groundedCandidateSchema).max(50),
  citations: z.array(groundingCitationSchema).max(100).default([]),
  sources: z.array(groundingSourceSchema).max(100).default([]),
  searchQueries: z.array(z.string().max(500)).max(50).default([]),
  inputTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
  model: z.string().max(120).optional(),
  promptVersion: z.string().max(40).optional(),
  discoveryDebug: groundingDiscoveryDebugSchema,
  configured: z.boolean().default(true),
});

export type GroundingBatch = z.infer<typeof groundingBatchSchema>;

export function parseGroundingJsonPayload(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const payload = fenced?.[1]?.trim() ?? trimmed;
  return JSON.parse(payload) as unknown;
}
