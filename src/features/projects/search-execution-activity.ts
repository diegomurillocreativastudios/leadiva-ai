import { assertSafePublicHttpUrl } from "@/server/security/safe-url";

export const SEARCH_EXECUTION_CANDIDATE_STAGES = [
  "PROVIDER_RESULT",
  "FETCH",
  "EXTRACTION",
  "FILTERING",
  "VERIFICATION",
  "PERSISTENCE",
] as const;

export type SearchExecutionCandidateStage =
  (typeof SEARCH_EXECUTION_CANDIDATE_STAGES)[number];

export const SEARCH_EXECUTION_CANDIDATE_OUTCOMES = [
  "DISCOVERED",
  "SELECTED",
  "FILTERED",
  "REJECTED",
  "UNVERIFIED",
  "VERIFIED",
  "CREATED",
  "UPDATED",
  "UNCHANGED",
  "ERROR",
] as const;

export type SearchExecutionCandidateOutcome =
  (typeof SEARCH_EXECUTION_CANDIDATE_OUTCOMES)[number];

export type SearchExecutionCandidateView = {
  temporaryId: string;
  executionId: string;
  title: string | null;
  organizationName: string | null;
  summary: string | null;
  officialSourceUrl: string | null;
  applicationUrl: string | null;
  sourceDomain: string | null;
  deadlineAt: string | null;
  category: string | null;
  stage: SearchExecutionCandidateStage;
  outcome: SearchExecutionCandidateOutcome;
  reasonCode: string | null;
  reason: string | null;
  retrievalScore: number | null;
  preliminaryScore: number | null;
  verificationStatus: string | null;
  discoveredByQueries: string[];
  discoveredByFamilies: string[];
};

export type SearchExecutionSummary = {
  providerResults: number;
  uniqueUrls: number;
  uniqueDomains: number;
  documentsFetched: number;
  documentsExtracted: number;
  candidatesFound: number;
  candidatesFiltered: number;
  candidatesVerified: number;
  candidatesCreated: number;
  candidatesUpdated: number;
  candidatesUnchanged: number;
  candidatesDiscarded: number;
  saved: number;
  rawCandidatesFound: number;
  schemaValidCandidates: number;
  normalizedCandidatesFound: number;
};

function metricNumber(
  metrics: Record<string, unknown> | null | undefined,
  ...keys: string[]
): number {
  if (!metrics) {
    return 0;
  }
  for (const key of keys) {
    const value = metrics[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.max(0, value);
    }
  }
  return 0;
}

/** Maps persisted execution metrics (and fallbacks) into the activity / empty-state summary. */
export function buildSearchExecutionSummary(params: {
  metrics?: Record<string, unknown> | null;
  candidatesFound?: number | null;
  candidatesDiscarded?: number | null;
}): SearchExecutionSummary {
  const metrics = params.metrics ?? null;
  const candidatesCreated = metricNumber(metrics, "candidatesCreated");
  const candidatesUpdated = metricNumber(metrics, "candidatesUpdated");
  const candidatesFound =
    metricNumber(metrics, "candidatesFound", "uniqueNormalizedCandidates") ||
    Math.max(0, params.candidatesFound ?? 0);

  return {
    providerResults: metricNumber(
      metrics,
      "searchProviderResults",
      "providerResults",
    ),
    uniqueUrls: metricNumber(
      metrics,
      "searchProviderUniqueUrls",
      "uniqueUrls",
    ),
    uniqueDomains: metricNumber(
      metrics,
      "searchProviderUniqueDomains",
      "uniqueDomains",
    ),
    documentsFetched: metricNumber(
      metrics,
      "documentsFetchSucceeded",
      "documentsFetched",
    ),
    documentsExtracted: metricNumber(metrics, "documentsExtracted"),
    candidatesFound,
    candidatesFiltered: metricNumber(metrics, "candidatesFiltered"),
    candidatesVerified: metricNumber(metrics, "candidatesVerified"),
    candidatesCreated,
    candidatesUpdated,
    candidatesUnchanged: metricNumber(metrics, "candidatesUnchanged"),
    candidatesDiscarded:
      metricNumber(metrics, "candidatesDiscarded") ||
      Math.max(0, params.candidatesDiscarded ?? 0),
    saved: candidatesCreated + candidatesUpdated,
    rawCandidatesFound: metricNumber(
      metrics,
      "rawCandidatesFound",
      "normalizationOutputItems",
    ),
    schemaValidCandidates: metricNumber(
      metrics,
      "schemaValidCandidatesBeforeDeduplication",
      "schemaValidCandidates",
    ),
    normalizedCandidatesFound: metricNumber(
      metrics,
      "normalizedCandidatesFound",
      "uniqueNormalizedCandidates",
      "candidatesFound",
    ) || candidatesFound,
  };
}

