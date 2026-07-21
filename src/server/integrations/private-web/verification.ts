import { createHash } from "node:crypto";

import { normalizeUrl } from "@/lib/normalization";
import type { FetchedDocument } from "@/server/services/web-document-fetcher";

import { evaluateElSalvadorEvidence } from "./country-evidence";
import {
  type PrivateWebCandidate,
  type PrivateWebCandidateRejection,
  type PrivateWebEvidence,
  type PrivateWebEvidenceField,
  type PrivateWebTitleSource,
  type VerifiedPrivateWebCandidate,
} from "./contracts";
import {
  classifyPrivateCategory,
  classifyPrivateOpportunityKind,
  classifyPrivateOrganizationType,
} from "./deterministic-extractor";
import { evaluatePrivateWebSource } from "./domain-policy";
import {
  classifyOpportunityRole,
  evaluateQueryRelation,
  extractContractAmount,
  parseLocalizedDecimal,
  scanDeadlineDates,
} from "./evidence-parsers";

const SPANISH_MONTHS: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

function normalized(value: string): string {
  return value
    .normalize("NFKC")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function evidenceOccursInDocument(
  evidence: PrivateWebEvidence,
  document: FetchedDocument,
  braveTitleConfirmed = false,
): boolean {
  const needle = normalized(evidence.text);
  if (needle.length < 3) return false;
  if (evidence.field === "TITLE" && braveTitleConfirmed) return true;
  return (
    normalized(document.text).includes(needle) ||
    normalized(document.title ?? "").includes(needle)
  );
}

function confirmedEvidence(
  candidate: PrivateWebCandidate,
  document: FetchedDocument,
  braveTitleConfirmed = false,
): PrivateWebEvidence[] {
  return candidate.evidence
    .map((evidence) => ({
      ...evidence,
      url: candidate.sourceUrl,
      confirmed: evidenceOccursInDocument(
        evidence,
        document,
        braveTitleConfirmed && evidence.field === "TITLE",
      ),
    }))
    .filter((evidence) => evidence.confirmed);
}

type BraveTitleContext = {
  title: string | null;
  url: string;
};

function safeNormalizedUrl(value: string): string | null {
  try {
    return normalizeUrl(value);
  } catch {
    return null;
  }
}

function isGenericTitle(value: string): boolean {
  const title = normalized(value).replace(/\.[a-z0-9]{2,5}$/i, "");
  return (
    title.length < 8 ||
    /^(?:pdf|documento|archivo|descarga|download|inicio|home|untitled|sin titulo|tdr|rfp|rfq)$/i.test(
      title,
    ) ||
    /^(?:documento|archivo|pdf|tdr|rfp|rfq)\s*[-|:]\s*\d*$/i.test(title)
  );
}

function braveTitleMatchesDocument(title: string, document: FetchedDocument): boolean {
  const titleTerms = normalized(title)
    .split(/[^a-z0-9]+/)
    .filter(
      (term) =>
        term.length >= 4 &&
        !["para", "como", "desde", "hasta", "sobre", "documento"].includes(term),
    );
  if (titleTerms.length === 0) return false;
  const documentText = normalized(document.text);
  const matches = titleTerms.filter((term) => documentText.includes(term)).length;
  return matches >= Math.min(2, titleTerms.length);
}

function trustedBraveTitle(
  context: BraveTitleContext | undefined,
  document: FetchedDocument,
): string | null {
  const title = context?.title?.replace(/\s+/g, " ").trim().slice(0, 500) ?? "";
  if (!title || isGenericTitle(title)) return null;
  const braveUrl = safeNormalizedUrl(context?.url ?? "");
  const sourceUrls = [document.finalUrl, document.canonicalUrl]
    .filter((value): value is string => Boolean(value))
    .map(safeNormalizedUrl);
  if (!braveUrl || !sourceUrls.includes(braveUrl)) return null;
  return braveTitleMatchesDocument(title, document) ? title : null;
}

function resolveCandidateTitle(input: {
  candidate: PrivateWebCandidate;
  document: FetchedDocument;
  braveResult?: BraveTitleContext;
}): { title: string; titleSource: PrivateWebTitleSource } | null {
  const documentTitle = input.document.title?.replace(/\s+/g, " ").trim() ?? "";
  if (documentTitle && !isGenericTitle(documentTitle)) {
    return {
      title: documentTitle.slice(0, 500),
      titleSource: input.document.titleSource ?? "DOCUMENT_HEADING",
    };
  }
  const braveTitle = trustedBraveTitle(input.braveResult, input.document);
  if (braveTitle) {
    return { title: braveTitle, titleSource: "BRAVE_RESULT" };
  }
  const candidateTitle = input.candidate.title.replace(/\s+/g, " ").trim();
  const titleEvidence = input.candidate.evidence.filter(
    (item) => item.field === "TITLE",
  );
  if (
    candidateTitle &&
    !isGenericTitle(candidateTitle) &&
    titleEvidence.some((item) =>
      normalized(item.text).includes(normalized(candidateTitle)),
    ) &&
    normalized(input.document.text).includes(normalized(candidateTitle))
  ) {
    return { title: candidateTitle, titleSource: "DOCUMENT_TEXT" };
  }
  return null;
}

function hasField(
  evidence: readonly PrivateWebEvidence[],
  field: PrivateWebEvidenceField,
): boolean {
  return evidence.some((item) => item.field === field && item.confirmed);
}

function evidenceFor(
  evidence: readonly PrivateWebEvidence[],
  field: PrivateWebEvidenceField,
): PrivateWebEvidence[] {
  return evidence.filter((item) => item.field === field && item.confirmed);
}

function normalizedDate(value: string | null, endOfDay: boolean): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^20\d{2}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(
      `${trimmed}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}-06:00`,
    ).toISOString();
  }
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function localDateKey(value: string): string | null {
  const trimmed = value.trim();
  if (/^20\d{2}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/El_Salvador",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year && values.month && values.day
    ? `${values.year}-${values.month}-${values.day}`
    : null;
}

function dateKeysInText(text: string): Set<string> {
  const keys = new Set<string>();
  const add = (year: string, month: string, day: string) => {
    const numericYear = Number(year);
    const numericMonth = Number(month);
    const numericDay = Number(day);
    const date = new Date(Date.UTC(numericYear, numericMonth - 1, numericDay));
    if (
      date.getUTCFullYear() === numericYear &&
      date.getUTCMonth() === numericMonth - 1 &&
      date.getUTCDate() === numericDay
    ) {
      keys.add(
        `${year}-${String(numericMonth).padStart(2, "0")}-${String(numericDay).padStart(2, "0")}`,
      );
    }
  };
  for (const match of text.matchAll(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g)) {
    const [, year, month, day] = match;
    if (year && month && day) add(year, month, day);
  }
  for (const match of text.matchAll(/\b(\d{1,2})[\/-](\d{1,2})[\/-](20\d{2})\b/g)) {
    const [, day, month, year] = match;
    if (year && month && day) add(year, month, day);
  }
  for (const match of normalized(text).matchAll(
    /\b(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?(20\d{2})\b/g,
  )) {
    const [, day, monthName, year] = match;
    const month = monthName ? SPANISH_MONTHS[monthName] : undefined;
    if (year && month && day) add(year, String(month), day);
  }
  return keys;
}

function dateIsSupported(
  value: string | null,
  evidence: readonly PrivateWebEvidence[],
  kind: "PUBLISHED" | "DEADLINE",
): boolean {
  if (!value) return false;
  const target = localDateKey(value);
  if (!target) return false;
  const label =
    kind === "DEADLINE"
      ? /fecha l[ií]mite|fecha de cierre|plazo|hasta|antes/i
      : /publicad|fecha de publicaci[oó]n/i;
  return evidence.some(
    (item) =>
      item.field === "TEMPORAL" &&
      label.test(item.text) &&
      dateKeysInText(item.text).has(target),
  );
}

function verifiedWorkMode(
  candidate: PrivateWebCandidate,
  document: FetchedDocument,
): PrivateWebCandidate["workMode"] {
  const text = normalized(document.text);
  if (candidate.workMode === "REMOTE" && /remot[oa]/.test(text)) return "REMOTE";
  if (candidate.workMode === "HYBRID" && /hibrid[oa]/.test(text)) return "HYBRID";
  if (candidate.workMode === "ONSITE" && /presencial/.test(text)) return "ONSITE";
  return "UNKNOWN";
}

function activeLanguage(text: string): boolean {
  return /convocatoria (?:abierta|vigente)|se recibir[aá]n (?:ofertas|propuestas)|invit(?:a|an|amos) a presentar|presentar (?:una )?(?:propuesta|oferta|cotizaci[oó]n)|recepci[oó]n de (?:ofertas|propuestas)|busca(?:mos|n)? proveedor/i.test(
    text,
  );
}

function hasExpiredContradiction(text: string): boolean {
  return /convocatoria cerrada|proceso (?:cerrado|finalizado|adjudicado)|ya no se aceptan (?:ofertas|propuestas)|adjudicaci[oó]n otorgada|oportunidad vencida/i.test(
    text,
  );
}

function publicBuyerReason(
  candidate: PrivateWebCandidate,
  text: string,
): "PUBLIC_SECTOR" | "INTERGOVERNMENTAL" | "FOREIGN_PUBLIC_SECTOR" | null {
  const buyer = normalized(candidate.organizationName);
  if (
    /\b(naciones unidas|banco mundial|banco interamericano de desarrollo|fondo monetario internacional|organizacion de los estados americanos|sistema de la integracion centroamericana|pnud|undp|bid)\b/.test(
      buyer,
    )
  ) {
    return "INTERGOVERNMENTAL";
  }
  if (/\b(embajada|consulado)\b/.test(buyer)) return "FOREIGN_PUBLIC_SECTOR";
  if (
    /\b(ministerio|alcaldia|municipalidad|gobierno|universidad de el salvador|instituto salvadoreno del seguro social|isss|anda|mop|minsal)\b/.test(
      buyer,
    ) ||
    /(?:instituci[oó]n|entidad|sector) p[uú]blic[oa][^\n]{0,120}(?:solicita|convoca|contrata)/i.test(
      text,
    )
  ) {
    return "PUBLIC_SECTOR";
  }
  return null;
}

function rejection(
  reasonCode: string,
  reason: string,
  extras: Partial<PrivateWebCandidateRejection> = {},
): PrivateWebCandidateRejection {
  return {
    status: "REJECTED",
    reasonCode,
    primaryRejectReason: reasonCode,
    secondaryRejectReasons: [],
    reason,
    ...extras,
  };
}

type GateFailure = { code: string; reason: string };

function rejectionFromFailures(
  failures: GateFailure[],
  extras: Partial<PrivateWebCandidateRejection> = {},
): PrivateWebCandidateRejection {
  const unique = failures.filter(
    (failure, index) =>
      failures.findIndex((candidate) => candidate.code === failure.code) === index,
  );
  const primary = unique[0];
  if (!primary) throw new Error("PRIVATE_WEB_REJECTION_WITHOUT_REASON");
  return rejection(primary.code, primary.reason, {
    ...extras,
    secondaryRejectReasons: unique.slice(1).map((failure) => failure.code),
  });
}

function scoreCandidate(input: {
  evidence: PrivateWebEvidence[];
  countryConfidence: number;
  hasDeadline: boolean;
  extractionMethod: "DETERMINISTIC" | "GEMINI";
}): number {
  const fields = new Set(input.evidence.map((item) => item.field));
  const evidenceScore = Math.min(60, fields.size * 7);
  return Math.min(
    100,
    Math.round(
      evidenceScore +
        input.countryConfidence * 20 +
        (input.hasDeadline ? 12 : 5) +
        (input.extractionMethod === "DETERMINISTIC" ? 8 : 4),
    ),
  );
}

export function verifyPrivateWebCandidate(input: {
  candidate: PrivateWebCandidate;
  document: FetchedDocument;
  query: string;
  now?: Date;
  minQueryCoverage?: number;
  braveResult?: BraveTitleContext;
}): VerifiedPrivateWebCandidate | PrivateWebCandidateRejection {
  const { candidate, document, query } = input;
  const now = input.now ?? new Date();
  const normalizedUrl = normalizeUrl(
    document.canonicalUrl ?? document.finalUrl ?? candidate.sourceUrl,
  );
  const sourcePolicy = evaluatePrivateWebSource({
    url: normalizedUrl,
    title: document.title,
    text: document.text,
  });
  if (!sourcePolicy.allowed) {
    return rejection(sourcePolicy.reason, "La fuente final no cumple la política privada.");
  }

  const resolvedTitle = resolveCandidateTitle({
    candidate,
    document,
    braveResult: input.braveResult,
  });
  const candidateWithTitle: PrivateWebCandidate = resolvedTitle
    ? {
        ...candidate,
        ...resolvedTitle,
        evidence: [
          ...candidate.evidence.filter((item) => item.field !== "TITLE"),
          {
            field: "TITLE",
            text: resolvedTitle.title,
            url: candidate.sourceUrl,
            confirmed: true,
          },
        ],
      }
    : candidate;
  const evidence = confirmedEvidence(
    candidateWithTitle,
    document,
    resolvedTitle?.titleSource === "BRAVE_RESULT",
  );
  const sourceBackedTitle = resolvedTitle?.title ?? candidate.title;
  const failures: GateFailure[] = [];
  if (!resolvedTitle) {
    failures.push({
      code: "MISSING_TITLE",
      reason: "No se confirmó un título literal de la fuente.",
    });
  }
  const role = classifyOpportunityRole(document.text);
  if (role !== "BUYER") {
    failures.push({
      code: role === "SELLER" ? "SELLER_PAGE" : "BUYER_ROLE_AMBIGUOUS",
      reason: "La fuente no confirma que la organización actúe como compradora.",
    });
  }
  const buyerEvidence = evidenceFor(evidence, "BUYER");
  if (
    !candidate.organizationName ||
    /^(?:fundaci[oó]n|asociaci[oó]n|universidad|empresa|organizaci[oó]n|ong)$/i.test(
      candidate.organizationName.trim(),
    ) ||
    buyerEvidence.length === 0 ||
    !buyerEvidence.some((item) =>
      normalized(item.text).includes(normalized(candidate.organizationName)),
    )
  ) {
    failures.push({
      code: "MISSING_BUYER",
      reason: "No se confirmó la organización compradora.",
    });
  }
  const scopeEvidence = evidenceFor(evidence, "SCOPE")[0] ?? null;
  if (!scopeEvidence) {
    failures.push({
      code: "MISSING_SCOPE",
      reason: "No se confirmó la necesidad o el alcance.",
    });
  }
  if (!hasField(evidence, "EXTERNAL_INTENT")) {
    failures.push({
      code: "MISSING_EXTERNAL_INTENT",
      reason: "No se confirmó la intención de contratar un proveedor externo.",
    });
  }
  const sectorReason = publicBuyerReason(candidate, document.text);
  if (!hasField(evidence, "PRIVATE_SECTOR") || sectorReason) {
    failures.push({
      code: sectorReason ?? "PUBLIC_OR_UNKNOWN_SECTOR",
      reason: "No se confirmó un comprador privado.",
    });
  }
  const relation = evaluateQueryRelation({
    query,
    title: sourceBackedTitle,
    scope: scopeEvidence?.text ?? candidate.description ?? "",
    documentText: document.text,
    minCoverage: input.minQueryCoverage ?? 0.6,
  });
  if (!relation.related) {
    failures.push({
      code: "QUERY_MISMATCH",
      reason: "La fuente no se relaciona con la consulta.",
    });
  }

  const countryEvidence = evaluateElSalvadorEvidence({
    text: document.text,
    sourceUrl: normalizedUrl,
    sourceDomain: new URL(normalizedUrl).hostname,
  });
  if (
    countryEvidence.decision !== "CONFIRMED" &&
    countryEvidence.decision !== "SUPPORTED"
  ) {
    failures.push({
      code: "COUNTRY_NOT_CONFIRMED",
      reason: "No se confirmó que la oportunidad corresponda a El Salvador.",
    });
  }
  const countryEvidenceRows: PrivateWebEvidence[] = countryEvidence.signals
    .filter(
      (item) => item.kind !== "SV_DOMAIN" && item.kind !== "SPANISH_DOCUMENT",
    )
    .map((item) => ({
      field: "COUNTRY",
      text: item.evidence,
      url: item.sourceUrl,
      confirmed: true,
    }));

  if (hasExpiredContradiction(document.text)) {
    failures.push({
      code: "EXPIRED",
      reason: "La fuente indica que el proceso ya cerró.",
    });
  }
  const deadlineScan = scanDeadlineDates(document.text);
  if (deadlineScan.status === "AMBIGUOUS") {
    failures.push({
      code: "TEMPORAL_AMBIGUOUS",
      reason: "La fuente contiene fechas de cierre contradictorias.",
    });
  }
  const deadlineAt =
    deadlineScan.status === "SINGLE" ? deadlineScan.deadlines[0].iso : null;
  if (deadlineAt && new Date(deadlineAt).getTime() <= now.getTime()) {
    failures.push({
      code: "EXPIRED",
      reason: "La fecha límite de la oportunidad ya venció.",
    });
  }
  const publishedAt = dateIsSupported(candidate.publishedAt, evidence, "PUBLISHED")
    ? normalizedDate(candidate.publishedAt, false)
    : null;
  const hasTemporalEvidence = hasField(evidence, "TEMPORAL");
  const canBeVerified = Boolean(deadlineAt && hasTemporalEvidence);
  const canBePartial = !deadlineAt && activeLanguage(document.text) && hasTemporalEvidence;
  if (
    !canBeVerified &&
    !canBePartial &&
    !failures.some((failure) =>
      ["EXPIRED", "TEMPORAL_AMBIGUOUS"].includes(failure.code),
    )
  ) {
    failures.push({
      code: "TEMPORAL_STATUS_UNKNOWN",
      reason: "No se pudo confirmar que la convocatoria siga vigente.",
    });
  }
  if (failures.length > 0) {
    return rejectionFromFailures(failures, { countryEvidence });
  }

  const contractAmount = extractContractAmount(document.text);
  const candidateAmount = candidate.estimatedAmount
    ? parseLocalizedDecimal(candidate.estimatedAmount)
    : null;
  const amountIsGrounded = Boolean(
    contractAmount &&
      candidateAmount === contractAmount.amount &&
      candidate.currency?.toUpperCase() === contractAmount.currency &&
      evidenceFor(evidence, "AMOUNT").some((item) =>
        normalized(item.text).includes(normalized(contractAmount.evidence)),
      ),
  );
  const estimatedAmount = amountIsGrounded ? contractAmount!.amount : null;
  const currency = estimatedAmount ? contractAmount!.currency : null;
  const relationEvidence: PrivateWebEvidence = {
    field: "QUERY_RELATION",
    text: scopeEvidence!.text,
    url: normalizedUrl,
    confirmed: true,
  };
  const finalEvidence = [
    ...evidence,
    ...countryEvidenceRows,
    ...(!hasField(evidence, "QUERY_RELATION")
      ? [relationEvidence]
      : []),
  ];
  const verificationStatus = canBeVerified
    ? ("VERIFIED" as const)
    : ("PARTIALLY_VERIFIED" as const);
  const verificationReason =
    verificationStatus === "VERIFIED"
      ? "Comprador, alcance, intención externa, sector, país y vigencia confirmados."
      : "Fecha límite no confirmada. Requiere revisión manual.";
  const contentHash = createHash("sha256")
    .update(document.text)
    .update("\0")
    .update(document.title ?? "")
    .digest("hex");

  return {
    ...candidateWithTitle,
    title: resolvedTitle!.title,
    description: scopeEvidence!.text,
    organizationType: classifyPrivateOrganizationType(
      `${buyerEvidence.map((item) => item.text).join(" ")} ${evidenceFor(evidence, "PRIVATE_SECTOR").map((item) => item.text).join(" ")}`,
    ),
    category: classifyPrivateCategory(`${query} ${scopeEvidence!.text}`),
    opportunityKind: classifyPrivateOpportunityKind(
      `${document.title ?? ""} ${document.text}`,
    ),
    sourceUrl: normalizedUrl,
    sourceDomain: new URL(normalizedUrl).hostname.toLowerCase(),
    publishedAt,
    deadlineAt,
    estimatedAmount,
    currency,
    amountStatus: estimatedAmount ? "PUBLISHED" : "NOT_PUBLISHED",
    applicationInstructions: evidenceFor(evidence, "APPLICATION")[0]?.text ?? null,
    workMode: verifiedWorkMode(candidate, document),
    evidence: finalEvidence,
    countryCode: "SV",
    countryEvidence,
    contractingSector: "PRIVATE",
    preliminaryScore: scoreCandidate({
      evidence: finalEvidence,
      countryConfidence: countryEvidence.confidence,
      hasDeadline: Boolean(deadlineAt),
      extractionMethod: candidate.extractionMethod,
    }),
    verificationStatus,
    verificationReason,
    document,
    normalizedUrl,
    contentHash,
  };
}
