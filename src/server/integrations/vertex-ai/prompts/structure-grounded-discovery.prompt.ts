import type { LabeledGroundingSource } from "../grounding-sources";

export const STRUCTURE_GROUNDED_DISCOVERY_PROMPT_VERSION = "v4";

export function buildStructureGroundedDiscoveryPrompt(params: {
  rawText: string;
  groundedSources: ReadonlyArray<
    Pick<LabeledGroundingSource, "sourceId" | "title" | "domain">
  >;
  maxCandidates: number;
  interestCategories: string[];
  currentDate?: string;
  repair?: boolean;
}): string {
  const categories =
    params.interestCategories.length > 0
      ? params.interestCategories.join(", ")
      : "SOFTWARE, IT, CONSULTING, AI";
  const currentDate =
    params.currentDate ?? new Date().toISOString().slice(0, 10);

  const sourcesJson = JSON.stringify(
    params.groundedSources.map((source) => ({
      sourceId: source.sourceId,
      title: source.title,
      domain: source.domain,
    })),
  );

  return [
    "You normalize Google Search Grounding discovery results for Creativa Studios.",
    "You do NOT search the web. You only structure the preliminary discovery text using the ALLOWED SOURCES list.",
    "Your responsibility is extraction, not qualification: extract every candidate present in the input.",
    "Each candidate should reference one sourceId from ALLOWED SOURCES when possible.",
    "Never invent sourceIds, URLs, buyers, budgets, or deadlines. Use null or UNKNOWN when data is absent.",
    "Do not discard a candidate because deadline, budget, eligibility, application method, evidence, or organization type is missing.",
    "Do not decide whether Creativa should apply. Filtering, scoring, and verification happen after this step.",
    params.repair
      ? "This is one repair pass. Return the smallest valid JSON payload from the supplied text only; do not research or browse."
      : "",
    "Return ONLY valid JSON (no markdown) with this shape:",
    '{"candidates":[{"sourceId":"source_1","title":"...","organizationName":"...","snippet":"...","category":"SOFTWARE|IT|CONSULTING|AI|OTHER","countryCode":"US","workMode":"UNKNOWN","contractingSector":"PUBLIC|PRIVATE|UNKNOWN","estimatedAmount":null,"currency":null,"deadlineAt":null}]}',
    "",
    "Rules:",
    `- Max ${params.maxCandidates} candidates.`,
    `- Categories of interest: ${categories}; when uncertain use OTHER rather than dropping the item.`,
    `- Current date: ${currentDate}; preserve a date when printed, even if it may later be expired.`,
    "- Extract from both [OPPORTUNITY] and [UNVERIFIED] sections.",
    "- title MUST name the PROJECT/WORK being procured.",
    "- organizationName MUST be the BUYING organization.",
    "- countryCode: use the buyer's real country (US, MX, etc.). NEVER default to SV just because Creativa is in El Salvador. Use null when unknown.",
    "- contractingSector: PUBLIC for governments/agencies/school districts; PRIVATE for companies; UNKNOWN when unclear.",
    "- Use only sourceIds from ALLOWED SOURCES when assigning a sourceId; do not fabricate URLs.",
    "- Do NOT include sourceUrl fields; the backend owns URLs.",
    '- If nothing usable, return {"candidates":[]}.',
    "",
    `ALLOWED SOURCES: ${sourcesJson}`,
    "",
    "PRELIMINARY DISCOVERY TEXT:",
    params.rawText.slice(0, 24_000),
  ].join("\n");
}
