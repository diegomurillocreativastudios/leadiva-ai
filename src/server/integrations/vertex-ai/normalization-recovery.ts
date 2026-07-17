import { extractDomain } from "@/lib/normalization";

import type { GroundedCandidate } from "./schemas";
import type { GroundingSource } from "./grounding-sources";

export const NORMALIZATION_FAILURE_KINDS = [
  "EMPTY_MODEL_RESPONSE",
  "EMPTY_OPPORTUNITIES_ARRAY",
  "INVALID_JSON",
  "WRONG_ROOT_REJECTED",
  "ITEMS_PARTIALLY_INVALID",
  "MODEL_DISCARDED_ALL",
  "NORMALIZATION_REQUEST_FAILED",
  "INPUT_EMPTY",
  "INPUT_TRUNCATED",
] as const;

export type NormalizationFailureKind =
  (typeof NORMALIZATION_FAILURE_KINDS)[number];

export function adaptNormalizationRoot(payload: unknown): {
  items: unknown[] | null;
  adapted: boolean;
  originalRoot: "array" | "candidates" | "opportunities" | "results" | "unknown";
} {
  if (Array.isArray(payload)) {
    return { items: payload, adapted: true, originalRoot: "array" };
  }
  if (!payload || typeof payload !== "object") {
    return { items: null, adapted: false, originalRoot: "unknown" };
  }
  const value = payload as Record<string, unknown>;
  for (const key of ["candidates", "opportunities", "results"] as const) {
    if (Array.isArray(value[key])) {
      return { items: value[key], adapted: key !== "candidates", originalRoot: key };
    }
  }
  return { items: null, adapted: false, originalRoot: "unknown" };
}

function field(block: string, name: string): string | null {
  const match = block.match(new RegExp(`^${name}:\\s*(.+)$`, "im"));
  const value = match?.[1]?.trim() ?? "";
  return value && !/^not specified|unknown|n\/?a|null$/i.test(value)
    ? value
    : null;
}

function asDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Deterministic last-resort extraction. It only reads fields explicitly
 * present in grounded [OPPORTUNITY] blocks and binds every draft to a real
 * Grounding source, so normal filters and verification remain authoritative.
 */
export function recoverCandidatesFromRawBlocks(params: {
  rawText: string;
  sources: readonly GroundingSource[];
  maxCandidates: number;
}): GroundedCandidate[] {
  const blocks = params.rawText.match(/\[OPPORTUNITY\][\s\S]*?\[\/OPPORTUNITY\]/gi) ?? [];
  const recovered: GroundedCandidate[] = [];

  for (const [index, block] of blocks.entries()) {
    if (recovered.length >= params.maxCandidates || params.sources.length === 0) break;
    const title = field(block, "Title");
    if (!title || title.length < 3) continue;
    const source = params.sources[index % params.sources.length];
    if (!source) continue;
    const summary = field(block, "Summary");
    recovered.push({
      title: title.slice(0, 500),
      organizationName: field(block, "Organization")?.slice(0, 250) ?? null,
      // Never trust a URL only printed in model text. The original, grounded
      // URL retains the source-binding invariant required by prepare/verify.
      sourceUrl: source.url,
      snippet: summary?.slice(0, 2_000) ?? null,
      category: null,
      countryCode: null,
      workMode: "UNKNOWN",
      contractingSector: "UNKNOWN",
      estimatedAmount: null,
      currency: null,
      deadlineAt: asDate(field(block, "Deadline")),
    });
  }
  return recovered;
}

export function safeValidationError(raw: unknown, index: number) {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    index,
    title: typeof record.title === "string" ? record.title.slice(0, 160) : null,
    organizationName:
      typeof record.organizationName === "string"
        ? record.organizationName.slice(0, 160)
        : null,
    fields: Object.keys(record).slice(0, 20),
    sourceDomain:
      typeof record.sourceUrl === "string" ? extractDomain(record.sourceUrl) : null,
  };
}
