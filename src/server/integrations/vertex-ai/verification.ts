import "server-only";

import { areEquivalentUrls, extractDomain } from "@/lib/normalization";
import {
  isContractorProfileUrl,
  isGenericOrListingSourceUrl,
} from "@/lib/source-url-specificity";
import { retrieveSourceContent } from "@/server/services/source-url-validation";
import { getServerEnv } from "@/env/server";
import {
  getVertexClient,
  getVertexGroundingClient,
  getVertexGroundingModel,
  getVertexModel,
} from "./client";
import {
  assertNoSearchWithControlledGeneration,
  type GroundingSource,
  extractGroundingSources,
} from "./grounding-sources";
import {
  parseGroundingJsonPayload,
  verifiedOpportunitySchema,
  type GroundedCandidate,
  type VerifiedOpportunityPayload,
} from "./schemas";
import { extractGenerateContentText } from "./response";
import {
  VERIFY_OPPORTUNITY_SOURCE_PROMPT_VERSION,
  buildVerifyOpportunitySourcePrompt,
} from "./prompts/verify-opportunity-source.prompt";
import { buildStructureVerificationPrompt } from "./prompts/structure-verification.prompt";

export type CandidateVerificationStatus =
  | "VERIFIED"
  | "PARTIALLY_VERIFIED"
  | "REJECTED";

export type CandidateVerification = {
  status: CandidateVerificationStatus;
  reason: string | null;
  originalSourceUrl: string;
  resolvedSourceUrl: string | null;
  sourceTitle: string | null;
  sourceDomain: string | null;
  sourceIsGrounded: boolean;
  sourceIsSpecific: boolean;
  titleConfirmed: boolean;
  buyerConfirmed: boolean;
  amountConfirmed: boolean;
  deadlineConfirmed: boolean;
  payload: VerifiedOpportunityPayload | null;
  evidence: VerifiedOpportunityPayload["evidence"];
  sourceUrlValidation: Record<string, unknown> | null;
  verifier:
    | "URL_CONTEXT"
    | "HTTP_FALLBACK"
    | "GOOGLE_SEARCH_GROUNDING"
    | "NONE";
  /** Wall time for the grounded (tool) call when used. */
  groundingDurationMs?: number | null;
  /** Wall time for the schema-only structuring call when used. */
  structuredDurationMs?: number | null;
  /** Total verification wall time. */
  durationMs?: number | null;
};

const VERIFICATION_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "projectName",
    "description",
    "buyerName",
    "category",
    "amountStatus",
    "amountValue",
    "amountMin",
    "amountMax",
    "amountCurrency",
    "publicationDate",
    "deadline",
    "sourceTitle",
    "sourceIsSpecific",
    "isSingleOpportunity",
    "titleConfirmed",
    "buyerConfirmed",
    "amountConfirmed",
    "deadlineConfirmed",
    "rejectionReason",
    "evidence",
  ],
  properties: {
    projectName: { type: ["string", "null"] },
    description: { type: ["string", "null"] },
    buyerName: { type: ["string", "null"] },
    category: { type: "string", enum: ["SOFTWARE", "IT", "CONSULTING", "AI", "OTHER"] },
    amountStatus: { type: "string", enum: ["PUBLISHED", "RANGE_PUBLISHED", "NOT_PUBLISHED", "UNKNOWN"] },
    amountValue: { type: ["number", "null"] },
    amountMin: { type: ["number", "null"] },
    amountMax: { type: ["number", "null"] },
    amountCurrency: { type: ["string", "null"] },
    publicationDate: { type: ["string", "null"] },
    deadline: { type: ["string", "null"] },
    sourceTitle: { type: ["string", "null"] },
    sourceIsSpecific: { type: "boolean" },
    isSingleOpportunity: { type: "boolean" },
    titleConfirmed: { type: "boolean" },
    buyerConfirmed: { type: "boolean" },
    amountConfirmed: { type: "boolean" },
    deadlineConfirmed: { type: "boolean" },
    rejectionReason: { type: ["string", "null"] },
    evidence: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["field", "text", "url", "confirmed"],
        properties: {
          field: { type: "string", enum: ["title", "buyer", "amount", "deadline"] },
          text: { type: "string" },
          url: { type: "string" },
          confirmed: { type: "boolean" },
        },
      },
    },
  },
} as const;

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sourcePageTitle(html: string): string | null {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (!title) {
    return null;
  }
  const plain = title.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return plain ? plain.slice(0, 500) : null;
}

