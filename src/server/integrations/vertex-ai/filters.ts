import { resolveOpportunityCategory } from "@/lib/normalization";
import type { InterestCategory } from "@/server/db/schema/enums";
import { interestCategories } from "@/server/db/schema/enums";

import type { GroundedCandidate } from "./schemas";

export const privateDiscardReasons = [
  "INVALID",
  "NOISE",
  "PUBLIC_SECTOR",
  "IRRELEVANT",
  "EXPIRED",
  "DUPLICATE_IN_BATCH",
  "UNREACHABLE",
  "UNGROUNDED_SOURCE",
] as const;

export type PrivateDiscardReason = (typeof privateDiscardReasons)[number];

export type PrivateFilterDecision =
  | { accept: true; score: number; category: string }
  | { accept: false; reason: PrivateDiscardReason; detail: string };

export type PrivateRelevanceOptions = {
  allowedCategories: readonly InterestCategory[];
  keywords: readonly string[];
  excludedKeywords: readonly string[];
};

/** Domain relevance for Creativa — not sufficient alone to accept a candidate. */
const DEFAULT_KEYWORDS = [
  "software",
  "sistema",
  "aplicación",
  "aplicacion",
  "consultoría",
  "consultoria",
  "inteligencia artificial",
  "rfp",
  "request for proposal",
  "términos de referencia",
  "terminos de referencia",
  "licitación",
  "licitacion",
  "proveedores",
] as const;

/**
 * Buyer-side procurement signals. At least one must appear in title/snippet/URL
 * or the candidate is treated as a marketing/company page.
 */
const OPPORTUNITY_SIGNALS = [
  "rfp",
  "rfq",
  "request for proposal",
  "request for quotation",
  "request for quote",
  "invitation to bid",
  "call for proposals",
  "call for proposal",
  "licitación",
  "licitacion",
  "licitaciones",
  "términos de referencia",
  "terminos de referencia",
  "pliego de condiciones",
  "pliego",
  "convocatoria",
  "solicitud de propuesta",
  "solicitud de propuestas",
  "solicita propuestas",
  "invita a presentar",
  "tender",
  "procurement",
  "portal de proveedores",
  "registro de proveedores",
  "contratación de servicios",
  "contratacion de servicios",
  "compra de servicios",
  "bases de la convocatoria",
  "adquisición",
  "adquisicion",
  "contrataciones",
  "solicitud de cotización",
  "solicitud de cotizacion",
  "solicitation",
  "convenio marco",
] as const;

const MARKETING_SIGNALS = [
  "nuestros servicios",
  "nuestras soluciones",
  "quiénes somos",
  "quienes somos",
  "sobre nosotros",
  "about us",
  "ofrecemos servicios",
  "ofrecemos consultoría",
  "ofrecemos consultoria",
  "empresa de consultoría",
  "empresa de consultoria",
  "empresa de desarrollo",
  "busca una empresa",
  "¿busca una empresa",
  "conoce nuestros servicios",
  "hablar con un experto",
  "agendar consulta",
  "primera consultoría gratuita",
  "hablemos de tu próximo proyecto",
  "top software developers",
  "software development outsourcing",
  "outsourcing in el salvador",
  "rankings",
  "highly reviewed",
  "win more deals",
  "rfp software with",
  "ai-powered rfp software",
  "soluciones erp",
  "software administrativo",
] as const;

/** Vendor directories / RFP-tool vendors / tender aggregators — not buyer notices. */
const NOISE_DOMAINS = [
  "clutch.co",
  "accelerance.com",
  "elsalvadortenders.com",
  "loopio.com",
  "ai-rfp-software.com",
  "softland.com",
  "grupophe.com",
  "premium-soft.com",
  "eribertdeoliveira.com",
  "escalemais.com",
  "takhyon.com",
  "grupoit.com.sv",
  "goodfirms.co",
  "designrush.com",
  "sortlist.com",
  "upwork.com",
  "fiverr.com",
  "scribd.com",
  "slideshare.net",
] as const;

