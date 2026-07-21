export const PRIVATE_WEB_PLANNER_VERSION = "private-web-brave-v2";
export const PRIVATE_WEB_MAX_QUERY_FAMILIES = 6;
export const BRAVE_QUERY_MAX_CHARS = 400;
export const BRAVE_QUERY_MAX_WORDS = 50;

export const PRIVATE_WEB_TECH_OBJECT_FACETS = [
  "software",
  "sistema informático",
  "sistema web",
  "plataforma",
  "aplicación",
  "API",
  "solución tecnológica",
] as const;

export const PRIVATE_WEB_ACTION_FACETS = [
  "desarrollar",
  "implementar",
  "adquirir",
  "mantener",
  "integrar",
  "licenciar",
] as const;

export const PRIVATE_WEB_BUYER_INTENT_FACETS = [
  "condor",
  "solicitud de propuestas",
  "solicitud de cotización",
  "invita a presentar ofertas",
  "términos de referencia para contratar",
  "recepción de propuestas",
] as const;

export type PrivateWebQueryFamily = {
  id: string;
  stage: 1 | 2;
  query: string;
  freshness: "pm" | "py" | null;
};

const STOP_WORDS = new Set([
  "a",
  "al",
  "con",
  "de",
  "del",
  "el",
  "en",
  "la",
  "las",
  "los",
  "para",
  "por",
  "un",
  "una",
  "y",
]);

function normalizeWhitespace(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function comparable(value: string): string {
  return normalizeWhitespace(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function significantTerms(query: string): string[] {
  return comparable(query)
    .split(/[^a-z0-9+#.]+/)
    .filter((term) => term.length >= 2 && !STOP_WORDS.has(term))
    .slice(0, 12);
}

function technologyExpansion(query: string): {
  proposalObject: string;
  serviceAction: string;
  quotationObject: string;
  termsAction: string;
  offerObject: string;
} {
  const blob = significantTerms(query).join(" ");
  if (/\bapi\b|integracion/.test(blob)) {
    return {
      proposalObject: "API",
      serviceAction: "integración de API",
      quotationObject: "solución tecnológica",
      termsAction: "implementación de API",
      offerObject: "API",
    };
  }
  if (/licencia|licenciamiento/.test(blob)) {
    return {
      proposalObject: "software",
      serviceAction: "licenciamiento de software",
      quotationObject: "licencias de software",
      termsAction: "adquisición de software",
      offerObject: "software",
    };
  }
  if (/aplicacion|app movil/.test(blob)) {
    return {
      proposalObject: "aplicación",
      serviceAction: "desarrollo de aplicación",
      quotationObject: "aplicación",
      termsAction: "implementación de aplicación",
      offerObject: "aplicación",
    };
  }
  if (/plataforma/.test(blob)) {
    return {
      proposalObject: "plataforma",
      serviceAction: "desarrollo de plataforma",
      quotationObject: "plataforma web",
      termsAction: "implementación de plataforma",
      offerObject: "plataforma",
    };
  }
  if (/web/.test(blob)) {
    return {
      proposalObject: "sistema web",
      serviceAction: "desarrollo de software",
      quotationObject: "sistema web",
      termsAction: "implementación de sistema",
      offerObject: "software",
    };
  }
  return {
    proposalObject: "sistema informático",
    serviceAction: "desarrollo de software",
    quotationObject: "sistema web",
    termsAction: "implementación de sistema",
    offerObject: "software",
  };
}

function withinBraveLimits(query: string): string {
  const words = normalizeWhitespace(query)
    .split(" ")
    .slice(0, BRAVE_QUERY_MAX_WORDS);
  return words.join(" ").slice(0, BRAVE_QUERY_MAX_CHARS).trim();
}

function dedupeFamilies(
  families: PrivateWebQueryFamily[],
): PrivateWebQueryFamily[] {
  const seen = new Set<string>();
  return families.filter((family) => {
    const key = comparable(family.query);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function planPrivateWebQueries(userQuery: string): {
  plannerVersion: string;
  normalizedUserQuery: string;
  initial: PrivateWebQueryFamily[];
  adaptive: PrivateWebQueryFamily[];
} {
  const normalizedUserQuery = normalizeWhitespace(userQuery).slice(0, 180);
  const technology = technologyExpansion(normalizedUserQuery);
  const candidates: PrivateWebQueryFamily[] = [
    {
      id: "base_provider_sv",
      stage: 1,
      query: `${normalizedUserQuery} contratar proveedor El Salvador`,
      freshness: null,
    },
    {
      id: "proposal_system_sv",
      stage: 1,
      query: `"solicitud de propuestas" ${technology.proposalObject} software El Salvador`,
      freshness: "py",
    },
    {
      id: "services_development_sv",
      stage: 1,
      query: `"contratación de servicios" ${technology.serviceAction} El Salvador`,
      freshness: "py",
    },
    {
      id: "quotation_web_sv",
      stage: 1,
      query: `"solicitud de cotización" ${technology.quotationObject} software El Salvador`,
      freshness: "pm",
    },
    {
      id: "terms_implementation_sv",
      stage: 2,
      query: `"términos de referencia" ${technology.termsAction} software El Salvador`,
      freshness: null,
    },
    {
      id: "offers_software_sv",
      stage: 2,
      query: `"invita a presentar ofertas" ${technology.offerObject} El Salvador`,
      freshness: "py",
    },
  ];
  const families = dedupeFamilies(
    candidates
      .slice(0, PRIVATE_WEB_MAX_QUERY_FAMILIES)
      .map((family) => ({ ...family, query: withinBraveLimits(family.query) })),
  );

  return {
    plannerVersion: PRIVATE_WEB_PLANNER_VERSION,
    normalizedUserQuery,
    initial: families.filter((family) => family.stage === 1),
    adaptive: families.filter((family) => family.stage === 2),
  };
}

export function shouldRunAdaptivePrivateWebStage(input: {
  qualifiedYield: number;
}): boolean {
  return input.qualifiedYield < 6;
}
