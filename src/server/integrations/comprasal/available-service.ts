import "server-only";

import { and, eq, isNull, ne, sql } from "drizzle-orm";

import { getServerEnv } from "@/env/server";
import { buildSearchExecutionTitle } from "@/lib/search-execution-title";
import { db } from "@/server/db";
import {
  searchExecutions,
  searchExecutionResults,
  searchProfiles,
  searchResults,
  userSearchResultStates,
} from "@/server/db/schema";
import { fetchComprasalAvailablePage } from "./client";
import {
  mapComprasalAvailableProcessToSearchResult,
  type MappedComprasalAvailableSearchResult,
} from "./available-mapper";
import {
  ComprasalAvailablePaginationError,
  createComprasalAvailableSnapshotCache,
  loadComprasalAvailableSnapshot,
  type ComprasalAvailableSnapshotCacheResult,
} from "./available-pagination";
import { searchComprasalAvailableProcesses } from "./available-search";

type PersistOutcome = "CREATED" | "UPDATED" | "UNCHANGED";

type PersistCandidateResult =
  | { kind: "PERSISTED"; id: string; outcome: PersistOutcome }
  | { kind: "GLOBAL_REJECTED" }
  | { kind: "DISMISSED" };

type FinishExecutionInput = {
  executionId: string;
  status: "COMPLETED" | "PARTIALLY_COMPLETED" | "FAILED";
  candidatesFound: number;
  candidatesDiscarded: number;
  queriesExecuted: number;
  metrics: Record<string, unknown>;
  errorMessage: string | null;
};

export type ComprasalAvailableSearchRepository = {
  ensureProfile(userId: string): Promise<{ id: string }>;
  createExecution(profileId: string): Promise<{ id: string }>;
  persistCandidate(params: {
    executionId: string;
    userId: string;
    mapped: MappedComprasalAvailableSearchResult,
    preliminaryScore: number;
    rank: number;
  }): Promise<PersistCandidateResult>;
  finishExecution(input: FinishExecutionInput): Promise<void>;
};

export type ComprasalAvailableSearchResult = {
  executionId: string;
  status: "COMPLETED" | "PARTIALLY_COMPLETED" | "FAILED";
  candidatesFound: number;
  candidatesVerified: number;
  candidatesCreated: number;
  candidatesUpdated: number;
  candidatesUnchanged: number;
  candidatesRejected: number;
  candidatesDismissed: number;
  persistenceErrors: number;
  cacheHit: boolean;
  cacheAgeMs: number;
  pagesFetched: number;
  rowsFetched: number;
  pagesFetchedThisExecution: number;
  rowsFetchedThisExecution: number;
  snapshotPages: number;
  snapshotRows: number;
  totalMatchesBeforeLimit: number;
  matchesPersisted: number;
  resultsLimitReached: boolean;
  queriesExecuted: number;
  snapshotRequests: number;
};

const AVAILABLE_PROFILE_KEY = "AVAILABLE_SEARCH";
const AVAILABLE_PROFILE_NAME = "COMPRASAL — búsqueda de oportunidades";

