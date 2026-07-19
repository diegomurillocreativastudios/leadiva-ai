import "server-only";

import { getServerEnv } from "@/env/server";
import {
  createComprasalAwardReportCache,
  getSharedComprasalAwardReportCache,
  type ComprasalAwardReportCacheResult,
} from "./award-report-cache";
import {
  ComprasalAwardReportContractError,
  normalizeComprasalAwardReport,
} from "./award-report-normalize";
import {
  ComprasalAwardReportClientError,
  fetchComprasalAwardReport,
} from "./client";

type AwardReportCache = ReturnType<typeof createComprasalAwardReportCache>;

const DEFAULT_CONCURRENCY = 4;

class AwardReportUnavailableError extends Error {
  constructor() {
    super("COMPRASAL award report unavailable");
    this.name = "AwardReportUnavailableError";
  }
}

async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index]!);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

export type ComprasalClosingDateLoaderDependencies = {
  fetchReport?: typeof fetchComprasalAwardReport;
  cache?: AwardReportCache;
  concurrency?: number;
};

/** Loads award-report fecha_cierre for list cards, best-effort and cached. */
export async function loadComprasalClosingDatesByProcessIds(
  processIds: readonly number[],
  dependencies: ComprasalClosingDateLoaderDependencies = {},
): Promise<Map<number, string>> {
  const uniqueIds = [...new Set(processIds)].filter(
    (id) => Number.isSafeInteger(id) && id > 0,
  );
  const closesAtByProcessId = new Map<number, string>();
  if (uniqueIds.length === 0) {
    return closesAtByProcessId;
  }

  const fetchReport = dependencies.fetchReport ?? fetchComprasalAwardReport;
  const cache =
    dependencies.cache ??
    getSharedComprasalAwardReportCache(
      getServerEnv().COMPRASAL_AWARD_REPORT_CACHE_TTL_MS,
    );
  const concurrency = dependencies.concurrency ?? DEFAULT_CONCURRENCY;

  const loaded = await mapPool(uniqueIds, concurrency, async (processId) => {
    try {
      const result: ComprasalAwardReportCacheResult = await cache.get(
        processId,
        async () => {
          const payload = await fetchReport(processId);
          const report = normalizeComprasalAwardReport(payload);
          if (!report) {
            throw new AwardReportUnavailableError();
          }
          return report;
        },
      );
      const closesAt = result.report.summary.closesAt;
      return {
        processId,
        closesAt:
          typeof closesAt === "string" && closesAt.trim()
            ? closesAt.trim()
            : null,
      };
    } catch (error) {
      if (
        error instanceof AwardReportUnavailableError ||
        error instanceof ComprasalAwardReportClientError ||
        error instanceof ComprasalAwardReportContractError
      ) {
        return { processId, closesAt: null };
      }
      return { processId, closesAt: null };
    }
  });

  for (const item of loaded) {
    if (item.closesAt) {
      closesAtByProcessId.set(item.processId, item.closesAt);
    }
  }

  return closesAtByProcessId;
}
