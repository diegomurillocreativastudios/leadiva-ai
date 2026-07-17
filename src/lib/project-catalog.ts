export const deadlineVigencies = ["ACTIVE", "EXPIRED", "UNKNOWN"] as const;
export type DeadlineVigency = (typeof deadlineVigencies)[number];

export const projectSortOptions = [
  "discovered_desc",
  "discovered_asc",
  "deadline_asc",
  "deadline_desc",
  "score_desc",
  "score_asc",
  "organization_asc",
] as const;

export type ProjectSortOption = (typeof projectSortOptions)[number];

export function getDeadlineVigency(
  deadlineAt: Date | string | null | undefined,
  now: Date = new Date(),
): DeadlineVigency {
  if (!deadlineAt) {
    return "UNKNOWN";
  }

  const deadline =
    deadlineAt instanceof Date ? deadlineAt : new Date(deadlineAt);

  if (Number.isNaN(deadline.getTime())) {
    return "UNKNOWN";
  }

  return deadline.getTime() >= now.getTime() ? "ACTIVE" : "EXPIRED";
}

export function isProjectActive(
  deadlineAt: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  const vigency = getDeadlineVigency(deadlineAt, now);
  return vigency === "ACTIVE" || vigency === "UNKNOWN";
}

export type DuplicateCandidate = {
  id: string;
  organizationName: string | null;
  contentHash: string | null;
};

export type DuplicateSignal = {
  isPossibleDuplicate: boolean;
  reason: string | null;
};

/**
 * Marks candidates that share a content hash with another row in the corpus.
 * Same organization alone is not a duplicate (common for COMPRASAL orgs).
 */
export function buildDuplicateSignals(
  pageItems: DuplicateCandidate[],
  corpus: DuplicateCandidate[],
): Map<string, DuplicateSignal> {
  const hashCounts = new Map<string, number>();

  for (const item of corpus) {
    if (item.contentHash) {
      hashCounts.set(item.contentHash, (hashCounts.get(item.contentHash) ?? 0) + 1);
    }
  }

  const signals = new Map<string, DuplicateSignal>();

  for (const item of pageItems) {
    const hashDup =
      item.contentHash !== null && (hashCounts.get(item.contentHash) ?? 0) > 1;

    if (hashDup) {
      signals.set(item.id, {
        isPossibleDuplicate: true,
        reason: "Mismo content hash que otro candidato",
      });
      continue;
    }

    signals.set(item.id, {
      isPossibleDuplicate: false,
      reason: null,
    });
  }

  return signals;
}

export function buildProjectsQueryString(
  params: Record<string, string | number | undefined | null>,
): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    search.set(key, String(value));
  }

  const query = search.toString();
  return query ? `?${query}` : "";
}
