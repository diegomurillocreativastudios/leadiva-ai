import "server-only";

import { and, desc, eq, gt, inArray, isNull, ne, or, sql } from "drizzle-orm";

import { getServerEnv } from "@/env/server";
import { db } from "@/server/db";
import {
  searchExecutions,
  searchProfiles,
  searchResults,
} from "@/server/db/schema";
import { searchResultNotDeleted } from "@/server/db/soft-delete";
import {
  fetchComprasalPage,
  type ComprasalPageResult,
} from "./client";
import { classifyComprasalProcess } from "./filters";
import {
  mapComprasalProcessToSearchResult,
  type MappedComprasalSearchResult,
} from "./mapper";
import { normalizeComprasalRecord } from "./normalize";
import { prepareComprasalBatch } from "./prepare";
import {
  buildRelevanceOptions,
  type ComprasalRelevanceOptions,
} from "./relevance";

export type ComprasalSyncMetrics = {
  candidatesCreated: number;
  candidatesUpdated: number;
  candidatesUnchanged: number;
  candidatesDiscarded: number;
  discardCounts: Record<string, number>;
  pageErrors: string[];
  invalidRows: number;
};

export type ComprasalSyncResult = {
  executionId: string;
  status: "COMPLETED" | "PARTIALLY_COMPLETED" | "FAILED";
  queriesExecuted: number;
  candidatesFound: number;
  candidatesCreated: number;
  candidatesUpdated: number;
  candidatesUnchanged: number;
  candidatesDiscarded: number;
  discardCounts: Record<string, number>;
  pageErrors: string[];
};

const DEFAULT_COMPRASAL_PROFILES = [
  {
    name: "COMPRASAL — sync general",
    description: "Sincronización general de procesos públicos COMPRASAL",
    keywords: ["software", "sistema", "consultoria", "tecnologia", "ia"],
  },
  {
    name: "COMPRASAL — software e IT",
    description: "Perfil enfocado en software, sistemas e IT",
    keywords: ["software", "sistema", "aplicacion", "plataforma", "tecnologia"],
  },
  {
    name: "COMPRASAL — consultoría y AI",
    description: "Perfil enfocado en consultoría e inteligencia artificial",
    keywords: ["consultoria", "asesoria", "inteligencia artificial", "ia"],
  },
] as const;

async function ensureComprasalProfiles(userId?: string) {
  const existing = await db
    .select()
    .from(searchProfiles)
    .where(
      and(
        eq(searchProfiles.sourceType, "COMPRASAL"),
        or(
          isNull(searchProfiles.profileKey),
          ne(searchProfiles.profileKey, "AVAILABLE_SEARCH"),
        ),
      ),
    );

  if (existing.length === 0) {
    const inserted = await db
      .insert(searchProfiles)
      .values(
        DEFAULT_COMPRASAL_PROFILES.map((profile) => ({
          name: profile.name,
          description: profile.description,
          sourceType: "COMPRASAL" as const,
          keywords: [...profile.keywords],
          createdByUserId: userId,
          isActive: true,
        })),
      )
      .returning();
    return inserted[0];
  }

  return (
    existing.find((profile) => profile.name.includes("sync general")) ??
    existing[0]
  );
}

export type ComprasalRemapResult = {
  updated: number;
  skipped: number;
  rejectedNoise: number;
  removedDuplicates: number;
};

/**
 * Re-maps stored COMPRASAL award rows to process-level identity,
 * rejects noise/irrelevant leftovers, and collapses duplicate process rows.
 */
