import { describe, expect, it } from "vitest";

import {
  HOME_SEARCH_SOURCES,
  defaultHomeSearchSource,
  homeSearchSourceLabel,
  resolveHomeSearchRequest,
} from "@/lib/home-search-source";

describe("home-search-source", () => {
  it("exposes the three selectable sources in order", () => {
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
  });

  it("defaults to sector privado", () => {
    expect(defaultHomeSearchSource).toBe("PRIVATE_WEB");
    expect(homeSearchSourceLabel("PRIVATE_WEB")).toBe("Sector privado");
  });

  it("resolves COMPRASAL to the sync endpoint without a query body", () => {
    expect(resolveHomeSearchRequest("COMPRASAL", "licitaciones software")).toEqual({
      endpoint: "/api/jobs/sync-comprasal",
      body: undefined,
      loadingMessage: "Sincronizando COMPRASAL…",
      requiresQuery: false,
    });
  });

  it("resolves grounded sources with query and sourceType", () => {
    expect(
      resolveHomeSearchRequest("PRIVATE_WEB", "RFP consultoría"),
    ).toEqual({
      endpoint: "/api/jobs/search-grounding",
      body: { sourceType: "PRIVATE_WEB", query: "RFP consultoría" },
      loadingMessage: "Buscando oportunidades…",
      requiresQuery: true,
    });

    expect(resolveHomeSearchRequest("LINKEDIN", "consultoría RFP")).toEqual({
      endpoint: "/api/jobs/search-grounding",
      body: { sourceType: "LINKEDIN", query: "consultoría RFP" },
      loadingMessage: "Buscando oportunidades…",
      requiresQuery: true,
    });
  });

  it("requires a query for grounded sources but not for COMPRASAL", () => {
    expect(resolveHomeSearchRequest("COMPRASAL", "").requiresQuery).toBe(false);
    expect(resolveHomeSearchRequest("PRIVATE_WEB", "ab").requiresQuery).toBe(
      true,
    );
    expect(resolveHomeSearchRequest("LINKEDIN", "abc").requiresQuery).toBe(
      true,
    );
  });
});
