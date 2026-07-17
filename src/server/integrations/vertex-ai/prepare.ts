import {
  classifyPrivateCandidate,
  privateBatchDedupeKey,
  type PrivateDiscardReason,
  type PrivateRelevanceOptions,
  buildPrivateRelevanceOptions,
} from "./filters";
import {
  mapGroundedCandidate,
  type MappedGroundedSearchResult,
} from "./mapper";
import type { GroundedCandidate } from "./schemas";
import {
  findGroundingSourceForUrl,
  type GroundingSource,
} from "./grounding-sources";

export type PreparedPrivateCandidate = {
  candidate: GroundedCandidate;
  groundingSource: GroundingSource;
  mapped: MappedGroundedSearchResult;
};

export type PreparedPrivateDiscard = {
  reason: PrivateDiscardReason;
  detail: string;
  candidate: GroundedCandidate;
  title?: string;
  organizationName?: string;
  officialSourceUrl?: string;
};

export type PreparedPrivateBatch = {
  accepted: PreparedPrivateCandidate[];
  discarded: PreparedPrivateDiscard[];
  discardCounts: Record<PrivateDiscardReason, number>;
};

function discardTrace(
  candidate: GroundedCandidate,
  reason: PrivateDiscardReason,
  detail: string,
): PreparedPrivateDiscard {
  return {
    reason,
    detail,
    candidate,
    title: candidate.title,
    organizationName: candidate.organizationName ?? undefined,
    officialSourceUrl: candidate.sourceUrl,
  };
}

export function preparePrivateBatch(params: {
  sourceType: "PRIVATE_WEB" | "LINKEDIN";
  candidates: GroundedCandidate[];
  query: string;
  citations?: Array<{ uri?: string; title?: string }>;
  groundingSources?: GroundingSource[];
  relevance?: PrivateRelevanceOptions;
  now?: Date;
}): PreparedPrivateBatch {
  const relevance =
    params.relevance ?? buildPrivateRelevanceOptions();
  const now = params.now ?? new Date();
  const discardCounts: Record<PrivateDiscardReason, number> = {
    INVALID: 0,
    NOISE: 0,
    PUBLIC_SECTOR: 0,
    IRRELEVANT: 0,
    EXPIRED: 0,
    DUPLICATE_IN_BATCH: 0,
    UNREACHABLE: 0,
    UNGROUNDED_SOURCE: 0,
  };
  const discarded: PreparedPrivateBatch["discarded"] = [];
  const accepted: PreparedPrivateCandidate[] = [];
  const seen = new Set<string>();

  for (const candidate of params.candidates) {
    const groundingSource = findGroundingSourceForUrl(
      candidate.sourceUrl,
      params.groundingSources ?? [],
    );
    if (!groundingSource) {
      discardCounts.UNGROUNDED_SOURCE += 1;
      discarded.push(
        discardTrace(
          candidate,
          "UNGROUNDED_SOURCE",
          "La URL propuesta no aparece en la metadata de Google Search Grounding",
        ),
      );
      continue;
    }

    // Sector / opportunity / relevance / validity order lives in classifyPrivateCandidate.
    const decision = classifyPrivateCandidate(candidate, relevance, now);
    if (!decision.accept) {
      discardCounts[decision.reason] += 1;
      discarded.push(
        discardTrace(candidate, decision.reason, decision.detail),
      );
      continue;
    }

    const dedupeKeys = [
      privateBatchDedupeKey(candidate),
      (() => {
        try {
          const url = new URL(candidate.sourceUrl);
          url.hash = "";
          return `url:${url.toString().toLowerCase()}`;
        } catch {
          return null;
        }
      })(),
    ].filter((value): value is string => Boolean(value));

    if (dedupeKeys.some((key) => seen.has(key))) {
      discardCounts.DUPLICATE_IN_BATCH += 1;
      discarded.push(
        discardTrace(
          candidate,
          "DUPLICATE_IN_BATCH",
          "Duplicado dentro del lote de grounding",
        ),
      );
      continue;
    }
    for (const key of dedupeKeys) {
      seen.add(key);
    }

    const mapped = mapGroundedCandidate(params.sourceType, candidate, {
      query: params.query,
      citations: params.citations,
      preliminaryScore: decision.score,
      category: decision.category,
    });

    if (!mapped.normalizedUrl) {
      discardCounts.INVALID += 1;
      discarded.push(
        discardTrace(candidate, "INVALID", "Candidato sin URL normalizable"),
      );
      continue;
    }

    accepted.push({ candidate, groundingSource, mapped });
  }

  return { accepted, discarded, discardCounts };
}