export async function remapStoredComprasalFromRaw(
  relevance: ComprasalRelevanceOptions = buildRelevanceOptions(),
): Promise<ComprasalRemapResult> {
  const rows = await db
    .select({
      id: searchResults.id,
      title: searchResults.title,
      externalId: searchResults.externalId,
      contentHash: searchResults.contentHash,
      verificationStatus: searchResults.verificationStatus,
      discoveredAt: searchResults.discoveredAt,
      rawData: searchResults.rawData,
    })
    .from(searchResults)
    .where(
      and(
        eq(searchResults.sourceType, "COMPRASAL"),
        searchResultNotDeleted(),
        sql`coalesce(${searchResults.externalId}, '') not like 'available:%'`,
      ),
    );

  let skipped = 0;
  let rejectedNoise = 0;
  let updated = 0;
  let removedDuplicates = 0;

  const noiseIds: string[] = [];
  const awardGroups = new Map<
    string,
    Array<{
      id: string;
      title: string;
      externalId: string | null;
      contentHash: string | null;
      verificationStatus: string;
      discoveredAt: Date | null;
      mapped: MappedComprasalSearchResult;
    }>
  >();

  for (const row of rows) {
    const normalized = normalizeComprasalRecord(row.rawData);
    if (!normalized) {
      skipped += 1;
      continue;
    }

    const decision = classifyComprasalProcess(
      normalized,
      new Date(),
      relevance,
    );
    if (!decision.accept) {
      if (row.verificationStatus !== "REJECTED") {
        noiseIds.push(row.id);
      } else {
        skipped += 1;
      }
      continue;
    }

    if (normalized.recordKind !== "AWARD") {
      skipped += 1;
      continue;
    }

    const mapped = mapComprasalProcessToSearchResult(normalized, {
      preliminaryScore: decision.score ?? null,
    });
    const processKey = mapped.externalId;
    if (!processKey) {
      skipped += 1;
      continue;
    }

    const group = awardGroups.get(processKey) ?? [];
    group.push({
      id: row.id,
      title: row.title,
      externalId: row.externalId,
      contentHash: row.contentHash,
      verificationStatus: row.verificationStatus,
      discoveredAt: row.discoveredAt,
      mapped,
    });
    awardGroups.set(processKey, group);
  }

  if (noiseIds.length > 0) {
    await db
      .update(searchResults)
      .set({ verificationStatus: "REJECTED" })
      .where(inArray(searchResults.id, noiseIds));
    rejectedNoise = noiseIds.length;
  }

  const idsToDelete: string[] = [];

  for (const group of awardGroups.values()) {
    group.sort((a, b) => {
      const aVerified = a.verificationStatus === "VERIFIED" ? 1 : 0;
      const bVerified = b.verificationStatus === "VERIFIED" ? 1 : 0;
      if (aVerified !== bVerified) {
        return bVerified - aVerified;
      }
      const aTime = a.discoveredAt?.getTime() ?? 0;
      const bTime = b.discoveredAt?.getTime() ?? 0;
      return aTime - bTime;
    });

    const extras = group.slice(1);
    for (const extra of extras) {
      idsToDelete.push(extra.id);
    }
  }

  if (idsToDelete.length > 0) {
    const uniqueIds = [...new Set(idsToDelete)];
    await db.delete(searchResults).where(inArray(searchResults.id, uniqueIds));
    removedDuplicates = uniqueIds.length;
  }

  for (const group of awardGroups.values()) {
    const keeper = group[0];
    if (!keeper) {
      continue;
    }

    const { mapped } = keeper;
    const alreadyCurrent =
      mapped.contentHash &&
      keeper.contentHash &&
      mapped.contentHash === keeper.contentHash &&
      mapped.title === keeper.title &&
      mapped.externalId === keeper.externalId;

    if (alreadyCurrent) {
      skipped += 1;
      continue;
    }

    await db
      .update(searchResults)
      .set({
        externalId: mapped.externalId,
        title: mapped.title,
        snippet: mapped.snippet,
        sourceUrl: mapped.sourceUrl,
        normalizedUrl: mapped.normalizedUrl,
        organizationName: mapped.organizationName,
        category: mapped.category,
        contractingSector: mapped.contractingSector,
        estimatedAmount: mapped.estimatedAmount,
        currency: mapped.currency,
        amountStatus: mapped.amountStatus,
        sourceIsSpecific: mapped.sourceIsSpecific,
        publishedAt: mapped.publishedAt,
        deadlineAt: mapped.deadlineAt,
        contentHash: mapped.contentHash,
        preliminaryScore: mapped.preliminaryScore,
        rawData: mapped.rawData,
        verificationStatus:
          keeper.verificationStatus === "REJECTED"
            ? "REJECTED"
            : keeper.verificationStatus === "VERIFIED"
              ? "VERIFIED"
              : "PENDING",
      })
      .where(eq(searchResults.id, keeper.id));

    updated += 1;
  }

  return { updated, skipped, rejectedNoise, removedDuplicates };
}

async function assertNoOverlappingSync() {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  const [running] = await db
    .select({ id: searchExecutions.id })
    .from(searchExecutions)
    .innerJoin(
      searchProfiles,
      eq(searchExecutions.searchProfileId, searchProfiles.id),
    )
    .where(
      and(
        eq(searchProfiles.sourceType, "COMPRASAL"),
        or(
          isNull(searchProfiles.profileKey),
          ne(searchProfiles.profileKey, "AVAILABLE_SEARCH"),
        ),
        eq(searchExecutions.status, "RUNNING"),
        gt(searchExecutions.startedAt, fiveMinutesAgo),
      ),
    )
    .limit(1);

  if (running) {
    throw new Error("COMPRASAL_SYNC_ALREADY_RUNNING");
  }
}