const databaseRepository: ComprasalAvailableSearchRepository = {
  async ensureProfile(userId) {
    const [created] = await db
      .insert(searchProfiles)
      .values({
        name: AVAILABLE_PROFILE_NAME,
        description: "Búsqueda local en oportunidades disponibles de COMPRASAL",
        sourceType: "COMPRASAL",
        profileKey: AVAILABLE_PROFILE_KEY,
        keywords: [],
        createdByUserId: userId,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: [searchProfiles.createdByUserId, searchProfiles.profileKey],
        targetWhere: sql`${searchProfiles.createdByUserId} is not null and ${searchProfiles.profileKey} is not null`,
        set: { updatedAt: new Date() },
      })
      .returning({ id: searchProfiles.id });
    if (!created) throw new Error("Could not create COMPRASAL search profile");
    return created;
  },
  async createExecution(profileId) {
    const [execution] = await db
      .insert(searchExecutions)
      .values({
        searchProfileId: profileId,
        status: "RUNNING",
        startedAt: new Date(),
        metrics: { searchMode: AVAILABLE_PROFILE_KEY },
      })
      .returning({ id: searchExecutions.id });
    if (!execution) throw new Error("Could not create COMPRASAL search execution");
    return execution;
  },
  async persistCandidate(params) {
    const canonicalValues = {
      ...params.mapped,
      preliminaryScore: null,
    };
    const [upserted] = await db
      .insert(searchResults)
      .values({
        ...canonicalValues,
        searchExecutionId: params.executionId,
        discoveredAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [searchResults.sourceType, searchResults.externalId],
        targetWhere: sql`${searchResults.sourceType} = 'COMPRASAL' and ${searchResults.externalId} like 'available:%'`,
        set: canonicalValues,
        setWhere: and(
          ne(searchResults.verificationStatus, "REJECTED"),
          isNull(searchResults.deletedAt),
          sql`${searchResults.contentHash} is distinct from ${params.mapped.contentHash}`,
        ),
      })
      .returning({
        id: searchResults.id,
        inserted: sql<boolean>`xmax = 0`,
      });
    const canonical = upserted
      ? {
          id: upserted.id,
          outcome: upserted.inserted
            ? ("CREATED" as const)
            : ("UPDATED" as const),
        }
      : await db
          .select({
            id: searchResults.id,
            contentHash: searchResults.contentHash,
            verificationStatus: searchResults.verificationStatus,
            deletedAt: searchResults.deletedAt,
          })
          .from(searchResults)
          .where(
            and(
              eq(searchResults.sourceType, "COMPRASAL"),
              eq(searchResults.externalId, params.mapped.externalId),
            ),
          )
          .limit(1)
          .then(([row]) =>
            row &&
            row.contentHash === params.mapped.contentHash &&
            row.verificationStatus !== "REJECTED" &&
            !row.deletedAt
              ? { id: row.id, outcome: "UNCHANGED" as const }
              : null,
          );
    if (!canonical) return { kind: "GLOBAL_REJECTED" };

    const [privateState] = await db
      .select({ state: userSearchResultStates.state })
      .from(userSearchResultStates)
      .where(
        and(
          eq(userSearchResultStates.userId, params.userId),
          eq(userSearchResultStates.searchResultId, canonical.id),
        ),
      )
      .limit(1);
    if (privateState?.state === "DISMISSED") {
      return { kind: "DISMISSED" };
    }

    await db
      .insert(searchExecutionResults)
      .values({
        searchExecutionId: params.executionId,
        searchResultId: canonical.id,
        preliminaryScore: params.preliminaryScore,
        rank: params.rank,
      })
      .onConflictDoUpdate({
        target: [
          searchExecutionResults.searchExecutionId,
          searchExecutionResults.searchResultId,
        ],
        set: {
          preliminaryScore: params.preliminaryScore,
          rank: params.rank,
        },
      });

    return {
      kind: "PERSISTED",
      id: canonical.id,
      outcome: canonical.outcome,
    };
  },
  async finishExecution(input) {
    await db
      .update(searchExecutions)
      .set({
        status: input.status,
        queriesExecuted: input.queriesExecuted,
        candidatesFound: input.candidatesFound,
        candidatesDiscarded: input.candidatesDiscarded,
        metrics: input.metrics,
        errorMessage: input.errorMessage,
        completedAt: new Date(),
      })
      .where(eq(searchExecutions.id, input.executionId));
  },
};

// This module-level cache and its in-flight promise are scoped to one Next.js
// server instance. Other instances intentionally build their own snapshot.
let snapshotCache:
  | ReturnType<typeof createComprasalAvailableSnapshotCache>
  | null = null;
let snapshotCacheTtlMs: number | null = null;

function getSnapshotCache(ttlMs: number) {
  if (!snapshotCache || snapshotCacheTtlMs !== ttlMs) {
    snapshotCache = createComprasalAvailableSnapshotCache({ ttlMs });
    snapshotCacheTtlMs = ttlMs;
  }
  return snapshotCache;
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message.slice(0, 2000)
    : "COMPRASAL search failed";
}

