import { createHash } from "node:crypto";

import { normalizeUrl } from "@/lib/normalization";
import type { FetchedDocument } from "@/server/services/web-document-fetcher";

import { evaluateElSalvadorEvidence } from "./country-evidence";
import {
  type PrivateWebCandidate,
  type PrivateWebCandidateRejection,
  type PrivateWebEvidence,
  type PrivateWebEvidenceField,
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
): boolean {
  const needle = normalized(evidence.text);
  if (needle.length < 3) return false;
  return (
    normalized(document.text).includes(needle) ||
    normalized(document.title ?? "").includes(needle)
  );
}

function confirmedEvidence(
  candidate: PrivateWebCandidate,
  document: FetchedDocument,
): PrivateWebEvidence[] {
  return candidate.evidence
    .map((evidence) => ({
      ...evidence,
      url: candidate.sourceUrl,
      confirmed: evidenceOccursInDocument(evidence, document),
    }))
    .filter((evidence) => evidence.confirmed);
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

function isPublicBuyer(candidate: PrivateWebCandidate, text: string): boolean {
  const buyer = normalized(candidate.organizationName);
  if (
    /\b(ministerio|alcaldia|municipalidad|gobierno|embajada|consulado|universidad de el salvador|instituto salvadoreno del seguro social|\bisss\b|\banda\b|\bmop\b|\bminsal\b)\b/.test(
      buyer,
    )
  ) {
    return true;
  }
  return /(?:instituci[oó]n|entidad|sector) p[uú]blic[oa][^\n]{0,120}(?:solicita|convoca|contrata)/i.test(
    text,
  );
}

function rejection(
  reasonCode: string,
  reason: string,
  extras: Partial<PrivateWebCandidateRejection> = {},
): PrivateWebCandidateRejection {
  return { status: "REJECTED", reasonCode, reason, ...extras };
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

  const evidence = confirmedEvidence(candidate, document);
  const titleEvidence = evidenceFor(evidence, "TITLE");
  const sourceBackedTitle = candidate.title.replace(/\s+/g, " ").trim();
  if (
    !sourceBackedTitle ||
    titleEvidence.length === 0 ||
    !titleEvidence.some((item) => normalized(item.text).includes(normalized(sourceBackedTitle))) ||
    !normalized(`${document.title ?? ""} ${document.text}`).includes(
      normalized(sourceBackedTitle),
    )
  ) {
    return rejection("MISSING_TITLE", "No se confirmó un título literal de la fuente.");
  }
  const role = classifyOpportunityRole(document.text);
  if (role !== "BUYER") {
    return rejection(
      role === "SELLER" ? "SELLER_PAGE" : "BUYER_ROLE_AMBIGUOUS",
      "La fuente no confirma que la organización actúe como compradora.",
    );
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
    return rejection("MISSING_BUYER", "No se confirmó la organización compradora.");
  }
  const scopeEvidence = evidenceFor(evidence, "SCOPE")[0] ?? null;
  if (!scopeEvidence) {
    return rejection("MISSING_SCOPE", "No se confirmó la necesidad o el alcance.");
  }
  if (!hasField(evidence, "EXTERNAL_INTENT")) {
    return rejection(
      "MISSING_EXTERNAL_INTENT",
      "No se confirmó la intención de contratar un proveedor externo.",
    );
  }
  if (!hasField(evidence, "PRIVATE_SECTOR") || isPublicBuyer(candidate, document.text)) {
    return rejection("PUBLIC_OR_UNKNOWN_SECTOR", "No se confirmó un comprador privado.");
  }
  const relation = evaluateQueryRelation({
    query,
    title: sourceBackedTitle,
    scope: scopeEvidence.text,
    documentText: document.text,
    minCoverage: input.minQueryCoverage ?? 0.6,
  });
  if (!relation.related) {
    return rejection("QUERY_MISMATCH", "La fuente no se relaciona con la consulta.");
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
    return rejection(
      "COUNTRY_NOT_CONFIRMED",
      "No se confirmó que la oportunidad corresponda a El Salvador.",
      { countryEvidence },
    );
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
    return rejection("EXPIRED", "La fuente indica que el proceso ya cerró.", {
      countryEvidence,
    });
  }
  const deadlineScan = scanDeadlineDates(document.text);
  if (deadlineScan.status === "AMBIGUOUS") {
    return rejection(
      "TEMPORAL_AMBIGUOUS",
      "La fuente contiene fechas de cierre contradictorias.",
      { countryEvidence },
    );
  }
  const deadlineAt =
    deadlineScan.status === "SINGLE" ? deadlineScan.deadlines[0].iso : null;
  if (deadlineAt && new Date(deadlineAt).getTime() <= now.getTime()) {
    return rejection("EXPIRED", "La fecha límite de la oportunidad ya venció.", {
      countryEvidence,
    });
  }
  const publishedAt = dateIsSupported(candidate.publishedAt, evidence, "PUBLISHED")
    ? normalizedDate(candidate.publishedAt, false)
    : null;
  const hasTemporalEvidence = hasField(evidence, "TEMPORAL");
  const canBeVerified = Boolean(deadlineAt && hasTemporalEvidence);
  const canBePartial = !deadlineAt && activeLanguage(document.text) && hasTemporalEvidence;
  if (!canBeVerified && !canBePartial) {
    return rejection(
      "TEMPORAL_STATUS_UNKNOWN",
      "No se pudo confirmar que la convocatoria siga vigente.",
      { countryEvidence },
    );
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
    text: scopeEvidence.text,
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
    ...candidate,
    title: sourceBackedTitle,
    description: scopeEvidence.text,
    organizationType: classifyPrivateOrganizationType(
      `${buyerEvidence.map((item) => item.text).join(" ")} ${evidenceFor(evidence, "PRIVATE_SECTOR").map((item) => item.text).join(" ")}`,
    ),
    category: classifyPrivateCategory(`${query} ${scopeEvidence.text}`),
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
