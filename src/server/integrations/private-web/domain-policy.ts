import type { WebSearchResult } from "@/server/integrations/web-search/contracts";

import { classifyOpportunityRole } from "./evidence-parsers";

export type PrivateWebDomainRejection =
  | "PUBLIC_SECTOR"
  | "INTERGOVERNMENTAL"
  | "FOREIGN_PUBLIC_SECTOR"
  | "LINKEDIN_BLOCKED"
  | "JOB_BOARD"
  | "SOCIAL_MEDIA"
  | "AGGREGATOR"
  | "JOB_PAGE"
  | "HOMEPAGE"
  | "GENERIC_LISTING"
  | "MARKETING_PAGE"
  | "NO_OPPORTUNITY_SIGNAL"
  | "INVALID_URL";

const JOB_HOSTS = [
  "tecoloco.com",
  "computrabajo.com",
  "indeed.com",
  "glassdoor.com",
  "jooble.org",
  "buscojobs.com",
  "opcionempleo.com",
  "unmejorempleo.com",
];

const AGGREGATOR_HOSTS = [
  "scribd.com",
  "slideshare.net",
  "devex.com",
  "developmentaid.org",
  "dgmarket.com",
  "globaltenders.com",
  "tendersinfo.com",
  "tendios.com",
];

const SOCIAL_HOSTS = [
  "facebook.com",
  "instagram.com",
  "x.com",
  "twitter.com",
  "tiktok.com",
];

const INTERGOVERNMENTAL_HOSTS = [
  "un.org",
  "undp.org",
  "unicef.org",
  "fao.org",
  "ilo.org",
  "iom.int",
  "sica.int",
  "oas.org",
  "oea.org",
  "worldbank.org",
  "iadb.org",
  "imf.org",
  "cepal.org",
];

const SALVADORAN_PUBLIC_HOSTS = [
  "gob.sv",
  "gov.sv",
  "ues.edu.sv",
  "mined.edu.sv",
];

const CONFIRMED_FOREIGN_PUBLIC_UNIVERSITY_HOSTS = [
  "unam.mx",
  "uba.ar",
  "uchile.cl",
  "unal.edu.co",
  "usac.edu.gt",
  "unah.edu.hn",
  "unan.edu.ni",
  "ucr.ac.cr",
];

const OPPORTUNITY_SIGNAL = /solicitud de (?:propuestas?|cotizaci[oó]n)|t[eé]rminos de referencia|\brfp\b|\brfq\b|convocatoria|presentar (?:una )?(?:propuesta|oferta|cotizaci[oó]n)|busca(?:mos|n)? proveedor|contratar (?:a |un |una )?(?:proveedor|empresa|agencia|consultor)|invitaci[oó]n a (?:cotizar|ofertar|presentar)|recepci[oó]n de (?:ofertas|propuestas)|servicios requeridos|proceso de selecci[oó]n/i;
const MARKETING_SIGNAL = /nuestros servicios|somos una (?:agencia|empresa)|solicita una propuesta|cotiza con nosotros|cont[aá]ctanos|portafolio|casos de [eé]xito|te ayudamos a|ofrecemos soluciones/i;

function hostMatches(host: string, candidates: readonly string[]): boolean {
  const normalized = host.toLowerCase().replace(/^www\./, "");
  return candidates.some(
    (candidate) => normalized === candidate || normalized.endsWith(`.${candidate}`),
  );
}