function pageText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textContainsEntity(text: string, entity: string): boolean {
  const normalizedText = normalizeText(text);
  const tokens = normalizeText(entity)
    .split(" ")
    .filter((token) => token.length >= 4);
  return tokens.length > 0 && tokens.some((token) => normalizedText.includes(token));
}

/**
 * Before accepting a verification source, require a minimum match with the
 * discovered candidate. Generic contractor-profile pages are never enough.
 */
export function assessVerificationSourceMatch(params: {
  candidate: GroundedCandidate;
  sourceUrl: string;
  sourceTitle?: string | null;
  pageTitle?: string | null;
  pageText?: string | null;
}): { matches: boolean; reason: string | null } {
  if (isContractorProfileUrl(params.sourceUrl) || isGenericOrListingSourceUrl(params.sourceUrl)) {
    return { matches: false, reason: "VERIFICATION_SOURCE_MISMATCH" };
  }

  const blob = normalizeText(
    [
      params.sourceTitle,
      params.pageTitle,
      params.pageText?.slice(0, 8_000),
      params.sourceUrl,
    ]
      .filter(Boolean)
      .join(" "),
  );

  const org = params.candidate.organizationName?.trim() ?? "";
  const title = params.candidate.title.trim();
  const externalId =
    params.candidate.sourceUrl.match(/\b(\d{5,}|[A-Z]{2,}-\d{3,})\b/i)?.[1] ??
    null;

  const orgMatch = org ? textContainsEntity(blob, org) : false;
  const titleTokens = normalizeText(title)
    .split(" ")
    .filter((token) => token.length >= 5);
  const matchedTitleTokens = titleTokens.filter((token) => blob.includes(token));
  const titleMatch =
    titleTokens.length > 0 &&
    matchedTitleTokens.length >= Math.min(2, titleTokens.length);
  const externalIdMatch = externalId
    ? blob.includes(normalizeText(externalId))
    : false;

  const scopeTerms = [
    "software",
    "desarrollo",
    "plataforma",
    "consultoria",
    "consultoría",
    "cloud",
    "sistema",
    "aplicacion",
    "aplicación",
    "rfp",
    "licitacion",
    "licitación",
  ];
  const candidateScope = normalizeText(`${title} ${params.candidate.snippet ?? ""}`);
  const sharedScope = scopeTerms.filter(
    (term) => candidateScope.includes(normalizeText(term)) && blob.includes(normalizeText(term)),
  );

  if (externalIdMatch && (orgMatch || titleMatch)) {
    return { matches: true, reason: null };
  }
  if (orgMatch && (titleMatch || sharedScope.length >= 1)) {
    return { matches: true, reason: null };
  }
  if (titleMatch && sharedScope.length >= 2) {
    return { matches: true, reason: null };
  }

  return { matches: false, reason: "VERIFICATION_SOURCE_MISMATCH" };
}

