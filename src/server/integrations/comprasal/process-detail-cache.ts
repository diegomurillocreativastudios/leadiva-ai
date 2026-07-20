import type { ComprasalProcessDetailSnapshot } from "./pip-normalize";

export type ComprasalProcessDetailCacheResult = {
  snapshot: ComprasalProcessDetailSnapshot;
  cacheHit: boolean;
  cacheAgeMs: number;
};

function cloneSnapshot(
  snapshot: ComprasalProcessDetailSnapshot,
): ComprasalProcessDetailSnapshot {
  return structuredClone(snapshot);
}

function deepFreeze(value: unknown): void {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return;
  for (const child of Object.values(value)) deepFreeze(child);
  Object.freeze(value);
}

/** Per-Node-instance cache; callers must authorize before reading it. */
export function createComprasalProcessDetailCache(params: {
  ttlMs: number;
  now?: () => number;
}) {
  const now = params.now ?? Date.now;
  const cached = new Map<
    number,
    { snapshot: ComprasalProcessDetailSnapshot; fetchedAt: number }
  >();
  const inFlight = new Map<number, Promise<ComprasalProcessDetailSnapshot>>();

  return {
    async get(
      processId: number,
      load: () => Promise<ComprasalProcessDetailSnapshot>,
    ): Promise<ComprasalProcessDetailCacheResult> {
      const currentTime = now();
      const existing = cached.get(processId);
      if (existing && currentTime - existing.fetchedAt < params.ttlMs) {
        return {
          snapshot: cloneSnapshot(existing.snapshot),
          cacheHit: true,
          cacheAgeMs: Math.max(0, currentTime - existing.fetchedAt),
        };
      }
      if (existing) cached.delete(processId);

      const pending = inFlight.get(processId);
      if (pending) {
        return {
          snapshot: cloneSnapshot(await pending),
          cacheHit: true,
          cacheAgeMs: 0,
        };
      }

      const promise = load();
      inFlight.set(processId, promise);
      try {
        const snapshot = await promise;
        const cacheCopy = cloneSnapshot(snapshot);
        deepFreeze(cacheCopy);
        cached.set(processId, { snapshot: cacheCopy, fetchedAt: now() });
        return {
          snapshot: cloneSnapshot(cacheCopy),
          cacheHit: false,
          cacheAgeMs: 0,
        };
      } finally {
        if (inFlight.get(processId) === promise) inFlight.delete(processId);
      }
    },
    clear() {
      cached.clear();
      inFlight.clear();
    },
  };
}