export async function runComprasalAvailableSearchWithDependencies(params: {
  userId: string;
  query: string;
  repository: ComprasalAvailableSearchRepository;
  loadSnapshot: () => Promise<ComprasalAvailableSnapshotCacheResult>;
  maxMatches?: number;
}): Promise<ComprasalAvailableSearchResult> {
  const profile = await params.repository.ensureProfile(params.userId);
  const execution = await params.repository.createExecution(profile.id);
  const executionTitle =
    buildSearchExecutionTitle({
      userQuery: params.query,
      sourceType: "COMPRASAL",
      at: new Date(),
    }) ?? params.query;
  let cacheHit = false;
  let cacheAgeMs = 0;
  let pagesFetchedThisExecution = 0;
  let rowsFetchedThisExecution = 0;
  let queriesExecuted = 0;

  try {
    let snapshotPartial = false;
    let loaded: ComprasalAvailableSnapshotCacheResult;
    try {
      loaded = await params.loadSnapshot();
    } catch (error) {
      if (
        error instanceof ComprasalAvailablePaginationError &&
        error.partialSnapshot
      ) {
        loaded = {
          snapshot: error.partialSnapshot,
          cacheHit: false,
          cacheAgeMs: 0,
        };
        snapshotPartial = true;
      } else {
        throw error;
      }
    }

    cacheHit = loaded.cacheHit;
    cacheAgeMs = loaded.cacheAgeMs;
    const snapshotPages = loaded.snapshot.metrics.pagesFetched;
    const snapshotRows = loaded.snapshot.metrics.rowsFetched;
    const snapshotRequests = loaded.snapshot.metrics.requestsExecuted;
    pagesFetchedThisExecution = cacheHit ? 0 : snapshotPages;
    rowsFetchedThisExecution = cacheHit ? 0 : snapshotRows;
    queriesExecuted = cacheHit ? 0 : snapshotRequests;

    const allMatches = searchComprasalAvailableProcesses(
      loaded.snapshot.processes,
      params.query,
    );
    const matches = allMatches.slice(0, params.maxMatches ?? 250);
    const executionCandidates: Array<Record<string, unknown>> = [];
    let candidatesCreated = 0;
    let candidatesUpdated = 0;
    let candidatesUnchanged = 0;
    let candidatesRejected = 0;
    let candidatesDismissed = 0;
    let persistenceErrors = 0;

    for (const [matchIndex, match] of matches.entries()) {
      const mapped = mapComprasalAvailableProcessToSearchResult(
        match.process,
        match.score,
      );
      try {
        const persisted = await params.repository.persistCandidate({
          executionId: execution.id,
          userId: params.userId,
          mapped,
          preliminaryScore: match.score,
          rank: matchIndex + 1,
        });
        if (persisted.kind === "GLOBAL_REJECTED") {
          candidatesRejected += 1;
          continue;
        }
        if (persisted.kind === "DISMISSED") {
          candidatesDismissed += 1;
          continue;
        }

        if (persisted.outcome === "CREATED") candidatesCreated += 1;
        if (persisted.outcome === "UPDATED") candidatesUpdated += 1;
        if (persisted.outcome === "UNCHANGED") candidatesUnchanged += 1;

        executionCandidates.push({
          temporaryId: `result-${persisted.id}`,
          searchResultId: persisted.id,
          title: mapped.title,
          organizationName: mapped.organizationName,
          summary: mapped.snippet,
          officialSourceUrl: mapped.sourceUrl,
          sourceDomain: mapped.sourceDomain,
          deadlineAt: mapped.deadlineAt.toISOString(),
          category: mapped.category,
          stage: "PERSISTENCE",
          outcome: persisted.outcome,
          retrievalScore: match.score,
          preliminaryScore: match.score,
          verificationStatus: "VERIFIED",
          discoveredByQueries: [params.query],
        });
      } catch {
        persistenceErrors += 1;
      }
    }

    const candidatesFound = executionCandidates.length;
    const status: ComprasalAvailableSearchResult["status"] =
      persistenceErrors > 0
        ? candidatesFound > 0
          ? "PARTIALLY_COMPLETED"
          : "FAILED"
        : snapshotPartial
          ? loaded.snapshot.processes.length > 0
            ? "PARTIALLY_COMPLETED"
            : "FAILED"
          : "COMPLETED";
    const resultsLimitReached = allMatches.length > matches.length;
    const metrics: Record<string, unknown> = {
      title: executionTitle,
      query: params.query,
      searchMode: AVAILABLE_PROFILE_KEY,
      searchProvider: "COMPRASAL_AVAILABLE_API",
      executionCandidates,
      cacheHit,
      cacheAgeMs,
      pagesFetchedThisExecution,
      rowsFetchedThisExecution,
      snapshotPages,
      snapshotRows,
      snapshotRequests,
      invalidRows: loaded.snapshot.metrics.invalidRows,
      duplicateRows: loaded.snapshot.metrics.duplicateRows,
      totalRows: loaded.snapshot.metrics.totalRows,
      defensiveLimitReached: loaded.snapshot.metrics.defensiveLimitReached,
      snapshotIssue: loaded.snapshot.metrics.snapshotIssue,
      candidatesFound,
      candidatesFiltered: Math.max(
        0,
        loaded.snapshot.processes.length - allMatches.length,
      ),
      candidatesVerified: candidatesFound,
      candidatesCreated,
      candidatesUpdated,
      candidatesUnchanged,
      candidatesRejected,
      candidatesDismissed,
      persistenceErrors,
      totalMatchesBeforeLimit: allMatches.length,
      matchesPersisted: candidatesFound,
      resultsLimitReached,
      discardCounts: {
        ...(candidatesRejected > 0 ? { REJECTED: candidatesRejected } : {}),
        ...(candidatesDismissed > 0
          ? { DISMISSED: candidatesDismissed }
          : {}),
        ...(persistenceErrors > 0 ? { PERSIST_ERROR: persistenceErrors } : {}),
      },
    };
    await params.repository.finishExecution({
      executionId: execution.id,
      status,
      candidatesFound,
      candidatesDiscarded:
        candidatesRejected + candidatesDismissed + persistenceErrors,
      queriesExecuted,
      metrics,
      errorMessage: snapshotPartial
        ? `${loaded.snapshot.metrics.invalidRows} invalid COMPRASAL row(s) were omitted`
        : persistenceErrors > 0
          ? `${persistenceErrors} COMPRASAL candidate(s) failed to persist`
          : null,
    });

    return {
      executionId: execution.id,
      status,
      candidatesFound,
      candidatesVerified: candidatesFound,
      candidatesCreated,
      candidatesUpdated,
      candidatesUnchanged,
      candidatesRejected,
      candidatesDismissed,
      persistenceErrors,
      cacheHit,
      cacheAgeMs,
      pagesFetched: pagesFetchedThisExecution,
      rowsFetched: rowsFetchedThisExecution,
      pagesFetchedThisExecution,
      rowsFetchedThisExecution,
      snapshotPages,
      snapshotRows,
      totalMatchesBeforeLimit: allMatches.length,
      matchesPersisted: candidatesFound,
      resultsLimitReached,
      queriesExecuted,
      snapshotRequests,
    };
  } catch (error) {
    const paginationMetrics =
      error instanceof ComprasalAvailablePaginationError ? error.metrics : null;
    pagesFetchedThisExecution =
      paginationMetrics?.pagesFetched ?? pagesFetchedThisExecution;
    rowsFetchedThisExecution =
      paginationMetrics?.rowsFetched ?? rowsFetchedThisExecution;
    queriesExecuted =
      paginationMetrics?.requestsExecuted ?? queriesExecuted;
    await params.repository.finishExecution({
      executionId: execution.id,
      status: "FAILED",
      candidatesFound: 0,
      candidatesDiscarded: 0,
      queriesExecuted,
      metrics: {
        title: executionTitle,
        query: params.query,
        searchMode: AVAILABLE_PROFILE_KEY,
        searchProvider: "COMPRASAL_AVAILABLE_API",
        executionCandidates: [],
        cacheHit,
        cacheAgeMs,
        pagesFetchedThisExecution,
        rowsFetchedThisExecution,
        snapshotPages: 0,
        snapshotRows: 0,
        snapshotRequests: 0,
        invalidRows: paginationMetrics?.invalidRows ?? 0,
        duplicateRows: paginationMetrics?.duplicateRows ?? 0,
        snapshotIssue: paginationMetrics?.snapshotIssue ?? null,
        defensiveLimitReached: paginationMetrics?.defensiveLimitReached ?? null,
        persistenceErrors: 0,
        errors: [errorMessage(error)],
      },
      errorMessage: errorMessage(error),
    });
    return {
      executionId: execution.id,
      status: "FAILED",
      candidatesFound: 0,
      candidatesVerified: 0,
      candidatesCreated: 0,
      candidatesUpdated: 0,
      candidatesUnchanged: 0,
      candidatesRejected: 0,
      candidatesDismissed: 0,
      persistenceErrors: 0,
      cacheHit,
      cacheAgeMs,
      pagesFetched: pagesFetchedThisExecution,
      rowsFetched: rowsFetchedThisExecution,
      pagesFetchedThisExecution,
      rowsFetchedThisExecution,
      snapshotPages: 0,
      snapshotRows: 0,
      totalMatchesBeforeLimit: 0,
      matchesPersisted: 0,
      resultsLimitReached: false,
      queriesExecuted,
      snapshotRequests: 0,
    };
  }
}

