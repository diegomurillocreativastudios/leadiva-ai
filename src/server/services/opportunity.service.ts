import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  notInArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import {
  assertOpportunityTransition,
  isOpportunityStatus,
  terminalOpportunityStatuses,
  type LeadSortOption,
} from "@/lib/lead-pipeline";
import {
  addDays,
  startOfUtcDay,
} from "@/lib/filters/presets";
import {
  buildDuplicateSignals,
  getDeadlineVigency,
  type ProjectSortOption,
} from "@/lib/project-catalog";
import { extractDomain, normalizeUrl, slugify } from "@/lib/normalization";
import {
  canReturnExistingLeadToUser,
  getSearchResultConversionError,
} from "@/lib/search-result-conversion";
import { isGenericOrListingSourceUrl } from "@/lib/source-url-specificity";
import type { LeadFiltersInput } from "@/schemas/leads";
import type { ProjectFiltersResolved } from "@/schemas/projects";
import { db } from "@/server/db";
import { withTransientDbRetry } from "@/server/db/retry";
import {
  opportunityNotDeleted,
  searchResultNotDeleted,
} from "@/server/db/soft-delete";
import { validateSourceUrl } from "@/server/services/source-url-validation";
import { evaluatePrivateWebUrl } from "@/server/integrations/private-web/domain-policy";
import {
  opportunities,
  opportunityNotes,
  opportunitySources,
  opportunityStatusHistory,
  organizations,
  searchExecutions,
  searchExecutionResults,
  searchProfiles,
  searchResults,
  userSearchResultStates,
  users,
} from "@/server/db/schema";
import type { OpportunityStatus } from "@/server/db/schema/enums";

function buildSearchResultConditions(
  filters: ProjectFiltersResolved,
  now: Date,
): SQL[] {
  const conditions: SQL[] = [searchResultNotDeleted()];

  if (filters.q) {
    const pattern = `%${filters.q}%`;
    const textMatch = or(
      ilike(searchResults.title, pattern),
      ilike(searchResults.organizationName, pattern),
      ilike(searchResults.snippet, pattern),
    );
    if (textMatch) {
      conditions.push(textMatch);
    }
  }

  if (filters.categories.length > 0) {
    conditions.push(inArray(searchResults.category, filters.categories));
  } else if (
    filters.scope === "INTERESTS" &&
    filters.interestCategories &&
    filters.interestCategories.length > 0
  ) {
    conditions.push(
      inArray(searchResults.category, filters.interestCategories),
    );
  }

  if (filters.sourceTypes.length > 0) {
    conditions.push(inArray(searchResults.sourceType, filters.sourceTypes));
  }

  if (filters.countryCodes.length > 0) {
    conditions.push(inArray(searchResults.countryCode, filters.countryCodes));
  }

  if (filters.workModes.length > 0) {
    conditions.push(inArray(searchResults.workMode, filters.workModes));
  }

  if (filters.verificationStatuses.length > 0) {
    conditions.push(
      inArray(searchResults.verificationStatus, filters.verificationStatuses),
    );
  }

  const deadlineCondition = buildDeadlineCondition(
    {
      preset: filters.deadlinePreset,
      from: filters.deadlineFrom,
      to: filters.deadlineTo,
      column: searchResults.deadlineAt,
    },
    now,
  );
  if (deadlineCondition) {
    conditions.push(deadlineCondition);
  }

  if (filters.minScore !== undefined) {
    conditions.push(gte(searchResults.preliminaryScore, filters.minScore));
  }
  if (filters.maxScore !== undefined) {
    conditions.push(lte(searchResults.preliminaryScore, filters.maxScore));
  }

  const discoveredCondition = buildDiscoveredCondition(
    {
      preset: filters.discoveredPreset,
      from: filters.discoveredFrom,
      to: filters.discoveredTo,
      column: searchResults.discoveredAt,
    },
    now,
  );
  if (discoveredCondition) {
    conditions.push(discoveredCondition);
  }

  if (filters.searchExecutionIds.length > 0) {
    conditions.push(
      inArray(searchResults.searchExecutionId, filters.searchExecutionIds),
    );
  }

  return conditions;
}

function buildDeadlineCondition(
  params: {
    preset: string;
    from?: string;
    to?: string;
    column:
      | typeof searchResults.deadlineAt
      | typeof opportunities.deadlineAt;
  },
  now: Date,
): SQL | undefined {
  const { preset, from, to, column } = params;

  switch (preset) {
    case "ACTIVE": {
      const active = or(isNull(column), gte(column, now));
      return active;
    }
    case "EXPIRED":
      return and(isNotNull(column), lt(column, now)) as SQL;
    case "NONE":
      return isNull(column);
    case "NEXT_7":
      return and(
        isNotNull(column),
        gte(column, now),
        lte(column, addDays(now, 7)),
      ) as SQL;
    case "NEXT_15":
      return and(
        isNotNull(column),
        gte(column, now),
        lte(column, addDays(now, 15)),
      ) as SQL;
    case "NEXT_30":
      return and(
        isNotNull(column),
        gte(column, now),
        lte(column, addDays(now, 30)),
      ) as SQL;
    case "CUSTOM": {
      const parts: SQL[] = [isNotNull(column) as SQL];
      if (from) {
        parts.push(gte(column, new Date(from)));
      }
      if (to) {
        parts.push(lte(column, new Date(to)));
      }
      return parts.length > 1 ? (and(...parts) as SQL) : undefined;
    }
    case "ANY":
    default:
      return undefined;
  }
}

