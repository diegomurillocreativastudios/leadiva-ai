import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  db: { select: mocks.select, update: mocks.update },
}));

import {
  getUserSearchExecutionDetail,
  getUserSearchExecutionResultDetail,
} from "./search-execution.service";

const EXECUTION_ID = "00000000-0000-4000-8000-000000000201";
const RESULT_ID = "00000000-0000-4000-8000-000000000101";

function ownedExecutionRow() {
  return {
    id: EXECUTION_ID,
    status: "COMPLETED",
    candidatesFound: 1,
    candidatesDiscarded: 0,
    estimatedCost: "0",
    metrics: {
      query: "software",
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
  };
}

function selectOwnedExecution(row = ownedExecutionRow()) {
  return {
    from: () => ({
      innerJoin: () => ({
        where: () => ({ limit: async () => [row] }),
      }),
    }),
  };
}

describe("search execution candidate history", () => {
  beforeEach(() => {
    mocks.select.mockReset();
    mocks.update.mockReset();
  });

  it("reads executionCandidates by id without mutating search_results ownership", async () => {
    mocks.select
      .mockImplementationOnce(() => selectOwnedExecution())
      .mockImplementationOnce(() => ({
        from: () => ({
          where: async () => [
            {
              id: RESULT_ID,
              title: "Licencias de software",
              organizationName: "Ministerio de Tecnología",
              summary: null,
              officialSourceUrl:
                "https://www.comprasal.gob.sv/procesos-publicos/121645",
              sourceDomain: "www.comprasal.gob.sv",
              deadlineAt: new Date("2026-08-01T23:59:59.000Z"),
              category: "SOFTWARE",
              preliminaryScore: 12,
              verificationStatus: "VERIFIED",
              verificationReason: null,
            },
          ],
        }),
      }));

    const detail = await getUserSearchExecutionDetail({
      executionId: EXECUTION_ID,
      userId: "00000000-0000-4000-8000-000000000401",
    });
    expect(detail?.candidates).toMatchObject([
      { searchResultId: RESULT_ID, preliminaryScore: 72 },
    ]);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("opens a result associated through metrics even when its mutable owner differs", async () => {
    mocks.select
      .mockImplementationOnce(() => selectOwnedExecution())
      .mockImplementationOnce(() => ({
        from: () => ({
          where: () => ({
            limit: async () => [
              {
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
              },
            ],
          }),
        }),
      }));

    const detail = await getUserSearchExecutionResultDetail({
      executionId: EXECUTION_ID,
      leadId: RESULT_ID,
      userId: "00000000-0000-4000-8000-000000000401",
    });
    expect(detail).toMatchObject({ id: RESULT_ID, searchExecutionId: EXECUTION_ID });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
