import { describe, expect, it, vi } from "vitest";

import { createComprasalAwardReportCache } from "./award-report-cache";
import type { ComprasalAwardReport } from "./award-report-normalize";

function report(name = "Contrato"): ComprasalAwardReport {
  return {
    summary: {
      contractName: name,
      contractingMethod: null,
      contractualTermDays: null,
      plannedAmount: null,
      certifiedAmount: null,
      publishedAt: null,
      openedAt: null,
      closesAt: null,
      signedAt: null,
      status: null,
      budgetCodes: [],
    },
    bidders: [],
    stages: [],
    payments: [],
    beneficiaries: [],
    contractualModificationCount: 0,
    message: null,
    hasAdditionalInformation: true,
    rawData: { data: {} },
  };
}

describe("COMPRASAL award report cache", () => {
  it("returns a hit with the real cache age and expires entries", async () => {
    let now = 1_000;
    const cache = createComprasalAwardReportCache({ ttlMs: 300, now: () => now });
    const load = vi.fn().mockResolvedValue(report());

    expect(await cache.get(135317, load)).toMatchObject({ cacheHit: false });
    now = 1_125;
    expect(await cache.get(135317, load)).toMatchObject({
      cacheHit: true,
      cacheAgeMs: 125,
    });
    now = 1_301;
    expect(await cache.get(135317, load)).toMatchObject({ cacheHit: false });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("shares an in-flight promise by processId", async () => {
    const cache = createComprasalAwardReportCache({ ttlMs: 300 });
    let resolveLoad: ((value: ComprasalAwardReport) => void) | undefined;
    const load = vi.fn(
      () =>
        new Promise<ComprasalAwardReport>((resolve) => {
          resolveLoad = resolve;
        }),
    );
    const first = cache.get(135317, load);
    const second = cache.get(135317, load);
    resolveLoad?.(report());

    expect((await first).cacheHit).toBe(false);
    expect((await second).cacheHit).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("does not cache rejection and clears the in-flight entry", async () => {
    const cache = createComprasalAwardReportCache({ ttlMs: 300 });
    const load = vi
      .fn<() => Promise<ComprasalAwardReport>>()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce(report());

    await expect(cache.get(135317, load)).rejects.toThrow("temporary");
    await expect(cache.get(135317, load)).resolves.toMatchObject({
      cacheHit: false,
    });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("returns clones so callers cannot mutate the cached snapshot", async () => {
    const cache = createComprasalAwardReportCache({ ttlMs: 300 });
    const first = await cache.get(135317, async () => report());
    first.report.summary.contractName = "Mutado";
    first.report.rawData = { changed: true };

    const second = await cache.get(135317, async () => report("Otro"));
    expect(second.report.summary.contractName).toBe("Contrato");
    expect(second.report.rawData).toEqual({ data: {} });
  });
});