function buildDiscoveredCondition(
  params: {
    preset: string;
    from?: string;
    to?: string;
    column: typeof searchResults.discoveredAt;
  },
  now: Date,
): SQL | undefined {
  const { preset, from, to, column } = params;
  const today = startOfUtcDay(now);

  switch (preset) {
    case "TODAY":
      return and(gte(column, today), lt(column, addDays(today, 1))) as SQL;
    case "LAST_7":
      return gte(column, addDays(today, -7));
    case "LAST_30":
      return gte(column, addDays(today, -30));
    case "CUSTOM": {
      const parts: SQL[] = [];
      if (from) {
        parts.push(gte(column, new Date(from)));
      }
      if (to) {
        parts.push(lte(column, new Date(to)));
      }
      if (parts.length === 0) {
        return undefined;
      }
      return parts.length === 1 ? parts[0] : (and(...parts) as SQL);
    }
    case "ANY":
    default:
      return undefined;
  }
}

function buildSearchResultOrderBy(sort: ProjectSortOption): SQL[] {
  switch (sort) {
    case "discovered_asc":
      return [asc(searchResults.discoveredAt)];
    case "deadline_asc":
      return [
        sql`${searchResults.deadlineAt} asc nulls last`,
        desc(searchResults.discoveredAt),
      ];
    case "deadline_desc":
      return [
        sql`${searchResults.deadlineAt} desc nulls last`,
        desc(searchResults.discoveredAt),
      ];
    case "score_desc":
      return [
        sql`${searchResults.preliminaryScore} desc nulls last`,
        desc(searchResults.discoveredAt),
      ];
    case "score_asc":
      return [
        sql`${searchResults.preliminaryScore} asc nulls last`,
        desc(searchResults.discoveredAt),
      ];
    case "organization_asc":
      return [
        sql`${searchResults.organizationName} asc nulls last`,
        desc(searchResults.discoveredAt),
      ];
    case "discovered_desc":
    default:
      return [desc(searchResults.discoveredAt)];
  }
}

