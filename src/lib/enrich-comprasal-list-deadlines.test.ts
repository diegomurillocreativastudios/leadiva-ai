import { describe, expect, it, vi } from "vitest";

import type { SearchExecutionDetail } from "@/features/projects/search-execution-activity";

vi.mock(
  "@/server/integrations/comprasal/award-report-closing-dates",
  () => ({
    loadComprasalClosingDatesByProcessIds: vi.fn(async () => {
      const map = new Map<number, string>();
      map.set(135317, "2024-10-01T22:25:00.000Z");
      map.set(135318, "2026-08-10T23:59:59.000Z");
      return map;
    }),
  }),
);

import {
  enrichComprasalListDeadlines,
  processIdFromComprasalPublicUrl,
} from "@/lib/enrich-comprasal-list-deadlines";

function candidate(params: {
  temporaryId: string;
  searchResultId: string;
  title: string;
  processId: number;
  deadlineAt: string;
}) {
  return {
    temporaryId: params.temporaryId,
    executionId: "00000000-0000-4000-8000-000000000001",
    searchResultId: params.searchResultId,
    title: params.title,
    organizationName: "MINEDUCYT",
    summary: null,
    officialSourceUrl: `https://www.comprasal.gob.sv/procesos-publicos/${params.processId}`,
    applicationUrl: null,
    sourceDomain: "www.comprasal.gob.sv",
    deadlineAt: params.deadlineAt,
    category: "SOFTWARE",
    stage: "PERSISTENCE" as const,
    outcome: "VERIFIED" as const,
    reasonCode: null,
    reason: null,
    retrievalScore: null,
    preliminaryScore: 80,
    verificationStatus: "VERIFIED",
    discoveredByQueries: [],
    discoveredByFamilies: [],
  };
}

function detail(
  overrides: Partial<SearchExecutionDetail["execution"]> = {},
  candidates: SearchExecutionDetail["candidates"] = [
    candidate({
      temporaryId: "result-1",
      searchResultId: "00000000-0000-4000-8000-000000000002",
      title: "Proceso antiguo",
      processId: 135317,
      deadlineAt: "2026-08-10T23:59:59.000Z",
    }),
  ],
): SearchExecutionDetail {
  return {
    execution: {
      id: "00000000-0000-4000-8000-000000000001",
      status: "COMPLETED",
      outcome: null,
      query: "desarrollo de software",
      createdAt: "2026-07-19T00:00:00.000Z",
      startedAt: null,
      completedAt: null,
      sourceType: "COMPRASAL",
      profileName: "COMPRASAL",
      discoveryMode: null,
      searchProvider: null,
      estimatedCost: null,
      ...overrides,
    },
    summary: {
      providerResults: 0,
      uniqueUrls: 0,
      uniqueDomains: 0,
      documentsFetched: 0,
      documentsExtracted: 0,
      candidatesFound: candidates.length,
      candidatesFiltered: 0,
      candidatesVerified: candidates.length,
      candidatesCreated: candidates.length,
      candidatesUpdated: 0,
      candidatesUnchanged: 0,
      candidatesDiscarded: 0,
      saved: candidates.length,
      rawCandidatesFound: candidates.length,
      schemaValidCandidates: candidates.length,
      normalizedCandidatesFound: candidates.length,
    },
    discardCounts: {},
    candidates,
  };
}

describe("enrichComprasalListDeadlines", () => {
  it("parses the public COMPRASAL process id from the official URL", () => {
    expect(
      processIdFromComprasalPublicUrl(
        "https://www.comprasal.gob.sv/procesos-publicos/135317",
      ),
    ).toBe(135317);
  });

  it("prefers fecha_cierre on COMPRASAL list candidates", async () => {
    const enriched = await enrichComprasalListDeadlines(detail());
    expect(enriched.candidates[0]?.deadlineAt).toBe(
      "2024-10-01T22:25:00.000Z",
    );
  });

  it("sorts COMPRASAL candidates from farthest to oldest cierre", async () => {
    const enriched = await enrichComprasalListDeadlines(
      detail(undefined, [
        candidate({
          temporaryId: "result-old",
          searchResultId: "00000000-0000-4000-8000-000000000002",
          title: "Cierre antiguo",
          processId: 135317,
          deadlineAt: "2026-01-01T00:00:00.000Z",
        }),
        candidate({
          temporaryId: "result-far",
          searchResultId: "00000000-0000-4000-8000-000000000003",
          title: "Cierre lejano",
          processId: 135318,
          deadlineAt: "2026-01-02T00:00:00.000Z",
        }),
      ]),
    );

    expect(enriched.candidates.map((item) => item.title)).toEqual([
      "Cierre lejano",
      "Cierre antiguo",
    ]);
    expect(enriched.candidates.map((item) => item.deadlineAt)).toEqual([
      "2026-08-10T23:59:59.000Z",
      "2024-10-01T22:25:00.000Z",
    ]);
  });

  it("leaves non-COMPRASAL executions unchanged", async () => {
    const source = detail({ sourceType: "PRIVATE_WEB" });
    const enriched = await enrichComprasalListDeadlines(source);
    expect(enriched.candidates[0]?.deadlineAt).toBe(
      "2026-08-10T23:59:59.000Z",
    );
  });
});
