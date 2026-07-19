import "server-only";

import { and, desc, eq, inArray, or, sql } from "drizzle-orm";

import {
  buildSearchExecutionSummary,
  mergeCandidateViews,
  normalizeCandidateTrace,
  readDiscardCounts,
  type SearchExecutionCandidateView,
  type SearchExecutionDetail,
  type SearchExecutionListItem,
} from "@/features/projects/search-execution-activity";
import {
  isSearchExecutionHiddenFromHistory,
  withSearchExecutionHiddenFromHistory,
  withSearchExecutionTitle,
} from "@/lib/search-execution-history";
import { db } from "@/server/db";
import {
  searchExecutions,
  searchProfiles,
  searchResults,
} from "@/server/db/schema";
import { searchResultNotDeleted } from "@/server/db/soft-delete";

type Metrics = Record<string, unknown> | null;

function metricString(metrics: Metrics, key: string): string | null {
  const value = metrics?.[key];
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 160)
    : null;
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function executionView(row: {
  id: string;
  status: string;
  estimatedCost: string;
  metrics: Metrics;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  sourceType: string | null;
  profileName: string | null;
}): SearchExecutionDetail["execution"] {
  const title = metricString(row.metrics, "title");
  const rawQuery = metricString(row.metrics, "query");
  const queryLabel =
    title ??
    (rawQuery
      ? (rawQuery.split("\n").find((line) => line.trim())?.trim() ?? rawQuery)
      : null);

  return {
    id: row.id,
    status: row.status,
    outcome: metricString(row.metrics, "outcome"),
    query: queryLabel,
    createdAt: row.createdAt.toISOString(),
    startedAt: toIso(row.startedAt),
    completedAt: toIso(row.completedAt),
    sourceType: row.sourceType ?? "PRIVATE_WEB",
    profileName: row.profileName ?? "Sector privado",
    discoveryMode: metricString(row.metrics, "discoveryMode"),
    searchProvider: metricString(row.metrics, "searchProvider"),
    estimatedCost: row.estimatedCost,
  };
}

function traceCandidates(
  metrics: Metrics,
  executionId: string,
): SearchExecutionCandidateView[] {
  const current = metrics?.executionCandidates;
  const historical = metrics?.discardedTraceSample;
  const traces = Array.isArray(current)
    ? current
    : Array.isArray(historical)
      ? historical
      : [];

  return traces
    .map((trace, index) => normalizeCandidateTrace(trace, executionId, index))
    .filter((candidate): candidate is SearchExecutionCandidateView =>
      Boolean(candidate),
    );
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function readExecutionCandidateResultIds(metrics: Metrics): string[] {
  const candidates = metrics?.executionCandidates;
  if (!Array.isArray(candidates)) return [];
  return [
    ...new Set(
      candidates.flatMap((candidate) => {
        if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
          return [];
        }
        const id = (candidate as Record<string, unknown>).searchResultId;
        return typeof id === "string" && UUID_PATTERN.test(id) ? [id] : [];
      }),
    ),
  ];
}

/** Sidebar / history list cap — high enough for MVP full history + own scroll. */
export const MAX_USER_SEARCH_HISTORY_LIMIT = 100;

export async function listUserSearchExecutions(params: {
  userId: string;
  limit?: number;
}): Promise<SearchExecutionListItem[]> {
  const limit = Math.min(
    MAX_USER_SEARCH_HISTORY_LIMIT,
    Math.max(1, params.limit ?? MAX_USER_SEARCH_HISTORY_LIMIT),
  );
  const rows = await db
    .select({
      id: searchExecutions.id,
      status: searchExecutions.status,
      candidatesFound: searchExecutions.candidatesFound,
      candidatesDiscarded: searchExecutions.candidatesDiscarded,
      estimatedCost: searchExecutions.estimatedCost,
      metrics: searchExecutions.metrics,
      startedAt: searchExecutions.startedAt,
      completedAt: searchExecutions.completedAt,
      createdAt: searchExecutions.createdAt,
      sourceType: searchProfiles.sourceType,
      profileName: searchProfiles.name,
    })
    .from(searchExecutions)
    .innerJoin(
      searchProfiles,
      eq(searchExecutions.searchProfileId, searchProfiles.id),
    )
    .where(
      and(
        eq(searchProfiles.createdByUserId, params.userId),
        inArray(searchProfiles.sourceType, [
          "PRIVATE_WEB",
          "LINKEDIN",
          "COMPRASAL",
        ]),
        sql`coalesce((${searchExecutions.metrics}->>'hiddenFromHistory')::boolean, false) = false`,
      ),
    )
    .orderBy(desc(searchExecutions.createdAt))
    .limit(limit);

  return rows.map((row) => {
    const summary = buildSearchExecutionSummary({
      metrics: row.metrics as Record<string, unknown> | null,
      candidatesFound: row.candidatesFound,
      candidatesDiscarded: row.candidatesDiscarded,
    });
    return {
      ...executionView(row),
      summary: {
        candidatesFound: summary.candidatesFound,
        candidatesVerified: summary.candidatesVerified,
        candidatesCreated: summary.candidatesCreated,
        candidatesUpdated: summary.candidatesUpdated,
        candidatesUnchanged: summary.candidatesUnchanged,
        saved: summary.saved,
      },
    };
  });
}