async function loadDuplicateCorpus(
  items: Array<{
    id: string;
    organizationName: string | null;
    contentHash: string | null;
  }>,
) {
  if (items.length === 0) {
    return items;
  }

  const hashes = [
    ...new Set(
      items
        .map((item) => item.contentHash)
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  if (hashes.length === 0) {
    return items;
  }

  const siblings = await db
    .select({
      id: searchResults.id,
      organizationName: searchResults.organizationName,
      contentHash: searchResults.contentHash,
    })
    .from(searchResults)
    .where(
      and(
        inArray(searchResults.contentHash, hashes),
        searchResultNotDeleted(),
        sql`${searchResults.verificationStatus} <> 'REJECTED'`,
      ),
    )
    .limit(250);

  const byId = new Map<string, (typeof siblings)[number]>();
  for (const item of items) {
    byId.set(item.id, item);
  }
  for (const sibling of siblings) {
    byId.set(sibling.id, sibling);
  }

  return [...byId.values()];
}

export async function listSearchResults(filters: ProjectFiltersResolved) {
  const now = new Date();
  const conditions = buildSearchResultConditions(filters, now);
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const offset = (filters.page - 1) * filters.pageSize;
  const orderBy = buildSearchResultOrderBy(filters.sort);

  const listColumns = {
    id: searchResults.id,
    title: searchResults.title,
    organizationName: searchResults.organizationName,
    sourceType: searchResults.sourceType,
    category: searchResults.category,
    countryCode: searchResults.countryCode,
    externalId: searchResults.externalId,
    preliminaryScore: searchResults.preliminaryScore,
    verificationStatus: searchResults.verificationStatus,
    publishedAt: searchResults.publishedAt,
    deadlineAt: searchResults.deadlineAt,
    estimatedAmount: searchResults.estimatedAmount,
    currency: searchResults.currency,
    amountStatus: searchResults.amountStatus,
    contractingSector: searchResults.contractingSector,
    searchExecutionId: searchResults.searchExecutionId,
    contentHash: searchResults.contentHash,
    discoveredAt: searchResults.discoveredAt,
  };

  const [items, countRow, catalogTotalRow] = await withTransientDbRetry(() =>
    Promise.all([
      db
        .select(listColumns)
        .from(searchResults)
        .where(whereClause)
        .orderBy(...orderBy)
        .limit(filters.pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(searchResults)
        .where(whereClause),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(searchResults)
        .where(searchResultNotDeleted()),
    ]),
  );

  const corpus = await loadDuplicateCorpus(items);
  const duplicateSignals = buildDuplicateSignals(items, corpus);

  return {
    items: items.map((item) => {
      const signal = duplicateSignals.get(item.id);
      return {
        id: item.id,
        title: item.title,
        organizationName: item.organizationName,
        sourceType: item.sourceType,
        category: item.category,
        countryCode: item.countryCode,
        externalId: item.externalId,
        preliminaryScore: item.preliminaryScore,
        verificationStatus: item.verificationStatus,
        publishedAt: item.publishedAt,
        deadlineAt: item.deadlineAt,
        estimatedAmount: item.estimatedAmount,
        currency: item.currency,
        amountStatus: item.amountStatus,
        contractingSector: item.contractingSector,
        searchExecutionId: item.searchExecutionId,
        discoveredAt: item.discoveredAt,
        vigency: getDeadlineVigency(item.deadlineAt, now),
        isExpiringSoon: (() => {
          if (!item.deadlineAt) {
            return false;
          }
          const vigency = getDeadlineVigency(item.deadlineAt, now);
          if (vigency !== "ACTIVE") {
            return false;
          }
          const daysLeft = Math.ceil(
            (item.deadlineAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
          );
          return daysLeft >= 0 && daysLeft <= 7;
        })(),
        isPossibleDuplicate: signal?.isPossibleDuplicate ?? false,
        duplicateReason: signal?.reason ?? null,
      };
    }),
    total: countRow[0]?.count ?? 0,
    catalogTotal: catalogTotalRow[0]?.count ?? 0,
    page: filters.page,
    pageSize: filters.pageSize,
    totalPages: Math.max(1, Math.ceil((countRow[0]?.count ?? 0) / filters.pageSize)),
  };
}

export type SearchResultCatalogStats = {
  total: number;
  pending: number;
  partiallyVerified: number;
  verified: number;
  rejected: number;
};

/** Counts by verification status for opportunity catalog metrics (no schema change). */
export async function getSearchResultCatalogStats(): Promise<SearchResultCatalogStats> {
  const rows = await withTransientDbRetry(() =>
    db
      .select({
        verificationStatus: searchResults.verificationStatus,
        count: sql<number>`count(*)::int`,
      })
      .from(searchResults)
      .where(searchResultNotDeleted())
      .groupBy(searchResults.verificationStatus),
  );

  const stats: SearchResultCatalogStats = {
    total: 0,
    pending: 0,
    partiallyVerified: 0,
    verified: 0,
    rejected: 0,
  };

  for (const row of rows) {
    stats.total += row.count;
    switch (row.verificationStatus) {
      case "PENDING":
        stats.pending = row.count;
        break;
      case "PARTIALLY_VERIFIED":
        stats.partiallyVerified = row.count;
        break;
      case "VERIFIED":
        stats.verified = row.count;
        break;
      case "REJECTED":
        stats.rejected = row.count;
        break;
      default:
        break;
    }
  }

  return stats;
}

export async function listRecentSearchExecutions(limit = 20, userId?: string) {
  return db
    .select({
      id: searchExecutions.id,
      status: searchExecutions.status,
      candidatesFound: searchExecutions.candidatesFound,
      candidatesDiscarded: searchExecutions.candidatesDiscarded,
      startedAt: searchExecutions.startedAt,
      completedAt: searchExecutions.completedAt,
      createdAt: searchExecutions.createdAt,
      sourceType: searchProfiles.sourceType,
      profileName: searchProfiles.name,
    })
    .from(searchExecutions)
    .leftJoin(
      searchProfiles,
      eq(searchExecutions.searchProfileId, searchProfiles.id),
    )
    .where(
      userId
        ? or(
            eq(searchProfiles.createdByUserId, userId),
            eq(searchProfiles.sourceType, "COMPRASAL"),
          )
        : undefined,
    )
    .orderBy(desc(searchExecutions.createdAt))
    .limit(limit);
}

export async function getSearchResultById(id: string) {
  const [result] = await db
    .select()
    .from(searchResults)
    .where(and(eq(searchResults.id, id), searchResultNotDeleted()))
    .limit(1);

  if (!result) {
    return null;
  }

  const corpus = await loadDuplicateCorpus([result]);
  const signals = buildDuplicateSignals([result], corpus);
  const signal = signals.get(result.id);

  return {
    ...result,
    vigency: getDeadlineVigency(result.deadlineAt),
    isPossibleDuplicate: signal?.isPossibleDuplicate ?? false,
    duplicateReason: signal?.reason ?? null,
  };
}

export async function discardSearchResult(
  id: string,
  userId: string,
  reason: string,
) {
  const accessible = await userAccessibleSearchResultIds([id], userId);
  if (!accessible.has(id)) throw new Error("RESULT_NOT_FOUND");
  const state = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`${userId}:${id}`}::text, 0))`,
    );
    const [inserted] = await tx
      .insert(userSearchResultStates)
      .values({
        userId,
        searchResultId: id,
        state: "DISMISSED",
        dismissedAt: new Date(),
        dismissReason: reason,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          userSearchResultStates.userId,
          userSearchResultStates.searchResultId,
        ],
        set: {
          state: "DISMISSED",
          dismissedAt: new Date(),
          dismissReason: reason,
          updatedAt: new Date(),
        },
      })
      .returning({ id: userSearchResultStates.searchResultId });
    return inserted;
  });

  return { discarded: state ? 1 : 0 };
}

async function userAccessibleSearchResultIds(
  ids: string[],
  userId: string,
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const [associated, legacy, publicRows] = await Promise.all([
    db
      .select({ id: searchResults.id })
      .from(searchExecutionResults)
      .innerJoin(searchResults, eq(searchExecutionResults.searchResultId, searchResults.id))
      .innerJoin(searchExecutions, eq(searchExecutionResults.searchExecutionId, searchExecutions.id))
      .innerJoin(searchProfiles, eq(searchExecutions.searchProfileId, searchProfiles.id))
      .where(
        and(
          inArray(searchResults.id, ids),
          eq(searchProfiles.createdByUserId, userId),
          searchResultNotDeleted(),
        ),
      ),
    db
      .select({ id: searchResults.id })
      .from(searchResults)
      .innerJoin(searchExecutions, eq(searchResults.searchExecutionId, searchExecutions.id))
      .innerJoin(searchProfiles, eq(searchExecutions.searchProfileId, searchProfiles.id))
      .where(
        and(
          inArray(searchResults.id, ids),
          eq(searchProfiles.createdByUserId, userId),
          ne(searchResults.sourceType, "PRIVATE_WEB"),
          searchResultNotDeleted(),
        ),
      ),
    db
      .select({ id: searchResults.id })
      .from(searchResults)
      .where(
        and(
          inArray(searchResults.id, ids),
          eq(searchResults.sourceType, "COMPRASAL"),
          searchResultNotDeleted(),
        ),
      ),
  ]);
  return new Set(
    [...associated, ...legacy, ...publicRows].map((row) => row.id),
  );
}

export async function discardSearchResults(
  ids: string[],
  userId: string,
  reason: string,
) {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) {
    return { discarded: 0 };
  }

  const accessible = await userAccessibleSearchResultIds(uniqueIds, userId);
  const allowedIds = uniqueIds.filter((id) => accessible.has(id)).sort();
  if (allowedIds.length === 0) return { discarded: 0 };
  const now = new Date();
  const updated = await db.transaction(async (tx) => {
    for (const id of allowedIds) {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`${userId}:${id}`}::text, 0))`,
      );
    }
    return tx
      .insert(userSearchResultStates)
      .values(
        allowedIds.map((searchResultId) => ({
        userId,
        searchResultId,
        state: "DISMISSED" as const,
        dismissedAt: now,
        dismissReason: reason,
        updatedAt: now,
      })),
      )
      .onConflictDoUpdate({
      target: [
        userSearchResultStates.userId,
        userSearchResultStates.searchResultId,
      ],
      set: {
        state: "DISMISSED",
        dismissedAt: now,
        dismissReason: reason,
        updatedAt: now,
      },
      })
      .returning({ id: userSearchResultStates.searchResultId });
  });

  return { discarded: updated.length };
}