export async function searchComprasalAvailable(params: {
  userId: string;
  query: string;
}): Promise<ComprasalAvailableSearchResult> {
  const env = getServerEnv();
  const cache = getSnapshotCache(env.COMPRASAL_AVAILABLE_CACHE_TTL_MS);
  const snapshotSignal = AbortSignal.timeout(
    env.COMPRASAL_AVAILABLE_TIME_BUDGET_MS,
  );
  return runComprasalAvailableSearchWithDependencies({
    ...params,
    repository: databaseRepository,
    maxMatches: env.COMPRASAL_AVAILABLE_MAX_MATCHES,
    loadSnapshot: () =>
      cache.get(() =>
        loadComprasalAvailableSnapshot({
          config: {
            perPage: env.COMPRASAL_AVAILABLE_PER_PAGE,
            maxPages: env.COMPRASAL_AVAILABLE_MAX_PAGES,
            maxRows: env.COMPRASAL_AVAILABLE_MAX_ROWS,
            timeBudgetMs: env.COMPRASAL_AVAILABLE_TIME_BUDGET_MS,
          },
          fetchPage: (page, perPage, recordRetry) =>
            fetchComprasalAvailablePage({
              page,
              perPage,
              signal: snapshotSignal,
              onRetry: recordRetry,
            }),
        }),
      ),
  });
}
