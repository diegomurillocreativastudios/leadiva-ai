import "server-only";

import { getServerEnv } from "@/env/server";
import {
  getUserAssociatedSearchResultDetail,
  type UserAssociatedSearchResultDetail,
} from "@/server/services/search-execution.service";
import {
  ComprasalAvailableExternalIdError,
  parseComprasalAvailableExternalId,
  resolveComprasalAvailableProcessId,
} from "./available-external-id";
import {
  normalizeComprasalRemotePip,
  normalizeComprasalStoredPip,
  parseComprasalProcessDetailPayload,
  ComprasalProcessDetailContractError,
  type ComprasalPip,
} from "./pip-normalize";
import {
  createComprasalProcessDetailCache,
  type ComprasalProcessDetailCacheResult,
} from "./process-detail-cache";
import {
  ComprasalProcessDetailClientError,
  fetchComprasalProcessDetail,
} from "./process-detail-client";

type ProcessDetailCache = ReturnType<
  typeof createComprasalProcessDetailCache
>;

export type ComprasalPipLoadStatus =
  | "AVAILABLE"
  | "FALLBACK"
  | "EMPTY"
  | "TEMPORARY_ERROR"
  | "INVALID_RESPONSE"
  | "IDENTITY_ERROR";

export type UserComprasalPipDetail = {
  kind: "COMPRASAL";
  result: UserAssociatedSearchResultDetail;
  processId: number | null;
  pip: ComprasalPip | null;
  status: ComprasalPipLoadStatus;
  cacheHit: boolean;
  cacheAgeMs: number;
  deadlineMismatch: boolean;
  identityMismatch: boolean;
};

export type UserProcessDetail =
  | UserComprasalPipDetail
  | {
      kind: "NOT_COMPRASAL";
      result: UserAssociatedSearchResultDetail;
    };

export type ComprasalProcessDetailServiceDependencies = {
  authorize?: typeof getUserAssociatedSearchResultDetail;
  fetchDetail?: typeof fetchComprasalProcessDetail;
  cache?: ProcessDetailCache;
  now?: () => Date;
  logError?: (event: string, context: Record<string, unknown>) => void;
  logWarn?: (event: string, context: Record<string, unknown>) => void;
  logInfo?: (event: string, context: Record<string, unknown>) => void;
};

class ComprasalProcessDetailNotAvailableError extends Error {}

const cacheByTtl = new Map<number, ProcessDetailCache>();

function getCache(ttlMs: number): ProcessDetailCache {
  const existing = cacheByTtl.get(ttlMs);
  if (existing) return existing;
  const created = createComprasalProcessDetailCache({ ttlMs });
  cacheByTtl.set(ttlMs, created);
  return created;
}

function logErrorDefault(event: string, context: Record<string, unknown>) {
  console.error(event, context);
}

function logWarnDefault(event: string, context: Record<string, unknown>) {
  console.warn(event, context);
}

function logInfoDefault(event: string, context: Record<string, unknown>) {
  console.info(event, context);
}

function usableStoredPip(
  result: UserAssociatedSearchResultDetail,
  now: Date,
): ComprasalPip | null {
  const pip = normalizeComprasalStoredPip({ rawData: result.rawData, now });
  return pip && pip.stages.length > 0 ? pip : null;
}

function detailResult(params: {
  result: UserAssociatedSearchResultDetail;
  processId: number | null;
  pip: ComprasalPip | null;
  status: ComprasalPipLoadStatus;
  cacheHit?: boolean;
  cacheAgeMs?: number;
  deadlineMismatch?: boolean;
  identityMismatch?: boolean;
}): UserComprasalPipDetail {
  return {
    kind: "COMPRASAL",
    result: params.result,
    processId: params.processId,
    pip: params.pip,
    status: params.status,
    cacheHit: params.cacheHit ?? false,
    cacheAgeMs: params.cacheAgeMs ?? 0,
    deadlineMismatch: params.deadlineMismatch ?? false,
    identityMismatch: params.identityMismatch ?? false,
  };
}

