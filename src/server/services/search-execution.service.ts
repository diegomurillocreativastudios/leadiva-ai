import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";

import {
  buildSearchExecutionSummary,
  mergeCandidateViews,
  normalizeCandidateTrace,
  readDiscardCounts,
  type SearchExecutionCandidateView,
  type SearchExecutionDetail,
  type SearchExecutionListItem,
} from "@/features/projects/search-execution-activity";
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
  return {
    id: row.id,
    status: row.status,
    outcome: metricString(row.metrics, "outcome"),
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

export async function listUserSearchExecutions(params: {
  userId: string;
  limit?: number;
}): Promise<SearchExecutionListItem[]> {
  const limit = Math.min(20, Math.max(1, params.limit ?? 20));
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
        inArray(searchProfiles.sourceType, ["PRIVATE_WEB", "LINKEDIN"]),
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
        eq(searchResults.searchExecutionId, row.id),
        searchResultNotDeleted(),
      ),
    );

  const persistedCandidates = persisted
    .map((candidate, index) =>
      normalizeCandidateTrace(
        {
          temporaryId: `result-${candidate.id}`,
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

  const metrics = row.metrics as Record<string, unknown> | null;

  return {
    execution: executionView(row),
    summary: buildSearchExecutionSummary({
      metrics,
      candidatesFound: row.candidatesFound,
      candidatesDiscarded: row.candidatesDiscarded,
    }),
    discardCounts: readDiscardCounts(metrics),
    candidates: mergeCandidateViews([
      ...traceCandidates(metrics, row.id),
      ...persistedCandidates,
    ]),
  };
}