export async function getUserSearchExecutionDetail(params: {
  executionId: string;
  userId: string;
}): Promise<SearchExecutionDetail | null> {
  const [row] = await db
    .select({
      id: searchExecutions.id,
      status: searchExecutions.status,
      candidatesFound: searchExecutions.candidatesFound,
      candidatesDiscarded: searchExecutions.candidatesDiscarded,
      estimatedCost: searchExecutions.estimatedCost,
      metrics: searchExecutions.metrics,
      startedAt: searchExecutions.startedAt,
      completedAt: searchExecutions.completedAt,
      createdAt: searchExecutions.createdAt,
      sourceType: searchProfiles.sourceType,
      profileName: searchProfiles.name,
    })
    .from(searchExecutions)
    .innerJoin(
      searchProfiles,
      eq(searchExecutions.searchProfileId, searchProfiles.id),
    )
    .where(
      and(
        eq(searchExecutions.id, params.executionId),
        eq(searchProfiles.createdByUserId, params.userId),
      ),
    )
    .limit(1);

  if (!row) {
    return null;
  }

  const metrics = row.metrics as Record<string, unknown> | null;
  if (isSearchExecutionHiddenFromHistory(metrics)) {
    return null;
  }

  const executionCandidateIds = readExecutionCandidateResultIds(metrics);
  const persisted = await db
    .select({
      id: searchResults.id,
      title: searchResults.title,
      organizationName: searchResults.organizationName,
      summary: searchResults.snippet,
      officialSourceUrl: searchResults.sourceUrl,
      sourceDomain: searchResults.sourceDomain,
      deadlineAt: searchResults.deadlineAt,
      category: searchResults.category,
      preliminaryScore: searchResults.preliminaryScore,
      verificationStatus: searchResults.verificationStatus,
      verificationReason: searchResults.verificationReason,
    })
    .from(searchResults)
    .where(
      and(
        executionCandidateIds.length > 0
          ? inArray(searchResults.id, executionCandidateIds)
          : eq(searchResults.searchExecutionId, row.id),
        searchResultNotDeleted(),
      ),
    );

  const persistedCandidates = persisted
    .map((candidate, index) =>
      normalizeCandidateTrace(
        {
          temporaryId: `result-${candidate.id}`,
          searchResultId: candidate.id,
          title: candidate.title,
          organizationName: candidate.organizationName,
          summary: candidate.summary,
          officialSourceUrl: candidate.officialSourceUrl,
          sourceDomain: candidate.sourceDomain,
          deadlineAt: candidate.deadlineAt?.toISOString(),
          category: candidate.category,
          stage: "PERSISTENCE",
          outcome: "VERIFIED",
          preliminaryScore: candidate.preliminaryScore,
          verificationStatus: candidate.verificationStatus,
          reason: candidate.verificationReason,
        },
        row.id,
        index,
      ),
    )
    .filter((candidate): candidate is SearchExecutionCandidateView =>
      Boolean(candidate),
    );

  const merged = mergeCandidateViews([
    ...persistedCandidates,
    ...traceCandidates(metrics, row.id),
  ]);

  const attached = await attachSearchResultIdsToCandidates({
    candidates: merged,
  });
  const candidates =
    row.sourceType === "COMPRASAL"
      ? attached.sort(
          (left, right) =>
            (right.preliminaryScore ?? 0) - (left.preliminaryScore ?? 0) ||
            (left.deadlineAt ?? "").localeCompare(right.deadlineAt ?? "") ||
            (left.title ?? "").localeCompare(right.title ?? ""),
        )
      : attached;

  return {
    execution: executionView(row),
    summary: buildSearchExecutionSummary({
      metrics,
      candidatesFound: row.candidatesFound,
      candidatesDiscarded: row.candidatesDiscarded,
    }),
    discardCounts: readDiscardCounts(metrics),
    candidates,
  };
}