export async function softDeleteAllSearchResults(reason = "CATALOG_RESET") {
  const now = new Date();
  const updated = await db
    .update(searchResults)
    .set({
      verificationStatus: "REJECTED",
      discardReason: reason,
      deletedAt: now,
    })
    .where(searchResultNotDeleted())
    .returning({ id: searchResults.id });

  return { softDeleted: updated.length };
}

export async function softDeleteAllOpportunities(reason = "CATALOG_RESET") {
  const now = new Date();
  const active = await db
    .select({ id: opportunities.id, status: opportunities.status })
    .from(opportunities)
    .where(opportunityNotDeleted());

  if (active.length === 0) {
    return { softDeleted: 0 };
  }

  await db
    .update(opportunities)
    .set({
      status: "DISCARDED",
      deletedAt: now,
      updatedAt: now,
      nextAction: reason,
    })
    .where(opportunityNotDeleted());

  return { softDeleted: active.length };
}

export async function convertSearchResultsToLeads(params: {
  searchResultIds: string[];
  userId: string;
}) {
  const leads = [];
  const errors: Array<{ searchResultId: string; error: string }> = [];

  for (const searchResultId of params.searchResultIds) {
    try {
      const [ownedAssociation] = await db
        .select({ executionId: searchExecutions.id })
        .from(searchExecutionResults)
        .innerJoin(
          searchExecutions,
          eq(searchExecutionResults.searchExecutionId, searchExecutions.id),
        )
        .innerJoin(
          searchProfiles,
          eq(searchExecutions.searchProfileId, searchProfiles.id),
        )
        .where(
          and(
            eq(searchExecutionResults.searchResultId, searchResultId),
            eq(searchProfiles.createdByUserId, params.userId),
          ),
        )
        .orderBy(desc(searchExecutions.createdAt))
        .limit(1);
      if (!ownedAssociation) throw new Error("RESULT_NOT_FOUND");
      const lead = await convertSearchResultToLead({
        searchResultId,
        executionId: ownedAssociation.executionId,
        userId: params.userId,
      });
      leads.push(lead);
    } catch (error) {
      errors.push({
        searchResultId,
        error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
      });
    }
  }

  return { leads, errors };
}

