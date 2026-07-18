export const homeSearchSourceIds = [
  "COMPRASAL",
  "PRIVATE_WEB",
  "LINKEDIN",
] as const;

export type HomeSearchSourceId = (typeof homeSearchSourceIds)[number];

export const defaultHomeSearchSource: HomeSearchSourceId = "PRIVATE_WEB";

export const HOME_SEARCH_SOURCES = [
  { id: "COMPRASAL", label: "Comprasal" },
  { id: "PRIVATE_WEB", label: "Sector privado" },
  { id: "LINKEDIN", label: "LinkedIn" },
] as const satisfies ReadonlyArray<{
  id: HomeSearchSourceId;
  label: string;
}>;

type GroundedSearchBody = {
  sourceType: "PRIVATE_WEB" | "LINKEDIN";
  query: string;
};

export type HomeSearchRequest = {
  endpoint: "/api/jobs/sync-comprasal" | "/api/jobs/search-grounding";
  body: GroundedSearchBody | undefined;
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
      endpoint: "/api/jobs/sync-comprasal",
      body: undefined,
      loadingMessage: "Sincronizando COMPRASAL…",
      requiresQuery: false,
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
