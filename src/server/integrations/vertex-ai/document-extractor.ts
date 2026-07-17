import "server-only";

import { z } from "zod";

import type { FetchedDocument } from "@/server/services/web-document-fetcher";
import { getVertexClient, getVertexModel } from "./client";
import {
  buildExtractWebDocumentPrompt,
  EXTRACT_WEB_DOCUMENT_PROMPT_VERSION,
} from "./prompts/extract-web-document.prompt";
import { extractGenerateContentText } from "./response";
import { sanitizeGroundedCandidate } from "./sanitize";
import type { GroundedCandidate } from "./schemas";

const evidenceDraftSchema = z
  .object({
    field: z.string().trim().max(80).optional().nullable(),
    text: z.string().trim().max(1_000).optional().nullable(),
    url: z.string().trim().max(2_000).optional().nullable(),
  })
  .passthrough();

export const extractedOpportunityDraftSchema = z
  .object({
    title: z.string().trim().max(500).optional().nullable(),
    organizationName: z.string().trim().max(250).optional().nullable(),
    organizationType: z.string().trim().max(80).optional().nullable(),
    summary: z.string().trim().max(3_000).optional().nullable(),
    requestedServices: z.array(z.string().trim().max(250)).optional().nullable(),
    technologies: z.array(z.string().trim().max(150)).optional().nullable(),
    publishedAt: z.string().trim().max(120).optional().nullable(),
    deadlineAt: z.string().trim().max(120).optional().nullable(),
    timezone: z.string().trim().max(80).optional().nullable(),
    budgetAmount: z.union([z.number(), z.string()]).optional().nullable(),
    currency: z.string().trim().max(20).optional().nullable(),
    amountStatus: z.string().trim().max(40).optional().nullable(),
    applicationMethod: z.string().trim().max(1_000).optional().nullable(),
    applicationUrl: z.string().trim().max(2_000).optional().nullable(),
    geographicRestrictions: z.array(z.string().trim().max(250)).optional().nullable(),
    contractingSignals: z.array(z.string().trim().max(500)).optional().nullable(),
    category: z.string().trim().max(80).optional().nullable(),
    countryCode: z.string().trim().max(20).optional().nullable(),
    workMode: z.string().trim().max(40).optional().nullable(),
    contractingSector: z.string().trim().max(40).optional().nullable(),
    evidence: z.array(evidenceDraftSchema).optional().nullable(),
    confidence: z.string().trim().max(40).optional().nullable(),
  })
  .passthrough();

export type ExtractedOpportunityDraft = z.infer<
  typeof extractedOpportunityDraftSchema
>;

const EXTRACT_DOCUMENT_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["candidates"],
  properties: {
    candidates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "title",
          "organizationName",
          "organizationType",
          "summary",
          "requestedServices",
          "technologies",
          "publishedAt",
          "deadlineAt",
          "timezone",
          "budgetAmount",
          "currency",
          "amountStatus",
          "applicationMethod",
          "applicationUrl",
          "geographicRestrictions",
          "contractingSignals",
          "category",
          "countryCode",
          "workMode",
          "contractingSector",
          "evidence",
          "confidence",
        ],
        properties: {
          title: { type: ["string", "null"] },
          organizationName: { type: ["string", "null"] },
          organizationType: { type: ["string", "null"] },
          summary: { type: ["string", "null"] },
          requestedServices: { type: "array", items: { type: "string" } },
          technologies: { type: "array", items: { type: "string" } },
          publishedAt: { type: ["string", "null"] },
          deadlineAt: { type: ["string", "null"] },
          timezone: { type: ["string", "null"] },
          budgetAmount: { type: ["number", "null"] },
          currency: { type: ["string", "null"] },
          amountStatus: {
            type: "string",
            enum: ["PUBLISHED", "RANGE_PUBLISHED", "NOT_PUBLISHED", "UNKNOWN"],
          },
          applicationMethod: { type: ["string", "null"] },
          applicationUrl: { type: ["string", "null"] },
          geographicRestrictions: { type: "array", items: { type: "string" } },
          contractingSignals: { type: "array", items: { type: "string" } },
          category: {
            type: "string",
            enum: ["SOFTWARE", "IT", "CONSULTING", "AI", "OTHER"],
          },
          countryCode: { type: ["string", "null"] },
          workMode: {
            type: "string",
            enum: ["ONSITE", "REMOTE", "HYBRID", "UNKNOWN"],
          },
          contractingSector: {
            type: "string",
            enum: ["PUBLIC", "PRIVATE", "UNKNOWN"],
          },
          evidence: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["field", "text", "url"],
              properties: {
                field: { type: "string" },
                text: { type: "string" },
                url: { type: "string" },
              },
            },
          },
          confidence: {
            type: "string",
            enum: ["UNKNOWN", "LOW", "MEDIUM", "HIGH"],
          },
        },
      },
    },
  },
} as const;