export async function convertSearchResultToLead(params: {
  searchResultId: string;
  executionId: string;
  userId: string;
}) {
  const [access] = await db
    .select({
      resultId: searchResults.id,
      userState: userSearchResultStates.state,
    })
    .from(searchExecutionResults)
    .innerJoin(
      searchExecutions,
      eq(searchExecutionResults.searchExecutionId, searchExecutions.id),
    )
    .innerJoin(
      searchProfiles,
      eq(searchExecutions.searchProfileId, searchProfiles.id),
    )
    .innerJoin(
      searchResults,
      eq(searchExecutionResults.searchResultId, searchResults.id),
    )
    .leftJoin(
      userSearchResultStates,
      and(
        eq(userSearchResultStates.searchResultId, searchResults.id),
        eq(userSearchResultStates.userId, params.userId),
      ),
    )
    .where(
      and(
        eq(searchExecutions.id, params.executionId),
        eq(searchExecutionResults.searchResultId, params.searchResultId),
        eq(searchProfiles.createdByUserId, params.userId),
        searchResultNotDeleted(),
      ),
    )
    .limit(1);
  if (!access) {
    throw new Error("RESULT_NOT_FOUND");
  }

  const result = await getSearchResultById(params.searchResultId);
  if (!result) {
    throw new Error("RESULT_NOT_FOUND");
  }

  const conversionError = getSearchResultConversionError({
    sourceType: result.sourceType,
    verificationStatus: result.verificationStatus,
    userState: access.userState ?? null,
    deadlineAt: result.deadlineAt,
  });
  if (conversionError) {
    throw new Error(conversionError);
  }

  const [existingLead] = await db
    .select({ id: opportunities.id, createdByUserId: opportunities.createdByUserId })
    .from(opportunities)
    .where(eq(opportunities.originSearchResultId, result.id))
    .limit(1);

  if (existingLead) {
    if (!canReturnExistingLeadToUser(existingLead.createdByUserId, params.userId)) {
      throw new Error("RESULT_NOT_FOUND");
    }
    return existingLead;
  }

  const urlValidation = await validateSourceUrl(result.sourceUrl);
  if (!urlValidation.ok) {
    await db
      .update(searchResults)
      .set({
        rawData: {
          ...(result.rawData ?? {}),
          sourceUrlValidation: urlValidation,
        },
      })
      .where(eq(searchResults.id, result.id));
    throw new Error("SOURCE_URL_UNREACHABLE");
  }

  const validatedSourceUrl = urlValidation.finalUrl;
  if (isGenericOrListingSourceUrl(validatedSourceUrl)) {
    throw new Error("SOURCE_URL_NOT_SPECIFIC");
  }
  if (
    result.sourceType === "PRIVATE_WEB" &&
    !evaluatePrivateWebUrl(validatedSourceUrl).allowed
  ) {
    throw new Error("SOURCE_URL_NOT_SPECIFIC");
  }

  const validatedNormalizedUrl = normalizeUrl(validatedSourceUrl);

  await db
    .update(searchResults)
    .set({
      sourceUrl: validatedSourceUrl,
      normalizedUrl: validatedNormalizedUrl,
      rawData: {
        ...(result.rawData ?? {}),
        sourceUrlValidation: urlValidation,
      },
    })
    .where(eq(searchResults.id, result.id));

  const organizationName = result.organizationName?.trim() || "Organización sin nombre";
  const slug = slugify(organizationName) || `org-${result.id.slice(0, 8)}`;

  const organizationType =
    result.sourceType === "COMPRASAL" || result.contractingSector === "PUBLIC"
      ? "PUBLIC_INSTITUTION"
      : result.contractingSector === "PRIVATE"
        ? "PRIVATE_COMPANY"
        : result.sourceType === "PRIVATE_WEB" || result.sourceType === "LINKEDIN"
          ? "PRIVATE_COMPANY"
          : "OTHER";

  const opportunityType =
    result.sourceType === "COMPRASAL" || result.contractingSector === "PUBLIC"
      ? "TENDER"
      : "RFP";

  let [organization] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);

  if (!organization) {
    [organization] = await db
      .insert(organizations)
      .values({
        name: organizationName,
        slug,
        organizationType,
        countryCode: result.countryCode ?? "SV",
        isVerified: false,
      })
      .returning();
  }

  const [opportunity] = await db
    .insert(opportunities)
    .values({
      organizationId: organization.id,
      originSearchResultId: result.id,
      title: result.title,
      description: result.snippet,
      opportunityType,
      primarySourceType: result.sourceType,
      category: result.category,
      status: "DETECTED",
      verificationStatus: "PENDING",
      relevanceScore: result.preliminaryScore,
      countryCode: result.countryCode,
      adminArea: result.adminArea,
      city: result.city,
      workMode: result.workMode,
      estimatedAmount: result.estimatedAmount,
      currency: result.currency,
      publishedAt: result.publishedAt,
      deadlineAt: result.deadlineAt,
      discoveredAt: result.discoveredAt,
      assignedToUserId: params.userId,
      createdByUserId: params.userId,
    })
    .returning();

  await db.insert(opportunitySources).values({
    opportunityId: opportunity.id,
    sourceType: result.sourceType,
    externalId: result.externalId,
    title: result.title,
    url: validatedSourceUrl,
    normalizedUrl: validatedNormalizedUrl,
    domain: extractDomain(validatedSourceUrl),
    isOfficial: true,
    isPrimary: true,
    contentHash: result.contentHash,
    lastCheckedAt: new Date(urlValidation.checkedAt),
    discoveredAt: result.discoveredAt,
  });

  await db.insert(opportunityStatusHistory).values({
    opportunityId: opportunity.id,
    previousStatus: null,
    newStatus: "DETECTED",
    reason: "Convertido desde proyecto/candidato",
    changedByUserId: params.userId,
  });

  await db
    .update(searchResults)
    .set({ verificationStatus: "VERIFIED" })
    .where(eq(searchResults.id, result.id));

  return opportunity;
}