export function assessSourceSpecificity(params: {
  finalUrl: string;
  candidate: GroundedCandidate;
  html: string | null;
}): { specific: boolean; reason: string | null; pageTitle: string | null; text: string | null } {
  const url = new URL(params.finalUrl);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  const html = params.html ?? "";
  const title = sourcePageTitle(html);
  const text = html ? pageText(html).slice(0, 30_000) : null;
  const blob = normalizeText(`${title ?? ""} ${text ?? ""}`);
  const normalizedExpectedTitle = normalizeText(params.candidate.title);
  const expectedTokens = normalizedExpectedTitle.split(" ").filter((token) => token.length >= 5);
  const matchedTitleTokens = expectedTokens.filter((token) => blob.includes(token));
  const titleMatch = expectedTokens.length > 0 && matchedTitleTokens.length >= Math.min(2, expectedTokens.length);
  const genericPath = isGenericOrListingSourceUrl(params.finalUrl);
  const homepage = pathname === "/";
  const multipleNotices = (blob.match(/\b(rfp|rfq|licitacion|convocatoria|tender)\b/g) ?? []).length >= 5;

  if (homepage) {
    return { specific: false, reason: "La URL final redirige o apunta a una homepage", pageTitle: title, text };
  }
  if (genericPath || (multipleNotices && !titleMatch)) {
    return { specific: false, reason: "La fuente parece un índice o portal con múltiples oportunidades", pageTitle: title, text };
  }

  const match = assessVerificationSourceMatch({
    candidate: params.candidate,
    sourceUrl: params.finalUrl,
    pageTitle: title,
    pageText: text,
  });
  if (!match.matches) {
    return {
      specific: false,
      reason: match.reason ?? "VERIFICATION_SOURCE_MISMATCH",
      pageTitle: title,
      text,
    };
  }

  if (html && !titleMatch) {
    return { specific: false, reason: "La página no contiene una coincidencia verificable con el proyecto esperado", pageTitle: title, text };
  }
  return { specific: true, reason: null, pageTitle: title, text };
}

export function normalizeVerifiedAmount(
  payload: VerifiedOpportunityPayload,
): VerifiedOpportunityPayload {
  const amountEvidence = payload.evidence.some(
    (evidence) => evidence.field === "amount" && evidence.confirmed,
  );
  const amountEvidenceText = payload.evidence
    .filter((evidence) => evidence.field === "amount" && evidence.confirmed)
    .map((evidence) => evidence.text)
    .join(" ")
    .toLowerCase();
  const isProgramOrLoanAmount =
    /\b(loan|pr[eé]stamo|financiamiento|programa|project financing|institutional budget)\b/i.test(
      amountEvidenceText,
    );
  const hasCurrency = Boolean(payload.amountCurrency);
  const published =
    payload.amountValue !== null &&
    hasCurrency &&
    amountEvidence &&
    !isProgramOrLoanAmount;
  const ranged =
    payload.amountMin !== null &&
    payload.amountMax !== null &&
    hasCurrency &&
    amountEvidence &&
    !isProgramOrLoanAmount;

  if (payload.amountStatus === "PUBLISHED" && !published) {
    return { ...payload, amountStatus: "UNKNOWN", amountValue: null, amountMin: null, amountMax: null, amountCurrency: null, amountConfirmed: false };
  }
  if (payload.amountStatus === "RANGE_PUBLISHED" && !ranged) {
    return { ...payload, amountStatus: "UNKNOWN", amountValue: null, amountMin: null, amountMax: null, amountCurrency: null, amountConfirmed: false };
  }
  if (payload.amountStatus === "NOT_PUBLISHED") {
    return { ...payload, amountValue: null, amountMin: null, amountMax: null, amountCurrency: null, amountConfirmed: false };
  }
  return payload;
}

function parseVerificationPayload(text: string): VerifiedOpportunityPayload | null {
  try {
    const parsed = parseGroundingJsonPayload(text);
    const result = verifiedOpportunitySchema.safeParse(parsed);
    return result.success ? normalizeVerifiedAmount(result.data) : null;
  } catch {
    return null;
  }
}

