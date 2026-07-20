import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { SearchExecutionDetail } from "@/features/projects/search-execution-activity";

import { HomeSearchResults } from "./home-search-results";

describe("PRIVATE_WEB home results UI", () => {
  it("labels partially verified results and their missing deadline", () => {
    const detail: SearchExecutionDetail = {
      execution: {
        id: "00000000-0000-4000-8000-000000000201",
        status: "PARTIALLY_COMPLETED",
        outcome: "PARTIALLY_COMPLETED",
        query: "desarrollo de software",
        createdAt: "2026-07-20T12:00:00.000Z",
        startedAt: "2026-07-20T12:00:00.000Z",
        completedAt: "2026-07-20T12:00:05.000Z",
        sourceType: "PRIVATE_WEB",
        profileName: "Sector privado — Brave Search",
        discoveryMode: "BRAVE_ONLY",
        searchProvider: "BRAVE",
        estimatedCost: "0.020000",
      },
      summary: {
        providerResults: 1,
        uniqueUrls: 1,
        uniqueDomains: 1,
        documentsFetched: 1,
        documentsExtracted: 1,
        candidatesFound: 1,
        candidatesFiltered: 0,
        candidatesVerified: 0,
        candidatesCreated: 1,
        candidatesUpdated: 0,
        candidatesUnchanged: 0,
        candidatesDiscarded: 0,
        saved: 1,
        rawCandidatesFound: 1,
        schemaValidCandidates: 1,
        normalizedCandidatesFound: 1,
      },
      discardCounts: {},
      candidates: [
        {
          temporaryId: "result-1",
          executionId: "00000000-0000-4000-8000-000000000201",
          searchResultId: "00000000-0000-4000-8000-000000000301",
          title: "RFP desarrollo de software",
          organizationName: "Fundación Ejemplo",
          summary: "Desarrollo de plataforma",
          officialSourceUrl: "https://fundacion.org.sv/rfp/software",
          applicationUrl: null,
          sourceDomain: "fundacion.org.sv",
          publishedAt: "2026-07-20T06:00:00.000Z",
          deadlineAt: null,
          estimatedAmount: null,
          currency: null,
          evidence: [],
          category: "SOFTWARE",
          stage: "PERSISTENCE",
          outcome: "UNVERIFIED",
          reasonCode: "PARTIALLY_VERIFIED",
          reason: "Fecha límite no confirmada. Requiere revisión manual.",
          retrievalScore: 10,
          preliminaryScore: 78,
          verificationStatus: "PARTIALLY_VERIFIED",
          discoveredByQueries: [],
          discoveredByFamilies: [],
        },
      ],
    };
    const html = renderToStaticMarkup(
      createElement(HomeSearchResults, { detail }),
    );
    expect(html).toContain("Verificación parcial");
    expect(html).toContain("No confirmada · revisión manual");
    expect(html).toContain("Fundación Ejemplo");
    expect(html).toContain("Fuente: fundacion.org.sv");
    expect(html).toContain("Publicada 20/7/2026");
  });

  it.each([
    ["FAILED", "No fue posible completar la búsqueda."],
    ["PARTIALLY_COMPLETED", "La búsqueda terminó parcialmente."],
    ["COMPLETED", "No encontramos oportunidades verificadas para esta búsqueda."],
  ] as const)("renders the %s empty state", (status, message) => {
    const detail = {
      execution: {
        id: "00000000-0000-4000-8000-000000000201",
        status,
        outcome: status,
        query: "software",
        createdAt: "2026-07-20T12:00:00.000Z",
        startedAt: "2026-07-20T12:00:00.000Z",
        completedAt: "2026-07-20T12:00:01.000Z",
        sourceType: "PRIVATE_WEB",
        profileName: "Sector privado",
        discoveryMode: "BRAVE_ONLY",
        searchProvider: "BRAVE",
        estimatedCost: "0",
      },
      summary: {
        providerResults: 0,
        uniqueUrls: 0,
        uniqueDomains: 0,
        documentsFetched: 0,
        documentsExtracted: 0,
        candidatesFound: 0,
        candidatesFiltered: 0,
        candidatesVerified: 0,
        candidatesCreated: 0,
        candidatesUpdated: 0,
        candidatesUnchanged: 0,
        candidatesDiscarded: 0,
        saved: 0,
        rawCandidatesFound: 0,
        schemaValidCandidates: 0,
        normalizedCandidatesFound: 0,
      },
      discardCounts: {},
      candidates: [],
    } satisfies SearchExecutionDetail;
    const html = renderToStaticMarkup(createElement(HomeSearchResults, { detail }));
    expect(html).toContain(message);
  });
});