function institutionalSectorReason(
  host: string,
  blob: string,
): "PUBLIC_SECTOR" | "INTERGOVERNMENTAL" | "FOREIGN_PUBLIC_SECTOR" | null {
  if (
    hostMatches(host, INTERGOVERNMENTAL_HOSTS) ||
    /\b(?:naciones unidas|programa de las naciones unidas|banco mundial|banco interamericano de desarrollo|fondo monetario internacional|organizaci[oó]n de los estados americanos|sistema de la integraci[oó]n centroamericana)\b/i.test(
      blob,
    )
  ) {
    return "INTERGOVERNMENTAL";
  }
  if (hostMatches(host, SALVADORAN_PUBLIC_HOSTS)) return "PUBLIC_SECTOR";
  if (
    hostMatches(host, CONFIRMED_FOREIGN_PUBLIC_UNIVERSITY_HOSTS) ||
    host.endsWith(".gov") ||
    /(?:^|\.)gov\.[a-z]{2,}(?:\.|$)/i.test(host) ||
    /(?:^|\.)gob\.[a-z]{2,}(?:\.|$)/i.test(host) ||
    hostMatches(host, [
      "gov.uk",
      "gouv.fr",
      "bund.de",
      "canada.ca",
      "europa.eu",
    ])
  ) {
    return "FOREIGN_PUBLIC_SECTOR";
  }
  if (
    /\b(?:embajada|consulado)\b/i.test(blob) ||
    /\b(?:ministerio|gobierno|municipalidad|alcald[ií]a|universidad p[uú]blica)\b[^\n]{0,100}\b(?:guatemala|honduras|nicaragua|costa rica|panam[aá]|m[eé]xico|colombia)\b/i.test(
      blob,
    )
  ) {
    return "FOREIGN_PUBLIC_SECTOR";
  }
  if (
    /\b(?:universidad de el salvador|ministerio de [a-záéíóúñ ]+|municipalidad|alcald[ií]a|gobierno de el salvador|instituto salvadore[ñn]o del seguro social|administraci[oó]n nacional de acueductos y alcantarillados)\b/i.test(
      blob,
    )
  ) {
    return "PUBLIC_SECTOR";
  }
  return null;
}

export function hasPrivateOpportunitySignal(value: string): boolean {
  return OPPORTUNITY_SIGNAL.test(value);
}

export function evaluatePrivateWebSource(input: {
  url: string;
  title?: string | null;
  text?: string | null;
}): { allowed: true } | { allowed: false; reason: PrivateWebDomainRejection } {
  let url: URL;
  try {
    url = new URL(input.url);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { allowed: false, reason: "INVALID_URL" };
    }
  } catch {
    return { allowed: false, reason: "INVALID_URL" };
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const initialBlob = `${input.title ?? ""} ${input.text ?? ""}`.slice(0, 20_000);
  const sectorReason = institutionalSectorReason(host, initialBlob);
  if (sectorReason) return { allowed: false, reason: sectorReason };
  if (hostMatches(host, ["linkedin.com"])) {
    return { allowed: false, reason: "LINKEDIN_BLOCKED" };
  }
  if (hostMatches(host, JOB_HOSTS)) {
    return { allowed: false, reason: "JOB_BOARD" };
  }
  if (hostMatches(host, SOCIAL_HOSTS)) {
    return { allowed: false, reason: "SOCIAL_MEDIA" };
  }
  if (hostMatches(host, AGGREGATOR_HOSTS)) {
    return { allowed: false, reason: "AGGREGATOR" };
  }

  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname).toLowerCase();
  } catch {
    return { allowed: false, reason: "INVALID_URL" };
  }
  if (/\/(?:jobs?|careers?|vacancies|vacantes?|empleos?|trabaja-con-nosotros)(?:\/|$)/.test(pathname)) {
    return { allowed: false, reason: "JOB_PAGE" };
  }
  if (pathname === "/" || pathname === "") {
    return { allowed: false, reason: "HOMEPAGE" };
  }
  if (
    /\/(?:search|buscar|busqueda|tag|tags|category|categories|categoria|categorias|archive|archives|directory|directorio|directorios|listado)(?:\/|$)/.test(
      pathname,
    ) ||
    url.searchParams.has("s") ||
    url.searchParams.has("search")
  ) {
    return { allowed: false, reason: "GENERIC_LISTING" };
  }

  const blob = initialBlob;
  if (classifyOpportunityRole(blob) === "SELLER") {
    return { allowed: false, reason: "MARKETING_PAGE" };
  }
  const opportunity = hasPrivateOpportunitySignal(blob);
  if (!opportunity && MARKETING_SIGNAL.test(blob)) {
    return { allowed: false, reason: "MARKETING_PAGE" };
  }
  if (!opportunity) {
    return { allowed: false, reason: "NO_OPPORTUNITY_SIGNAL" };
  }
  return { allowed: true };
}

/** Applies only deterministic host/path exclusions, before any remote bytes are read. */
export function evaluatePrivateWebUrl(url: string) {
  return evaluatePrivateWebSource({
    url,
    text: "Solicitud de propuestas. Invita a proveedores a presentar ofertas.",
  });
}

export function evaluateBraveResult(
  result: Pick<WebSearchResult, "url" | "title" | "snippet" | "extraSnippets">,
) {
  return evaluatePrivateWebSource({
    url: result.url,
    title: result.title,
    text: [result.snippet, ...(result.extraSnippets ?? [])]
      .filter(Boolean)
      .join(" "),
  });
}