function retrievalSucceeded(response: {
  candidates?: Array<{
    urlContextMetadata?: {
      urlMetadata?: Array<{ retrievedUrl?: string; urlRetrievalStatus?: string }>;
    };
  } | null> | null;
}, sourceUrl: string): boolean {
  const metadata = response.candidates?.[0]?.urlContextMetadata?.urlMetadata ?? [];
  return metadata.some(
    (entry) =>
      Boolean(entry.retrievedUrl && areEquivalentUrls(entry.retrievedUrl, sourceUrl)) &&
      entry.urlRetrievalStatus === "URL_RETRIEVAL_STATUS_SUCCESS",
  );
}

async function structureVerificationFromRawText(params: {
  sourceUrl: string;
  rawText: string;
  groundingSources?: string[];
}): Promise<{
  payload: VerifiedOpportunityPayload | null;
  durationMs: number;
}> {
  const client = getVertexClient();
  const startedAt = performance.now();
  const config = {
    temperature: 0,
    maxOutputTokens: 4096,
    responseMimeType: "application/json" as const,
    responseJsonSchema: VERIFICATION_RESPONSE_SCHEMA,
  };
  assertNoSearchWithControlledGeneration(config);
  const response = await client.models.generateContent({
    model: getVertexModel(),
    contents: buildStructureVerificationPrompt({
      sourceUrl: params.sourceUrl,
      rawText: [
        params.rawText,
        params.groundingSources?.length
          ? `\nGrounding sources:\n${params.groundingSources.join("\n")}`
          : "",
      ].join(""),
    }),
    config,
  });
  const { text } = extractGenerateContentText(response);
  return {
    payload: text ? parseVerificationPayload(text) : null,
    durationMs: Math.round(performance.now() - startedAt),
  };
}

/**
 * Mandatory split:
 * A) optional tool call (urlContext) — text only, no controlled generation
 * B) schema-only structuring — no tools
 */
async function runStructuredVerification(params: {
  candidate: GroundedCandidate;
  sourceUrl: string;
  fallbackPageText?: string | null;
  useUrlContext: boolean;
}): Promise<{
  payload: VerifiedOpportunityPayload | null;
  urlContextSucceeded: boolean;
  groundingDurationMs: number | null;
  structuredDurationMs: number | null;
}> {
  const client = getVertexClient();
  const contents = buildVerifyOpportunitySourcePrompt(params);

  if (params.useUrlContext) {
    const groundedStartedAt = performance.now();
    const groundedConfig = {
      temperature: 0,
      maxOutputTokens: 4096,
      tools: [{ urlContext: {} }],
    };
    assertNoSearchWithControlledGeneration(groundedConfig);
    const freeResponse = await client.models.generateContent({
      model: getVertexModel(),
      contents,
      config: groundedConfig,
    });
    const groundingDurationMs = Math.round(performance.now() - groundedStartedAt);
    const { text: freeText } = extractGenerateContentText(freeResponse);
    const urlContextSucceeded = retrievalSucceeded(freeResponse, params.sourceUrl);
    if (!freeText) {
      return {
        payload: null,
        urlContextSucceeded,
        groundingDurationMs,
        structuredDurationMs: null,
      };
    }

    const direct = parseVerificationPayload(freeText);
    if (direct) {
      return {
        payload: direct,
        urlContextSucceeded,
        groundingDurationMs,
        structuredDurationMs: 0,
      };
    }

    const structured = await structureVerificationFromRawText({
      sourceUrl: params.sourceUrl,
      rawText: freeText,
    });
    return {
      payload: structured.payload,
      urlContextSucceeded,
      groundingDurationMs,
      structuredDurationMs: structured.durationMs,
    };
  }

  const structuredStartedAt = performance.now();
  const schemaOnlyConfig = {
    temperature: 0,
    maxOutputTokens: 4096,
    responseMimeType: "application/json" as const,
    responseJsonSchema: VERIFICATION_RESPONSE_SCHEMA,
  };
  assertNoSearchWithControlledGeneration(schemaOnlyConfig);
  const response = await client.models.generateContent({
    model: getVertexModel(),
    contents,
    config: schemaOnlyConfig,
  });
  const { text } = extractGenerateContentText(response);
  return {
    payload: text ? parseVerificationPayload(text) : null,
    urlContextSucceeded: false,
    groundingDurationMs: null,
    structuredDurationMs: Math.round(performance.now() - structuredStartedAt),
  };
}