type GenerateResponseLike = Parameters<typeof extractGenerateContentText>[0] & {
  usageMetadata?: {
    promptTokenCount?: number | null;
    candidatesTokenCount?: number | null;
  } | null;
};

export type DocumentExtractionResult = {
  candidates: GroundedCandidate[];
  drafts: ExtractedOpportunityDraft[];
  outputItems: number;
  schemaValidCandidatesBeforeDeduplication: number;
  schemaInvalidCandidates: number;
  inputTokens: number;
  outputTokens: number;
  finishReason: string | null;
  durationMs: number;
  failureKind: "EMPTY_RESPONSE" | "INVALID_JSON" | "WRONG_ROOT" | null;
  model: string;
  promptVersion: string;
};

export async function extractOpportunitiesFromDocument(
  params: {
    document: FetchedDocument;
    maxOutputTokens: number;
  },
  deps: {
    generateContent?: (request: {
      model: string;
      contents: string;
      config: Record<string, unknown>;
    }) => Promise<GenerateResponseLike>;
    model?: string;
    now?: () => Date;
  } = {},
): Promise<DocumentExtractionResult> {
  const model = deps.model ?? getVertexModel();
  const generateContent =
    deps.generateContent ??
    ((request) =>
      getVertexClient().models.generateContent(request) as Promise<GenerateResponseLike>);
  const startedAt = performance.now();
  const response = await generateContent({
    model,
    contents: buildExtractWebDocumentPrompt({
      document: params.document,
      currentDate: (deps.now?.() ?? new Date()).toISOString().slice(0, 10),
    }),
    config: {
      temperature: 0,
      maxOutputTokens: params.maxOutputTokens,
      responseMimeType: "application/json",
      responseJsonSchema: EXTRACT_DOCUMENT_RESPONSE_SCHEMA,
    },
  });
  const extracted = extractGenerateContentText(response);
  const base = {
    inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
    finishReason: extracted.finishReason,
    durationMs: Math.round(performance.now() - startedAt),
    model,
    promptVersion: EXTRACT_WEB_DOCUMENT_PROMPT_VERSION,
  };
  if (!extracted.text) {
    return {
      ...base,
      candidates: [],
      drafts: [],
      outputItems: 0,
      schemaValidCandidatesBeforeDeduplication: 0,
      schemaInvalidCandidates: 0,
      failureKind: "EMPTY_RESPONSE",
    };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(extracted.text);
  } catch {
    return {
      ...base,
      candidates: [],
      drafts: [],
      outputItems: 0,
      schemaValidCandidatesBeforeDeduplication: 0,
      schemaInvalidCandidates: 0,
      failureKind: "INVALID_JSON",
    };
  }
  if (
    !payload ||
    typeof payload !== "object" ||
    !Array.isArray((payload as { candidates?: unknown }).candidates)
  ) {
    return {
      ...base,
      candidates: [],
      drafts: [],
      outputItems: 0,
      schemaValidCandidatesBeforeDeduplication: 0,
      schemaInvalidCandidates: 0,
      failureKind: "WRONG_ROOT",
    };
  }

  const items = (payload as { candidates: unknown[] }).candidates;
  const drafts: ExtractedOpportunityDraft[] = [];
  const candidates: GroundedCandidate[] = [];
  let invalid = 0;
  const sourceUrl = params.document.canonicalUrl ?? params.document.finalUrl;
  for (const item of items) {
    const draft = extractedOpportunityDraftSchema.safeParse(item);
    if (!draft.success) {
      invalid += 1;
      continue;
    }
    const candidate = sanitizeGroundedCandidate({
      title: draft.data.title,
      organizationName: draft.data.organizationName,
      sourceUrl,
      snippet: draft.data.summary,
      category: draft.data.category,
      countryCode: draft.data.countryCode,
      workMode: draft.data.workMode,
      contractingSector: draft.data.contractingSector,
      estimatedAmount: draft.data.budgetAmount,
      currency: draft.data.currency,
      deadlineAt: draft.data.deadlineAt,
    });
    if (!candidate) {
      invalid += 1;
      continue;
    }
    drafts.push(draft.data);
    candidates.push(candidate);
  }

  return {
    ...base,
    candidates,
    drafts,
    outputItems: items.length,
    schemaValidCandidatesBeforeDeduplication: candidates.length,
    schemaInvalidCandidates: invalid,
    failureKind: null,
  };
}

export { EXTRACT_DOCUMENT_RESPONSE_SCHEMA };
