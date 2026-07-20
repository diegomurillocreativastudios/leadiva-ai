import { describe, expect, it } from "vitest";

import {
  GROUNDED_HOME_QUERY_MAX_LENGTH,
  HOME_SEARCH_SOURCES,
  SELECTABLE_HOME_SEARCH_SOURCES,
  defaultHomeSearchSource,
  homeSearchSourceLabel,
  resolveHomeSearchRequest,
} from "@/lib/home-search-source";
import { homeSearchHref } from "@/lib/home-search-href";

describe("home-search-source", () => {
  it("limits grounded free-text queries to 100 characters", () => {
    expect(GROUNDED_HOME_QUERY_MAX_LENGTH).toBe(100);
  });

  it("exposes Comprasal and Sector privado while keeping LinkedIn legacy hidden", () => {
    expect(HOME_SEARCH_SOURCES.map((source) => source.id)).toEqual([
      "COMPRASAL",
      "PRIVATE_WEB",
      "LINKEDIN",
    ]);
    expect(HOME_SEARCH_SOURCES.map((source) => source.label)).toEqual([
      "Comprasal",
      "Sector privado",
      "LinkedIn",
    ]);
    expect(SELECTABLE_HOME_SEARCH_SOURCES.map((source) => source.id)).toEqual([
      "COMPRASAL",
      "PRIVATE_WEB",
    ]);
    expect(SELECTABLE_HOME_SEARCH_SOURCES.map((source) => source.label)).toEqual([
      "Comprasal",
      "Sector privado",
    ]);
  });

  it("defaults to COMPRASAL", () => {
    expect(defaultHomeSearchSource).toBe("COMPRASAL");
    expect(homeSearchSourceLabel("COMPRASAL")).toBe("Comprasal");
  });

  it("resolves COMPRASAL to its search endpoint with the submitted query", () => {
    expect(resolveHomeSearchRequest("COMPRASAL", "licitaciones software")).toEqual({
      endpoint: "/api/jobs/search-comprasal",
      body: {
        sourceType: "COMPRASAL",
        query: "licitaciones software",
      },
      loadingMessage: "Buscando en COMPRASAL…",
      requiresQuery: true,
    });
  });

  it("resolves PRIVATE_WEB to its dedicated route and leaves LINKEDIN legacy unchanged", () => {
    expect(
      resolveHomeSearchRequest("PRIVATE_WEB", "RFP consultoría"),
    ).toEqual({
      endpoint: "/api/jobs/search-private-web",
      body: { sourceType: "PRIVATE_WEB", query: "RFP consultoría" },
      loadingMessage: "Buscando oportunidades privadas…",
      requiresQuery: true,
    });

    expect(resolveHomeSearchRequest("LINKEDIN", "consultoría RFP")).toEqual({
      endpoint: "/api/jobs/search-grounding",
      body: { sourceType: "LINKEDIN", query: "consultoría RFP" },
      loadingMessage: "Buscando oportunidades…",
      requiresQuery: true,
    });
  });

  it("requires a query for every source", () => {
    expect(resolveHomeSearchRequest("COMPRASAL", "").requiresQuery).toBe(true);
    expect(resolveHomeSearchRequest("PRIVATE_WEB", "ab").requiresQuery).toBe(
      true,
    );
    expect(resolveHomeSearchRequest("LINKEDIN", "abc").requiresQuery).toBe(
      true,
    );
  });

  it("navigates a completed COMPRASAL search by executionId", () => {
    const response = { executionId: "00000000-0000-4000-8000-000000000201" };
    expect(homeSearchHref(response.executionId)).toBe(
      "/b/00000000-0000-4000-8000-000000000201",
    );
  });
});