function rejected(params: Omit<CandidateVerification, "status" | "payload" | "evidence">): CandidateVerification {
  return { ...params, status: "REJECTED", payload: null, evidence: [] };
}

function notVerifiable(
  params: Omit<CandidateVerification, "status" | "payload" | "evidence">,
): CandidateVerification {
  return {
    ...params,
    status: "PARTIALLY_VERIFIED",
    payload: null,
    evidence: [],
  };
}

/** Verifies a grounded candidate before it can enter the publishable catalog. */
export async function verifyGroundedCandidate(params: {
  candidate: GroundedCandidate;
  groundingSource: GroundingSource;
  sourceIsGrounded?: boolean;
}): Promise<CandidateVerification> {
  const verificationStartedAt = performance.now();
  const originalSourceUrl = params.groundingSource.url;
  const sourceIsGrounded = params.sourceIsGrounded ?? true;
  const retrieved = await retrieveSourceContent(params.groundingSource.url);
  if (!retrieved.ok) {
    const failure = {
      reason: retrieved.detail,
      originalSourceUrl,
      resolvedSourceUrl: retrieved.finalUrl ?? null,
      sourceTitle: params.groundingSource.title,
      sourceDomain: params.groundingSource.domain,
      sourceIsGrounded,
      sourceIsSpecific: false,
      titleConfirmed: false,
      buyerConfirmed: false,
      amountConfirmed: false,
      deadlineConfirmed: false,
      sourceUrlValidation: retrieved,
      verifier: "NONE",
      durationMs: Math.round(performance.now() - verificationStartedAt),
    } as const;
    return ["DNS_FAILED", "TIMEOUT", "HTTP_ERROR", "NETWORK_ERROR", "TOO_LARGE", "UNSUPPORTED_CONTENT_TYPE"].includes(
      retrieved.code,
    )
      ? notVerifiable(failure)
      : rejected(failure);
  }

  const specificity = assessSourceSpecificity({
    finalUrl: retrieved.finalUrl,
    candidate: params.candidate,
    html: retrieved.content,
  });
  if (!specificity.specific) {
    return rejected({
      reason: specificity.reason,
      originalSourceUrl,
      resolvedSourceUrl: retrieved.finalUrl,
      sourceTitle: specificity.pageTitle ?? params.groundingSource.title,
      sourceDomain: extractDomain(retrieved.finalUrl),
      sourceIsGrounded,
      sourceIsSpecific: false,
      titleConfirmed: false,
      buyerConfirmed: false,
      amountConfirmed: false,
      deadlineConfirmed: false,
      sourceUrlValidation: retrieved,
      verifier: "NONE",
      durationMs: Math.round(performance.now() - verificationStartedAt),
    });
  }

  let result: {
    payload: VerifiedOpportunityPayload | null;
    urlContextSucceeded: boolean;
    groundingDurationMs: number | null;
    structuredDurationMs: number | null;
  } | null = null;
  try {
    result = await runStructuredVerification({
      candidate: params.candidate,
      sourceUrl: retrieved.finalUrl,
      useUrlContext: true,
    });
  } catch {
    // urlContext availability depends on the configured Vertex model. The safe
    // HTTP content below keeps verification functional without inventing it.
  }

  let verifier: CandidateVerification["verifier"] = "URL_CONTEXT";
  if (!result?.urlContextSucceeded) {
    if (!specificity.text) {
      return rejected({
        reason: "La fuente no pudo verificarse con URL Context y no ofrece HTML recuperable",
        originalSourceUrl,
        resolvedSourceUrl: retrieved.finalUrl,
        sourceTitle: specificity.pageTitle ?? params.groundingSource.title,
        sourceDomain: extractDomain(retrieved.finalUrl),
        sourceIsGrounded,
        sourceIsSpecific: true,
        titleConfirmed: false,
        buyerConfirmed: false,
        amountConfirmed: false,
        deadlineConfirmed: false,
        sourceUrlValidation: retrieved,
        verifier: "NONE",
        groundingDurationMs: result?.groundingDurationMs ?? null,
        structuredDurationMs: result?.structuredDurationMs ?? null,
        durationMs: Math.round(performance.now() - verificationStartedAt),
      });
    }
    verifier = "HTTP_FALLBACK";
    try {
      result = await runStructuredVerification({
        candidate: params.candidate,
        sourceUrl: retrieved.finalUrl,
        fallbackPageText: specificity.text,
        useUrlContext: false,
      });
    } catch {
      result = null;
    }
  }

  const payload = result?.payload;
  if (!payload) {
    return rejected({
      reason: "La verificación no devolvió JSON estructurado válido",
      originalSourceUrl,
      resolvedSourceUrl: retrieved.finalUrl,
      sourceTitle: specificity.pageTitle ?? params.groundingSource.title,
      sourceDomain: extractDomain(retrieved.finalUrl),
      sourceIsGrounded,
      sourceIsSpecific: true,
      titleConfirmed: false,
      buyerConfirmed: false,
      amountConfirmed: false,
      deadlineConfirmed: false,
      sourceUrlValidation: retrieved,
      verifier,
      groundingDurationMs: result?.groundingDurationMs ?? null,
      structuredDurationMs: result?.structuredDurationMs ?? null,
      durationMs: Math.round(performance.now() - verificationStartedAt),
    });
  }

  const sourceIsSpecific = specificity.specific && payload.sourceIsSpecific && payload.isSingleOpportunity;
  const buyerConfirmed =
    payload.buyerConfirmed &&
    (!specificity.text ||
      Boolean(payload.buyerName && textContainsEntity(specificity.text, payload.buyerName)));
  const verifiedPayload = { ...payload, buyerConfirmed };
  const canBePublished = canPublishVerifiedOpportunity(
    verifiedPayload,
    sourceIsSpecific,
  );
  const status: CandidateVerificationStatus = canBePublished
    ? "VERIFIED"
    : sourceIsSpecific
      ? "PARTIALLY_VERIFIED"
      : "REJECTED";

  return {
    status,
    reason:
      status === "VERIFIED"
        ? null
      : verifiedPayload.rejectionReason ?? "La fuente no confirma los campos mínimos para publicar",
    originalSourceUrl,
    resolvedSourceUrl: retrieved.finalUrl,
    sourceTitle: payload.sourceTitle ?? specificity.pageTitle ?? params.groundingSource.title,
    sourceDomain: extractDomain(retrieved.finalUrl),
    sourceIsGrounded,
    sourceIsSpecific,
    titleConfirmed: payload.titleConfirmed,
    buyerConfirmed,
    amountConfirmed: verifiedPayload.amountConfirmed,
    deadlineConfirmed: verifiedPayload.deadlineConfirmed,
    payload: verifiedPayload,
    evidence: verifiedPayload.evidence.filter(
      (evidence) => areEquivalentUrls(evidence.url, retrieved.finalUrl),
    ),
    sourceUrlValidation: retrieved,
    verifier,
    groundingDurationMs: result?.groundingDurationMs ?? null,
    structuredDurationMs: result?.structuredDurationMs ?? null,
    durationMs: Math.round(performance.now() - verificationStartedAt),
  };
}

