import type { WebSearchResult } from "@/server/integrations/web-search/contracts";

export const PRIVATE_WEB_AGE_BUCKETS = [
  "UP_TO_180_DAYS",
  "DAYS_181_TO_365",
  "YEARS_1_TO_2",
  "OVER_2_YEARS",
  "UNKNOWN",
] as const;

export type PrivateWebAgeBucket = (typeof PRIVATE_WEB_AGE_BUCKETS)[number];

export type PrivateWebPreliminaryScore = {
  score: number;
  rawScore: number;
  qualified: boolean;
  positiveSignals: string[];
  negativeSignals: string[];
  ageBucket: PrivateWebAgeBucket;
  freshnessFactor: number;
  inferredDate: string | null;
  inferredDateSource: "PUBLISHED_AT" | "AGE" | "TEXT" | "URL_YEAR" | null;
  deadlineExpiredVisible: boolean;
  dimensions: {
    technologyRelation: boolean;
    buyerIntent: boolean;
    possiblePrivateSector: boolean;
    elSalvador: boolean;
    dateOrValidity: boolean;
    specificUrl: boolean;
  };
};

const BUYER_SIGNAL =
  /solicitud de (?:propuestas?|cotizaci[oó]n)|contrataci[oó]n de servicios|invita(?:ci[oó]n)? a (?:proveedores|presentar)|presentaci[oó]n de ofertas|presentar ofertas|t[eé]rminos de referencia|recepci[oó]n de propuestas|contratar (?:a |un |una )?(?:proveedor|empresa|agencia|consultor)|\brfp\b|\brfq\b/i;
const TECHNOLOGY_SIGNAL =
  /desarrollo|implementaci[oó]n|adquisici[oó]n|mantenimiento|integraci[oó]n|licenciamiento|software|sistema inform[aá]tico|sistema web|plataforma (?:digital|tecnol[oó]gica|web)|aplicaci[oó]n (?:web|m[oó]vil|inform[aá]tica)|\bapi\b|soluci[oó]n tecnol[oó]gica/i;
const NON_SOFTWARE_SYSTEM =
  /sistema (?:ambiental|hidrom[eé]trico|meteorol[oó]gico|de riego|de agua|fotovoltaico|el[eé]ctrico)|monitoreo (?:ambiental|hidrom[eé]trico)|estaci[oó]n hidrom[eé]trica/i;
const ACTIVE_SIGNAL =
  /convocatoria (?:abierta|vigente)|recepci[oó]n de (?:ofertas|propuestas)|se recibir[aá]n (?:ofertas|propuestas)|invita(?:n|mos)? a presentar|fecha l[ií]mite|fecha de cierre|plazo para presentar/i;
const PUBLIC_OR_INTERGOVERNMENTAL_SIGNAL =
  /\bministerio\b|\bmunicipalidad\b|\balcald[ií]a\b|\bgobierno\b|\bsector p[uú]blico\b|\bnaciones unidas\b|\bbanco mundial\b|\bbanco interamericano de desarrollo\b|\buni[oó]n europea\b/i;
const SELLER_SIGNAL =
  /nuestros servicios|somos una (?:agencia|empresa)|cotiza con nosotros|cont[aá]ctanos|portafolio|casos de [eé]xito|ofrecemos soluciones/i;

