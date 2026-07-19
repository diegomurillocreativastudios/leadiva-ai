import type { ComprasalAvailablePage } from "./available-schemas";
import {
  normalizeComprasalAvailableProcess,
  type ComprasalAvailableProcess,
} from "./available-normalize";

export type ComprasalAvailablePaginationConfig = {
  perPage: number;
  maxPages: number;
  maxRows: number;
};

export type ComprasalAvailableSnapshotMetrics = {
  pagesFetched: number;
  rowsFetched: number;
  invalidRows: number;
  duplicateRows: number;
  totalRows: number;
  defensiveLimitReached: "MAX_PAGES" | "MAX_ROWS" | null;
};

export type ComprasalAvailableSnapshot = {
  processes: ComprasalAvailableProcess[];
  metrics: ComprasalAvailableSnapshotMetrics;
};

export class ComprasalAvailablePaginationError extends Error {
  constructor(
    message: string,
    public readonly metrics: ComprasalAvailableSnapshotMetrics,
  ) {
    super(message);
    this.name = "ComprasalAvailablePaginationError";
  }
}

export async function loadComprasalAvailableSnapshot(params: {
  config: ComprasalAvailablePaginationConfig;
  fetchPage: (page: number, perPage: number) => Promise<ComprasalAvailablePage>;
}): Promise<ComprasalAvailableSnapshot> {
  const { config } = params;
  const metrics: ComprasalAvailableSnapshotMetrics = {
    pagesFetched: 0,
    rowsFetched: 0,
    invalidRows: 0,
    duplicateRows: 0,
    totalRows: 0,
    defensiveLimitReached: null,
  };
  const byId = new Map<number, ComprasalAvailableProcess>();
  const idByCode = new Map<string, number>();

  for (let requestedPage = 1; requestedPage <= config.maxPages; requestedPage += 1) {
    const page = await params.fetchPage(requestedPage, config.perPage);
    metrics.pagesFetched += 1;
    metrics.rowsFetched += page.rows.length;
    metrics.totalRows = page.totalRows;

    if (page.currentPage !== requestedPage || page.perPage !== config.perPage) {
      throw new ComprasalAvailablePaginationError(
        "COMPRASAL pagination headers do not match the requested page",
        metrics,
      );
    }
    if (page.totalRows > config.maxRows || metrics.rowsFetched > config.maxRows) {
      metrics.defensiveLimitReached = "MAX_ROWS";
      throw new ComprasalAvailablePaginationError(
        "COMPRASAL available snapshot exceeded maxRows",
        metrics,
      );
    }
    if (page.lastPage > config.maxPages) {
      metrics.defensiveLimitReached = "MAX_PAGES";
      throw new ComprasalAvailablePaginationError(
        "COMPRASAL available snapshot exceeded maxPages",
        metrics,
      );
    }

    let newIdentities = 0;
    for (const row of page.rows) {
      const normalized = normalizeComprasalAvailableProcess(row);
      if (!normalized) {
        metrics.invalidRows += 1;
        continue;
      }

      const duplicateId = byId.get(normalized.id);
      const duplicateCodeId = idByCode.get(normalized.code);
      const identityId = duplicateId?.id ?? duplicateCodeId;
      if (identityId !== undefined) {
        metrics.duplicateRows += 1;
        const existing = byId.get(identityId);
        if (existing && normalized.version > existing.version) {
          byId.delete(existing.id);
          idByCode.delete(existing.code);
          byId.set(normalized.id, normalized);
          idByCode.set(normalized.code, normalized.id);
        }
        continue;
      }

      byId.set(normalized.id, normalized);
      idByCode.set(normalized.code, normalized.id);
      newIdentities += 1;
    }

    const reachedTotal = metrics.rowsFetched >= page.totalRows;
    const reachedLastPage = page.lastPage === 0 || requestedPage >= page.lastPage;
    if (page.rows.length === 0 || reachedTotal || reachedLastPage) {
      return { processes: [...byId.values()], metrics };
    }
    if (newIdentities === 0) {
      throw new ComprasalAvailablePaginationError(
        "COMPRASAL pagination made no identity progress",
        metrics,
      );
    }
  }

  metrics.defensiveLimitReached = "MAX_PAGES";
  throw new ComprasalAvailablePaginationError(
    "COMPRASAL available snapshot reached maxPages",
    metrics,
  );
}

export type ComprasalAvailableSnapshotCacheResult = {
  snapshot: ComprasalAvailableSnapshot;
  cacheHit: boolean;
  cacheAgeMs: number;
};

export function createComprasalAvailableSnapshotCache(params: {
  ttlMs: number;
  now?: () => number;
}) {
  const now = params.now ?? Date.now;
  let cached: { snapshot: ComprasalAvailableSnapshot; fetchedAt: number } | null = null;
  let inFlight: Promise<ComprasalAvailableSnapshot> | null = null;

  return {
    async get(
      load: () => Promise<ComprasalAvailableSnapshot>,
    ): Promise<ComprasalAvailableSnapshotCacheResult> {
      const currentTime = now();
      if (cached && currentTime - cached.fetchedAt < params.ttlMs) {
        return {
          snapshot: cached.snapshot,
          cacheHit: true,
          cacheAgeMs: Math.max(0, currentTime - cached.fetchedAt),
        };
      }

      if (inFlight) {
        const snapshot = await inFlight;
        return { snapshot, cacheHit: true, cacheAgeMs: 0 };
      }

      const promise = load();
      inFlight = promise;
      try {
        const snapshot = await promise;
        cached = { snapshot, fetchedAt: now() };
        return { snapshot, cacheHit: false, cacheAgeMs: 0 };
      } finally {
        if (inFlight === promise) {
          inFlight = null;
        }
      }
    },
    clear() {
      cached = null;
      inFlight = null;
    },
  };
}
