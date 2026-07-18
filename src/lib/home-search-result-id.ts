const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PERSISTED_RESULT_TEMPORARY_ID_RE =
  /^result-([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

/** Extracts a search_results id from a home candidate temporaryId when persisted. */
export function homeSearchResultIdFromTemporaryId(
  temporaryId: string,
): string | null {
  const match = PERSISTED_RESULT_TEMPORARY_ID_RE.exec(temporaryId.trim());
  return match?.[1] ?? null;
}

/** Resolves the search_results id used to open a home lead detail page. */
export function resolveHomeSearchResultId(candidate: {
  searchResultId?: string | null;
  temporaryId: string;
}): string | null {
  const explicit = candidate.searchResultId?.trim();
  if (explicit && isUuid(explicit)) {
    return explicit;
  }

  return homeSearchResultIdFromTemporaryId(candidate.temporaryId);
}

/**
 * Path key for a home result card.
 * Prefers a persisted search_results id; otherwise uses temporaryId so the
 * card still navigates to an in-app detail view.
 */
export function homeSearchResultLeadKey(candidate: {
  searchResultId?: string | null;
  temporaryId: string;
}): string {
  return (
    resolveHomeSearchResultId(candidate) ?? candidate.temporaryId.trim()
  );
}
