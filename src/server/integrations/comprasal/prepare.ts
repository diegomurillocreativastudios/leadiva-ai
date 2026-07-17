import {
  batchDedupeKey,
  classifyComprasalProcess,
  type ComprasalDiscardReason,
  type ComprasalRelevanceOptions,
} from "./filters";
import {
  mapComprasalProcessToSearchResult,
  type MappedComprasalSearchResult,
} from "./mapper";
import { buildRelevanceOptions } from "./relevance";
import type { ComprasalProcess } from "./schemas";

export type PreparedComprasalCandidate = {
  process: ComprasalProcess;
  mapped: MappedComprasalSearchResult;
};

export type PreparedComprasalBatch = {
  accepted: PreparedComprasalCandidate[];
  discarded: Array<{
    reason: ComprasalDiscardReason;
    detail: string;
  }>;
  discardCounts: Record<ComprasalDiscardReason, number>;
};

export function prepareComprasalBatch(
  processes: ComprasalProcess[],
  now: Date = new Date(),
  relevance: ComprasalRelevanceOptions = buildRelevanceOptions(),
): PreparedComprasalBatch {
  const discardCounts: Record<ComprasalDiscardReason, number> = {
    INVALID: 0,
    HISTORICAL: 0,
    NOISE: 0,
    IRRELEVANT: 0,
    DUPLICATE_IN_BATCH: 0,
  };
  const discarded: PreparedComprasalBatch["discarded"] = [];
  const accepted: PreparedComprasalCandidate[] = [];
  const seen = new Set<string>();

  for (const process of processes) {
    const decision = classifyComprasalProcess(process, now, relevance);
    if (!decision.accept) {
      discardCounts[decision.reason] += 1;
      discarded.push({
        reason: decision.reason,
        detail: decision.detail,
      });
      continue;
    }

    const key = batchDedupeKey(process);
    if (seen.has(key)) {
      discardCounts.DUPLICATE_IN_BATCH += 1;
      discarded.push({
        reason: "DUPLICATE_IN_BATCH",
        detail: "Duplicado dentro del lote sincronizado",
      });
      continue;
    }
    seen.add(key);

    const mapped = mapComprasalProcessToSearchResult(process, {
      preliminaryScore: decision.score ?? null,
    });
    if (!mapped.externalId && !mapped.normalizedUrl) {
      discardCounts.INVALID += 1;
      discarded.push({
        reason: "INVALID",
        detail: "Mapped process without identity",
      });
      continue;
    }

    accepted.push({ process, mapped });
  }

  return { accepted, discarded, discardCounts };
}