function classifyClientError(
  error: ComprasalProcessDetailClientError,
): "EMPTY" | "TEMPORARY_ERROR" | "INVALID_RESPONSE" {
  if (error.code === "NOT_FOUND") return "EMPTY";
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

function deadlineMismatch(
  remoteDeadline: string | null,
  storedDeadline: Date | null,
): boolean {
  if (!remoteDeadline || !storedDeadline) return false;
  return Date.parse(remoteDeadline) !== storedDeadline.getTime();
}

/** Authorizes the result before consulting or returning process-detail cache. */
export async function loadUserComprasalPipDetail(
  params: { executionId: string; resultId: string; userId: string },
  dependencies: ComprasalProcessDetailServiceDependencies = {},
): Promise<UserProcessDetail | null> {
  const authorize =
    dependencies.authorize ?? getUserAssociatedSearchResultDetail;
  const result = await authorize(params);
  if (!result) return null;
  if (result.sourceType !== "COMPRASAL") {
    return { kind: "NOT_COMPRASAL", result };
  }

  const now = dependencies.now?.() ?? new Date();
  const storedPip = usableStoredPip(result, now);
  const logError = dependencies.logError ?? logErrorDefault;
  const logWarn = dependencies.logWarn ?? logWarnDefault;
  const logInfo = dependencies.logInfo ?? logInfoDefault;

  let processId: number;
  try {
    processId = parseComprasalAvailableExternalId(result.externalId ?? "");
  } catch (error) {
    logError("COMPRASAL_PIP_IDENTITY_ERROR", {
      executionId: params.executionId,
      resultId: params.resultId,
      errorType:
        error instanceof ComprasalAvailableExternalIdError
          ? error.name
          : "UnknownError",
    });
    return detailResult({
      result,
      processId: null,
      pip: null,
      status: "IDENTITY_ERROR",
    });
  }

  try {
    resolveComprasalAvailableProcessId({
      externalId: result.externalId ?? "",
      rawData: result.rawData,
    });
  } catch (error) {
    logError("COMPRASAL_PIP_IDENTITY_MISMATCH", {
      executionId: params.executionId,
      resultId: params.resultId,
      processId,
      errorType:
        error instanceof ComprasalAvailableExternalIdError
          ? error.name
          : "UnknownError",
    });
    return detailResult({
      result,
      processId,
      pip: storedPip,
      status: storedPip ? "FALLBACK" : "IDENTITY_ERROR",
      identityMismatch: true,
    });
  }

  const fetchDetail = dependencies.fetchDetail ?? fetchComprasalProcessDetail;
  try {
    const cache =
      dependencies.cache ??
      getCache(getServerEnv().COMPRASAL_PROCESS_DETAIL_CACHE_TTL_MS);
    const loaded: ComprasalProcessDetailCacheResult = await cache.get(
      processId,
      async () => {
        const payload = await fetchDetail(processId);
        const snapshot = parseComprasalProcessDetailPayload(payload);
        if (!snapshot) throw new ComprasalProcessDetailNotAvailableError();
        if (snapshot.processId !== processId) {
          throw new ComprasalProcessDetailContractError();
        }
        return { ...snapshot, fetchedAt: (dependencies.now?.() ?? new Date()).toISOString() };
      },
    );
    logInfo("COMPRASAL_PROCESS_DETAIL_LOADED", {
      processId,
      cacheHit: loaded.cacheHit,
      cacheAgeMs: loaded.cacheAgeMs,
    });

    const remotePip = normalizeComprasalRemotePip({
      snapshot: loaded.snapshot,
      now,
    });
    if (remotePip.stages.length === 0) {
      return detailResult({
        result,
        processId,
        pip: storedPip,
        status: storedPip ? "FALLBACK" : "EMPTY",
        cacheHit: loaded.cacheHit,
        cacheAgeMs: loaded.cacheAgeMs,
      });
    }

    const hasDeadlineMismatch = deadlineMismatch(
      remotePip.offerDeadlineAt,
      result.deadlineAt,
    );
    if (hasDeadlineMismatch) {
      logWarn("COMPRASAL_PIP_DEADLINE_MISMATCH", {
        processId,
        storedDeadlineAt: result.deadlineAt?.toISOString() ?? null,
        remoteDeadlineAt: remotePip.offerDeadlineAt,
      });
    }
    return detailResult({
      result,
      processId,
      pip: remotePip,
      status: "AVAILABLE",
      cacheHit: loaded.cacheHit,
      cacheAgeMs: loaded.cacheAgeMs,
      deadlineMismatch: hasDeadlineMismatch,
    });
  } catch (error) {
    const status =
      error instanceof ComprasalProcessDetailNotAvailableError
        ? "EMPTY"
        : error instanceof ComprasalProcessDetailClientError
          ? classifyClientError(error)
          : error instanceof ComprasalProcessDetailContractError
            ? "INVALID_RESPONSE"
            : "TEMPORARY_ERROR";
    if (status !== "EMPTY") {
      logError("COMPRASAL_PROCESS_DETAIL_LOAD_ERROR", {
        executionId: params.executionId,
        resultId: params.resultId,
        processId,
        errorType: error instanceof Error ? error.name : "UnknownError",
        status,
      });
    }
    return detailResult({
      result,
      processId,
      pip: storedPip,
      status: storedPip ? "FALLBACK" : status,
    });
  }
}
