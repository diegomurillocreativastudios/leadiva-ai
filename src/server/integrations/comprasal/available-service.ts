import "server-only";

import { and, eq } from "drizzle-orm";

import { getServerEnv } from "@/env/server";
import { db } from "@/server/db";
import {
  searchExecutions,
  searchProfiles,
  searchResults,
} from "@/server/db/schema";
import { searchResultNotDeleted } from "@/server/db/soft-delete";
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

type ExistingComprasalResult = {
  id: string;
  contentHash: string | null;
  verificationStatus: string;
};

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
  findCanonicalResult(externalId: string): Promise<ExistingComprasalResult | null>;
  createResult(
    executionId: string,
    mapped: MappedComprasalAvailableSearchResult,
  ): Promise<{ id: string }>;
  updateResult(
    id: string,
    mapped: MappedComprasalAvailableSearchResult,
  ): Promise<void>;
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
  persistenceErrors: number;
  cacheHit: boolean;
  cacheAgeMs: number;
  pagesFetched: number;
  rowsFetched: number;
};

const databaseRepository: ComprasalAvailableSearchRepository = {
  async ensureProfile(userId) {
    const [existing] = await db
      .select({ id: searchProfiles.id })
      .from(searchProfiles)
      .where(
        and(
          eq(searchProfiles.sourceType, "COMPRASAL"),
          eq(searchProfiles.createdByUserId, userId),
        ),
      )
      .limit(1);
    if (existing) return existing;

    const [created] = await db
      .insert(searchProfiles)
      .values({
        name: "COMPRASAL — búsqueda de oportunidades",
        description: "Búsqueda local en oportunidades disponibles de COMPRASAL",
        sourceType: "COMPRASAL",
        keywords: [],
        createdByUserId: userId,
        isActive: true,
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
      })
      .returning({ id: searchExecutions.id });
    if (!execution) throw new Error("Could not create COMPRASAL search execution");
    return execution;
  },
  async findCanonicalResult(externalId) {
    const [existing] = await db
      .select({
        id: searchResults.id,
        contentHash: searchResults.contentHash,
        verificationStatus: searchResults.verificationStatus,
      })
      .from(searchResults)
      .where(
        and(
          eq(searchResults.sourceType, "COMPRASAL"),
          eq(searchResults.externalId, externalId),
          searchResultNotDeleted(),
        ),
      )
      .limit(1);
    return existing ?? null;
  },
  async createResult(executionId, mapped) {
    const [created] = await db
      .insert(searchResults)
      .values({ ...mapped, searchExecutionId: executionId, discoveredAt: new Date() })
      .returning({ id: searchResults.id });
    if (!created) throw new Error("Could not persist COMPRASAL candidate");
    return created;
  },
  async updateResult(id, mapped) {
    // searchExecutionId is deliberately absent: canonical rows never change ownership.
    await db.update(searchResults).set(mapped).where(eq(searchResults.id, id));
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
  return error instanceof Error ? error.message.slice(0, 2000) : "COMPRASAL search failed";
}

export async function runComprasalAvailableSearchWithDependencies(params: {
  userId: string;
  query: string;
  repository: ComprasalAvailableSearchRepository;
  loadSnapshot: () => Promise<ComprasalAvailableSnapshotCacheResult>;
}): Promise<ComprasalAvailableSearchResult> {
  const profile = await params.repository.ensureProfile(params.userId);
  const execution = await params.repository.createExecution(profile.id);
  let cacheHit = false;
  let cacheAgeMs = 0;
  let pagesFetched = 0;
  let rowsFetched = 0;

  try {
    const loaded = await params.loadSnapshot();
    cacheHit = loaded.cacheHit;
    cacheAgeMs = loaded.cacheAgeMs;
    pagesFetched = loaded.snapshot.metrics.pagesFetched;
    rowsFetched = loaded.snapshot.metrics.rowsFetched;
    const matches = searchComprasalAvailableProcesses(
      loaded.snapshot.processes,
      params.query,
    );
    const executionCandidates: Array<Record<string, unknown>> = [];
    let candidatesCreated = 0;
    let candidatesUpdated = 0;
    let candidatesUnchanged = 0;
    let candidatesRejected = 0;
    let persistenceErrors = 0;

    for (const match of matches) {
      const mapped = mapComprasalAvailableProcessToSearchResult(
        match.process,
        match.score,
      );
      try {
        const existing = await params.repository.findCanonicalResult(
          match.process.externalId,
        );
        if (existing?.verificationStatus === "REJECTED") {
          candidatesRejected += 1;
          continue;
        }

        let resultId: string;
        let outcome: PersistOutcome;
        if (!existing) {
          resultId = (await params.repository.createResult(execution.id, mapped)).id;
          outcome = "CREATED";
          candidatesCreated += 1;
        } else if (existing.contentHash === mapped.contentHash) {
          resultId = existing.id;
          outcome = "UNCHANGED";
          candidatesUnchanged += 1;
        } else {
          await params.repository.updateResult(existing.id, mapped);
          resultId = existing.id;
          outcome = "UPDATED";
          candidatesUpdated += 1;
        }

        executionCandidates.push({
          temporaryId: `result-${resultId}`,
          searchResultId: resultId,
          title: mapped.title,
          organizationName: mapped.organizationName,
          summary: mapped.snippet,
          officialSourceUrl: mapped.sourceUrl,
          sourceDomain: mapped.sourceDomain,
          deadlineAt: mapped.deadlineAt.toISOString(),
          category: mapped.category,
          stage: "PERSISTENCE",
          outcome,
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
    const status =
      persistenceErrors === 0
        ? "COMPLETED"
        : candidatesFound > 0
          ? "PARTIALLY_COMPLETED"
          : "FAILED";
    const metrics: Record<string, unknown> = {
      title: params.query,
      query: params.query,
      searchProvider: "COMPRASAL_AVAILABLE_API",
      executionCandidates,
      cacheHit,
      cacheAgeMs,
      pagesFetched,
      rowsFetched,
      invalidRows: loaded.snapshot.metrics.invalidRows,
      duplicateRows: loaded.snapshot.metrics.duplicateRows,
      totalRows: loaded.snapshot.metrics.totalRows,
      defensiveLimitReached: loaded.snapshot.metrics.defensiveLimitReached,
      candidatesFound,
      candidatesFiltered: loaded.snapshot.processes.length - matches.length,
      candidatesVerified: candidatesFound,
      candidatesCreated,
      candidatesUpdated,
      candidatesUnchanged,
      candidatesRejected,
      persistenceErrors,
      discardCounts: {
        ...(candidatesRejected > 0 ? { REJECTED: candidatesRejected } : {}),
        ...(persistenceErrors > 0 ? { PERSIST_ERROR: persistenceErrors } : {}),
      },
    };
    await params.repository.finishExecution({
      executionId: execution.id,
      status,
      candidatesFound,
      candidatesDiscarded: candidatesRejected + persistenceErrors,
      queriesExecuted: pagesFetched,
      metrics,
      errorMessage:
        persistenceErrors > 0
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
      persistenceErrors,
      cacheHit,
      cacheAgeMs,
      pagesFetched,
      rowsFetched,
    };
  } catch (error) {
    const paginationMetrics =
      error instanceof ComprasalAvailablePaginationError ? error.metrics : null;
    await params.repository.finishExecution({
      executionId: execution.id,
      status: "FAILED",
      candidatesFound: 0,
      candidatesDiscarded: 0,
      queriesExecuted: paginationMetrics?.pagesFetched ?? pagesFetched,
      metrics: {
        title: params.query,
        query: params.query,
        searchProvider: "COMPRASAL_AVAILABLE_API",
        executionCandidates: [],
        cacheHit,
        cacheAgeMs,
        pagesFetched: paginationMetrics?.pagesFetched ?? pagesFetched,
        rowsFetched: paginationMetrics?.rowsFetched ?? rowsFetched,
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
      persistenceErrors: 0,
      cacheHit,
      cacheAgeMs,
      pagesFetched: paginationMetrics?.pagesFetched ?? pagesFetched,
      rowsFetched: paginationMetrics?.rowsFetched ?? rowsFetched,
    };
  }
}

export async function searchComprasalAvailable(params: {
  userId: string;
  query: string;
}): Promise<ComprasalAvailableSearchResult> {
  const env = getServerEnv();
  const cache = getSnapshotCache(env.COMPRASAL_AVAILABLE_CACHE_TTL_MS);
  return runComprasalAvailableSearchWithDependencies({
    ...params,
    repository: databaseRepository,
    loadSnapshot: () =>
      cache.get(() =>
        loadComprasalAvailableSnapshot({
          config: {
            perPage: env.COMPRASAL_AVAILABLE_PER_PAGE,
            maxPages: env.COMPRASAL_AVAILABLE_MAX_PAGES,
            maxRows: env.COMPRASAL_AVAILABLE_MAX_ROWS,
          },
          fetchPage: (page, perPage) =>
            fetchComprasalAvailablePage({ page, perPage }),
        }),
      ),
  });
}
