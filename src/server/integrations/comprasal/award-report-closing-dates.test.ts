import { describe, expect, it, vi } from "vitest";

import { createComprasalAwardReportCache } from "./award-report-cache";
import { loadComprasalClosingDatesByProcessIds } from "./award-report-closing-dates";

describe("loadComprasalClosingDatesByProcessIds", () => {
  it("returns fecha_cierre for process ids that have an award report", async () => {
    const fetchReport = vi.fn(async (processId: number) => ({
      data: {
        adjudicacion: {
          fecha_cierre: `2024-10-0${processId}T22:25:00.000Z`,
        },
      },
      message: "ok",
    }));

    const closesAtByProcessId = await loadComprasalClosingDatesByProcessIds(
      [1, 2, 1],
      {
        fetchReport,
        cache: createComprasalAwardReportCache({ ttlMs: 60_000 }),
        concurrency: 2,
      },
    );

    expect(fetchReport).toHaveBeenCalledTimes(2);
    expect(closesAtByProcessId.get(1)).toBe("2024-10-01T22:25:00.000Z");
    expect(closesAtByProcessId.get(2)).toBe("2024-10-02T22:25:00.000Z");
  });

  it("skips processes whose award report has no cierre", async () => {
    const closesAtByProcessId = await loadComprasalClosingDatesByProcessIds(
      [9],
      {
        fetchReport: vi.fn(async () => ({
          data: { adjudicacion: { fecha_cierre: null } },
          message: "ok",
        })),
        cache: createComprasalAwardReportCache({ ttlMs: 60_000 }),
      },
    );

    expect(closesAtByProcessId.size).toBe(0);
  });
});
