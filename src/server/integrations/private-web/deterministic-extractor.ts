import type { FetchedDocument } from "@/server/services/web-document-fetcher";

import type {
  PrivateOpportunityKind,
  PrivateOrganizationType,
  PrivateWebCandidate,
  PrivateWebEvidence,
  PrivateWebEvidenceField,
} from "./contracts";
import {
  classifyOpportunityRole,
  extractContractAmount,
  scanDeadlineDates,
} from "./evidence-parsers";

const MONTHS: Record<string, number> = {
  enero: 0,
  febrero: 1,
  marzo: 2,
  abril: 3,
  mayo: 4,
  junio: 5,
  julio: 6,
  agosto: 7,
  septiembre: 8,
  setiembre: 8,
  octubre: 9,
  noviembre: 10,
  diciembre: 11,
};

function normalized(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function lineExcerpt(text: string, index: number, length: number): string {
  const start = Math.max(0, text.lastIndexOf("\n", index) + 1);
  const lineEnd = text.indexOf("\n", index + length);
  const end = Math.min(text.length, lineEnd === -1 ? index + length + 240 : lineEnd);
  return text.slice(start, end).replace(/\s+/g, " ").trim().slice(0, 1_000);
}

function evidenceFromPattern(input: {
  field: PrivateWebEvidenceField;
  text: string;
  pattern: RegExp;
  sourceUrl: string;
}): PrivateWebEvidence | null {
  const match = input.pattern.exec(input.text);
  if (match?.index === undefined) return null;
  return {
    field: input.field,
    text: lineExcerpt(input.text, match.index, match[0].length),
    url: input.sourceUrl,
    confirmed: true,
  };
}

function parseDateValue(value: string, endOfDay: boolean): string | null {
  const compact = value.trim().replace(/\s+/g, " ");
  let year: number | null = null;
  let month: number | null = null;
  let day: number | null = null;

  const iso = compact.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  const numeric = compact.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](20\d{2})\b/);
  const spanish = normalized(compact).match(
    /\b(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?(20\d{2})\b/,
  );
  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]) - 1;
    day = Number(iso[3]);
  } else if (numeric) {
    day = Number(numeric[1]);
    month = Number(numeric[2]) - 1;
    year = Number(numeric[3]);
  } else if (spanish) {
    day = Number(spanish[1]);
    month = MONTHS[spanish[2] ?? ""] ?? null;
    year = Number(spanish[3]);
  }
  if (year === null || month === null || day === null) return null;

  const hour = endOfDay ? 23 : 0;
  const minute = endOfDay ? 59 : 0;
  const second = endOfDay ? 59 : 0;
  const millisecond = endOfDay ? 999 : 0;
  const utc = new Date(
    Date.UTC(year, month, day, hour + 6, minute, second, millisecond),
  );
  const local = new Date(utc.getTime() - 6 * 60 * 60 * 1_000);
  if (
    local.getUTCFullYear() !== year ||
    local.getUTCMonth() !== month ||
    local.getUTCDate() !== day
  ) {
    return null;
  }
  return utc.toISOString();
}

function dateFromLabeledLine(
  text: string,
  label: RegExp,
  endOfDay: boolean,
): { value: string; evidence: string } | null {
  const pattern = new RegExp(
    `${label.source}[^\\n]{0,180}(?:20\\d{2}-\\d{1,2}-\\d{1,2}|\\d{1,2}[\\/-]\\d{1,2}[\\/-]20\\d{2}|\\d{1,2}\\s+de\\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\\s+(?:de\\s+)?20\\d{2})`,
    "i",
  );
  const match = pattern.exec(text);
  if (match?.index === undefined) return null;
  const evidence = lineExcerpt(text, match.index, match[0].length);
  const value = parseDateValue(evidence, endOfDay);
  return value ? { value, evidence } : null;
}

function buyerFromText(text: string): { name: string; evidence: string } | null {
  const patterns = [
    /(?:organizaci[oó]n|entidad|empresa)\s+contratante\s*[:\-]\s*([^\n.;]{3,180})/i,
    /\b((?:Fundaci[oó]n|Asociaci[oó]n|Universidad|C[aá]mara|Corporaci[oó]n|Empresa|ONG)\s+[^\n.;]{2,150})\s+(?:invita|solicita|convoca|requiere|busca)/i,
    /\b(?:La|El)\s+([^\n.;]{3,150})\s+(?:invita|solicita|convoca|requiere|busca)\s+/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    const value = match?.[1]?.replace(/\s+/g, " ").trim();
    if (match?.index !== undefined && value && value.length <= 250) {
      return {
        name: value,
        evidence: lineExcerpt(text, match.index, match[0].length),
      };
    }
  }
  return null;
}

