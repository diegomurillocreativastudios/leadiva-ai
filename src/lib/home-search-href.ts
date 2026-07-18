/** Builds the home URL that shows a search execution's results in-place. */
export function homeSearchHref(executionId?: string): string {
  return executionId ? `/b/${encodeURIComponent(executionId)}` : "/";
}

/** Builds the home URL for a single search result (lead) detail. */
export function homeSearchResultHref(
  executionId: string,
  leadId: string,
): string {
  return `/b/${encodeURIComponent(executionId)}/${encodeURIComponent(leadId)}`;
}
