import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  db: { select: mocks.select, update: mocks.update },
}));

import {
  getUserAssociatedSearchResultDetail,
  getUserSearchExecutionDetail,
  getUserSearchExecutionResultDetail,
  isInteractiveUserSearchExecution,
  readExecutionCandidateResultIds,
} from "./search-execution.service";

const EXECUTION_ID = "00000000-0000-4000-8000-000000000201";
const RESULT_ID = "00000000-0000-4000-8000-000000000101";
const OTHER_RESULT_ID = "00000000-0000-4000-8000-000000000102";

function ownedExecutionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: EXECUTION_ID,
    status: "COMPLETED",
    candidatesFound: 1,
    candidatesDiscarded: 0,
    estimatedCost: "0",
    metrics: {
      query: "software",
      searchMode: "AVAILABLE_SEARCH",
      executionCandidates: [
        {
          temporaryId: `result-${RESULT_ID}`,
          searchResultId: RESULT_ID,
          title: "Licencias de software",
          officialSourceUrl:
            "https://www.comprasal.gob.sv/procesos-publicos/121645",
          stage: "PERSISTENCE",
          outcome: "UNCHANGED",
          preliminaryScore: 72,
          verificationStatus: "VERIFIED",
        },
      ],
    },
    startedAt: new Date("2026-07-18T12:00:00.000Z"),
    completedAt: new Date("2026-07-18T12:00:01.000Z"),
    createdAt: new Date("2026-07-18T12:00:00.000Z"),
    sourceType: "COMPRASAL",
    profileName: "COMPRASAL — búsqueda de oportunidades",
    ...overrides,
  };
}

function ownedExecutionSelect(row: ReturnType<typeof ownedExecutionRow> | null) {
  return {
    from: () => ({
      innerJoin: () => ({
        where: () => ({ limit: async () => (row ? [row] : []) }),
      }),
    }),
  };
}

function associatedCandidatesSelect(rows: unknown[]) {
  return {
    from: () => ({
      innerJoin: () => ({
        leftJoin: () => ({
          where: () => ({
            orderBy: () => ({ limit: async () => rows }),
          }),
        }),
      }),
    }),
  };
}

function legacyCandidatesSelect(rows: unknown[]) {
  return {
    from: () => ({
      leftJoin: () => ({
        where: () => ({ limit: async () => rows }),
      }),
    }),
  };
}

function associationExistsSelect(row: unknown | null) {
  return {
    from: () => ({
      where: () => ({ limit: async () => (row ? [row] : []) }),
    }),
  };
}

function exactAssociationSelect(row: unknown | null) {
  return {
    from: () => ({
      innerJoin: () => ({
        leftJoin: () => ({
          where: () => ({ limit: async () => (row ? [row] : []) }),
        }),
      }),
    }),
  };
}

function resultDetailSelect(row: unknown | null) {
  return {
    from: () => ({
      leftJoin: () => ({
        where: () => ({ limit: async () => (row ? [row] : []) }),
      }),
    }),
  };
}

function strictAssociatedResultSelect(row: unknown | null) {
  return {
    from: () => ({
      innerJoin: () => ({
        leftJoin: () => ({
          where: () => ({ limit: async () => (row ? [row] : []) }),
        }),
      }),
    }),
  };
}

function associatedCandidate(userState: string | null = null) {
  return {
    id: RESULT_ID,
    title: "Licencias de software",
    organizationName: "Ministerio de Tecnología",
    summary: null,
    officialSourceUrl:
      "https://www.comprasal.gob.sv/procesos-publicos/121645",
    sourceDomain: "www.comprasal.gob.sv",
    deadlineAt: new Date("2026-08-01T23:59:59.000Z"),
    category: "SOFTWARE",
    preliminaryScore: 88,
    rank: 1,
    verificationStatus: "VERIFIED",
    verificationReason: null,
    deletedAt: null,
    userState,
  };
}

