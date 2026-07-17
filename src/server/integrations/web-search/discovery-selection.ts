import { normalizeUrl, slugify } from "@/lib/normalization";
import { isGenericOrListingSourceUrl } from "@/lib/source-url-specificity";

import type { WebSearchResult } from "./contracts";

export type RetrievalClassification = {
  score: number;
  positiveSignals: string[];
  negativeSignals: string[];
  recommendation: "FETCH" | "REVIEW" | "SKIP";
};

export type SourceRelationship =
  | "DIRECT_OFFICIAL"
  | "LINKED_OFFICIAL"
  | "AGGREGATOR"
  | "SOCIAL_DISCOVERY"
  | "UNKNOWN";

export type SelectedWebResult = WebSearchResult & {
  normalizedUrl: string;
  discoveredByQueries: string[];
  discoveredByFamilies: string[];
  duplicateEvidenceCount: number;
  retrieval: RetrievalClassification;
  sourceRelationship: SourceRelationship;
};

const POSITIVE_SIGNALS: Array<[string, number]> = [
  ["request for proposal", 5],
  ["request for quotation", 5],
  ["invitation to tender", 5],
  ["invitation to bid", 5],
  ["submit proposal", 4],
  ["proposal deadline", 4],
  ["proposals due", 4],
  ["call for vendors", 4],
  ["vendor opportunity", 4],
  ["terms of reference", 4],
  ["expression of interest", 4],
  ["seeking agency", 3],
  ["seeking technology partner", 3],
  ["website redesign", 3],
  ["platform development", 3],
  ["software development", 2],
  ["managed hosting", 2],
  ["cloud migration", 2],
  ["digital services", 2],
  ["consulting services", 2],
  ["procurement", 3],
  ["rfp", 5],
  ["rfq", 5],
  ["licitación", 5],
  ["licitacion", 5],
  ["convocatoria", 3],
];

const NEGATIVE_SIGNALS: Array<[string, number]> = [
  ["job opening", -7],
  ["vacancy", -7],
  ["career", -6],
  ["course", -6],
  ["training program", -6],
  ["completed project", -5],
  ["award announcement", -5],
  ["our services", -4],
  ["portfolio", -4],
  ["about us", -4],
  ["press release", -3],
  ["blog", -3],
  ["news archive", -3],
  ["empleo", -7],
  ["vacante", -7],
  ["curso", -6],
  ["nuestros servicios", -4],
];

const AGGREGATOR_HOSTS = [
  "linkedin.com",
  "facebook.com",
  "x.com",
  "twitter.com",
  "tendersinfo.com",
  "developmentaid.org",
  "devex.com",
  "tendios.com",
];

