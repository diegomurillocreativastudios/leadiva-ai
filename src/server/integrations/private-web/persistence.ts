import "server-only";

import { createHash } from "node:crypto";

import { and, asc, eq, gte, isNull, lt, or, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  searchExecutionResults,
  searchExecutions,
  searchProfiles,
  searchResults,
  userSearchResultStates,
} from "@/server/db/schema";
import { transactionDb } from "@/server/db/transaction";

import type { VerifiedPrivateWebCandidate } from "./contracts";

const PRIVATE_WEB_PROFILE_KEY = "PRIVATE_WEB_BRAVE_V1";
const PRIVATE_WEB_PROFILE_NAME = "Sector privado — Brave Search";

export type PrivateWebPersistenceOutcome =
  | { kind: "PERSISTED"; id: string; outcome: "CREATED" | "UPDATED" | "UNCHANGED" }
  | { kind: "DISMISSED" }
  | { kind: "PROVENANCE_CONFLICT" }
  | { kind: "GLOBAL_REJECTED" };

export type FinishPrivateWebExecutionInput = {
  executionId: string;
  status: "COMPLETED" | "PARTIALLY_COMPLETED" | "FAILED";
  queriesExecuted: number;
  candidatesFound: number;
  candidatesDiscarded: number;
  opportunitiesCreated: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: string;
  metrics: Record<string, unknown>;
  errorMessage: string | null;
};

export type StartPrivateWebExecutionInput = {
  userId: string;
  query: string;
  now: Date;
  maxConcurrent: number;
  maxPerHour: number;
  staleExecutionMinutes: number;
};

export type StartPrivateWebExecutionResult =
  | { kind: "STARTED"; profileId: string; executionId: string }
  | { kind: "ACTIVE_LIMIT"; retryAfterSeconds: number }
  | { kind: "RATE_LIMIT"; retryAfterSeconds: number };

export interface PrivateWebRepository {
  startExecution(
    input: StartPrivateWebExecutionInput,
  ): Promise<StartPrivateWebExecutionResult>;
  persistCandidate(input: {
    userId: string;
    executionId: string;
    candidate: VerifiedPrivateWebCandidate;
    rank: number;
  }): Promise<PrivateWebPersistenceOutcome>;
  finishExecution(input: FinishPrivateWebExecutionInput): Promise<void>;
}

export function canUseExistingPrivateWebCanonical(sourceType: string): boolean {
  return sourceType === "PRIVATE_WEB";
}