function normalized(value: string): string {
  return value
    .normalize("NFKC")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function safeDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dateFromAge(age: string | null | undefined, now: Date): Date | null {
  if (!age) return null;
  const value = normalized(age);
  const match = value.match(
    /(?:hace\s+)?(\d+)\s*(minut(?:o|os)|hour|hours|hora|horas|day|days|dia|dias|week|weeks|semana|semanas|month|months|mes|meses|year|years|ano|anos)/,
  );
  if (!match?.[1] || !match[2]) return null;
  const amount = Number(match[1]);
  const unit = match[2];
  const days = /minut/.test(unit)
    ? amount / 1_440
    : /hour|hora/.test(unit)
      ? amount / 24
      : /week|semana/.test(unit)
        ? amount * 7
        : /month|mes/.test(unit)
          ? amount * 30
          : /year|ano/.test(unit)
            ? amount * 365
            : amount;
  return new Date(now.getTime() - days * 86_400_000);
}

function contextualDate(text: string): Date | null {
  const candidates: Date[] = [];
  const add = (year: string, month: string, day: string) => {
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (
      date.getUTCFullYear() === Number(year) &&
      date.getUTCMonth() === Number(month) - 1 &&
      date.getUTCDate() === Number(day)
    ) {
      candidates.push(date);
    }
  };
  for (const match of text.matchAll(
    /(?:publicad[oa]|publicaci[oó]n|actualizad[oa]|actualizaci[oó]n)[^\n.]{0,50}?\b(20\d{2})[-/]([01]?\d)[-/]([0-3]?\d)\b/gi,
  )) {
    if (match[1] && match[2] && match[3]) add(match[1], match[2], match[3]);
  }
  for (const match of text.matchAll(
    /(?:publicad[oa]|publicaci[oó]n|actualizad[oa]|actualizaci[oó]n)[^\n.]{0,50}?\b([0-3]?\d)[-/]([01]?\d)[-/](20\d{2})\b/gi,
  )) {
    if (match[1] && match[2] && match[3]) add(match[3], match[2], match[1]);
  }
  return candidates.sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
}

function yearFromUrl(url: string): Date | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  const years = [...pathname.matchAll(/(?:^|[^0-9])(20\d{2})(?:[^0-9]|$)/g)]
    .map((match) => Number(match[1]))
    .filter((year) => year >= 2000 && year <= 2100);
  const latest = Math.max(...years);
  return Number.isFinite(latest) ? new Date(Date.UTC(latest, 6, 1)) : null;
}

function evaluateFreshness(input: {
  result: WebSearchResult;
  text: string;
  now: Date;
}): Pick<
  PrivateWebPreliminaryScore,
  "ageBucket" | "freshnessFactor" | "inferredDate" | "inferredDateSource"
> {
  const published = safeDate(input.result.publishedAt);
  const fromAge = dateFromAge(input.result.age, input.now);
  const fromText = contextualDate(input.text);
  const fromUrl = yearFromUrl(input.result.url);
  const selected = [
    ...(published ? [{ date: published, source: "PUBLISHED_AT" as const }] : []),
    ...(fromAge ? [{ date: fromAge, source: "AGE" as const }] : []),
    ...(fromText ? [{ date: fromText, source: "TEXT" as const }] : []),
  ].sort((left, right) => right.date.getTime() - left.date.getTime())[0] ??
    (fromUrl ? { date: fromUrl, source: "URL_YEAR" as const } : null);
  if (!selected) {
    return {
      ageBucket: "UNKNOWN",
      freshnessFactor: 0.7,
      inferredDate: null,
      inferredDateSource: null,
    };
  }
  const days = Math.max(
    0,
    Math.floor((input.now.getTime() - selected.date.getTime()) / 86_400_000),
  );
  if (days <= 180) {
    return {
      ageBucket: "UP_TO_180_DAYS",
      freshnessFactor: 1,
      inferredDate: selected.date.toISOString(),
      inferredDateSource: selected.source,
    };
  }
  if (days <= 365) {
    return {
      ageBucket: "DAYS_181_TO_365",
      freshnessFactor: 0.85,
      inferredDate: selected.date.toISOString(),
      inferredDateSource: selected.source,
    };
  }
  if (days <= 730) {
    return {
      ageBucket: "YEARS_1_TO_2",
      freshnessFactor: 0.55,
      inferredDate: selected.date.toISOString(),
      inferredDateSource: selected.source,
    };
  }
  return {
    ageBucket: "OVER_2_YEARS",
    freshnessFactor: 0,
    inferredDate: selected.date.toISOString(),
    inferredDateSource: selected.source,
  };
}

