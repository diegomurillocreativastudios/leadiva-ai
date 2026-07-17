import type { StructuredGroundingCandidate } from "./grounding-sources";
import { normalizedCandidateDraftSchema } from "./schemas";

function asStructuredCandidate(
  raw: unknown,
): StructuredGroundingCandidate | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const parsed = normalizedCandidateDraftSchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  const record = parsed.data as Record<string, unknown>;
  const sourceId =
    typeof record.sourceId === "string" ? record.sourceId.trim() : "";
  const title = typeof record.title === "string" ? record.title.trim() : "";
  if (title.length < 3) {
    return null;
  }

  return {
    sourceId,
    title,
    organizationName:
      typeof record.organizationName === "string"
        ? record.organizationName
        : null,
    snippet: typeof record.snippet === "string" ? record.snippet : null,
    category: typeof record.category === "string" ? record.category : null,
    countryCode:
      typeof record.countryCode === "string" ? record.countryCode : null,
    workMode: typeof record.workMode === "string" ? record.workMode : null,
    contractingSector:
      typeof record.contractingSector === "string"
        ? record.contractingSector
        : null,
    estimatedAmount:
      typeof record.estimatedAmount === "number"
        ? record.estimatedAmount
        : null,
    currency: typeof record.currency === "string" ? record.currency : null,
    deadlineAt:
      typeof record.deadlineAt === "string" ? record.deadlineAt : null,
  };
}

/** Keeps valid items when one candidate fails local shape checks. */
export function partitionStructuredCandidates(rawCandidates: unknown[]): {
  valid: StructuredGroundingCandidate[];
  invalidCount: number;
} {
  const valid: StructuredGroundingCandidate[] = [];
  let invalidCount = 0;
  for (const raw of rawCandidates) {
    const candidate = asStructuredCandidate(raw);
    if (candidate) {
      valid.push(candidate);
    } else {
      invalidCount += 1;
    }
  }
  return { valid, invalidCount };
}