export function readDiscardCounts(
  metrics: Record<string, unknown> | null | undefined,
): Record<string, number> {
  const value = metrics?.discardCounts;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        (entry): entry is [string, number] =>
          typeof entry[1] === "number" &&
          Number.isFinite(entry[1]) &&
          entry[1] > 0,
      )
      .map(([key, count]) => [key.slice(0, 120), count]),
  );
}

export function formatSearchFunnelLine(summary: SearchExecutionSummary): string {
  const parts = [
    `${summary.providerResults} resultado${summary.providerResults === 1 ? "" : "s"} web`,
    `${summary.documentsExtracted} doc${summary.documentsExtracted === 1 ? "" : "s"}. analizado${summary.documentsExtracted === 1 ? "" : "s"}`,
    `${summary.candidatesFound} candidato${summary.candidatesFound === 1 ? "" : "s"}`,
    `${summary.candidatesFiltered} filtrado${summary.candidatesFiltered === 1 ? "" : "s"}`,
    `${summary.candidatesVerified} verificado${summary.candidatesVerified === 1 ? "" : "s"}`,
  ];
  return parts.join(" · ");
}

export type SearchExecutionDetail = {
  execution: {
    id: string;
    status: string;
    outcome: string | null;
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
    sourceType: string;
    profileName: string;
    discoveryMode: string | null;
    searchProvider: string | null;
    estimatedCost: string | null;
  };
  summary: SearchExecutionSummary;
  discardCounts: Record<string, number>;
  candidates: SearchExecutionCandidateView[];
};

export type SearchExecutionListItem = SearchExecutionDetail["execution"] & {
  summary: Pick<
    SearchExecutionSummary,
    | "candidatesFound"
    | "candidatesVerified"
    | "candidatesCreated"
    | "candidatesUpdated"
    | "candidatesUnchanged"
    | "saved"
  >;
};

export type SearchActivityFilter =
  | "ALL"
  | "VERIFIED"
  | "FILTERED"
  | "REJECTED"
  | "ERROR";

const REASON_LABELS: Record<string, string> = {
  IRRELEVANT: "No parece ser una contratación o convocatoria activa.",
  PUBLIC_SECTOR:
    "Es una contratación del sector público y no pertenece a la búsqueda privada.",
  NO_CONTRACTING_SIGNAL:
    "No se encontró una señal clara de que la organización esté buscando un proveedor.",
  MISSING_DEADLINE: "No se pudo confirmar la fecha límite.",
  EXPIRED: "La fecha límite ya venció.",
  MISSING_APPLICATION_METHOD:
    "No se encontró una forma concreta de presentar la propuesta.",
  REJECTED: "La oportunidad no superó la verificación.",
  PARTIALLY_VERIFIED:
    "La fuente no confirmó todos los requisitos mínimos para publicar.",
  DUPLICATE: "La oportunidad ya había sido encontrada.",
  DUPLICATE_IN_BATCH: "La oportunidad está repetida dentro de esta búsqueda.",
  ROBOTS_DISALLOWED:
    "El sitio no permitió recuperar automáticamente el documento.",
  FETCH_FAILED: "No se pudo descargar la fuente.",
  NETWORK_ERROR: "No se pudo descargar la fuente por un error de red.",
  HTTP_ERROR: "La fuente respondió con un error al intentar recuperarla.",
  TIMEOUT: "La fuente tardó demasiado en responder.",
  PDF_NO_EXTRACTABLE_TEXT: "El PDF no contiene texto que se pueda analizar.",
  EXTRACTION_FAILED: "No se pudo analizar el documento recuperado.",
  INVALID: "El candidato no contiene los datos mínimos válidos.",
  NOISE: "El resultado parece ser empleo, capacitación o contenido no comercial.",
  UNREACHABLE: "No se pudo acceder a la fuente.",
  UNGROUNDED_SOURCE: "No se pudo relacionar el candidato con una fuente recuperada.",
  RETRIEVAL_SKIPPED:
    "El resultado web no mostró señales suficientes para recuperar la página.",
  PERSIST_ERROR: "Ocurrió un error al guardar la oportunidad verificada.",
  AGGREGATOR_INDEX_PAGE:
    "La URL es una página índice o agregadora, no una convocatoria específica.",
  OFFICIAL_LINK_NOT_FOUND:
    "No se encontró un enlace oficial específico desde el agregador.",
  SPECIFIC_OPPORTUNITY_NOT_FOUND:
    "No se encontró una oportunidad concreta con título, organización y señal de contratación.",
  VERIFICATION_SOURCE_MISMATCH:
    "La fuente de verificación no coincide con el proyecto o la organización descubiertos.",
};