let lastExpirePassAt = 0;
const EXPIRE_PASS_INTERVAL_MS = 60_000;

function shouldRunExpirePass(): boolean {
  const now = Date.now();
  if (now - lastExpirePassAt < EXPIRE_PASS_INTERVAL_MS) {
    return false;
  }
  lastExpirePassAt = now;
  return true;
}

export async function expireOverdueOpportunities(changedByUserId?: string) {
  // Throttle read-path expiration to avoid write storms on every list/detail.
  if (!shouldRunExpirePass()) {
    return { expired: 0, skipped: true as const };
  }

  const now = new Date();
  const overdue = await db
    .select({
      id: opportunities.id,
      status: opportunities.status,
    })
    .from(opportunities)
    .where(
      and(
        opportunityNotDeleted(),
        isNotNull(opportunities.deadlineAt),
        lt(opportunities.deadlineAt, now),
        notInArray(opportunities.status, [...terminalOpportunityStatuses]),
      ),
    );

  if (overdue.length === 0) {
    return { expired: 0 };
  }

  await db
    .update(opportunities)
    .set({
      status: "EXPIRED",
      updatedAt: now,
    })
    .where(
      inArray(
        opportunities.id,
        overdue.map((item) => item.id),
      ),
    );

  await db.insert(opportunityStatusHistory).values(
    overdue.map((item) => ({
      opportunityId: item.id,
      previousStatus: item.status,
      newStatus: "EXPIRED" satisfies OpportunityStatus,
      reason: "Marcado automáticamente por deadline vencido",
      changedByUserId: changedByUserId ?? null,
    })),
  );

  return { expired: overdue.length };
}

function buildLeadConditions(filters: LeadFiltersInput, now: Date): SQL[] {
  const conditions: SQL[] = [opportunityNotDeleted()];

  if (filters.q) {
    const pattern = `%${filters.q}%`;
    const textMatch = or(
      ilike(opportunities.title, pattern),
      ilike(organizations.name, pattern),
      ilike(opportunities.description, pattern),
    );
    if (textMatch) {
      conditions.push(textMatch);
    }
  }

  if (filters.organization) {
    conditions.push(ilike(organizations.name, `%${filters.organization}%`));
  }

  if (filters.statuses.length > 0) {
    conditions.push(inArray(opportunities.status, filters.statuses));
  }

  if (filters.sourceTypes.length > 0) {
    conditions.push(
      inArray(opportunities.primarySourceType, filters.sourceTypes),
    );
  }

  if (filters.categories.length > 0) {
    conditions.push(inArray(opportunities.category, filters.categories));
  }

  if (filters.countryCodes.length > 0) {
    conditions.push(inArray(opportunities.countryCode, filters.countryCodes));
  }

  if (filters.workModes.length > 0) {
    conditions.push(inArray(opportunities.workMode, filters.workModes));
  }

  if (filters.unassignedOnly) {
    conditions.push(isNull(opportunities.assignedToUserId));
  } else if (filters.assignedToUserIds.length > 0) {
    const ids = filters.assignedToUserIds.filter((id) => id !== "UNASSIGNED");
    if (ids.length > 0) {
      conditions.push(inArray(opportunities.assignedToUserId, ids));
    }
  }

  if (filters.minScore !== undefined) {
    conditions.push(gte(opportunities.relevanceScore, filters.minScore));
  }
  if (filters.maxScore !== undefined) {
    conditions.push(lte(opportunities.relevanceScore, filters.maxScore));
  }

  if (filters.noDeadline || filters.deadlinePreset === "NONE") {
    conditions.push(isNull(opportunities.deadlineAt));
  } else if (filters.deadlinePreset === "ACTIVE") {
    // Leads: "vigentes" = plazo futuro (sin incluir null), unlike projects catalog.
    conditions.push(
      and(
        isNotNull(opportunities.deadlineAt),
        gte(opportunities.deadlineAt, now),
      ) as SQL,
    );
  } else {
    const deadlineCondition = buildDeadlineCondition(
      {
        preset: filters.deadlinePreset,
        from: filters.deadlineFrom,
        to: filters.deadlineTo,
        column: opportunities.deadlineAt,
      },
      now,
    );
    if (deadlineCondition) {
      conditions.push(deadlineCondition);
    }
  }

  if (filters.createdFrom) {
    conditions.push(gte(opportunities.createdAt, new Date(filters.createdFrom)));
  }
  if (filters.createdTo) {
    conditions.push(lte(opportunities.createdAt, new Date(filters.createdTo)));
  }
  if (filters.updatedFrom) {
    conditions.push(gte(opportunities.updatedAt, new Date(filters.updatedFrom)));
  }
  if (filters.updatedTo) {
    conditions.push(lte(opportunities.updatedAt, new Date(filters.updatedTo)));
  }
  if (filters.lastActivityFrom) {
    conditions.push(
      gte(opportunities.updatedAt, new Date(filters.lastActivityFrom)),
    );
  }
  if (filters.lastActivityTo) {
    conditions.push(
      lte(opportunities.updatedAt, new Date(filters.lastActivityTo)),
    );
  }

  return conditions;
}

