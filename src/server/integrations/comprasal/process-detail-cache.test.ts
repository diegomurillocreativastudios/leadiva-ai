import { describe, expect, it, vi } from "vitest";

import { createComprasalProcessDetailCache } from "./process-detail-cache";
import type { ComprasalProcessDetailSnapshot } from "./pip-normalize";

function snapshot(name = "Recepción de ofertas"): ComprasalProcessDetailSnapshot {
  return {
    processId: 135317,
    fetchedAt: "2026-07-19T12:00:00.000Z",
    stages: [
      {
        id: "10",
        name,
        startsAt: "2026-07-20T14:00:00.000Z",
        endsAt: "2026-07-20T16:00:00.000Z",
        originalPosition: 0,
      },
    ],
  };
}

describe("COMPRASAL process-detail cache", () => {
  it("returns cache hit, age and expiration by processId", async () => {
    let now = 1_000;
    const cache = createComprasalProcessDetailCache({
      ttlMs: 300,
      now: () => now,
    });
    const load = vi.fn().mockResolvedValue(snapshot());
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

  it("shares an in-flight promise", async () => {
    const cache = createComprasalProcessDetailCache({ ttlMs: 300_000 });
    let resolveLoad: ((value: ComprasalProcessDetailSnapshot) => void) | undefined;
    const load = vi.fn(
      () =>
        new Promise<ComprasalProcessDetailSnapshot>((resolve) => {
          resolveLoad = resolve;
        }),
    );
    const first = cache.get(135317, load);
    const second = cache.get(135317, load);
    resolveLoad?.(snapshot());
    expect((await first).cacheHit).toBe(false);
    expect((await second).cacheHit).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("does not cache a rejection", async () => {
    const cache = createComprasalProcessDetailCache({ ttlMs: 300_000 });
    const load = vi
      .fn<() => Promise<ComprasalProcessDetailSnapshot>>()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce(snapshot());
    await expect(cache.get(135317, load)).rejects.toThrow("temporary");
    await expect(cache.get(135317, load)).resolves.toMatchObject({
      cacheHit: false,
    });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("returns independent clones", async () => {
    const cache = createComprasalProcessDetailCache({ ttlMs: 300_000 });
    const first = await cache.get(135317, async () => snapshot());
    first.snapshot.stages[0]!.name = "Mutada";
    const second = await cache.get(135317, async () => snapshot("Otra"));
    expect(second.snapshot.stages[0]?.name).toBe("Recepción de ofertas");
  });
});