async function upsertComprasalCandidate(params: {
  executionId: string;
  mapped: MappedComprasalSearchResult;
}): Promise<"created" | "updated" | "unchanged"> {
  const { mapped, executionId } = params;

  if (mapped.externalId) {
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
          eq(searchResults.externalId, mapped.externalId),
          searchResultNotDeleted(),
        ),
      )
      .limit(1);

    if (existing) {
      if (
        existing.contentHash &&
        mapped.contentHash &&
        existing.contentHash === mapped.contentHash
      ) {
        return "unchanged";
      }

      await db
        .update(searchResults)
        .set({
          searchExecutionId: executionId,
          title: mapped.title,
          snippet: mapped.snippet,
          sourceUrl: mapped.sourceUrl,
          normalizedUrl: mapped.normalizedUrl,
          organizationName: mapped.organizationName,
          category: mapped.category,
          contractingSector: mapped.contractingSector,
          estimatedAmount: mapped.estimatedAmount,
          currency: mapped.currency,
          amountStatus: mapped.amountStatus,
          sourceIsSpecific: mapped.sourceIsSpecific,
          publishedAt: mapped.publishedAt,
          deadlineAt: mapped.deadlineAt,
          contentHash: mapped.contentHash,
          preliminaryScore: mapped.preliminaryScore,
          rawData: mapped.rawData,
          verificationStatus:
            existing.verificationStatus === "REJECTED"
              ? "REJECTED"
              : existing.verificationStatus === "VERIFIED"
                ? "VERIFIED"
                : "PENDING",
        })
        .where(eq(searchResults.id, existing.id));

      return "updated";
    }
  }

  const [existingByUrl] = await db
    .select({
      id: searchResults.id,
      contentHash: searchResults.contentHash,
      verificationStatus: searchResults.verificationStatus,
      externalId: searchResults.externalId,
    })
    .from(searchResults)
    .where(
      and(
        eq(searchResults.normalizedUrl, mapped.normalizedUrl),
        searchResultNotDeleted(),
        sql`coalesce(${searchResults.externalId}, '') not like 'available:%'`,
      ),
    )
    .limit(1);

  if (existingByUrl) {
    if (
      existingByUrl.contentHash &&
      mapped.contentHash &&
      existingByUrl.contentHash === mapped.contentHash
    ) {
      return "unchanged";
    }

    await db
      .update(searchResults)
      .set({
        searchExecutionId: executionId,
        externalId: mapped.externalId ?? existingByUrl.externalId,
        title: mapped.title,
        snippet: mapped.snippet,
        organizationName: mapped.organizationName,
        category: mapped.category,
        contractingSector: mapped.contractingSector,
        estimatedAmount: mapped.estimatedAmount,
        currency: mapped.currency,
        amountStatus: mapped.amountStatus,
        sourceIsSpecific: mapped.sourceIsSpecific,
        publishedAt: mapped.publishedAt,
        deadlineAt: mapped.deadlineAt,
        contentHash: mapped.contentHash,
        preliminaryScore: mapped.preliminaryScore,
        rawData: mapped.rawData,
        verificationStatus:
          existingByUrl.verificationStatus === "REJECTED"
            ? "REJECTED"
            : existingByUrl.verificationStatus === "VERIFIED"
              ? "VERIFIED"
              : "PENDING",
      })
      .where(eq(searchResults.id, existingByUrl.id));

    return "updated";
  }

  await db.insert(searchResults).values({
    searchExecutionId: executionId,
    ...mapped,
    discoveredAt: new Date(),
  });

  return "created";
}

