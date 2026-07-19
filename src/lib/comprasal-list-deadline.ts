/** Prefers award-report cierre over the available-process stage end. */
export function preferComprasalClosingDeadline(params: {
  closesAt: string | Date | null | undefined;
  deadlineAt: string | Date | null | undefined;
}): string | null {
  const closesAt = toIsoString(params.closesAt);
  if (closesAt) {
    return closesAt;
  }
  return toIsoString(params.deadlineAt);
}

/**
 * Farthest closing dates first (still actionable), oldest last (already closed).
 * Missing dates sink to the end.
 */
export function compareComprasalClosingDeadlineDesc(
  left: string | null | undefined,
  right: string | null | undefined,
): number {
  const leftMs = toTimestamp(left);
  const rightMs = toTimestamp(right);

  if (leftMs === null && rightMs === null) {
    return 0;
  }
  if (leftMs === null) {
    return 1;
  }
  if (rightMs === null) {
    return -1;
  }
  return rightMs - leftMs;
}

function toIsoString(value: string | Date | null | undefined): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function toTimestamp(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}
