import type { ComprasalAvailableProcess } from "./available-normalize";

export const COMPRASAL_SHORT_TECH_TERMS = [
  "ia",
  "ai",
  "ti",
  "it",
  "bi",
  "qa",
  "ux",
  "ui",
  "erp",
  "crm",
  "sap",
  "api",
  "aws",
  "gis",
  "vpn",
  "web",
  "app",
] as const;

const SHORT_TECH_TERM_SET = new Set<string>(COMPRASAL_SHORT_TECH_TERMS);

const QUERY_STOP_WORDS = new Set([
  "a",
  "al",
  "con",
  "de",
  "del",
  "el",
  "en",
  "la",
  "las",
  "lo",
  "los",
  "o",
  "para",
  "por",
  "un",
  "una",
  "y",
]);

const GENERIC_PROCUREMENT_TERMS = new Set([
  "adquisicion",
  "compra",
  "compras",
  "contratacion",
  "proceso",
  "procesos",
  "servicio",
  "servicios",
  "suministro",
  "suministros",
]);

export const COMPRASAL_SEARCH_SCORING = {
  termWeights: {
    title: 18,
    code: 16,
    institution: 10,
    contractingMethod: 8,
    activity: 4,
  },
  phraseBonuses: {
    title: 25,
    institution: 12,
    contractingMethod: 10,
    activity: 6,
  },
  exactCodeBonus: 35,
  coverageBonus: 20,
  multiTermMinimumScore: 30,
  multiTermMinimumCoverage: 0.6,
  prefixMinimumLength: 4,
  maximumScore: 100,
} as const;

export type ComprasalSearchQuery = {
  normalized: string;
  terms: string[];
};

export type ComprasalSearchDecision = {
  accept: boolean;
  score: number;
  coverage: number;
  matchedTerms: string[];
  exactCodeMatch: boolean;
};

export type ScoredComprasalAvailableProcess = {
  process: ComprasalAvailableProcess;
  score: number;
  coverage: number;
  matchedTerms: string[];
};

export function normalizeComprasalSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function isMeaningfulTerm(term: string): boolean {
  if (QUERY_STOP_WORDS.has(term) || GENERIC_PROCUREMENT_TERMS.has(term)) {
    return false;
  }
  if (SHORT_TECH_TERM_SET.has(term)) {
    return true;
  }
  return term.length >= COMPRASAL_SEARCH_SCORING.prefixMinimumLength;
}

export function parseComprasalSearchQuery(query: string): ComprasalSearchQuery {
  const normalized = normalizeComprasalSearchText(query);
  const terms = [
    ...new Set(normalized.split(" ").filter((term) => isMeaningfulTerm(term))),
  ];
  return { normalized, terms };
}

export function hasSignificantComprasalQuery(query: string): boolean {
  return parseComprasalSearchQuery(query).terms.length > 0;
}

function fieldWords(value: string): string[] {
  const normalized = normalizeComprasalSearchText(value);
  return normalized ? normalized.split(" ") : [];
}

function termMatchesWords(term: string, words: readonly string[]): boolean {
  if (SHORT_TECH_TERM_SET.has(term)) {
    return words.includes(term);
  }

  return words.some(
    (word) =>
      word === term ||
      (term.length >= COMPRASAL_SEARCH_SCORING.prefixMinimumLength &&
        word.startsWith(term)),
  );
}

function phraseMatches(value: string, query: ComprasalSearchQuery): boolean {
  if (!query.normalized) {
    return false;
  }
  const normalizedField = normalizeComprasalSearchText(value);
  if (query.terms.length === 1 && SHORT_TECH_TERM_SET.has(query.terms[0] ?? "")) {
    return normalizedField.split(" ").includes(query.terms[0] ?? "");
  }
  return normalizedField.includes(query.normalized);
}

