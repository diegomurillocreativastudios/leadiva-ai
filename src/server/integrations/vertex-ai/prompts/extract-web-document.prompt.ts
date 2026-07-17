import type { FetchedDocument } from "@/server/services/web-document-fetcher";

export const EXTRACT_WEB_DOCUMENT_PROMPT_VERSION = "v1";

export function buildExtractWebDocumentPrompt(params: {
  document: FetchedDocument;
  currentDate?: string;
}): string {
  const currentDate = params.currentDate ?? new Date().toISOString().slice(0, 10);
  return [
    "You extract private-sector procurement opportunities from one already-fetched document.",
    "You do not browse, search, follow links, score, filter, verify, or decide whether to apply.",
    "Extract every potential opportunity actually described in the document, including partial records.",
    "Use null, empty arrays, OTHER, or UNKNOWN when information is absent or ambiguous.",
    "Never invent dates, URLs, budgets, eligibility, organizations, methods, technologies, or evidence.",
    "A document may be irrelevant; in that case return an empty candidates array.",
    "Do not mark an item VERIFIED. Official-looking content still requires the downstream verifier.",
    "For every important field, copy short textual evidence from this document and use the supplied document URL.",
    "Dates may remain ISO date-only or ISO date-time strings; downstream sanitization normalizes them.",
    "The response schema is supplied separately. Return only JSON matching it; do not repeat the schema.",
    "Fields requested: title, buying organization and type, summary, requested services, technologies, publication date, deadline, timezone, budget, currency, amount status, application method and URL, geographic restrictions, contracting signals, category, country, work mode, sector, evidence, and confidence.",
    `Current date: ${currentDate}`,
    `Document URL: ${params.document.finalUrl}`,
    `Canonical URL: ${params.document.canonicalUrl ?? "UNKNOWN"}`,
    `Content type: ${params.document.contentType}`,
    `Document title: ${params.document.title ?? "UNKNOWN"}`,
    "",
    "DOCUMENT TEXT:",
    params.document.text.slice(0, 60_000),
  ].join("\n");
}

