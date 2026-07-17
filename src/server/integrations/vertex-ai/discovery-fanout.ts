import type { GroundingSource } from "./grounding-sources";
import type { GroundedCandidate } from "./schemas";

export type DiscoveryPassResult = {
  text: string;
  finishReason: string | null;
  sources: GroundingSource[];
  searchQueries: string[];
  usage: { inputTokens: number; outputTokens: number };
  model: string;
  passIndex: number;
  queriesInPass: string[];
  family?: string;
  intentIds?: string[];
};

export function chunkDiscoveryQueries<T>(
  queries: readonly T[],
  batchSize = 2,
): T[][] {
  if (queries.length === 0) {
    return [];
  }

  const batches: T[][] = [];
  for (let index = 0; index < queries.length; index += batchSize) {
    batches.push(queries.slice(index, index + batchSize));
  }
  return batches;
}

function normalizedIdentity(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

/** Global, deterministic dedupe after all per-pass normalizations. */
export function deduplicateDiscoveryCandidates(
  candidates: readonly GroundedCandidate[],
): { candidates: GroundedCandidate[]; duplicates: number } {
  const accepted: GroundedCandidate[] = [];
  const seen = new Set<string>();
  let duplicates = 0;

  for (const candidate of candidates) {
    const urlKey = `url:${candidate.sourceUrl.trim().toLowerCase()}`;
    const identityKey = `identity:${normalizedIdentity(candidate.organizationName)}:${normalizedIdentity(candidate.title)}`;
    if (seen.has(urlKey) || (candidate.organizationName && seen.has(identityKey))) {
      duplicates += 1;
      continue;
    }
    seen.add(urlKey);
    if (candidate.organizationName) {
      seen.add(identityKey);
    }
    accepted.push(candidate);
  }

  return { candidates: accepted, duplicates };
}

/** Shared bounded-concurrency utility; preserves input order. */
export async function mapWithConcurrency<T, R>(
  values: readonly T[],
  maxConcurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(1, maxConcurrency), values.length) },
    async () => {
      while (next < values.length) {
        const index = next;
        next += 1;
        results[index] = await mapper(values[index] as T, index);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

export function mergeDiscoveryPasses(
  passes: readonly DiscoveryPassResult[],
): DiscoveryPassResult {
  const sourceByKey = new Map<string, GroundingSource>();
  const searchQueries: string[] = [];
  const seenQueries = new Set<string>();
  const textParts: string[] = [];
  let inputTokens = 0;
  let outputTokens = 0;

  for (const pass of passes) {
    inputTokens += pass.usage.inputTokens;
    outputTokens += pass.usage.outputTokens;

    if (pass.text.trim()) {
      textParts.push(pass.text.trim());
    }

    for (const query of pass.searchQueries) {
      const normalized = query.trim();
      if (normalized && !seenQueries.has(normalized)) {
        seenQueries.add(normalized);
        searchQueries.push(normalized);
      }
    }

    for (const source of pass.sources) {
      const existing = sourceByKey.get(source.equivalenceKey);
      if (!existing) {
        sourceByKey.set(source.equivalenceKey, { ...source });
        continue;
      }
      existing.supportCount += source.supportCount;
      existing.maxConfidence = Math.max(
        existing.maxConfidence ?? 0,
        source.maxConfidence ?? 0,
      ) || null;
      if (!existing.title && source.title) {
        existing.title = source.title;
      }
    }
  }

  return {
    text: textParts.join("\n\n"),
    finishReason: passes.at(-1)?.finishReason ?? null,
    sources: [...sourceByKey.values()],
    searchQueries,
    usage: { inputTokens, outputTokens },
    model: passes.at(-1)?.model ?? "",
    passIndex: passes.length,
    queriesInPass: passes.flatMap((pass) => pass.queriesInPass),
  };
}
