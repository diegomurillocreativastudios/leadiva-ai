/**
 * Builds a short, human-readable title from the user's search text.
 * Returns null when there is no usable custom query.
 */
export function buildSearchExecutionTitle(
  userQuery: string | null | undefined,
  maxLength = 120,
): string | null {
  if (!userQuery) {
    return null;
  }

  const normalized = userQuery.trim().replace(/\s+/g, " ");
  if (normalized.length < 3) {
    return null;
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}