function normalizedBlob(result: WebSearchResult): string {
  return `${result.title} ${result.url} ${result.domain} ${result.snippet ?? ""}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function hostMatches(host: string, candidates: readonly string[]): boolean {
  const normalized = host.replace(/^www\./, "").toLowerCase();
  return candidates.some(
    (candidate) => normalized === candidate || normalized.endsWith(`.${candidate}`),
  );
}

export function inferSourceRelationship(
  result: WebSearchResult,
): SourceRelationship {
  if (hostMatches(result.domain, ["linkedin.com", "facebook.com", "x.com", "twitter.com"])) {
    return "SOCIAL_DISCOVERY";
  }
  if (
    hostMatches(result.domain, AGGREGATOR_HOSTS) ||
    isGenericOrListingSourceUrl(result.url)
  ) {
    return "AGGREGATOR";
  }
  const blob = normalizedBlob(result);
  if (
    /\/(procurement|rfp|rfq|tender|vendor|opportunit|solicitation|terms-of-reference|convocatoria|licitacion)/.test(
      blob,
    ) ||
    /\.(pdf)(?:\?|$)/.test(blob)
  ) {
    return "DIRECT_OFFICIAL";
  }
  return "UNKNOWN";
}

export function classifySearchResult(
  result: WebSearchResult,
): RetrievalClassification {
  const blob = normalizedBlob(result);
  const positiveSignals: string[] = [];
  const negativeSignals: string[] = [];
  let score = 0;

  for (const [signal, weight] of POSITIVE_SIGNALS) {
    const normalizedSignal = signal
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    if (blob.includes(normalizedSignal)) {
      positiveSignals.push(signal);
      score += weight;
    }
  }
  for (const [signal, weight] of NEGATIVE_SIGNALS) {
    const normalizedSignal = signal
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    if (blob.includes(normalizedSignal)) {
      negativeSignals.push(signal);
      score += weight;
    }
  }

  if (/\.(pdf)(?:\?|$)/i.test(result.url)) {
    positiveSignals.push("pdf");
    score += 2;
  }
  if (/\/(procurement|rfp|rfq|tender|vendor|opportunit|solicitation)/i.test(result.url)) {
    positiveSignals.push("procurement_path");
    score += 2;
  }
  if (inferSourceRelationship(result) === "AGGREGATOR") {
    negativeSignals.push("aggregator");
    score -= 2;
  }

  const hasStrongNegative = negativeSignals.some((signal) =>
    ["career", "job opening", "vacancy", "course", "training program", "empleo", "vacante", "curso"].includes(signal),
  );
  const recommendation: RetrievalClassification["recommendation"] =
    hasStrongNegative || score <= 0
      ? "SKIP"
      : score >= 4
        ? "FETCH"
        : "REVIEW";

  return {
    score,
    positiveSignals: unique(positiveSignals),
    negativeSignals: unique(negativeSignals),
    recommendation,
  };
}

function titleIdentity(title: string): string {
  return slugify(title).slice(0, 180);
}

function inferredOrganizationKey(result: SelectedWebResult): string | null {
  const parts = result.title
    .split(/\s(?:\||—|-)\s/)
    .map((part) => titleIdentity(part))
    .filter((part) => part.length >= 4);
  if (parts.length < 2) {
    return null;
  }
  const candidate = parts.at(-1) ?? null;
  return candidate && !/^(rfp|rfq|procurement|tender|opportunity)$/.test(candidate)
    ? candidate
    : null;
}

export function deduplicateWebResults(results: readonly WebSearchResult[]): {
  results: SelectedWebResult[];
  duplicates: number;
} {
  const byUrl = new Map<string, SelectedWebResult>();
  const byIdentity = new Map<string, SelectedWebResult>();
  let duplicates = 0;

  for (const result of results) {
    const normalizedUrl = normalizeUrl(result.url);
    let parsed: URL;
    try {
      parsed = new URL(normalizedUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        continue;
      }
    } catch {
      continue;
    }
    const identity = `${parsed.hostname.toLowerCase()}:${titleIdentity(result.title)}`;
    const existing = byUrl.get(normalizedUrl) ?? byIdentity.get(identity);
    if (existing) {
      duplicates += 1;
      existing.discoveredByQueries = unique([
        ...existing.discoveredByQueries,
        result.query,
      ]);
      existing.discoveredByFamilies = unique([
        ...existing.discoveredByFamilies,
        result.queryFamily,
      ]);
      existing.duplicateEvidenceCount += 1;
      if (!existing.snippet && result.snippet) {
        existing.snippet = result.snippet;
      }
      continue;
    }

    const selected: SelectedWebResult = {
      ...result,
      domain: parsed.hostname.toLowerCase(),
      normalizedUrl,
      discoveredByQueries: [result.query],
      discoveredByFamilies: [result.queryFamily],
      duplicateEvidenceCount: 0,
      retrieval: classifySearchResult(result),
      sourceRelationship: inferSourceRelationship(result),
    };
    byUrl.set(normalizedUrl, selected);
    byIdentity.set(identity, selected);
  }

  return { results: [...byUrl.values()], duplicates };
}

function recommendationRank(value: RetrievalClassification["recommendation"]): number {
  return value === "FETCH" ? 0 : value === "REVIEW" ? 1 : 2;
}

export function selectDiverseResults(
  results: readonly SelectedWebResult[],
  options: {
    maxResults: number;
    maxPerDomain: number;
    maxPerOrganization?: number;
    includeReview?: boolean;
  },
): SelectedWebResult[] {
  const eligible = results
    .filter(
      (result) =>
        result.retrieval.recommendation === "FETCH" ||
        (options.includeReview !== false &&
          result.retrieval.recommendation === "REVIEW"),
    )
    .sort(
      (left, right) =>
        recommendationRank(left.retrieval.recommendation) -
          recommendationRank(right.retrieval.recommendation) ||
        right.retrieval.score - left.retrieval.score ||
        left.rank - right.rank,
    );

  const byFamily = new Map<string, SelectedWebResult[]>();
  for (const result of eligible) {
    const family = result.discoveredByFamilies[0] ?? result.queryFamily;
    byFamily.set(family, [...(byFamily.get(family) ?? []), result]);
  }
  const families = [...byFamily.keys()].sort((left, right) => {
    const leftScore = byFamily.get(left)?.[0]?.retrieval.score ?? 0;
    const rightScore = byFamily.get(right)?.[0]?.retrieval.score ?? 0;
    return rightScore - leftScore;
  });

  const selected: SelectedWebResult[] = [];
  const domainCounts = new Map<string, number>();
  const organizationCounts = new Map<string, number>();
  const maxOrganization = Math.max(1, options.maxPerOrganization ?? 2);
  let advanced = true;

  while (advanced && selected.length < options.maxResults) {
    advanced = false;
    for (const family of families) {
      const bucket = byFamily.get(family);
      while (bucket?.length) {
        const candidate = bucket.shift();
        if (!candidate) {
          break;
        }
        const domainCount = domainCounts.get(candidate.domain) ?? 0;
        const organization = inferredOrganizationKey(candidate);
        const organizationCount = organization
          ? organizationCounts.get(organization) ?? 0
          : 0;
        if (
          domainCount >= options.maxPerDomain ||
          (organization && organizationCount >= maxOrganization)
        ) {
          continue;
        }
        selected.push(candidate);
        domainCounts.set(candidate.domain, domainCount + 1);
        if (organization) {
          organizationCounts.set(organization, organizationCount + 1);
        }
        advanced = true;
        break;
      }
      if (selected.length >= options.maxResults) {
        break;
      }
    }
  }

  return selected;
}