/** Links legacy home candidates to search_results rows by URL without mutating ownership. */
async function attachSearchResultIdsToCandidates(params: {
  candidates: SearchExecutionCandidateView[];
}): Promise<SearchExecutionCandidateView[]> {
  if (params.candidates.every((candidate) => Boolean(candidate.searchResultId))) {
    return params.candidates;
  }

  const urls = [
    ...new Set(
      params.candidates
        .map((candidate) => candidate.officialSourceUrl)
        .filter((url): url is string => Boolean(url)),
    ),
  ];

  if (urls.length === 0) {
    return params.candidates;
  }

  const rows = await db
    .select({
      id: searchResults.id,
      sourceUrl: searchResults.sourceUrl,
      sourceOriginalUrl: searchResults.sourceOriginalUrl,
      sourceResolvedUrl: searchResults.sourceResolvedUrl,
    })
    .from(searchResults)
    .where(
      and(
        searchResultNotDeleted(),
        or(
          inArray(searchResults.sourceUrl, urls),
          inArray(searchResults.sourceOriginalUrl, urls),
          inArray(searchResults.sourceResolvedUrl, urls),
        ),
      ),
    );

  if (rows.length === 0) {
    return params.candidates;
  }

  const idByUrl = new Map<string, string>();
  for (const row of rows) {
    for (const url of [
      row.sourceUrl,
      row.sourceOriginalUrl,
      row.sourceResolvedUrl,
    ]) {
      if (url) {
        idByUrl.set(url.toLowerCase(), row.id);
      }
    }
  }

  return params.candidates.map((candidate) => {
    if (candidate.searchResultId) {
      return candidate;
    }

    const matchedId = candidate.officialSourceUrl
      ? (idByUrl.get(candidate.officialSourceUrl.toLowerCase()) ?? null)
      : null;

    if (!matchedId) {
      return candidate;
    }

    return {
      ...candidate,
      searchResultId: matchedId,
      temporaryId: `result-${matchedId}`,
    };
  });
}

async function getOwnedSearchExecution(params: {
  executionId: string;
  userId: string;
}) {
  const [row] = await db
    .select({
      id: searchExecutions.id,
      metrics: searchExecutions.metrics,
    })
    .from(searchExecutions)
    .innerJoin(
      searchProfiles,
      eq(searchExecutions.searchProfileId, searchProfiles.id),
    )
    .where(
      and(
        eq(searchExecutions.id, params.executionId),
        eq(searchProfiles.createdByUserId, params.userId),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function renameUserSearchExecution(params: {
  executionId: string;
  userId: string;
  title: string;
}): Promise<{ id: string; title: string } | null> {
  const row = await getOwnedSearchExecution(params);
  if (!row || isSearchExecutionHiddenFromHistory(row.metrics)) {
    return null;
  }

  const nextMetrics = withSearchExecutionTitle(row.metrics, params.title);
  const title = String(nextMetrics.title);

  await db
    .update(searchExecutions)
    .set({ metrics: nextMetrics })
    .where(eq(searchExecutions.id, row.id));

  return { id: row.id, title };
}

export async function hideUserSearchExecutionFromHistory(params: {
  executionId: string;
  userId: string;
}): Promise<{ id: string } | null> {
  const row = await getOwnedSearchExecution(params);
  if (!row || isSearchExecutionHiddenFromHistory(row.metrics)) {
    return null;
  }

  await db
    .update(searchExecutions)
    .set({
      metrics: withSearchExecutionHiddenFromHistory(row.metrics),
    })
    .where(eq(searchExecutions.id, row.id));

  return { id: row.id };
}

export type UserSearchExecutionResultDetail = {
  id: string;
  searchExecutionId: string;
  title: string;
  snippet: string | null;
  sourceUrl: string;
  deadlineAt: Date | null;
  estimatedAmount: string | null;
  currency: string | null;
  amountStatus: string;
};

/** Returns a persisted search result owned by the user within a given execution. */
export async function getUserSearchExecutionResultDetail(params: {
  executionId: string;
  leadId: string;
  userId: string;
}): Promise<UserSearchExecutionResultDetail | null> {
  const execution = await getOwnedSearchExecution({
    executionId: params.executionId,
    userId: params.userId,
  });
  if (!execution || isSearchExecutionHiddenFromHistory(execution.metrics)) {
    return null;
  }

  const executionCandidateIds = readExecutionCandidateResultIds(
    execution.metrics as Metrics,
  );
  if (
    executionCandidateIds.length > 0 &&
    !executionCandidateIds.includes(params.leadId)
  ) {
    return null;
  }

  const [result] = await db
    .select({
      id: searchResults.id,
      searchExecutionId: searchResults.searchExecutionId,
      title: searchResults.title,
      snippet: searchResults.snippet,
      sourceUrl: searchResults.sourceUrl,
      deadlineAt: searchResults.deadlineAt,
      estimatedAmount: searchResults.estimatedAmount,
      currency: searchResults.currency,
      amountStatus: searchResults.amountStatus,
    })
    .from(searchResults)
    .where(
      and(
        eq(searchResults.id, params.leadId),
        executionCandidateIds.length > 0
          ? inArray(searchResults.id, executionCandidateIds)
          : eq(searchResults.searchExecutionId, params.executionId),
        searchResultNotDeleted(),
      ),
    )
    .limit(1);

  if (!result) {
    return null;
  }

  return {
    id: result.id,
    searchExecutionId: params.executionId,
    title: result.title,
    snippet: result.snippet,
    sourceUrl: result.sourceUrl,
    deadlineAt: result.deadlineAt,
    estimatedAmount: result.estimatedAmount,
    currency: result.currency,
    amountStatus: result.amountStatus,
  };
}
