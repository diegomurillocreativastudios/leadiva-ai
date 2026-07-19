import "server-only";

import { getServerEnv } from "@/env/server";
import {
  getUserAssociatedSearchResultDetail,
  type UserAssociatedSearchResultDetail,
} from "@/server/services/search-execution.service";
import {
  ComprasalAvailableExternalIdError,
  resolveComprasalAvailableProcessId,
} from "./available-external-id";
import {
  getSharedComprasalAwardReportCache,
  type ComprasalAwardReportCacheResult,
} from "./award-report-cache";
import {
  ComprasalAwardReportContractError,
  normalizeComprasalAwardReport,
  type ComprasalAwardReport,
} from "./award-report-normalize";
import {
  ComprasalAwardReportClientError,
  fetchComprasalAwardReport,
} from "./client";

type AwardReportCache = ReturnType<
  typeof getSharedComprasalAwardReportCache
>;

export type ComprasalAwardReportLoadStatus =
  | "AVAILABLE"
  | "EMPTY"
  | "NOT_AVAILABLE"
  | "TEMPORARY_ERROR"
  | "INVALID_RESPONSE"
  | "IDENTITY_ERROR";

export type UserComprasalAwardReportDetail = {
  kind: "COMPRASAL";
  result: UserAssociatedSearchResultDetail;
  processId: number | null;
  report: ComprasalAwardReport | null;
  status: ComprasalAwardReportLoadStatus;
  cacheHit: boolean;
  cacheAgeMs: number;
};

export type UserAwardReportDetail =
  | UserComprasalAwardReportDetail
  | {
      kind: "NOT_COMPRASAL";
      result: UserAssociatedSearchResultDetail;
    };

export type ComprasalAwardReportServiceDependencies = {
  authorize?: typeof getUserAssociatedSearchResultDetail;
  fetchReport?: typeof fetchComprasalAwardReport;
  cache?: AwardReportCache;
  logError?: (event: string, context: Record<string, unknown>) => void;
  logInfo?: (event: string, context: Record<string, unknown>) => void;
};

class ComprasalAwardReportNotAvailableError extends Error {}

function defaultLogError(event: string, context: Record<string, unknown>) {
  console.error(event, context);
}

function defaultLogInfo(event: string, context: Record<string, unknown>) {
  console.info(event, context);
}

function failedDetail(
  result: UserAssociatedSearchResultDetail,
  processId: number | null,
  status: ComprasalAwardReportLoadStatus,
): UserComprasalAwardReportDetail {
  return {
    kind: "COMPRASAL",
    result,
    processId,
    report: null,
    status,
    cacheHit: false,
    cacheAgeMs: 0,
  };
}

function classifyClientError(
  error: ComprasalAwardReportClientError,
): "NOT_AVAILABLE" | "TEMPORARY_ERROR" | "INVALID_RESPONSE" {
  if (error.code === "NOT_FOUND") return "NOT_AVAILABLE";
  if (
    error.code === "TIMEOUT" ||
    error.code === "NETWORK" ||
    error.code === "RATE_LIMITED" ||
    error.code === "UPSTREAM"
  ) {
    return "TEMPORARY_ERROR";
  }
  return "INVALID_RESPONSE";
}

/** Authorizes first, then resolves and fetches a public COMPRASAL award report. */
export async function loadUserComprasalAwardReportDetail(
  params: { executionId: string; resultId: string; userId: string },
  dependencies: ComprasalAwardReportServiceDependencies = {},
): Promise<UserAwardReportDetail | null> {
  const authorize =
    dependencies.authorize ?? getUserAssociatedSearchResultDetail;
  const result = await authorize(params);
  if (!result) return null;
  if (result.sourceType !== "COMPRASAL") {
    return { kind: "NOT_COMPRASAL", result };
  }

  const logError = dependencies.logError ?? defaultLogError;
  const logInfo = dependencies.logInfo ?? defaultLogInfo;
  let processId: number;
  try {
    processId = resolveComprasalAvailableProcessId({
      externalId: result.externalId ?? "",
      rawData: result.rawData,
    });
  } catch (error) {
    logError("COMPRASAL_AWARD_REPORT_IDENTITY_ERROR", {
      executionId: params.executionId,
      resultId: params.resultId,
      errorType:
        error instanceof ComprasalAvailableExternalIdError
          ? error.name
          : "UnknownError",
    });
    return failedDetail(result, null, "IDENTITY_ERROR");
  }

  const fetchReport = dependencies.fetchReport ?? fetchComprasalAwardReport;

  try {
    const cache =
      dependencies.cache ??
      getSharedComprasalAwardReportCache(
        getServerEnv().COMPRASAL_AWARD_REPORT_CACHE_TTL_MS,
      );
    const loaded: ComprasalAwardReportCacheResult = await cache.get(
      processId,
      async () => {
        const payload = await fetchReport(processId);
        const report = normalizeComprasalAwardReport(payload);
        if (!report) {
          throw new ComprasalAwardReportNotAvailableError();
        }
        return report;
      },
    );
    logInfo("COMPRASAL_AWARD_REPORT_LOADED", {
      processId,
      cacheHit: loaded.cacheHit,
      cacheAgeMs: loaded.cacheAgeMs,
    });
    return {
      kind: "COMPRASAL",
      result,
      processId,
      report: loaded.report,
      status: loaded.report.hasAdditionalInformation ? "AVAILABLE" : "EMPTY",
      cacheHit: loaded.cacheHit,
      cacheAgeMs: loaded.cacheAgeMs,
    };
  } catch (error) {
    if (error instanceof ComprasalAwardReportNotAvailableError) {
      return failedDetail(result, processId, "NOT_AVAILABLE");
    }

    const status =
      error instanceof ComprasalAwardReportClientError
        ? classifyClientError(error)
        : error instanceof ComprasalAwardReportContractError
          ? "INVALID_RESPONSE"
          : "TEMPORARY_ERROR";
    logError("COMPRASAL_AWARD_REPORT_LOAD_ERROR", {
      executionId: params.executionId,
      resultId: params.resultId,
      processId,
      errorType: error instanceof Error ? error.name : "UnknownError",
      status,
    });
    return failedDetail(result, processId, status);
  }
}
