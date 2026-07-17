export const DISCOVER_PRIVATE_PROMPT_VERSION = "v11";

function formatCurrentDate(isoDate?: string): string {
  if (isoDate) {
    return isoDate;
  }
  return new Date().toISOString().slice(0, 10);
}

function sharedDiscoveryRules(params: {
  sourceType: "PRIVATE_WEB" | "LINKEDIN";
  interestCategories: string[];
  currentDate: string;
}): string[] {
  const categories =
    params.interestCategories.length > 0
      ? params.interestCategories.join(", ")
      : "SOFTWARE, IT, CONSULTING, AI";

  const sourceHint =
    params.sourceType === "LINKEDIN"
      ? "Prioritize public LinkedIn posts from BUYERS seeking technology providers. A LinkedIn post is preliminary only; prefer the linked official RFP/detail URL when available."
      : "Include private companies, foundations, NGOs, associations, universities, international organizations, and FOREIGN public-sector buyers (foreign governments, school districts, agencies).";

  return [
    `Preferred categories: ${categories}.`,
    "Do not require pages to mention El Salvador, Centroamérica, or LatAm.",
    "Discover global opportunities first, then evaluate geographic eligibility.",
    "Exclude job postings, courses, individual grants, office supplies, staffing/temp employment, and RFIs that are information-only with no award.",
    "Only exclude El Salvador GOVERNMENT procurement — COMPRASAL already covers Salvadoran public tenders. Foreign public-sector RFPs are welcome.",
    "Exclude competitor marketing pages that advertise their own services.",
    "Creativa wants to BID — return BUYER RFPs/RFQs and vendor convocatorias only for software/IT/AI/consulting work.",
    "",
    "STRICT OPENNESS RULE (most important):",
    `- Current date is ${params.currentDate}.`,
    `- ONLY include opportunities that are still open to apply AFTER ${params.currentDate}.`,
    `- If a deadline is on or before ${params.currentDate}, DO NOT include it — even if the page is from ${params.currentDate.slice(0, 4)}.`,
    "- Prefer pages that say open, currently accepting proposals, proposals due, closing date, or fecha límite with a future date.",
    "- Prefer official buyer pages over document mirrors (Scribd, SlideShare, aggregators).",
    "",
    "OUTPUT RULES:",
    "- Use [OPPORTUNITY] for grounded, still-open software/IT/AI/consulting RFPs that map to a search result.",
    "- Use [UNVERIFIED] only when the page is relevant but deadline/buyer cannot be confirmed.",
    "- Do NOT dump unrelated RFIs (office supplies, staffing) into either section.",
    "- If search returns multiple relevant sources, extract multiple [OPPORTUNITY] blocks — one per distinct open RFP.",
    sourceHint,
  ];
}

function opportunityOutputFormat(): string[] {
  return [
    "Return structured text using this format for each opportunity:",
    "",
    "[OPPORTUNITY]",
    "Title:",
    "Organization:",
    "Organization type:",
    "Summary:",
    "Published date:",
    "Deadline:",
    "Required services:",
    "Geographic eligibility:",
    "Application method:",
    "Official source URL:",
    "Application URL:",
    "Deadline evidence:",
    "Application evidence:",
    "[/OPPORTUNITY]",
    "",
    "If an opportunity seems relevant but cannot be verified, place it under [UNVERIFIED].",
    "Do not return JSON.",
    "Do not invent dates, URLs, budgets, or requirements.",
    "If nothing usable is found, say so explicitly.",
  ];
}

/** Focused scout prompt for a single fan-out pass (1–2 search intents). */
export function buildFocusedDiscoveryPrompt(params: {
  discoveryQueries: string[];
  sourceType: "PRIVATE_WEB" | "LINKEDIN";
  maxCandidates: number;
  interestCategories: string[];
  currentDate?: string;
  family?: string;
}): string {
  const currentDate = formatCurrentDate(params.currentDate);
  const intents = params.discoveryQueries
    .map((query, index) => `${index + 1}. ${query}`)
    .join("\n");

  return [
    `Current date: ${currentDate}.`,
    "",
    "Use Google Search to find real, currently OPEN buyer RFPs/RFQs for software, IT, AI, or consulting.",
    "A software company in El Salvador may bid globally unless the source restricts geography.",
    params.family ? `Discovery family for this pass: ${params.family}.` : "",
    "",
    ...sharedDiscoveryRules({ ...params, currentDate }),
    "",
    "Run these search intents:",
    intents,
    "",
    `Return between 3 and ${Math.min(params.maxCandidates, 5)} potential opportunities from this pass when evidence exists; never invent results to fill the quota.`,
    "Do not limit the research to pages using the words RFP, software, or licitación. Search for the project outcome, required provider, or service as well.",
    "Do not discard an opportunity because it does not mention El Salvador or Latin America. If no geography restriction is published, record eligibility as unknown for later evaluation.",
    "Every opportunity must be grounded in a real page returned by search.",
    `Do not return opportunities whose deadline is on or before ${currentDate}.`,
    "",
    ...opportunityOutputFormat(),
  ].join("\n");
}

export function buildDiscoverPrivateOpportunitiesPrompt(params: {
  discoveryQueries: string[];
  sourceType: "PRIVATE_WEB" | "LINKEDIN";
  maxCandidates: number;
  interestCategories: string[];
  currentDate?: string;
}): string {
  if (params.discoveryQueries.length <= 2) {
    return buildFocusedDiscoveryPrompt(params);
  }

  const currentDate = formatCurrentDate(params.currentDate);
  const intents = params.discoveryQueries
    .map((query, index) => `${index + 1}. ${query}`)
    .join("\n");

  return [
    `Current date: ${currentDate}.`,
    "",
    "Investigate real, currently OPEN opportunities for a software development company",
    "based in El Salvador to submit a proposal.",
    "",
    "Search for projects involving:",
    "- Software development",
    "- Website development and maintenance",
    "- Artificial intelligence",
    "- Automation",
    "- Cloud computing",
    "- DevOps",
    "- Technology consulting",
    "- UX/UI",
    "- Enterprise platforms",
    "",
    ...sharedDiscoveryRules({ ...params, currentDate }),
    "",
    "Suggested search intents (use as guidance; generate your own searches as needed):",
    intents,
    "",
    `Find between 5 and ${params.maxCandidates} still-open opportunities, but never invent results to fill the quota.`,
    `Do not return opportunities whose deadline is on or before ${currentDate}.`,
    "",
    "For each opportunity found, verify when possible:",
    "- Organization name",
    "- Opportunity title",
    "- Deadline (must be after current date)",
    "- Open / active status",
    "- Requested scope",
    "- Application method",
    "- Official source URL",
    "- Geographic eligibility",
    "- Evidence found in the source",
    "",
    ...opportunityOutputFormat(),
  ].join("\n");
}