export function scoreComprasalAvailableProcess(
  process: ComprasalAvailableProcess,
  queryInput: string | ComprasalSearchQuery,
): ComprasalSearchDecision {
  const query =
    typeof queryInput === "string"
      ? parseComprasalSearchQuery(queryInput)
      : queryInput;

  if (query.terms.length === 0) {
    return {
      accept: false,
      score: 0,
      coverage: 0,
      matchedTerms: [],
      exactCodeMatch: false,
    };
  }

  const titleWords = fieldWords(process.title);
  const codeWords = fieldWords(process.code);
  const institutionWords = fieldWords(process.institution);
  const methodWords = fieldWords(
    `${process.contractingMethod} ${process.contractingMethodCode}`,
  );
  const activityWords = fieldWords(process.activityNames.join(" "));
  const matchedTerms: string[] = [];
  let score = 0;

  for (const term of query.terms) {
    const weights: number[] = [];
    if (termMatchesWords(term, titleWords)) {
      weights.push(COMPRASAL_SEARCH_SCORING.termWeights.title);
    }
    if (termMatchesWords(term, codeWords)) {
      weights.push(COMPRASAL_SEARCH_SCORING.termWeights.code);
    }
    if (termMatchesWords(term, institutionWords)) {
      weights.push(COMPRASAL_SEARCH_SCORING.termWeights.institution);
    }
    if (termMatchesWords(term, methodWords)) {
      weights.push(COMPRASAL_SEARCH_SCORING.termWeights.contractingMethod);
    }
    if (termMatchesWords(term, activityWords)) {
      weights.push(COMPRASAL_SEARCH_SCORING.termWeights.activity);
    }

    const bestWeight = weights.length > 0 ? Math.max(...weights) : 0;
    if (bestWeight > 0) {
      matchedTerms.push(term);
      score += bestWeight;
    }
  }

  const coverage = matchedTerms.length / query.terms.length;
  score += Math.round(COMPRASAL_SEARCH_SCORING.coverageBonus * coverage);

  const exactCodeMatch =
    query.normalized === normalizeComprasalSearchText(process.code);
  if (exactCodeMatch) {
    score += COMPRASAL_SEARCH_SCORING.exactCodeBonus;
  }
  if (phraseMatches(process.title, query)) {
    score += COMPRASAL_SEARCH_SCORING.phraseBonuses.title;
  }
  if (phraseMatches(process.institution, query)) {
    score += COMPRASAL_SEARCH_SCORING.phraseBonuses.institution;
  }
  if (
    phraseMatches(
      `${process.contractingMethod} ${process.contractingMethodCode}`,
      query,
    )
  ) {
    score += COMPRASAL_SEARCH_SCORING.phraseBonuses.contractingMethod;
  }
  if (phraseMatches(process.activityNames.join(" "), query)) {
    score += COMPRASAL_SEARCH_SCORING.phraseBonuses.activity;
  }

  score = Math.min(COMPRASAL_SEARCH_SCORING.maximumScore, score);
  const accept =
    exactCodeMatch ||
    (query.terms.length === 1
      ? matchedTerms.length === 1
      : coverage >= COMPRASAL_SEARCH_SCORING.multiTermMinimumCoverage &&
        score >= COMPRASAL_SEARCH_SCORING.multiTermMinimumScore);

  return { accept, score, coverage, matchedTerms, exactCodeMatch };
}

export function searchComprasalAvailableProcesses(
  processes: readonly ComprasalAvailableProcess[],
  rawQuery: string,
): ScoredComprasalAvailableProcess[] {
  const query = parseComprasalSearchQuery(rawQuery);
  return processes
    .map((process) => ({
      process,
      decision: scoreComprasalAvailableProcess(process, query),
    }))
    .filter((item) => item.decision.accept)
    .map((item) => ({
      process: item.process,
      score: item.decision.score,
      coverage: item.decision.coverage,
      matchedTerms: item.decision.matchedTerms,
    }))
    .sort((left, right) => {
      const scoreDifference = right.score - left.score;
      if (scoreDifference !== 0) {
        return scoreDifference;
      }
      const deadlineDifference =
        new Date(left.process.deadlineAt).getTime() -
        new Date(right.process.deadlineAt).getTime();
      return deadlineDifference || left.process.id - right.process.id;
    });
}