function visibleDeadlineExpired(text: string, now: Date): boolean {
  const matches = [
    ...text.matchAll(
      /(?:fecha l[ií]mite|fecha de cierre|plazo|hasta)[^\n.]{0,60}?\b([0-3]?\d)[-/]([01]?\d)[-/](20\d{2})\b/gi,
    ),
  ];
  return matches.some((match) => {
    if (!match[1] || !match[2] || !match[3]) return false;
    const end = new Date(
      Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1]), 23, 59, 59),
    );
    return !Number.isNaN(end.getTime()) && end.getTime() < now.getTime();
  });
}

function specificUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const path = decodeURIComponent(url.pathname).toLowerCase();
    return (
      path !== "/" &&
      path !== "" &&
      !/\/(?:search|buscar|tag|category|categoria|archive|directorio|listado)(?:\/|$)/.test(
        path,
      )
    );
  } catch {
    return false;
  }
}

function queryTerms(value: string): string[] {
  return normalized(value)
    .split(/[^a-z0-9+#.]+/)
    .filter((term) => term.length >= 4 && !["para", "sistema", "sistemas"].includes(term))
    .slice(0, 8);
}

export function evaluatePrivateWebPreliminaryResult(input: {
  result: WebSearchResult;
  query: string;
  now?: Date;
}): PrivateWebPreliminaryScore {
  const now = input.now ?? new Date();
  const remoteText = [
    input.result.title,
    input.result.snippet,
    ...(input.result.extraSnippets ?? []),
  ]
    .filter(Boolean)
    .join(" ");
  const blob = normalized(`${remoteText} ${input.result.url} ${input.result.domain}`);
  const relationTerms = queryTerms(input.query);
  const explicitTechnology = TECHNOLOGY_SIGNAL.test(blob) && !NON_SOFTWARE_SYSTEM.test(blob);
  const termRelation = relationTerms.some((term) => blob.includes(term));
  const technologyQuery = /software|sistema|plataforma|aplicaci[oó]n|\bapi\b|tecnolog/i.test(
    input.query,
  );
  const technologyRelation = technologyQuery
    ? explicitTechnology
    : explicitTechnology && termRelation;
  const buyerIntent = BUYER_SIGNAL.test(blob);
  const possiblePrivateSector = !PUBLIC_OR_INTERGOVERNMENTAL_SIGNAL.test(blob);
  const elSalvador =
    /\bel salvador\b|\bsalvadore[ñn][oa]\b/.test(blob) ||
    /(?:^|\.)[^/]+\.sv(?:\/|$)/.test(normalized(input.result.url));
  const freshness = evaluateFreshness({
    result: input.result,
    text: remoteText,
    now,
  });
  const deadlineExpiredVisible = visibleDeadlineExpired(remoteText, now);
  const dateOrValidity = Boolean(
    freshness.inferredDate || input.result.age || ACTIVE_SIGNAL.test(remoteText),
  );
  const isSpecificUrl = specificUrl(input.result.url);
  const positiveSignals: string[] = [];
  const negativeSignals: string[] = [];
  let rawScore = 0;

  const positive: Array<[string, RegExp, number]> = [
    ["REQUEST_FOR_PROPOSALS", /solicitud de propuestas?/, 14],
    ["REQUEST_FOR_QUOTATION", /solicitud de cotizaci[oó]n/, 14],
    ["SERVICE_CONTRACTING", /contrataci[oó]n de servicios/, 12],
    ["INVITES_PROVIDERS", /invita(?:n|mos)? a proveedores/, 12],
    ["PRESENTATION_OF_OFFERS", /presenta(?:ci[oó]n|r) de? ofertas|presentar ofertas/, 12],
    [
      "SOFTWARE_BUYING_ACTION",
      /(?:desarrollo|implementaci[oó]n|adquisici[oó]n) de (?:software|sistema|plataforma|aplicaci[oó]n)/,
      16,
    ],
  ];
  for (const [name, pattern, weight] of positive) {
    if (pattern.test(blob)) {
      positiveSignals.push(name);
      rawScore += weight;
    }
  }
  if (technologyRelation) {
    positiveSignals.push("TECHNOLOGY_RELATION");
    rawScore += 14;
  }
  if (buyerIntent) {
    positiveSignals.push("BUYER_INTENT");
    rawScore += 12;
  }
  if (elSalvador) {
    positiveSignals.push("EL_SALVADOR");
    rawScore += 10;
  }
  if (freshness.ageBucket === "UP_TO_180_DAYS") {
    positiveSignals.push("RECENT_DATE");
    rawScore += 8;
  }
  if (possiblePrivateSector) {
    positiveSignals.push("PRIVATE_OR_ALLOWED_NONGOV_DOMAIN");
    rawScore += 6;
  }
  if (isSpecificUrl) {
    positiveSignals.push("SPECIFIC_URL");
    rawScore += 5;
  }

  const negative: Array<[string, RegExp, number]> = [
    ["AUDIT", /\bauditor[ií]a\b/, -24],
    ["SALARY_STUDY", /estudio salarial|escala salarial/, -28],
    ["BASELINE", /l[ií]nea de base/, -24],
    ["EVALUATION", /\bevaluaci[oó]n\b/, -18],
    [
      "PHYSICAL_CONSTRUCTION",
      /construcci[oó]n (?:de|f[ií]sica)|obra civil|infraestructura f[ií]sica/,
      -28,
    ],
    ["ENVIRONMENTAL_OR_HYDROMETRIC_SYSTEM", NON_SOFTWARE_SYSTEM, -35],
    [
      "FOREIGN_COUNTRY",
      /\bguatemala\b|\bhonduras\b|\bnicaragua\b|\bcosta rica\b|\bpanam[aá]\b|\bm[eé]xico\b|\bcolombia\b/,
      -30,
    ],
    ["PUBLIC_OR_INTERGOVERNMENTAL", PUBLIC_OR_INTERGOVERNMENTAL_SIGNAL, -35],
    ["SELLER_OR_MARKETING", SELLER_SIGNAL, -30],
  ];
  for (const [name, pattern, weight] of negative) {
    if (pattern.test(blob)) {
      negativeSignals.push(name);
      rawScore += weight;
    }
  }
  if (freshness.ageBucket === "YEARS_1_TO_2") {
    negativeSignals.push("OLDER_THAN_ONE_YEAR");
  } else if (freshness.ageBucket === "OVER_2_YEARS") {
    negativeSignals.push("OLDER_THAN_TWO_YEARS");
    rawScore -= 35;
  }
  if (deadlineExpiredVisible) {
    negativeSignals.push("VISIBLE_EXPIRED_DEADLINE");
    rawScore -= 45;
  }

  const effectiveFreshnessFactor = deadlineExpiredVisible
    ? 0
    : freshness.freshnessFactor;
  const score = Math.max(
    0,
    Math.min(100, Math.round(rawScore * effectiveFreshnessFactor)),
  );
  const dimensions = {
    technologyRelation,
    buyerIntent,
    possiblePrivateSector,
    elSalvador,
    dateOrValidity,
    specificUrl: isSpecificUrl,
  };
  return {
    score,
    rawScore,
    qualified:
      Object.values(dimensions).every(Boolean) &&
      score >= 40 &&
      effectiveFreshnessFactor > 0,
    positiveSignals: unique(positiveSignals),
    negativeSignals: unique(negativeSignals),
    ...freshness,
    freshnessFactor: effectiveFreshnessFactor,
    deadlineExpiredVisible,
    dimensions,
  };
}

export function inferPrivateWebDocumentType(
  result: Pick<WebSearchResult, "url">,
): "HTML" | "PDF" | "UNKNOWN" {
  try {
    return /\.pdf$/i.test(new URL(result.url).pathname) ? "PDF" : "UNKNOWN";
  } catch {
    return "UNKNOWN";
  }
}