const PUBLIC_PROCUREMENT_HOSTS = [
  "chilecompra.cl",
  "mercadopublico.cl",
  "comprasal.gob.sv",
  "compras.gob.sv",
] as const;

const MARKETING_PATH_PATTERN =
  /\/(servicios|services|nosotros|about|quienes-somos|qui[eé]nes-somos|soluciones|solutions|outsourcing-guides|developers)(\/|$)/i;

const DEFAULT_EXCLUSIONS = [
  "empleo",
  "vacante",
  "hiring",
  "job opening",
  "job opportunities",
  "job opportunity",
  "promoting-job",
  "curso",
  "cursos",
  "diplomado",
  "capacitación",
  "capacitacion",
  "webinar",
  "noticia",
  "news",
] as const;

function normalizeInterestCategories(
  values: readonly string[] | null | undefined,
): InterestCategory[] {
  if (!values?.length) {
    return [...interestCategories];
  }
  const allowed = new Set<string>(interestCategories);
  const selected = values.filter((value): value is InterestCategory =>
    allowed.has(value),
  );
  return selected.length > 0 ? selected : [...interestCategories];
}

export function buildPrivateRelevanceOptions(params?: {
  interestCategories?: readonly string[] | null;
  profileKeywords?: readonly string[] | null;
  excludedKeywords?: readonly string[] | null;
}): PrivateRelevanceOptions {
  const allowedCategories = normalizeInterestCategories(
    params?.interestCategories,
  );
  const fromProfile = (params?.profileKeywords ?? [])
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const excluded = [
    ...new Set([
      ...DEFAULT_EXCLUSIONS,
      ...(params?.excludedKeywords ?? [])
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    ]),
  ];

  return {
    allowedCategories,
    keywords: [...new Set([...DEFAULT_KEYWORDS, ...fromProfile])],
    excludedKeywords: excluded,
  };
}

function textBlob(candidate: GroundedCandidate): string {
  return [
    candidate.title,
    candidate.snippet,
    candidate.organizationName,
    candidate.sourceUrl,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function containsAny(blob: string, needles: readonly string[]): string | null {
  for (const needle of needles) {
    if (needle && blob.includes(needle.toLowerCase())) {
      return needle;
    }
  }
  return null;
}

function hasOpportunitySignal(blob: string, pathname: string): boolean {
  if (containsAny(blob, OPPORTUNITY_SIGNALS)) {
    return true;
  }
  // Path cues from vendor portals / procurement sections.
  return /\/(rfp|rfq|tender|licitaci|proveedor|procurement|convocatoria|tdr|pliego|contratacion|adquisicion|compras)(?:es)?/i.test(
    pathname,
  );
}

function isLikelyHomepage(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  return normalized === "/";
}

function isNoiseDomain(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  return NOISE_DOMAINS.some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );
}

function hostMatchesPublicPortal(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  if (host.endsWith(".gob.sv") || host.endsWith(".gob.cl") || /\.gov(\.|$)/.test(host)) {
    return true;
  }
  return PUBLIC_PROCUREMENT_HOSTS.some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );
}

/**
 * Private-web search must not ingest public procurement.
 * Detect by sector flag, known portals, and buyer/org language.
 */