export async function syncComprasal(options?: {
  userId?: string;
  interestCategories?: string[];
  fetchPage?: typeof fetchComprasalPage;
}): Promise<ComprasalSyncResult> {
  const env = getServerEnv();
  const fetchPage = options?.fetchPage ?? fetchComprasalPage;
  const maxPages = env.COMPRASAL_SYNC_MAX_PAGES;

  await assertNoOverlappingSync();

  const profile = await ensureComprasalProfiles(options?.userId);
  const relevance = buildRelevanceOptions({
    interestCategories: options?.interestCategories,
    profileKeywords: profile.keywords,
    excludedKeywords: profile.excludedKeywords,
  });

  await remapStoredComprasalFromRaw(relevance);

  const [execution] = await db
    .insert(searchExecutions)
    .values({
      searchProfileId: profile.id,
      status: "RUNNING",
      startedAt: new Date(),
    })
    .returning();

  let queriesExecuted = 0;
  let candidatesCreated = 0;
  let candidatesUpdated = 0;
  let candidatesUnchanged = 0;
  let candidatesDiscarded = 0;
  let invalidRows = 0;
  const discardCounts: Record<string, number> = {};
  const pageErrors: string[] = [];

  const bumpDiscard = (reason: string, count = 1) => {
    discardCounts[reason] = (discardCounts[reason] ?? 0) + count;
    candidatesDiscarded += count;
  };

  const buildMetrics = (): ComprasalSyncMetrics => ({
    candidatesCreated,
    candidatesUpdated,
    candidatesUnchanged,
    candidatesDiscarded,
    discardCounts,
    pageErrors,
    invalidRows,
  });

  try {
    for (let page = 1; page <= maxPages; page += 1) {
      queriesExecuted += 1;

      let pageResult: ComprasalPageResult;
      try {
        pageResult = await fetchPage({ page, perPage: 50 });
      } catch (error) {
        const message = error instanceof Error ? error.message : "page failed";
        pageErrors.push(`page ${page}: ${message}`);
        continue;
      }

      invalidRows += pageResult.invalidRows;
      if (pageResult.invalidRows > 0) {
        bumpDiscard("INVALID_ROW", pageResult.invalidRows);
      }

      if (pageResult.items.length === 0) {
        break;
      }

      const prepared = prepareComprasalBatch(
        pageResult.items,
        new Date(),
        relevance,
      );

      for (const [reason, count] of Object.entries(prepared.discardCounts)) {
        if (count > 0) {
          bumpDiscard(reason, count);
        }
      }

      for (const candidate of prepared.accepted) {
        try {
          const outcome = await upsertComprasalCandidate({
            executionId: execution.id,
            mapped: candidate.mapped,
          });
          if (outcome === "created") {
            candidatesCreated += 1;
          } else if (outcome === "updated") {
            candidatesUpdated += 1;
          } else {
            candidatesUnchanged += 1;
          }
        } catch {
          bumpDiscard("PERSIST_ERROR");
        }
      }

      if (!pageResult.meta.hasMore) {
        break;
      }
    }

    const candidatesFound = candidatesCreated + candidatesUpdated;
    const status: ComprasalSyncResult["status"] =
      pageErrors.length > 0 && candidatesFound > 0
        ? "PARTIALLY_COMPLETED"
        : pageErrors.length > 0 && candidatesFound === 0
          ? "FAILED"
          : "COMPLETED";

    await db
      .update(searchExecutions)
      .set({
        status,
        queriesExecuted,
        candidatesFound,
        candidatesDiscarded,
        metrics: buildMetrics(),
        errorMessage:
          pageErrors.length > 0 ? pageErrors.join(" | ").slice(0, 2000) : null,
        completedAt: new Date(),
      })
      .where(eq(searchExecutions.id, execution.id));

    return {
      executionId: execution.id,
      status,
      queriesExecuted,
      candidatesFound,
      candidatesCreated,
      candidatesUpdated,
      candidatesUnchanged,
      candidatesDiscarded,
      discardCounts,
      pageErrors,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    await db
      .update(searchExecutions)
      .set({
        status: "FAILED",
        errorMessage: message.slice(0, 2000),
        queriesExecuted,
        candidatesFound: candidatesCreated + candidatesUpdated,
        candidatesDiscarded,
        metrics: buildMetrics(),
        completedAt: new Date(),
      })
      .where(eq(searchExecutions.id, execution.id));

    throw error;
  }
}

export async function getLatestComprasalSync() {
  const [row] = await db
    .select({
      id: searchExecutions.id,
      status: searchExecutions.status,
      queriesExecuted: searchExecutions.queriesExecuted,
      candidatesFound: searchExecutions.candidatesFound,
      candidatesDiscarded: searchExecutions.candidatesDiscarded,
      metrics: searchExecutions.metrics,
      errorMessage: searchExecutions.errorMessage,
      startedAt: searchExecutions.startedAt,
      completedAt: searchExecutions.completedAt,
      createdAt: searchExecutions.createdAt,
      profileName: searchProfiles.name,
    })
    .from(searchExecutions)
    .innerJoin(
      searchProfiles,
      eq(searchExecutions.searchProfileId, searchProfiles.id),
    )
    .where(
      and(
        eq(searchProfiles.sourceType, "COMPRASAL"),
        inArray(searchExecutions.status, [
          "COMPLETED",
          "PARTIALLY_COMPLETED",
          "FAILED",
          "RUNNING",
        ]),
      ),
    )
    .orderBy(desc(searchExecutions.createdAt))
    .limit(1);

  return row ?? null;
}