const OUTCOME_LABELS: Record<SearchExecutionCandidateOutcome, string> = {
  DISCOVERED: "Descubierto",
  SELECTED: "Seleccionado",
  FILTERED: "Filtrado",
  REJECTED: "Rechazado",
  UNVERIFIED: "No verificable",
  VERIFIED: "Verificado",
  CREATED: "Creado",
  UPDATED: "Actualizado",
  UNCHANGED: "Sin cambios",
  ERROR: "Error",
};

const STAGE_LABELS: Record<SearchExecutionCandidateStage, string> = {
  PROVIDER_RESULT: "Resultado web",
  FETCH: "Recuperación",
  EXTRACTION: "Extracción",
  FILTERING: "Filtrado",
  VERIFICATION: "Verificación",
  PERSISTENCE: "Persistencia",
};

const VERIFIED_OUTCOMES = new Set<SearchExecutionCandidateOutcome>([
  "VERIFIED",
  "CREATED",
  "UPDATED",
  "UNCHANGED",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function optionalString(value: unknown, limit = 2_000): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, limit) : null;
}

function optionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().slice(0, 500))
        .filter(Boolean),
    ),
  ].slice(0, 20);
}

function safeExternalUrl(value: unknown): string | null {
  const raw = optionalString(value);
  if (!raw) {
    return null;
  }
  const result = assertSafePublicHttpUrl(raw);
  return result.ok ? result.url.toString() : null;
}

function normalizeStage(value: unknown): SearchExecutionCandidateStage {
  if (
    typeof value === "string" &&
    SEARCH_EXECUTION_CANDIDATE_STAGES.includes(
      value as SearchExecutionCandidateStage,
    )
  ) {
    return value as SearchExecutionCandidateStage;
  }
  switch (value) {
    case "DISCOVERY":
      return "PROVIDER_RESULT";
    case "NORMALIZATION":
      return "EXTRACTION";
    case "DEDUPLICATION":
      return "FILTERING";
    default:
      return "FILTERING";
  }
}

function normalizeOutcome(
  value: unknown,
  reasonCode: string | null,
): SearchExecutionCandidateOutcome {
  if (
    typeof value === "string" &&
    SEARCH_EXECUTION_CANDIDATE_OUTCOMES.includes(
      value as SearchExecutionCandidateOutcome,
    )
  ) {
    return value as SearchExecutionCandidateOutcome;
  }
  if (value === "ACCEPTED") {
    return "DISCOVERED";
  }
  if (value === "REJECTED") {
    return reasonCode === "PARTIALLY_VERIFIED" ? "UNVERIFIED" : "REJECTED";
  }
  return "DISCOVERED";
}