export function isPublicSectorOpportunity(candidate: {
  sourceUrl: string;
  organizationName?: string | null;
  countryCode?: string | null;
  contractingSector?: string | null;
  title?: string | null;
  snippet?: string | null;
}): boolean {
  if (candidate.contractingSector === "PUBLIC") {
    return true;
  }

  let hostname = "";
  let pathname = "";
  try {
    const url = new URL(candidate.sourceUrl);
    hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    pathname = url.pathname.toLowerCase();
  } catch {
    return false;
  }

  if (hostMatchesPublicPortal(hostname) || hostname.includes("chilecompra") || hostname.includes("comprasal")) {
    return true;
  }

  const blob = [
    candidate.title,
    candidate.snippet,
    candidate.organizationName,
    hostname,
    pathname,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /\b(chilecompra|mercado p[uú]blico|compras?\s*p[uú]blicas?|contrataci[oó]n p[uú]blica|sector p[uú]blico|direcci[oó]n chilecompra|ministerio|municipalidad|alcald[ií]a|gobierno (?:de|del)|comprasal|compras\.gob)\b/i.test(
    blob,
  );
}

/**
 * COMPRASAL owns El Salvador GOVERNMENT procurement.
 * Narrower than isPublicSectorOpportunity — prefer the latter for private-web filters.
 */
export function isSalvadoranPublicProcurement(candidate: {
  sourceUrl: string;
  organizationName?: string | null;
  countryCode?: string | null;
  contractingSector?: string | null;
  title?: string | null;
  snippet?: string | null;
}): boolean {
  if (candidate.contractingSector !== "PUBLIC") {
    return false;
  }

  let hostname = "";
  let pathname = "";
  try {
    const url = new URL(candidate.sourceUrl);
    hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    pathname = url.pathname.toLowerCase();
  } catch {
    return false;
  }

  if (
    hostname.endsWith(".gob.sv") ||
    hostname === "comprasal.gob.sv" ||
    hostname.includes("comprasal")
  ) {
    return true;
  }

  const blob = [
    candidate.title,
    candidate.snippet,
    candidate.organizationName,
    hostname,
    pathname,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const salvadorEvidence =
    /\b(el salvador|salvadoran|salvadoreñ|ministerio|municipalidad|alcald[ií]a|gobierno de el salvador|compras\.gob\.sv|comprasal)\b/i.test(
      blob,
    );

  return candidate.countryCode?.toUpperCase() === "SV" && salvadorEvidence;
}

/**
 * Filter order (private web):
 * 1. Organization / sector (public vs private)
 * 2. Opportunity type (noise, marketing, tender signals)
 * 3. Technical relevance (software / IT / consulting / AI)
 * 4. Validity (deadline) and remaining rules
 */
export function classifyPrivateCandidate(
  candidate: GroundedCandidate,
  relevance: PrivateRelevanceOptions = buildPrivateRelevanceOptions(),
  now: Date = new Date(),
): PrivateFilterDecision {
  let url: URL;
  try {
    url = new URL(candidate.sourceUrl);
  } catch {
    return {
      accept: false,
      reason: "INVALID",
      detail: "URL de fuente inválida",
    };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return {
      accept: false,
      reason: "INVALID",
      detail: "Protocolo de URL no permitido",
    };
  }

  // 1. Organization / sector — never classify public procurement as private.
  if (isPublicSectorOpportunity(candidate)) {
    return {
      accept: false,
      reason: "PUBLIC_SECTOR",
      detail:
        "Contratación del sector público — no pertenece a la búsqueda privada",
    };
  }

  if (isNoiseDomain(url.hostname)) {
    return {
      accept: false,
      reason: "IRRELEVANT",
      detail: "Directorio, agregador o sitio de proveedor, no convocatoria",
    };
  }

  const blob = textBlob(candidate);

  // 2. Opportunity type
  const noiseHit = containsAny(blob, [
    "empleo",
    "vacante",
    "hiring",
    "job opening",
    "job opportunities",
    "job opportunity",
    "promoting-job",
    "we are hiring",
    "curso",
    "cursos",
    "diplomado",
    "capacitación",
    "capacitacion",
    "webinar",
  ]);
  if (noiseHit) {
    return {
      accept: false,
      reason: "NOISE",
      detail: `Descartado por ruido (${noiseHit})`,
    };
  }

  // Path-level job boards / notices often slip past title keywords.
  if (
    /\/jobs?\b|job-opportunit|\/careers?\b|\/vacanc/i.test(url.pathname)
  ) {
    return {
      accept: false,
      reason: "NOISE",
      detail: "URL parece oferta de empleo, no oportunidad comercial",
    };
  }

  if (
    /\b(noticia|breaking news|últimas noticias|ultimas noticias)\b/.test(blob) &&
    !/\b(rfp|licitaci[oó]n|proveedor|tender|proposal)\b/.test(blob)
  ) {
    return {
      accept: false,
      reason: "NOISE",
      detail: "Parece noticia genérica sin oportunidad concreta",
    };
  }

  const marketingHit = containsAny(blob, MARKETING_SIGNALS);
  if (marketingHit) {
    return {
      accept: false,
      reason: "IRRELEVANT",
      detail: `Parece página de marketing/servicios (${marketingHit}), no licitación`,
    };
  }

  if (MARKETING_PATH_PATTERN.test(url.pathname)) {
    return {
      accept: false,
      reason: "IRRELEVANT",
      detail: "URL parece catálogo de servicios de una empresa, no licitación",
    };
  }

  if (isLikelyHomepage(url.pathname) && !hasOpportunitySignal(blob, url.pathname)) {
    return {
      accept: false,
      reason: "IRRELEVANT",
      detail: "Homepage de empresa sin señal de licitación o RFP",
    };
  }

  if (!hasOpportunitySignal(blob, url.pathname)) {
    return {
      accept: false,
      reason: "IRRELEVANT",
      detail:
        "Sin señal de licitación, RFP, TDR o convocatoria de compra de servicios",
    };
  }

  const buyingOrg = candidate.organizationName?.trim();
  if (!buyingOrg) {
    return {
      accept: false,
      reason: "IRRELEVANT",
      detail: "Sin organización compradora identificable",
    };
  }

  const excludedHit = containsAny(blob, relevance.excludedKeywords);
  if (excludedHit) {
    return {
      accept: false,
      reason: "IRRELEVANT",
      detail: `Fuera de interés (${excludedHit})`,
    };
  }

  // 3. Technical relevance — re-infer when the model said OTHER.
  const category = resolveOpportunityCategory({
    category: candidate.category,
    text: blob,
  });

  if (category === "OTHER") {
    return {
      accept: false,
      reason: "IRRELEVANT",
      detail: "Sin relación clara con software, IT, consultoría o AI",
    };
  }

  if (!relevance.allowedCategories.includes(category as InterestCategory)) {
    return {
      accept: false,
      reason: "IRRELEVANT",
      detail: `Categoría ${category} fuera de tus intereses`,
    };
  }

  // 4. Validity
  if (candidate.deadlineAt) {
    const deadline = new Date(candidate.deadlineAt);
    if (!Number.isNaN(deadline.getTime()) && deadline < now) {
      return {
        accept: false,
        reason: "EXPIRED",
        detail: `Oportunidad con plazo vencido (${candidate.title.slice(0, 80)}; deadline ${candidate.deadlineAt})`,
      };
    }
  }

  const keywordHits = relevance.keywords.filter((keyword) =>
    blob.includes(keyword.toLowerCase()),
  ).length;
  const opportunityHits = OPPORTUNITY_SIGNALS.filter((signal) =>
    blob.includes(signal.toLowerCase()),
  ).length;
  const score = Math.min(100, keywordHits * 10 + opportunityHits * 15 + 20);

  return { accept: true, score, category };
}

export function privateIdentityKey(params: {
  title: string;
  organizationName?: string | null;
}): string | null {
  const title = params.title.trim().toLowerCase().replace(/\s+/g, " ");
  const organization = (params.organizationName ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

  if (!title || title.length < 12) {
    return null;
  }

  // Organization strengthens identity; title alone is used only when long enough.
  if (organization) {
    return `title-org:${title}|${organization}`;
  }

  if (title.length >= 40) {
    return `title:${title}`;
  }

  return null;
}

export function privateBatchDedupeKey(candidate: GroundedCandidate): string {
  const identity = privateIdentityKey({
    title: candidate.title,
    organizationName: candidate.organizationName,
  });
  if (identity) {
    return identity;
  }

  try {
    const url = new URL(candidate.sourceUrl);
    url.hash = "";
    return `url:${url.toString().toLowerCase()}`;
  } catch {
    return `title:${candidate.title.trim().toLowerCase()}`;
  }
}