function buildLeadOrderBy(sort: LeadSortOption): SQL[] {
  switch (sort) {
    case "deadline_asc":
      return [
        sql`${opportunities.deadlineAt} asc nulls last`,
        desc(opportunities.updatedAt),
      ];
    case "deadline_desc":
      return [
        sql`${opportunities.deadlineAt} desc nulls last`,
        desc(opportunities.updatedAt),
      ];
    case "score_desc":
      return [
        sql`${opportunities.relevanceScore} desc nulls last`,
        desc(opportunities.updatedAt),
      ];
    case "score_asc":
      return [
        sql`${opportunities.relevanceScore} asc nulls last`,
        desc(opportunities.updatedAt),
      ];
    case "title_asc":
      return [asc(opportunities.title)];
    case "updated_desc":
    default:
      return [desc(opportunities.updatedAt)];
  }
}

export async function listOpportunities(filters: LeadFiltersInput) {
  await expireOverdueOpportunities();

  const now = new Date();
  const conditions = buildLeadConditions(filters, now);
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const offset = (filters.page - 1) * filters.pageSize;
  const orderBy = buildLeadOrderBy(filters.sort);

  const [items, countRow, catalogTotalRow] = await Promise.all([
    db
      .select({
        id: opportunities.id,
        title: opportunities.title,
        status: opportunities.status,
        category: opportunities.category,
        primarySourceType: opportunities.primarySourceType,
        relevanceScore: opportunities.relevanceScore,
        relevanceExplanation: opportunities.relevanceExplanation,
        deadlineAt: opportunities.deadlineAt,
        nextAction: opportunities.nextAction,
        nextActionAt: opportunities.nextActionAt,
        countryCode: opportunities.countryCode,
        organizationName: organizations.name,
        assignedToUserId: opportunities.assignedToUserId,
        assigneeName: sql<string | null>`
          nullif(trim(concat(${users.firstName}, ' ', ${users.lastName})), '')
        `,
        updatedAt: opportunities.updatedAt,
      })
      .from(opportunities)
      .innerJoin(
        organizations,
        eq(opportunities.organizationId, organizations.id),
      )
      .leftJoin(users, eq(opportunities.assignedToUserId, users.id))
      .where(whereClause)
      .orderBy(...orderBy)
      .limit(filters.pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(opportunities)
      .innerJoin(
        organizations,
        eq(opportunities.organizationId, organizations.id),
      )
      .leftJoin(users, eq(opportunities.assignedToUserId, users.id))
      .where(whereClause),
    db.select({ count: sql<number>`count(*)::int` }).from(opportunities).where(opportunityNotDeleted()),
  ]);

  return {
    items,
    total: countRow[0]?.count ?? 0,
    catalogTotal: catalogTotalRow[0]?.count ?? 0,
    page: filters.page,
    pageSize: filters.pageSize,
    totalPages: Math.max(
      1,
      Math.ceil((countRow[0]?.count ?? 0) / filters.pageSize),
    ),
  };
}

export async function listAssignableUsers() {
  return db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      role: users.role,
    })
    .from(users)
    .where(eq(users.isActive, true))
    .orderBy(asc(users.firstName), asc(users.lastName));
}

export async function getOpportunityDetail(id: string) {
  await expireOverdueOpportunities();

  const [row] = await db
    .select({
      opportunity: opportunities,
      organization: organizations,
      assigneeFirstName: users.firstName,
      assigneeLastName: users.lastName,
      assigneeEmail: users.email,
    })
    .from(opportunities)
    .innerJoin(organizations, eq(opportunities.organizationId, organizations.id))
    .leftJoin(users, eq(opportunities.assignedToUserId, users.id))
    .where(and(eq(opportunities.id, id), opportunityNotDeleted()))
    .limit(1);

  if (!row) {
    return null;
  }

  const [sources, notes, history] = await Promise.all([
    db
      .select()
      .from(opportunitySources)
      .where(eq(opportunitySources.opportunityId, id))
      .orderBy(desc(opportunitySources.isPrimary), asc(opportunitySources.createdAt)),
    db
      .select({
        id: opportunityNotes.id,
        content: opportunityNotes.content,
        createdAt: opportunityNotes.createdAt,
        userId: opportunityNotes.userId,
        authorName: sql<string>`
          trim(concat(${users.firstName}, ' ', ${users.lastName}))
        `,
      })
      .from(opportunityNotes)
      .innerJoin(users, eq(opportunityNotes.userId, users.id))
      .where(eq(opportunityNotes.opportunityId, id))
      .orderBy(desc(opportunityNotes.createdAt)),
    db
      .select({
        id: opportunityStatusHistory.id,
        previousStatus: opportunityStatusHistory.previousStatus,
        newStatus: opportunityStatusHistory.newStatus,
        reason: opportunityStatusHistory.reason,
        changedAt: opportunityStatusHistory.changedAt,
        changedByUserId: opportunityStatusHistory.changedByUserId,
        changedByName: sql<string | null>`
          nullif(
            trim(concat(${users.firstName}, ' ', ${users.lastName})),
            ''
          )
        `,
      })
      .from(opportunityStatusHistory)
      .leftJoin(users, eq(opportunityStatusHistory.changedByUserId, users.id))
      .where(eq(opportunityStatusHistory.opportunityId, id))
      .orderBy(desc(opportunityStatusHistory.changedAt)),
  ]);

  return {
    ...row.opportunity,
    organization: row.organization,
    assignee:
      row.opportunity.assignedToUserId && row.assigneeEmail
        ? {
            id: row.opportunity.assignedToUserId,
            name: `${row.assigneeFirstName} ${row.assigneeLastName}`.trim(),
            email: row.assigneeEmail,
          }
        : null,
    sources,
    notes,
    history,
  };
}

