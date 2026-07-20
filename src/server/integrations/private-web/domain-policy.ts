import type { WebSearchResult } from "@/server/integrations/web-search/contracts";

import { classifyOpportunityRole } from "./evidence-parsers";

export type PrivateWebDomainRejection =
  | "PUBLIC_SECTOR_DOMAIN"
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

const OPPORTUNITY_SIGNAL = /solicitud de (?:propuestas?|cotizaci[oó]n)|t[eé]rminos de referencia|\brfp\b|\brfq\b|convocatoria|presentar (?:una )?(?:propuesta|oferta|cotizaci[oó]n)|busca(?:mos|n)? proveedor|contratar (?:a |un |una )?(?:proveedor|empresa|agencia|consultor)|invitaci[oó]n a (?:cotizar|ofertar|presentar)|recepci[oó]n de (?:ofertas|propuestas)|servicios requeridos|proceso de selecci[oó]n/i;
const MARKETING_SIGNAL = /nuestros servicios|somos una (?:agencia|empresa)|solicita una propuesta|cotiza con nosotros|cont[aá]ctanos|portafolio|casos de [eé]xito|te ayudamos a|ofrecemos soluciones/i;

function hostMatches(host: string, candidates: readonly string[]): boolean {
  const normalized = host.toLowerCase().replace(/^www\./, "");
  return candidates.some(
    (candidate) => normalized === candidate || normalized.endsWith(`.${candidate}`),
  );
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
  if (
    host === "comprasal.gob.sv" ||
    host.endsWith(".comprasal.gob.sv") ||
    host === "dinac.gob.sv" ||
    host === "gob.sv" ||
    host.endsWith(".gob.sv")
  ) {
    return { allowed: false, reason: "PUBLIC_SECTOR_DOMAIN" };
  }
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

  const blob = `${input.title ?? ""} ${input.text ?? ""}`.slice(0, 20_000);
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