describe("search execution result isolation", () => {
  beforeEach(() => {
    mocks.select.mockReset();
    mocks.update.mockReset();
  });

  it("does not classify the historical global sync as interactive history", () => {
    expect(isInteractiveUserSearchExecution("COMPRASAL", null)).toBe(false);
    expect(
      isInteractiveUserSearchExecution("COMPRASAL", {
        searchMode: "AVAILABLE_SEARCH",
      }),
    ).toBe(true);
  });

  it("caps a legacy JSONB UUID list before building an IN query", () => {
    const executionCandidates = Array.from({ length: 1_200 }, (_, index) => ({
      searchResultId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    }));
    expect(readExecutionCandidateResultIds({ executionCandidates })).toHaveLength(
      1_000,
    );
  });

  it("uses the execution association as source of truth for score and ordering", async () => {
    mocks.select
      .mockImplementationOnce(() => ownedExecutionSelect(ownedExecutionRow()))
      .mockImplementationOnce(() =>
        associatedCandidatesSelect([associatedCandidate()]),
      );

    const detail = await getUserSearchExecutionDetail({
      executionId: EXECUTION_ID,
      userId: "00000000-0000-4000-8000-000000000401",
    });
    expect(detail?.candidates).toMatchObject([
      { searchResultId: RESULT_ID, preliminaryScore: 88 },
    ]);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("keeps the bounded legacy executionCandidates fallback", async () => {
    mocks.select
      .mockImplementationOnce(() => ownedExecutionSelect(ownedExecutionRow()))
      .mockImplementationOnce(() => associatedCandidatesSelect([]))
      .mockImplementationOnce(() =>
        legacyCandidatesSelect([
          {
            ...associatedCandidate(),
            preliminaryScore: 12,
            rank: null,
          },
        ]),
      );
    const detail = await getUserSearchExecutionDetail({
      executionId: EXECUTION_ID,
      userId: "00000000-0000-4000-8000-000000000401",
    });
    expect(detail?.candidates).toMatchObject([
      { searchResultId: RESULT_ID, preliminaryScore: 72 },
    ]);
  });

  it("never turns PRIVATE_WEB_BRAVE metrics traces into visible results", async () => {
    mocks.select
      .mockImplementationOnce(() =>
        ownedExecutionSelect(
          ownedExecutionRow({
            sourceType: "PRIVATE_WEB",
            metrics: {
              searchMode: "PRIVATE_WEB_BRAVE",
              searchProvider: "BRAVE",
              executionCandidates: [
                {
                  searchResultId: OTHER_RESULT_ID,
                  title: "Trace rechazado",
                  outcome: "REJECTED",
                },
              ],
            },
          }),
        ),
      )
      .mockImplementationOnce(() => associatedCandidatesSelect([]));
    const detail = await getUserSearchExecutionDetail({
      executionId: EXECUTION_ID,
      userId: "00000000-0000-4000-8000-000000000401",
    });
    expect(detail?.candidates).toEqual([]);
    expect(mocks.select).toHaveBeenCalledTimes(2);
  });

  it("hides an associated result dismissed only by the current user", async () => {
    mocks.select
      .mockImplementationOnce(() => ownedExecutionSelect(ownedExecutionRow()))
      .mockImplementationOnce(() =>
        associatedCandidatesSelect([associatedCandidate("DISMISSED")]),
      );
    const detail = await getUserSearchExecutionDetail({
      executionId: EXECUTION_ID,
      userId: "00000000-0000-4000-8000-000000000401",
    });
    expect(detail?.candidates).toEqual([]);
  });

  it("does not reintroduce a dismissed legacy result from metrics", async () => {
    mocks.select
      .mockImplementationOnce(() => ownedExecutionSelect(ownedExecutionRow()))
      .mockImplementationOnce(() => associatedCandidatesSelect([]))
      .mockImplementationOnce(() =>
        legacyCandidatesSelect([
          {
            ...associatedCandidate("DISMISSED"),
            preliminaryScore: 12,
            rank: null,
          },
        ]),
      );
    const detail = await getUserSearchExecutionDetail({
      executionId: EXECUTION_ID,
      userId: "00000000-0000-4000-8000-000000000401",
    });
    expect(detail?.candidates).toEqual([]);
  });

  it("rejects user B before reading user A's execution results", async () => {
    mocks.select.mockImplementationOnce(() => ownedExecutionSelect(null));
    const detail = await getUserSearchExecutionDetail({
      executionId: EXECUTION_ID,
      userId: "00000000-0000-4000-8000-000000000402",
    });
    expect(detail).toBeNull();
    expect(mocks.select).toHaveBeenCalledTimes(1);
  });

  it("opens only a UUID associated with the owned execution", async () => {
    mocks.select
      .mockImplementationOnce(() => ownedExecutionSelect(ownedExecutionRow()))
      .mockImplementationOnce(() =>
        associationExistsSelect({ searchResultId: RESULT_ID }),
      )
      .mockImplementationOnce(() =>
        exactAssociationSelect({ searchResultId: RESULT_ID, userState: null }),
      )
      .mockImplementationOnce(() =>
        resultDetailSelect({
          id: RESULT_ID,
          searchExecutionId: "00000000-0000-4000-8000-000000000999",
          title: "Licencias de software",
          snippet: null,
          sourceUrl:
            "https://www.comprasal.gob.sv/procesos-publicos/121645",
          deadlineAt: new Date("2026-08-01T23:59:59.000Z"),
          estimatedAmount: null,
          currency: null,
          amountStatus: "NOT_PUBLISHED",
          userState: null,
        }),
      );
    const detail = await getUserSearchExecutionResultDetail({
      executionId: EXECUTION_ID,
      leadId: RESULT_ID,
      userId: "00000000-0000-4000-8000-000000000401",
    });
    expect(detail).toMatchObject({ id: RESULT_ID, searchExecutionId: EXECUTION_ID });
  });

  it("rejects a valid UUID that is not associated with the owned execution", async () => {
    mocks.select
      .mockImplementationOnce(() => ownedExecutionSelect(ownedExecutionRow()))
      .mockImplementationOnce(() =>
        associationExistsSelect({ searchResultId: RESULT_ID }),
      )
      .mockImplementationOnce(() => exactAssociationSelect(null));
    const detail = await getUserSearchExecutionResultDetail({
      executionId: EXECUTION_ID,
      leadId: OTHER_RESULT_ID,
      userId: "00000000-0000-4000-8000-000000000401",
    });
    expect(detail).toBeNull();
    expect(mocks.select).toHaveBeenCalledTimes(3);
  });

  it("authorizes enriched detail only after ownership and exact association", async () => {
    mocks.select
      .mockImplementationOnce(() => ownedExecutionSelect(ownedExecutionRow()))
      .mockImplementationOnce(() =>
        strictAssociatedResultSelect({
          id: RESULT_ID,
          sourceType: "COMPRASAL",
          externalId: "available:135317",
          title: "Licencias de software",
          snippet: null,
          sourceUrl:
            "https://www.comprasal.gob.sv/procesos-publicos/135317",
          organizationName: "Ministerio de Tecnología",
          publishedAt: new Date("2026-07-01T12:00:00.000Z"),
          deadlineAt: new Date("2026-08-01T23:59:59.000Z"),
          estimatedAmount: null,
          currency: null,
          amountStatus: "NOT_PUBLISHED",
          preliminaryScore: 88,
          rawData: { id: 135317 },
          userState: null,
        }),
      );

    await expect(
      getUserAssociatedSearchResultDetail({
        executionId: EXECUTION_ID,
        resultId: RESULT_ID,
        userId: "00000000-0000-4000-8000-000000000401",
      }),
    ).resolves.toMatchObject({
      id: RESULT_ID,
      externalId: "available:135317",
      preliminaryScore: 88,
    });
  });

  it("stops enriched detail before association lookup for a cross-user execution", async () => {
    mocks.select.mockImplementationOnce(() => ownedExecutionSelect(null));
    await expect(
      getUserAssociatedSearchResultDetail({
        executionId: EXECUTION_ID,
        resultId: RESULT_ID,
        userId: "00000000-0000-4000-8000-000000000402",
      }),
    ).resolves.toBeNull();
    expect(mocks.select).toHaveBeenCalledTimes(1);
  });

  it("rejects enriched detail when the result is not associated", async () => {
    mocks.select
      .mockImplementationOnce(() => ownedExecutionSelect(ownedExecutionRow()))
      .mockImplementationOnce(() => strictAssociatedResultSelect(null));
    await expect(
      getUserAssociatedSearchResultDetail({
        executionId: EXECUTION_ID,
        resultId: OTHER_RESULT_ID,
        userId: "00000000-0000-4000-8000-000000000401",
      }),
    ).resolves.toBeNull();
  });

  it("rejects enriched detail for a privately dismissed result", async () => {
    mocks.select
      .mockImplementationOnce(() => ownedExecutionSelect(ownedExecutionRow()))
      .mockImplementationOnce(() =>
        strictAssociatedResultSelect({
          id: RESULT_ID,
          sourceType: "COMPRASAL",
          externalId: "available:135317",
          title: "Licencias de software",
          snippet: null,
          sourceUrl:
            "https://www.comprasal.gob.sv/procesos-publicos/135317",
          organizationName: null,
          publishedAt: null,
          deadlineAt: null,
          estimatedAmount: null,
          currency: null,
          amountStatus: "NOT_PUBLISHED",
          preliminaryScore: 88,
          rawData: { id: 135317 },
          userState: "DISMISSED",
        }),
      );
    await expect(
      getUserAssociatedSearchResultDetail({
        executionId: EXECUTION_ID,
        resultId: RESULT_ID,
        userId: "00000000-0000-4000-8000-000000000401",
      }),
    ).resolves.toBeNull();
  });
});