export function classifyPrivateOrganizationType(text: string): PrivateOrganizationType {
  const value = normalized(text);
  if (/universidad privada/.test(value)) return "PRIVATE_UNIVERSITY";
  if (/camara (?:de comercio|empresarial)/.test(value)) return "BUSINESS_CHAMBER";
  if (/fundacion/.test(value)) return "FOUNDATION";
  if (/asociacion/.test(value)) return "ASSOCIATION";
  if (/\bong\b|organizacion no gubernamental/.test(value)) return "NGO";
  if (/empresa|sociedad anonima|s\.?\s*a\.?\s*de\s*c\.?\s*v\.?/.test(value)) {
    return "PRIVATE_COMPANY";
  }
  return "OTHER_PRIVATE";
}

export function classifyPrivateOpportunityKind(text: string): PrivateOpportunityKind {
  if (/\brfq\b|solicitud de cotizaci[oó]n/i.test(text)) return "RFQ";
  if (/\brfp\b|solicitud de propuestas?/i.test(text)) return "RFP";
  if (/t[eé]rminos de referencia/i.test(text)) return "TERMS_OF_REFERENCE";
  if (/licitaci[oó]n|concurso/i.test(text)) return "TENDER";
  if (/registro de proveedores|busca(?:mos|n)? proveedor/i.test(text)) {
    return "VENDOR_REQUEST";
  }
  if (/consultor[ií]a|consultor/i.test(text)) return "CONSULTING";
  if (/licencias?|suscripciones?/i.test(text)) return "LICENSES";
  return "OTHER";
}

export function classifyPrivateCategory(text: string) {
  const value = normalized(text);
  if (/inteligencia artificial|machine learning|\bia\b/.test(value)) return "AI" as const;
  if (/software|desarrollo|aplicacion|plataforma|sitio web/.test(value)) {
    return "SOFTWARE" as const;
  }
  if (/tecnologia|sistemas|infraestructura|redes|servidor|nube|licencias/.test(value)) {
    return "IT" as const;
  }
  if (/consultoria|asesoria/.test(value)) return "CONSULTING" as const;
  return "OTHER" as const;
}

function findQueryEvidence(text: string, query: string, sourceUrl: string) {
  const terms = normalized(query)
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length >= 4)
    .slice(0, 10);
  for (const term of terms) {
    const index = normalized(text).indexOf(term);
    if (index >= 0) {
      return {
        field: "QUERY_RELATION" as const,
        text: lineExcerpt(text, index, term.length),
        url: sourceUrl,
        confirmed: true,
      };
    }
  }
  return null;
}

