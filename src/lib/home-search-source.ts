export const homeSearchSourceIds = [
  "COMPRASAL",
  "PRIVATE_WEB",
  "LINKEDIN",
] as const;

export type HomeSearchSourceId = (typeof homeSearchSourceIds)[number];

export const defaultHomeSearchSource: HomeSearchSourceId = "COMPRASAL";

/** Max length for Sector privado / LinkedIn free-text queries. */
export const GROUNDED_HOME_QUERY_MAX_LENGTH = 100;

export const HOME_SEARCH_SOURCES = [
  { id: "COMPRASAL", label: "Comprasal" },
  { id: "PRIVATE_WEB", label: "Sector privado" },
  { id: "LINKEDIN", label: "LinkedIn" },
] as const satisfies ReadonlyArray<{
  id: HomeSearchSourceId;
  label: string;
}>;

/** Sources shown in the home search picker. Others stay defined for a later release. */
const SELECTABLE_HOME_SEARCH_SOURCE_IDS = [
  "COMPRASAL",
] as const satisfies ReadonlyArray<HomeSearchSourceId>;

export const SELECTABLE_HOME_SEARCH_SOURCES = HOME_SEARCH_SOURCES.filter(
  (source) =>
    (SELECTABLE_HOME_SEARCH_SOURCE_IDS as readonly HomeSearchSourceId[]).includes(
      source.id,
    ),
);

type GroundedSearchBody = {
  sourceType: "PRIVATE_WEB" | "LINKEDIN";
  query: string;
};

type ComprasalSearchBody = {
  sourceType: "COMPRASAL";
  query: string;
};

export type HomeSearchRequest = {
  endpoint: "/api/jobs/search-comprasal" | "/api/jobs/search-grounding";
  body: GroundedSearchBody | ComprasalSearchBody;
  loadingMessage: string;
  requiresQuery: boolean;
};

export function homeSearchSourceLabel(source: HomeSearchSourceId): string {
  const match = HOME_SEARCH_SOURCES.find((item) => item.id === source);
  return match?.label ?? source;
}

export function resolveHomeSearchRequest(
  source: HomeSearchSourceId,
  query: string,
): HomeSearchRequest {
  if (source === "COMPRASAL") {
    return {
      endpoint: "/api/jobs/search-comprasal",
      body: { sourceType: "COMPRASAL", query },
      loadingMessage: "Buscando en COMPRASAL…",
      requiresQuery: true,
    };
  }

  return {
    endpoint: "/api/jobs/search-grounding",
    body: {
      sourceType: source,
      query,
    },
    loadingMessage: "Buscando oportunidades…",
    requiresQuery: true,
  };
}