function validDeadline(value: unknown): string | null {
  const raw = optionalString(value, 120);
  if (!raw) {
    return null;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Converts persisted JSONB traces, including historical trace shapes, to a safe API view. */
export function normalizeCandidateTrace(
  value: unknown,
  executionId: string,
  index: number,
): SearchExecutionCandidateView | null {
  if (!isRecord(value)) {
    return null;
  }
  const reasonCode = optionalString(value.reasonCode, 120);
  const officialSourceUrl = safeExternalUrl(value.officialSourceUrl);
  const sourceDomain =
    optionalString(value.sourceDomain, 255) ??
    (officialSourceUrl ? new URL(officialSourceUrl).hostname : null);

  return {
    temporaryId:
      optionalString(value.temporaryId, 160) ?? `candidate-${index + 1}`,
    executionId,
    title: optionalString(value.title, 500),
    organizationName: optionalString(value.organizationName, 250),
    summary: optionalString(value.summary, 2_000),
    officialSourceUrl,
    applicationUrl: safeExternalUrl(value.applicationUrl),
    sourceDomain,
    deadlineAt: validDeadline(value.deadlineAt),
    category: optionalString(value.category, 80),
    stage: normalizeStage(value.stage),
    outcome: normalizeOutcome(value.outcome, reasonCode),
    reasonCode,
    reason: optionalString(value.reason, 800),
    retrievalScore: optionalNumber(value.retrievalScore),
    preliminaryScore: optionalNumber(value.preliminaryScore),
    verificationStatus: optionalString(value.verificationStatus, 80),
    discoveredByQueries: stringArray(value.discoveredByQueries),
    discoveredByFamilies: stringArray(value.discoveredByFamilies),
  };
}

export function formatCandidateReason(reasonCode: string | null): string | null {
  if (!reasonCode) {
    return null;
  }
  if (reasonCode.startsWith("EXTRACTION_")) {
    return REASON_LABELS.EXTRACTION_FAILED;
  }
  return REASON_LABELS[reasonCode] ?? null;
}

export function formatCandidateOutcome(
  candidate: Pick<SearchExecutionCandidateView, "outcome" | "reasonCode">,
): string {
  if (candidate.reasonCode === "IRRELEVANT") {
    return "Irrelevante";
  }
  if (candidate.reasonCode === "PUBLIC_SECTOR") {
    return "Sector público";
  }
  return OUTCOME_LABELS[candidate.outcome];
}

export function formatCandidateStage(stage: SearchExecutionCandidateStage) {
  return STAGE_LABELS[stage];
}

export function candidateMatchesFilter(
  candidate: SearchExecutionCandidateView,
  filter: SearchActivityFilter,
): boolean {
  switch (filter) {
    case "VERIFIED":
      return VERIFIED_OUTCOMES.has(candidate.outcome);
    case "FILTERED":
      return candidate.outcome === "FILTERED";
    case "REJECTED":
      return candidate.outcome === "REJECTED" || candidate.outcome === "UNVERIFIED";
    case "ERROR":
      return candidate.outcome === "ERROR";
    default:
      return true;
  }
}

export function mergeCandidateViews(
  candidates: SearchExecutionCandidateView[],
): SearchExecutionCandidateView[] {
  const stageRank: Record<SearchExecutionCandidateStage, number> = {
    PROVIDER_RESULT: 0,
    FETCH: 1,
    EXTRACTION: 2,
    FILTERING: 3,
    VERIFICATION: 4,
    PERSISTENCE: 5,
  };
  const merged = new Map<string, SearchExecutionCandidateView>();

  for (const candidate of candidates) {
    const key = candidate.officialSourceUrl
      ? `url:${candidate.officialSourceUrl.toLowerCase()}`
      : `candidate:${candidate.title?.toLowerCase() ?? candidate.temporaryId}`;
    const current = merged.get(key);
    if (!current) {
      merged.set(key, candidate);
      continue;
    }
    const finalCandidate =
      stageRank[candidate.stage] >= stageRank[current.stage] ? candidate : current;
    const discoveryCandidate = finalCandidate === candidate ? current : candidate;
    merged.set(key, {
      ...discoveryCandidate,
      ...finalCandidate,
      summary: finalCandidate.summary ?? discoveryCandidate.summary,
      applicationUrl:
        finalCandidate.applicationUrl ?? discoveryCandidate.applicationUrl,
      sourceDomain: finalCandidate.sourceDomain ?? discoveryCandidate.sourceDomain,
      retrievalScore:
        finalCandidate.retrievalScore ?? discoveryCandidate.retrievalScore,
      preliminaryScore:
        finalCandidate.preliminaryScore ?? discoveryCandidate.preliminaryScore,
      discoveredByQueries: [
        ...new Set([
          ...discoveryCandidate.discoveredByQueries,
          ...finalCandidate.discoveredByQueries,
        ]),
      ],
      discoveredByFamilies: [
        ...new Set([
          ...discoveryCandidate.discoveredByFamilies,
          ...finalCandidate.discoveredByFamilies,
        ]),
      ],
    });
  }

  return [...merged.values()].sort((left, right) => {
    const stageDifference = stageRank[right.stage] - stageRank[left.stage];
    return stageDifference || (left.title ?? "").localeCompare(right.title ?? "", "es");
  });
}