export function extractPrivateOpportunityDeterministically(input: {
  document: FetchedDocument;
  query: string;
}): PrivateWebCandidate | null {
  const { document, query } = input;
  const sourceUrl = document.canonicalUrl ?? document.finalUrl;
  const sourceDomain = new URL(sourceUrl).hostname.toLowerCase();
  const text = document.text;
  if (classifyOpportunityRole(text) !== "BUYER") return null;
  const externalIntent = evidenceFromPattern({
    field: "EXTERNAL_INTENT",
    text,
    sourceUrl,
    pattern:
      /solicitud de (?:propuestas?|cotizaci[oó]n)|invita(?:mos)? a presentar|busca(?:mos|n)? (?:un )?proveedor|contratar (?:a |un |una )?(?:proveedor|empresa|agencia|consultor)|recepci[oó]n de (?:ofertas|propuestas)|presentar (?:una )?(?:propuesta|oferta|cotizaci[oó]n)/i,
  });
  if (!externalIntent) return null;

  const buyer = buyerFromText(text);
  if (!buyer) return null;
  const scope = evidenceFromPattern({
    field: "SCOPE",
    text,
    sourceUrl,
    pattern:
      /(?:objetivo|alcance|servicios requeridos|se requiere|necesidad)[^\n]{0,500}|(?:desarrollo|mantenimiento|implementaci[oó]n|consultor[ií]a|licencias?|infraestructura|servicios digitales)[^\n]{0,400}/i,
  });
  const privateSector = evidenceFromPattern({
    field: "PRIVATE_SECTOR",
    text,
    sourceUrl,
    pattern:
      /empresa privada|universidad privada|organizaci[oó]n no gubernamental|\bONG\b|fundaci[oó]n|asociaci[oó]n|c[aá]mara (?:de comercio|empresarial)|S\.?\s*A\.?\s*de\s*C\.?\s*V\.?/i,
  });
  const temporal = evidenceFromPattern({
    field: "TEMPORAL",
    text,
    sourceUrl,
    pattern:
      /convocatoria (?:abierta|vigente)|se recibir[aá]n (?:ofertas|propuestas)|fecha l[ií]mite|plazo para presentar|propuestas? (?:deber[aá]n|hasta)|recepci[oó]n de (?:ofertas|propuestas)/i,
  });
  const queryRelation = findQueryEvidence(text, query, sourceUrl);
  const published = dateFromLabeledLine(
    text,
    /(?:fecha de publicaci[oó]n|publicado|publicaci[oó]n)/i,
    false,
  );
  const deadlineScan = scanDeadlineDates(text);
  const deadline =
    deadlineScan.status === "SINGLE" ? deadlineScan.deadlines[0] : null;
  const amount = extractContractAmount(text);
  const application = evidenceFromPattern({
    field: "APPLICATION",
    text,
    sourceUrl,
    pattern:
      /(?:enviar|remitir|presentar)[^\n]{0,350}(?:correo|email|@|formulario|propuesta|cotizaci[oó]n)/i,
  });

  const labeledTitle = text.match(
    /(?:^|\n)\s*(?:t[ií]tulo|nombre de la convocatoria|objeto)\s*[:\-]\s*([^\n]{5,500})/i,
  )?.[1]?.trim();
  const sourceTitle = (document.title ?? labeledTitle ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
  if (!sourceTitle) return null;

  const evidence: PrivateWebEvidence[] = [
    {
      field: "TITLE",
      text: sourceTitle,
      url: sourceUrl,
      confirmed: true,
    },
    {
      field: "BUYER",
      text: buyer.evidence,
      url: sourceUrl,
      confirmed: true,
    },
    externalIntent,
    scope,
    privateSector,
    temporal,
    queryRelation,
    application,
  ].filter((item): item is PrivateWebEvidence => Boolean(item));
  if (published) {
    evidence.push({
      field: "TEMPORAL",
      text: published.evidence,
      url: sourceUrl,
      confirmed: true,
    });
  }
  if (deadline) {
    evidence.push({
      field: "TEMPORAL",
      text: deadline.evidence,
      url: sourceUrl,
      confirmed: true,
    });
  }
  if (amount) {
    evidence.push({
      field: "AMOUNT",
      text: amount.evidence,
      url: sourceUrl,
      confirmed: true,
    });
  }

  const scopeText = scope?.text ?? null;
  const detectedOpportunityKind = classifyPrivateOpportunityKind(
    `${document.title ?? ""} ${text}`,
  );
  return {
    title: sourceTitle,
    description: scopeText,
    organizationName: buyer.name,
    organizationType: classifyPrivateOrganizationType(
      `${buyer.evidence} ${privateSector?.text ?? ""}`,
    ),
    category: classifyPrivateCategory(`${query} ${scopeText ?? ""}`),
    workMode: /remot[oa]/i.test(text)
      ? "REMOTE"
      : /h[ií]brid[oa]/i.test(text)
        ? "HYBRID"
        : /presencial/i.test(text)
          ? "ONSITE"
          : "UNKNOWN",
    opportunityKind: detectedOpportunityKind,
    publishedAt: published?.value ?? null,
    deadlineAt: deadline?.iso ?? null,
    estimatedAmount: amount?.amount ?? null,
    currency: amount?.currency ?? null,
    amountStatus: amount ? "PUBLISHED" : "NOT_PUBLISHED",
    applicationInstructions: application?.text ?? null,
    sourceUrl,
    sourceDomain,
    evidence,
    extractionMethod: "DETERMINISTIC",
  };
}