function stableDocumentId(candidate: VerifiedPrivateWebCandidate): string | null {
  const match = candidate.document.text.match(
    /\b(?:RFP|RFQ|TDR|referencia|reference|proceso)\s*(?:n(?:o|úm(?:ero)?)?\.?|#|:)\s*([A-Z0-9][A-Z0-9._\/-]{2,80})/i,
  );
  return match?.[1]?.trim().slice(0, 90) ?? null;
}

export function privateWebExternalId(candidate: VerifiedPrivateWebCandidate): string {
  const stableId = stableDocumentId(candidate) ?? candidate.normalizedUrl;
  return `web:${createHash("sha256")
    .update(candidate.sourceDomain)
    .update("\0")
    .update(stableId)
    .digest("hex")}`;
}

function canonicalValues(candidate: VerifiedPrivateWebCandidate) {
  const stableId = stableDocumentId(candidate);
  return {
    sourceType: "PRIVATE_WEB",
    externalId: privateWebExternalId(candidate),
    title: candidate.title,
    snippet: candidate.description,
    sourceUrl: candidate.sourceUrl,
    sourceOriginalUrl: candidate.document.requestedUrl,
    sourceResolvedUrl: candidate.document.finalUrl,
    normalizedUrl: candidate.normalizedUrl,
    sourceTitle: candidate.document.title,
    sourceDomain: candidate.sourceDomain,
    organizationName: candidate.organizationName,
    category: candidate.category,
    countryCode: candidate.countryCode,
    workMode: candidate.workMode,
    contractingSector: candidate.contractingSector,
    estimatedAmount: candidate.estimatedAmount,
    currency: candidate.currency,
    amountStatus: candidate.amountStatus,
    amountEvidenceText:
      candidate.evidence.find((item) => item.field === "AMOUNT")?.text ?? null,
    amountEvidenceUrl: candidate.estimatedAmount ? candidate.sourceUrl : null,
    publishedAt: candidate.publishedAt ? new Date(candidate.publishedAt) : null,
    deadlineAt: candidate.deadlineAt ? new Date(candidate.deadlineAt) : null,
    preliminaryScore: null,
    verificationStatus: candidate.verificationStatus,
    verificationReason: candidate.verificationReason,
    titleConfirmed: true,
    buyerConfirmed: true,
    amountConfirmed: Boolean(candidate.estimatedAmount),
    deadlineConfirmed: Boolean(candidate.deadlineAt),
    sourceIsSpecific: true,
    sourceIsGrounded: true,
    fieldEvidence: candidate.evidence,
    discardReason: null,
    contentHash: candidate.contentHash,
    rawData: {
      schemaVersion: 1,
      provider: "BRAVE",
      organizationType: candidate.organizationType,
      opportunityKind: candidate.opportunityKind,
      countryEvidence: candidate.countryEvidence,
      extractionMethod: candidate.extractionMethod,
      applicationInstructions: candidate.applicationInstructions,
      canonicalUrl: candidate.normalizedUrl,
      stableDocumentId: stableId,
      fetched: {
        contentType: candidate.document.contentType,
        byteLength: candidate.document.byteLength,
        pdfPagesProcessed: candidate.document.pdfPagesProcessed,
        fetchedAt: candidate.document.fetchedAt,
      },
      partialLimitation:
        candidate.verificationStatus === "PARTIALLY_VERIFIED"
          ? "Fecha límite no confirmada. Requiere revisión manual."
          : null,
    },
    discoveredAt: new Date(),
    deletedAt: null,
  } as const;
}

export const databasePrivateWebRepository: PrivateWebRepository = {
  async startExecution(input) {
    return transactionDb.transaction(async (tx) => {
      // Serializes admission for this user across all application processes.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${input.userId}::text, 0))`,
      );

      const [profile] = await tx
        .insert(searchProfiles)
        .values({
          name: PRIVATE_WEB_PROFILE_NAME,
          description: "Oportunidades privadas en El Salvador descubiertas con Brave Search",
          sourceType: "PRIVATE_WEB",
          profileKey: PRIVATE_WEB_PROFILE_KEY,
          keywords: [],
          createdByUserId: input.userId,
          isActive: true,
        })
        .onConflictDoUpdate({
          target: [searchProfiles.createdByUserId, searchProfiles.profileKey],
          targetWhere: sql`${searchProfiles.createdByUserId} is not null and ${searchProfiles.profileKey} is not null`,
          set: { updatedAt: input.now },
        })
        .returning({ id: searchProfiles.id });
      if (!profile) throw new Error("PRIVATE_WEB_PROFILE_CREATE_FAILED");

      const staleBefore = new Date(
        input.now.getTime() - input.staleExecutionMinutes * 60_000,
      );
      await tx
        .update(searchExecutions)
        .set({
          status: "FAILED",
          completedAt: input.now,
          errorMessage: "STALE_EXECUTION_RECOVERED",
          metrics: sql`coalesce(${searchExecutions.metrics}, '{}'::jsonb) || jsonb_build_object('terminationCause', 'STALE_EXECUTION_RECOVERED')`,
        })
        .where(
          and(
            eq(searchExecutions.searchProfileId, profile.id),
            eq(searchExecutions.status, "RUNNING"),
            or(
              lt(searchExecutions.startedAt, staleBefore),
              and(
                isNull(searchExecutions.startedAt),
                lt(searchExecutions.createdAt, staleBefore),
              ),
            ),
          ),
        );

      const active = await tx
        .select({ startedAt: searchExecutions.startedAt })
        .from(searchExecutions)
        .where(
          and(
            eq(searchExecutions.searchProfileId, profile.id),
            eq(searchExecutions.status, "RUNNING"),
          ),
        )
        .orderBy(asc(searchExecutions.startedAt));
      if (active.length >= input.maxConcurrent) {
        const oldest = active[0]?.startedAt?.getTime() ?? input.now.getTime();
        return {
          kind: "ACTIVE_LIMIT",
          retryAfterSeconds: Math.max(
            1,
            Math.ceil(
              (oldest + input.staleExecutionMinutes * 60_000 - input.now.getTime()) /
                1_000,
            ),
          ),
        } as const;
      }

      const hourBefore = new Date(input.now.getTime() - 60 * 60_000);
      const recent = await tx
        .select({ startedAt: searchExecutions.startedAt })
        .from(searchExecutions)
        .where(
          and(
            eq(searchExecutions.searchProfileId, profile.id),
            gte(searchExecutions.startedAt, hourBefore),
          ),
        )
        .orderBy(asc(searchExecutions.startedAt));
      if (recent.length >= input.maxPerHour) {
        const oldest = recent[0]?.startedAt?.getTime() ?? input.now.getTime();
        return {
          kind: "RATE_LIMIT",
          retryAfterSeconds: Math.max(
            1,
            Math.ceil((oldest + 60 * 60_000 - input.now.getTime()) / 1_000),
          ),
        } as const;
      }

      const [execution] = await tx
        .insert(searchExecutions)
        .values({
          searchProfileId: profile.id,
          status: "RUNNING",
          startedAt: input.now,
          metrics: {
            query: input.query,
            searchMode: "PRIVATE_WEB_BRAVE",
            discoveryMode: "BRAVE_ONLY",
            searchProvider: "BRAVE",
            plannerVersion: "private-web-brave-v1",
          },
        })
        .returning({ id: searchExecutions.id });
      if (!execution) throw new Error("PRIVATE_WEB_EXECUTION_CREATE_FAILED");
      return {
        kind: "STARTED",
        profileId: profile.id,
        executionId: execution.id,
      } as const;
    });
  },

  async persistCandidate(input) {
    return transactionDb.transaction(async (tx) => {
      const values = canonicalValues(input.candidate);
      const externalId = privateWebExternalId(input.candidate);
      const [existing] = await tx
        .select({
          id: searchResults.id,
          sourceType: searchResults.sourceType,
          contentHash: searchResults.contentHash,
          verificationStatus: searchResults.verificationStatus,
          deadlineAt: searchResults.deadlineAt,
        })
        .from(searchResults)
        .where(
          and(
            or(
              and(
                eq(searchResults.normalizedUrl, input.candidate.normalizedUrl),
                eq(searchResults.sourceType, "PRIVATE_WEB"),
              ),
              and(
                eq(searchResults.sourceType, "PRIVATE_WEB"),
                eq(searchResults.externalId, externalId),
              ),
              and(
                eq(searchResults.sourceType, "PRIVATE_WEB"),
                eq(searchResults.contentHash, input.candidate.contentHash),
              ),
            ),
            isNull(searchResults.deletedAt),
          ),
        )
        .limit(1);

      if (existing && !canUseExistingPrivateWebCanonical(existing.sourceType)) {
        return { kind: "PROVENANCE_CONFLICT" } as const;
      }
      if (existing?.deadlineAt && existing.deadlineAt.getTime() < Date.now()) {
        return { kind: "GLOBAL_REJECTED" } as const;
      }

      if (existing) {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${`${input.userId}:${existing.id}`}::text, 0))`,
        );
        const [privateState] = await tx
          .select({ state: userSearchResultStates.state })
          .from(userSearchResultStates)
          .where(
            and(
              eq(userSearchResultStates.userId, input.userId),
              eq(userSearchResultStates.searchResultId, existing.id),
            ),
          )
          .limit(1);
        if (privateState?.state === "DISMISSED") {
          return { kind: "DISMISSED" } as const;
        }
      }

      let canonicalId: string;
      let outcome: "CREATED" | "UPDATED" | "UNCHANGED";
      if (existing) {
        canonicalId = existing.id;
        if (
          (existing.contentHash === input.candidate.contentHash &&
            existing.verificationStatus === input.candidate.verificationStatus) ||
          (existing.verificationStatus === "VERIFIED" &&
            input.candidate.verificationStatus === "PARTIALLY_VERIFIED")
        ) {
          outcome = "UNCHANGED";
        } else {
          await tx
            .update(searchResults)
            .set(values)
            .where(
              and(
                eq(searchResults.id, existing.id),
                eq(searchResults.sourceType, "PRIVATE_WEB"),
              ),
            );
          outcome = "UPDATED";
        }
      } else {
        const [inserted] = await tx
          .insert(searchResults)
          .values(values)
          .onConflictDoNothing()
          .returning({ id: searchResults.id });
        if (inserted) {
          canonicalId = inserted.id;
          outcome = "CREATED";
        } else {
          const [raced] = await tx
            .select({ id: searchResults.id, sourceType: searchResults.sourceType })
            .from(searchResults)
            .where(
              and(
                or(
                  and(
                    eq(searchResults.normalizedUrl, input.candidate.normalizedUrl),
                    eq(searchResults.sourceType, "PRIVATE_WEB"),
                  ),
                  and(
                    eq(searchResults.sourceType, "PRIVATE_WEB"),
                    eq(searchResults.externalId, externalId),
                  ),
                  and(
                    eq(searchResults.sourceType, "PRIVATE_WEB"),
                    eq(searchResults.contentHash, input.candidate.contentHash),
                  ),
                ),
                isNull(searchResults.deletedAt),
              ),
            )
            .limit(1);
          if (!raced) return { kind: "GLOBAL_REJECTED" } as const;
          if (!canUseExistingPrivateWebCanonical(raced.sourceType)) {
            return { kind: "PROVENANCE_CONFLICT" } as const;
          }
          canonicalId = raced.id;
          outcome = "UNCHANGED";
        }
      }

      if (!existing) {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${`${input.userId}:${canonicalId}`}::text, 0))`,
        );
      }
      const [privateState] = existing ? [] : await tx
        .select({ state: userSearchResultStates.state })
        .from(userSearchResultStates)
        .where(
          and(
            eq(userSearchResultStates.userId, input.userId),
            eq(userSearchResultStates.searchResultId, canonicalId),
          ),
        )
        .limit(1);
      if (privateState?.state === "DISMISSED") {
        return { kind: "DISMISSED" } as const;
      }

      await tx
        .insert(searchExecutionResults)
        .values({
          searchExecutionId: input.executionId,
          searchResultId: canonicalId,
          preliminaryScore: input.candidate.preliminaryScore,
          rank: input.rank,
        })
        .onConflictDoUpdate({
          target: [
            searchExecutionResults.searchExecutionId,
            searchExecutionResults.searchResultId,
          ],
          set: {
            preliminaryScore: input.candidate.preliminaryScore,
            rank: input.rank,
          },
        });

      return { kind: "PERSISTED", id: canonicalId, outcome } as const;
    });
  },

  async finishExecution(input) {
    await db
      .update(searchExecutions)
      .set({
        status: input.status,
        queriesExecuted: input.queriesExecuted,
        candidatesFound: input.candidatesFound,
        candidatesDiscarded: input.candidatesDiscarded,
        opportunitiesCreated: input.opportunitiesCreated,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        estimatedCost: input.estimatedCost,
        metrics: input.metrics,
        errorMessage: input.errorMessage,
        completedAt: new Date(),
      })
      .where(
        and(
          eq(searchExecutions.id, input.executionId),
          eq(searchExecutions.status, "RUNNING"),
        ),
      );
  },
};