export function shouldUseGroundingVerification(params: {
  candidate: GroundedCandidate;
  verification: CandidateVerification;
}): boolean {
  const candidateDeadline = params.candidate.deadlineAt
    ? new Date(params.candidate.deadlineAt).getTime()
    : null;
  const verifiedDeadline = params.verification.payload?.deadline
    ? new Date(params.verification.payload.deadline).getTime()
    : null;
  const deadlineConflict =
    candidateDeadline !== null &&
    verifiedDeadline !== null &&
    Number.isFinite(candidateDeadline) &&
    Number.isFinite(verifiedDeadline) &&
    Math.abs(candidateDeadline - verifiedDeadline) > 86_400_000;
  return (
    params.verification.status !== "VERIFIED" ||
    !params.candidate.deadlineAt ||
    !params.candidate.organizationName ||
    deadlineConflict
  );
}

async function discoverVerificationSourceWithGrounding(
  candidate: GroundedCandidate,
): Promise<{
  source: GroundingSource | null;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  mismatchReason: string | null;
}> {
  const startedAt = performance.now();
  const groundedConfig = {
    temperature: 1,
    maxOutputTokens: Math.min(
      2_048,
      getServerEnv().SEARCH_GROUNDING_MAX_OUTPUT_TOKENS,
    ),
    tools: [{ googleSearch: {} }],
  };
  assertNoSearchWithControlledGeneration(groundedConfig);
  const response = await getVertexGroundingClient().models.generateContent({
    model: getVertexGroundingModel(),
    contents: [
      "Verify one already-discovered procurement opportunity; do not discover a batch.",
      "Find the most specific official notice, PDF, or application page that confirms whether it is current, its deadline, and how to apply.",
      "Do not invent missing facts. Prefer the buyer's own domain over aggregators or social posts.",
      "Reject contractor-profile hubs and generic listing pages.",
      `Current date: ${new Date().toISOString().slice(0, 10)}`,
      `Candidate title: ${candidate.title}`,
      `Buyer: ${candidate.organizationName ?? "UNKNOWN"}`,
      `Known source: ${candidate.sourceUrl}`,
    ].join("\n"),
    config: groundedConfig,
  });
  const sources = extractGroundingSources(
    response.candidates?.[0]?.groundingMetadata,
  );
  const durationMs = Math.round(performance.now() - startedAt);
  const ranked = sources
    .filter((source) => !isGenericOrListingSourceUrl(source.url))
    .sort(
      (left, right) =>
        right.supportCount - left.supportCount ||
        (right.maxConfidence ?? 0) - (left.maxConfidence ?? 0),
    );

  for (const source of ranked) {
    const match = assessVerificationSourceMatch({
      candidate,
      sourceUrl: source.url,
      sourceTitle: source.title,
    });
    if (match.matches) {
      return {
        source,
        inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
        durationMs,
        mismatchReason: null,
      };
    }
  }

  if (ranked.length > 0) {
    console.info("verification_source_mismatch", {
      event: "verification_source_mismatch",
      reason: "VERIFICATION_SOURCE_MISMATCH",
      candidateTitle: candidate.title.slice(0, 200),
      candidateOrganization: candidate.organizationName,
      rejectedUrls: ranked.slice(0, 5).map((source) => source.url),
    });
  }

  return {
    source: null,
    inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
    durationMs,
    mismatchReason: ranked.length > 0 ? "VERIFICATION_SOURCE_MISMATCH" : null,
  };
}

