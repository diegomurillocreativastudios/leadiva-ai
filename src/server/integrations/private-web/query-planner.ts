export const PRIVATE_WEB_PLANNER_VERSION = "private-web-brave-v1";
export const BRAVE_QUERY_MAX_CHARS = 400;
export const BRAVE_QUERY_MAX_WORDS = 50;

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
  return value.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
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

function subjectExpansion(query: string): {
  primary: string;
  proposal: string;
  systems: string;
  technology: string;
  university: boolean;
} {
  const terms = significantTerms(query);
  const blob = terms.join(" ");
  if (/inteligencia artificial|\bia\b|machine learning|datos/.test(blob)) {
    return {
      primary: "inteligencia artificial",
      proposal: "inteligencia artificial",
      systems: "sistemas",
      technology: "tecnología",
      university: /universidad|educacion|academ/.test(blob),
    };
  }
  if (/infraestructura|redes|servidor|nube|cloud|ciberseguridad/.test(blob)) {
    return {
      primary: "infraestructura TI",
      proposal: "infraestructura TI",
      systems: "sistemas",
      technology: "tecnología",
      university: /universidad|educacion|academ/.test(blob),
    };
  }
  if (/consultor|consultoria|asesoria/.test(blob)) {
    return {
      primary: "consultoría",
      proposal: terms.includes("software") ? "software" : "consultoría",
      systems: terms.includes("software") ? "software" : "sistemas",
      technology: "servicios profesionales",
      university: /universidad|educacion|academ/.test(blob),
    };
  }
  const primary = terms.slice(0, 6).join(" ") || "servicios digitales";
  return {
    primary,
    proposal: /software|desarrollo|aplicacion|web|plataforma/.test(blob)
      ? "software"
      : "sistemas",
    systems: "sistemas",
    technology: /licencia/.test(blob) ? "licencias tecnología" : "tecnología",
    university: /universidad|educacion|academ/.test(blob),
  };
}

function withinBraveLimits(query: string): string {
  const words = normalizeWhitespace(query).split(" ").slice(0, BRAVE_QUERY_MAX_WORDS);
  return words.join(" ").slice(0, BRAVE_QUERY_MAX_CHARS).trim();
}

function dedupeFamilies(families: PrivateWebQueryFamily[]): PrivateWebQueryFamily[] {
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
  const subject = subjectExpansion(normalizedUserQuery);
  const initialCandidates: PrivateWebQueryFamily[] = [
    {
      id: "base_provider_sv",
      stage: 1,
      query: `${normalizedUserQuery} proveedor El Salvador`,
      freshness: null,
    },
    {
      id: "proposal_sv",
      stage: 1,
      query: `"solicitud de propuestas" ${subject.proposal} El Salvador`,
      freshness: "py",
    },
    {
      id: "terms_sv",
      stage: 1,
      query: `"términos de referencia" ${subject.systems} El Salvador`,
      freshness: null,
    },
    {
      id: "quotation_sv",
      stage: 1,
      query: `"solicitud de cotización" ${subject.technology} El Salvador`,
      freshness: "pm",
    },
  ];
  const initial = dedupeFamilies(
    initialCandidates.map((family) => ({
      ...family,
      query: withinBraveLimits(family.query),
    })),
  );

  const adaptiveCandidates: PrivateWebQueryFamily[] = [
    {
      id: "org_sv_convocation",
      stage: 2,
      query: `site:org.sv ${subject.proposal} convocatoria`,
      freshness: null,
    },
    subject.university
      ? {
          id: "edu_sv_private",
          stage: 2,
          query: `site:edu.sv ${subject.primary} convocatoria proveedor`,
          freshness: null,
        }
      : {
          id: "com_sv_provider",
          stage: 2,
          query: `site:com.sv ${subject.technology} proveedor`,
          freshness: "pm",
        },
  ];

  return {
    plannerVersion: PRIVATE_WEB_PLANNER_VERSION,
    normalizedUserQuery,
    initial,
    adaptive: dedupeFamilies(
      adaptiveCandidates.map((family) => ({
        ...family,
        query: withinBraveLimits(family.query),
      })),
    ),
  };
}

export function shouldRunAdaptivePrivateWebStage(input: {
  eligibleUniqueUrls: number;
  providerResults: number;
}): boolean {
  return input.eligibleUniqueUrls < 8 || input.providerResults < 12;
}
