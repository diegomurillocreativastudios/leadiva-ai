import { interestCategories } from "@/server/db/schema/enums";

export type SearchIntent = {
  id: string;
  family:
    | "explicit_procurement"
    | "outcome_hiring"
    | "project_solution"
    | "specific_services"
    | "procurement_pages"
    | "organizations"
    | "linkedin_discovery"
    | "regional";
  language: "es" | "en";
  query: string;
  priority: number;
  regional: boolean;
};

export type DiscoverySearchPlan = {
  intents: SearchIntent[];
  globalIntentCount: number;
  regionalIntentCount: number;
};

const CATEGORY_SEARCH_TERMS: Record<string, string[]> = {
  SOFTWARE: [
    "software development",
    "web application",
    "online platform",
    "system implementation",
    "application maintenance",
  ],
  IT: ["IT services", "cloud infrastructure", "managed hosting", "technical support"],
  CONSULTING: ["technology consulting", "digital transformation", "data analytics"],
  AI: ["AI implementation", "automation", "AI integration", "data platform"],
};

function resolveCategoryTerms(
  interestCats: readonly string[] | null | undefined,
): string[] {
  const categories =
    interestCats && interestCats.length > 0
      ? interestCats
      : [...interestCategories];
  return [
    ...new Set(
      categories.flatMap((category) =>
        CATEGORY_SEARCH_TERMS[category] ?? [category.toLowerCase()],
      ),
    ),
  ];
}

function firstService(
  interestCats: readonly string[] | null | undefined,
): string {
  return resolveCategoryTerms(interestCats)[0] ?? "software development";
}

/**
 * A deliberately broad, independently executable search plan. Geography is a
 * complementary family, never an AND condition imposed on the whole plan.
 */
export function buildDiscoverySearchPlan(params: {
  interestCategories?: readonly string[] | null;
  maxIntents?: number;
  regionalShare?: number;
  customQuery?: string;
  now?: Date;
} = {}): DiscoverySearchPlan {
  const service = firstService(params.interestCategories);
  const now = params.now ?? new Date();
  const year = now.getUTCFullYear();
  const nextMonth = new Date(Date.UTC(year, now.getUTCMonth() + 1, 1));
  const monthHint = nextMonth.toLocaleString("en-US", {
    month: "long",
    timeZone: "UTC",
  });
  const maxIntents = Math.max(1, params.maxIntents ?? 8);
  const regionalShare = Math.min(0.5, Math.max(0, params.regionalShare ?? 0.25));
  const maxRegional = Math.max(1, Math.floor(maxIntents * regionalShare));
  const global: SearchIntent[] = [
    {
      id: "procurement-en",
      family: "explicit_procurement",
      language: "en",
      query: `"open RFP" ${service} "proposals due" ${monthHint} ${year} OR technology services RFP`,
      priority: 100,
      regional: false,
    },
    {
      id: "procurement-es",
      family: "explicit_procurement",
      language: "es",
      query: `solicitud de propuestas ${service} convocatoria vigente ${year}`,
      priority: 99,
      regional: false,
    },
    {
      id: "outcome-en",
      family: "outcome_hiring",
      language: "en",
      query: `seeking technology partner OR looking for web development agency OR digital agency RFP "currently accepting" ${year}`,
      priority: 95,
      regional: false,
    },
    {
      id: "project-es",
      family: "project_solution",
      language: "es",
      query: `proveedor para desarrollo de plataforma OR rediseño sitio web OR implementación de sistemas ${year}`,
      priority: 94,
      regional: false,
    },
    {
      id: "services-en",
      family: "specific_services",
      language: "en",
      query: `website redesign vendor OR managed website hosting proposal OR cloud migration provider ${year}`,
      priority: 90,
      regional: false,
    },
    {
      id: "procurement-pages-en",
      family: "procurement_pages",
      language: "en",
      query: `procurement opportunities technology OR open tenders digital services ${year}`,
      priority: 85,
      regional: false,
    },
    {
      id: "organizations-es",
      family: "organizations",
      language: "es",
      query: `fundación ONG universidad convocatoria proveedor digital tecnología ${year}`,
      priority: 80,
      regional: false,
    },
    {
      id: "linkedin-en",
      family: "linkedin_discovery",
      language: "en",
      query: `site:linkedin.com/posts "looking for technology partner" OR "seeking agency" web development ${year}`,
      priority: 70,
      regional: false,
    },
  ];
  const regional: SearchIntent[] = [
    {
      id: "regional-es",
      family: "regional",
      language: "es",
      query: `convocatoria proveedor tecnológico desarrollo web Centroamérica OR Latinoamérica ${year}`,
      priority: 60,
      regional: true,
    },
    {
      id: "regional-en",
      family: "regional",
      language: "en",
      query: `technology vendor opportunity El Salvador OR Centroamérica OR Latinoamérica ${year}`,
      priority: 59,
      regional: true,
    },
  ];

  const custom = params.customQuery?.trim();
  if (custom) {
    global.unshift({
      id: "custom",
      family: "project_solution",
      language: /[áéíóúñ]/i.test(custom) ? "es" : "en",
      query: custom.slice(0, 500),
      priority: 110,
      regional: false,
    });
  }

  const selectedRegional = regional.slice(0, Math.min(maxRegional, regional.length));
  const selectedGlobal = global.slice(0, Math.max(0, maxIntents - selectedRegional.length));
  const intents = [...selectedGlobal, ...selectedRegional]
    .sort((a, b) => b.priority - a.priority)
    .slice(0, maxIntents);
  return {
    intents,
    globalIntentCount: intents.filter((intent) => !intent.regional).length,
    regionalIntentCount: intents.filter((intent) => intent.regional).length,
  };
}

/** Backward-compatible query list used by existing callers and diagnostics. */
export function buildDiscoveryQueries(
  interestCategories: readonly string[] | null | undefined,
  now: Date = new Date(),
): string[] {
  return buildDiscoverySearchPlan({ interestCategories, now }).intents.map(
    (intent) => intent.query,
  );
}

export function buildDefaultPrivateQuery(
  interestCategories: readonly string[] | null | undefined,
  now: Date = new Date(),
): string {
  return buildDiscoveryQueries(interestCategories, now).join("\n");
}

export function getGroundedSearchMode(
  sourceType: "PRIVATE_WEB" | "LINKEDIN",
): "PRIVATE_RFP" | "LINKEDIN" {
  return sourceType === "LINKEDIN" ? "LINKEDIN" : "PRIVATE_RFP";
}