export async function verifyProviderCandidate(
  params: {
    candidate: GroundedCandidate;
    source: GroundingSource;
    allowGrounding: boolean;
    forceGrounding?: boolean;
  },
  deps: {
    discoverVerificationSource?: (
      candidate: GroundedCandidate,
    ) => Promise<{
      source: GroundingSource | null;
      inputTokens: number;
      outputTokens: number;
      durationMs?: number;
      mismatchReason?: string | null;
    }>;
    verifySource?: typeof verifyGroundedCandidate;
  } = {},
): Promise<{
  verification: CandidateVerification;
  groundingRequested: boolean;
  groundingSucceeded: boolean;
  groundingInputTokens: number;
  groundingOutputTokens: number;
  groundingDurationMs: number | null;
}> {
  const verifySource = deps.verifySource ?? verifyGroundedCandidate;
  const base = await verifySource({
    candidate: params.candidate,
    groundingSource: params.source,
    sourceIsGrounded: false,
  });
  if (
    !params.allowGrounding ||
    (!params.forceGrounding &&
      !shouldUseGroundingVerification({
        candidate: params.candidate,
        verification: base,
      }))
  ) {
    return {
      verification: base,
      groundingRequested: false,
      groundingSucceeded: false,
      groundingInputTokens: 0,
      groundingOutputTokens: 0,
      groundingDurationMs: null,
    };
  }

  const discoverSource =
    deps.discoverVerificationSource ?? discoverVerificationSourceWithGrounding;
  let groundedDiscovery: {
    source: GroundingSource | null;
    inputTokens: number;
    outputTokens: number;
    durationMs?: number;
    mismatchReason?: string | null;
  } | null = null;
  try {
    groundedDiscovery = await discoverSource(params.candidate);
  } catch {
    return {
      verification: base,
      groundingRequested: true,
      groundingSucceeded: false,
      groundingInputTokens: 0,
      groundingOutputTokens: 0,
      groundingDurationMs: null,
    };
  }
  const groundedSource = groundedDiscovery.source;
  if (!groundedSource) {
    const verification =
      groundedDiscovery.mismatchReason === "VERIFICATION_SOURCE_MISMATCH"
        ? rejected({
            reason: "VERIFICATION_SOURCE_MISMATCH",
            originalSourceUrl: params.source.url,
            resolvedSourceUrl: null,
            sourceTitle: params.source.title,
            sourceDomain: params.source.domain,
            sourceIsGrounded: false,
            sourceIsSpecific: false,
            titleConfirmed: false,
            buyerConfirmed: false,
            amountConfirmed: false,
            deadlineConfirmed: false,
            sourceUrlValidation: null,
            verifier: "GOOGLE_SEARCH_GROUNDING",
            groundingDurationMs: groundedDiscovery.durationMs ?? null,
            durationMs: groundedDiscovery.durationMs ?? null,
          })
        : base;
    return {
      verification,
      groundingRequested: true,
      groundingSucceeded: false,
      groundingInputTokens: groundedDiscovery.inputTokens,
      groundingOutputTokens: groundedDiscovery.outputTokens,
      groundingDurationMs: groundedDiscovery.durationMs ?? null,
    };
  }

  const grounded = await verifySource({
    candidate: params.candidate,
    groundingSource: groundedSource,
    sourceIsGrounded: true,
  });
  const rank = { REJECTED: 0, PARTIALLY_VERIFIED: 1, VERIFIED: 2 } as const;
  const verification =
    rank[grounded.status] >= rank[base.status]
      ? {
          ...grounded,
          verifier: "GOOGLE_SEARCH_GROUNDING" as const,
          groundingDurationMs:
            grounded.groundingDurationMs ??
            groundedDiscovery.durationMs ??
            null,
        }
      : base;
  return {
    verification,
    groundingRequested: true,
    groundingSucceeded: true,
    groundingInputTokens: groundedDiscovery.inputTokens,
    groundingOutputTokens: groundedDiscovery.outputTokens,
    groundingDurationMs: groundedDiscovery.durationMs ?? null,
  };
}

export { VERIFY_OPPORTUNITY_SOURCE_PROMPT_VERSION };

export function canPublishVerifiedOpportunity(
  payload: VerifiedOpportunityPayload,
  sourceIsSpecific: boolean,
): boolean {
  return (
    sourceIsSpecific &&
    payload.titleConfirmed &&
    payload.buyerConfirmed &&
    payload.category !== "OTHER"
  );
}
