import type { ComprasalAwardReport } from "./award-report-normalize";

export type ComprasalAwardReportCacheResult = {
  report: ComprasalAwardReport;
  cacheHit: boolean;
  cacheAgeMs: number;
};

type AwardReportCache = ReturnType<typeof createComprasalAwardReportCache>;

const sharedCachesByTtl = new Map<number, AwardReportCache>();

/** Reuses one in-memory cache per TTL across list enrichment and detail loads. */
export function getSharedComprasalAwardReportCache(
  ttlMs: number,
): AwardReportCache {
  const existing = sharedCachesByTtl.get(ttlMs);
  if (existing) return existing;
  const created = createComprasalAwardReportCache({ ttlMs });
  sharedCachesByTtl.set(ttlMs, created);
  return created;
}

function cloneReport(report: ComprasalAwardReport): ComprasalAwardReport {
  return structuredClone(report);
}

function deepFreeze(value: unknown): void {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return;
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  Object.freeze(value);
}

/** In-memory, per-Node-instance cache. Authorization deliberately lives outside. */
export function createComprasalAwardReportCache(params: {
  ttlMs: number;
  now?: () => number;
}) {
  const now = params.now ?? Date.now;
  const cached = new Map<
    number,
    { report: ComprasalAwardReport; fetchedAt: number }
  >();
  const inFlight = new Map<number, Promise<ComprasalAwardReport>>();

  return {
    async get(
      processId: number,
      load: () => Promise<ComprasalAwardReport>,
    ): Promise<ComprasalAwardReportCacheResult> {
      const currentTime = now();
      const existing = cached.get(processId);
      if (existing && currentTime - existing.fetchedAt < params.ttlMs) {
        return {
          report: cloneReport(existing.report),
          cacheHit: true,
          cacheAgeMs: Math.max(0, currentTime - existing.fetchedAt),
        };
      }
      if (existing) cached.delete(processId);

      const pending = inFlight.get(processId);
      if (pending) {
        return {
          report: cloneReport(await pending),
          cacheHit: true,
          cacheAgeMs: 0,
        };
      }

      const promise = load();
      inFlight.set(processId, promise);
      try {
        const report = await promise;
        const cacheCopy = cloneReport(report);
        deepFreeze(cacheCopy);
        cached.set(processId, { report: cacheCopy, fetchedAt: now() });
        return { report: cloneReport(cacheCopy), cacheHit: false, cacheAgeMs: 0 };
      } finally {
        if (inFlight.get(processId) === promise) {
          inFlight.delete(processId);
        }
      }
    },
    clear() {
      cached.clear();
      inFlight.clear();
    },
  };
}