export async function updateOpportunityStatus(params: {
  opportunityId: string;
  status: string;
  reason?: string;
  userId: string;
}) {
  const detail = await getOpportunityDetail(params.opportunityId);
  if (!detail) {
    throw new Error("NOT_FOUND");
  }

  if (!isOpportunityStatus(detail.status) || !isOpportunityStatus(params.status)) {
    throw new Error("INVALID_STATUS");
  }

  assertOpportunityTransition(detail.status, params.status);

  await db
    .update(opportunities)
    .set({
      status: params.status,
      updatedAt: new Date(),
    })
    .where(eq(opportunities.id, params.opportunityId));

  await db.insert(opportunityStatusHistory).values({
    opportunityId: params.opportunityId,
    previousStatus: detail.status,
    newStatus: params.status,
    reason: params.reason,
    changedByUserId: params.userId,
  });
}

export async function assignOpportunity(params: {
  opportunityId: string;
  assignedToUserId: string | null;
  userId: string;
}) {
  const detail = await getOpportunityDetail(params.opportunityId);
  if (!detail) {
    throw new Error("NOT_FOUND");
  }

  if (params.assignedToUserId) {
    const [assignee] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, params.assignedToUserId), eq(users.isActive, true)))
      .limit(1);
    if (!assignee) {
      throw new Error("ASSIGNEE_NOT_FOUND");
    }
  }

  await db
    .update(opportunities)
    .set({
      assignedToUserId: params.assignedToUserId,
      updatedAt: new Date(),
    })
    .where(eq(opportunities.id, params.opportunityId));
}

export async function updateOpportunityDetails(params: {
  opportunityId: string;
  nextAction?: string;
  nextActionAt?: Date | null;
  deadlineAt?: Date | null;
  estimatedAmount?: string | null;
  currency?: string | null;
}) {
  const detail = await getOpportunityDetail(params.opportunityId);
  if (!detail) {
    throw new Error("NOT_FOUND");
  }

  await db
    .update(opportunities)
    .set({
      nextAction:
        params.nextAction !== undefined
          ? params.nextAction || null
          : detail.nextAction,
      nextActionAt:
        params.nextActionAt !== undefined
          ? params.nextActionAt
          : detail.nextActionAt,
      deadlineAt:
        params.deadlineAt !== undefined ? params.deadlineAt : detail.deadlineAt,
      estimatedAmount:
        params.estimatedAmount !== undefined
          ? params.estimatedAmount
          : detail.estimatedAmount,
      currency:
        params.currency !== undefined ? params.currency : detail.currency,
      updatedAt: new Date(),
    })
    .where(eq(opportunities.id, params.opportunityId));
}

export async function addOpportunityNote(params: {
  opportunityId: string;
  userId: string;
  content: string;
}) {
  const detail = await getOpportunityDetail(params.opportunityId);
  if (!detail) {
    throw new Error("NOT_FOUND");
  }

  await db.insert(opportunityNotes).values({
    opportunityId: params.opportunityId,
    userId: params.userId,
    content: params.content,
  });
}

export async function updateOpportunityNote(params: {
  noteId: string;
  opportunityId: string;
  content: string;
  userId: string;
}) {
  const [note] = await db
    .select()
    .from(opportunityNotes)
    .where(
      and(
        eq(opportunityNotes.id, params.noteId),
        eq(opportunityNotes.opportunityId, params.opportunityId),
      ),
    )
    .limit(1);

  if (!note) {
    throw new Error("NOTE_NOT_FOUND");
  }

  await db
    .update(opportunityNotes)
    .set({ content: params.content })
    .where(eq(opportunityNotes.id, params.noteId));
}

export async function deleteOpportunityNote(params: {
  noteId: string;
  opportunityId: string;
}) {
  const deleted = await db
    .delete(opportunityNotes)
    .where(
      and(
        eq(opportunityNotes.id, params.noteId),
        eq(opportunityNotes.opportunityId, params.opportunityId),
      ),
    )
    .returning({ id: opportunityNotes.id });

  if (deleted.length === 0) {
    throw new Error("NOTE_NOT_FOUND");
  }
}

export async function updateUserInterests(userId: string, categories: string[]) {
  await db
    .update(users)
    .set({
      interestCategories: categories,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}
