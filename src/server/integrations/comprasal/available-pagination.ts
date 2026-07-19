import type { ComprasalAvailablePage } from "./available-schemas";
import {
  normalizeComprasalAvailableProcess,
  type ComprasalAvailableProcess,
} from "./available-normalize";

export type ComprasalAvailablePaginationConfig = {
  perPage: number;
  maxPages: number;
  maxRows: number;
  timeBudgetMs?: number;
};

export type ComprasalAvailableSnapshotMetrics = {
  requestsExecuted: number;
  pagesFetched: number;
  rowsFetched: number;
  invalidRows: number;
  duplicateRows: number;
  totalRows: number;
  defensiveLimitReached: "MAX_PAGES" | "MAX_ROWS" | null;
  snapshotIssue: string | null;
};

export type ComprasalAvailableSnapshot = {
  processes: ComprasalAvailableProcess[];
  metrics: ComprasalAvailableSnapshotMetrics;
};

export class ComprasalAvailablePaginationError extends Error {
  constructor(
    message: string,
    public readonly metrics: ComprasalAvailableSnapshotMetrics,
    public readonly partialSnapshot: ComprasalAvailableSnapshot | null = null,
  ) {
    super(message);
    this.name = "ComprasalAvailablePaginationError";
  }
}

export async function loadComprasalAvailableSnapshot(params: {
  config: ComprasalAvailablePaginationConfig;
  fetchPage: (
    page: number,
    perPage: number,
    recordRetry: () => void,
  ) => Promise<ComprasalAvailablePage>;
}): Promise<ComprasalAvailableSnapshot> {
  const { config } = params;
  const metrics: ComprasalAvailableSnapshotMetrics = {
    requestsExecuted: 0,
    pagesFetched: 0,
    rowsFetched: 0,
    invalidRows: 0,
    duplicateRows: 0,
    totalRows: 0,
    defensiveLimitReached: null,
    snapshotIssue: null,
  };
  const byId = new Map<number, ComprasalAvailableProcess>();
  const idByCode = new Map<string, number>();
  const deadline = config.timeBudgetMs
    ? Date.now() + config.timeBudgetMs
    : null;

  let expectedTotalRows: number | null = null;
  let expectedLastPage: number | null = null;

  for (let requestedPage = 1; requestedPage <= config.maxPages; requestedPage += 1) {
    if (deadline !== null && Date.now() >= deadline) {
      metrics.snapshotIssue = "TIME_BUDGET_EXCEEDED";
      throw new ComprasalAvailablePaginationError(
        "COMPRASAL available snapshot exceeded its time budget",
        metrics,
      );
    }
    metrics.requestsExecuted += 1;
    metrics.pagesFetched += 1;
    let page: ComprasalAvailablePage;
    try {
      page = await params.fetchPage(requestedPage, config.perPage, () => {
        metrics.requestsExecuted += 1;
      });
    } catch {
      metrics.snapshotIssue = "PAGE_REQUEST_FAILED";
      throw new ComprasalAvailablePaginationError(
        "COMPRASAL available page request failed",
        metrics,
      );
    }
    metrics.rowsFetched += page.rows.length;
    metrics.totalRows = page.totalRows;
    if (deadline !== null && Date.now() >= deadline) {
      metrics.snapshotIssue = "TIME_BUDGET_EXCEEDED";
      throw new ComprasalAvailablePaginationError(
        "COMPRASAL available snapshot exceeded its time budget",
        metrics,
      );
    }
    if (page.currentPage !== requestedPage || page.perPage !== config.perPage) {
      metrics.snapshotIssue = "PAGINATION_HEADERS_MISMATCH";
      throw new ComprasalAvailablePaginationError(
        "COMPRASAL pagination headers do not match the requested page",
        metrics,
      );
    }
    if (expectedTotalRows === null) {
      expectedTotalRows = page.totalRows;
      expectedLastPage = page.lastPage;
    } else if (
      page.totalRows !== expectedTotalRows ||
      page.lastPage !== expectedLastPage
    ) {
      metrics.snapshotIssue = "TOTAL_CHANGED";
      throw new ComprasalAvailablePaginationError(
        "COMPRASAL pagination total changed during snapshot",
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

    if (page.totalRows === 0) {
      if (page.rows.length > 0) {
        metrics.snapshotIssue = "ZERO_TOTAL_WITH_ROWS";
        throw new ComprasalAvailablePaginationError(
          "COMPRASAL returned rows with a zero total",
          metrics,
        );
      }
      return { processes: [], metrics };
    }

    const isExpectedLastPage = requestedPage === page.lastPage;
    const expectedRowsOnPage = isExpectedLastPage
      ? page.totalRows - page.perPage * (page.lastPage - 1)
      : page.perPage;
    if (page.rows.length !== expectedRowsOnPage) {
      metrics.snapshotIssue =
        isExpectedLastPage
          ? "TRUNCATED_LAST_PAGE"
          : page.rows.length === 0
            ? "EMPTY_PAGE_BEFORE_TOTAL"
            : "TRUNCATED_INTERMEDIATE_PAGE";
      throw new ComprasalAvailablePaginationError(
        "COMPRASAL returned an incomplete snapshot page",
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

    const reachedTotal = metrics.rowsFetched === page.totalRows;
    if (newIdentities === 0 && page.rows.length > 0) {
      metrics.snapshotIssue = "REPEATED_PAGE";
      throw new ComprasalAvailablePaginationError(
        "COMPRASAL pagination made no identity progress",
        metrics,
      );
    }
    if (isExpectedLastPage) {
      if (!reachedTotal) {
        metrics.snapshotIssue = "ROW_TOTAL_MISMATCH";
        throw new ComprasalAvailablePaginationError(
          "COMPRASAL snapshot row count did not reach total_rows",
          metrics,
        );
      }
      const snapshot = { processes: [...byId.values()], metrics };
      if (metrics.invalidRows > 0) {
        metrics.snapshotIssue = "INVALID_ROWS";
        throw new ComprasalAvailablePaginationError(
          "COMPRASAL snapshot contained invalid rows",
          metrics,
          snapshot,
        );
      }
      return snapshot;
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

  function cloneSnapshot(snapshot: ComprasalAvailableSnapshot) {
    return structuredClone(snapshot);
  }

  function freezeSnapshot(snapshot: ComprasalAvailableSnapshot) {
    Object.freeze(snapshot.metrics);
    for (const process of snapshot.processes) {
      Object.freeze(process.currentStage);
      Object.freeze(process.activityNames);
      Object.freeze(process.rawData);
      Object.freeze(process);
    }
    Object.freeze(snapshot.processes);
    return Object.freeze(snapshot);
  }

  return {
    async get(
      load: () => Promise<ComprasalAvailableSnapshot>,
    ): Promise<ComprasalAvailableSnapshotCacheResult> {
      const currentTime = now();
      if (cached && currentTime - cached.fetchedAt < params.ttlMs) {
        return {
          snapshot: cloneSnapshot(cached.snapshot),
          cacheHit: true,
          cacheAgeMs: Math.max(0, currentTime - cached.fetchedAt),
        };
      }

      if (inFlight) {
        const snapshot = await inFlight;
        return {
          snapshot: cloneSnapshot(snapshot),
          cacheHit: true,
          cacheAgeMs: 0,
        };
      }

      const promise = load();
      inFlight = promise;
      try {
        const snapshot = await promise;
        const cacheCopy = freezeSnapshot(cloneSnapshot(snapshot));
        cached = { snapshot: cacheCopy, fetchedAt: now() };
        return {
          snapshot: cloneSnapshot(cacheCopy),
          cacheHit: false,
          cacheAgeMs: 0,
        };
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
