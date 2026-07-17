import { hashContent } from "@/lib/content-hash";
import {
  extractDomain,
  inferCategoryFromText,
  normalizeUrl,
} from "@/lib/normalization";

import type { GroundedCandidate } from "./schemas";
import type { CandidateVerification } from "./verification";

function formatEstimatedAmount(
  amount: number | null | undefined,
): string | null {
  if (amount === null || amount === undefined || Number.isNaN(amount)) {
    return null;
  }
  return amount.toFixed(2);
}

export function mapGroundedCandidate(
  sourceType: "PRIVATE_WEB" | "LINKEDIN",
  candidate: GroundedCandidate,
  options?: {
    query?: string;
    citations?: Array<{ uri?: string; title?: string }>;
    preliminaryScore?: number | null;
    category?: string;
  },
) {
  const text = [candidate.title, candidate.snippet, candidate.organizationName]
    .filter(Boolean)
    .join(" ");

  const category =
    options?.category ??
    candidate.category ??
    inferCategoryFromText(text);

  const deadlineAt = candidate.deadlineAt
    ? new Date(candidate.deadlineAt)
    : null;

  const estimatedAmount = formatEstimatedAmount(candidate.estimatedAmount);
  const currency = estimatedAmount
    ? (candidate.currency ?? "USD")
    : (candidate.currency ?? null);

  const contentHash = hashContent([
    sourceType,
    candidate.title,
    candidate.organizationName,
    candidate.snippet,
    category,
    candidate.contractingSector,
    estimatedAmount,
    candidate.deadlineAt,
  ]);

  return {
    sourceType,
    externalId: null as string | null,
    title: candidate.title,
    snippet: candidate.snippet ?? null,
    sourceUrl: candidate.sourceUrl,
    normalizedUrl: normalizeUrl(candidate.sourceUrl),
    organizationName: candidate.organizationName ?? null,
    category,
    countryCode: candidate.countryCode ?? null,
    adminArea: null as string | null,
    city: null as string | null,
    workMode: candidate.workMode ?? ("UNKNOWN" as const),
    contractingSector: candidate.contractingSector ?? ("UNKNOWN" as const),
    estimatedAmount,
    currency,
    publishedAt: null as Date | null,
    deadlineAt:
      deadlineAt && !Number.isNaN(deadlineAt.getTime()) ? deadlineAt : null,
    preliminaryScore: options?.preliminaryScore ?? null,
    verificationStatus: "PENDING" as const,
    contentHash,
    rawData: {
      query: options?.query ?? null,
      domain: extractDomain(candidate.sourceUrl),
      citations: options?.citations ?? [],
      candidate,
      discoveryOnly: true,
      notVerifiedByGoogleAlone: true,
    } as Record<string, unknown>,
  };
}

export type MappedGroundedSearchResult = ReturnType<
  typeof mapGroundedCandidate
>;

export type PersistedGroundedSearchResult = ReturnType<
  typeof mapVerifiedGroundedCandidate
>;

export function mapVerifiedGroundedCandidate(
  sourceType: "PRIVATE_WEB" | "LINKEDIN",
  candidate: GroundedCandidate,
  verification: CandidateVerification,
  options?: {
    query?: string;
    preliminaryScore?: number | null;
    discoveryMetadata?: Record<string, unknown> | null;
  },
) {
  const payload = verification.payload;
  const title = payload?.projectName ?? candidate.title;
  const organizationName = payload?.buyerName ?? candidate.organizationName ?? null;
  const category = payload?.category ?? candidate.category ?? inferCategoryFromText(
    [title, payload?.description ?? candidate.snippet, organizationName]
      .filter(Boolean)
      .join(" "),
  );
  const sourceUrl = verification.resolvedSourceUrl ?? candidate.sourceUrl;
  const amountEvidence = payload?.evidence.find(
    (evidence) => evidence.field === "amount" && evidence.confirmed,
  );
  const estimatedAmount = formatEstimatedAmount(payload?.amountValue ?? null);
  const contentHash = hashContent([
    sourceType,
    title,
    organizationName,
    payload?.description ?? candidate.snippet,
    category,
    payload?.amountStatus,
    estimatedAmount,
    payload?.deadline,
    sourceUrl,
  ]);

  return {
    sourceType,
    externalId: null as string | null,
    title,
    snippet: payload?.description ?? candidate.snippet ?? null,
    sourceUrl,
    sourceOriginalUrl: verification.originalSourceUrl,
    sourceResolvedUrl: verification.resolvedSourceUrl,
    normalizedUrl: normalizeUrl(sourceUrl),
    sourceTitle: verification.sourceTitle,
    sourceDomain: verification.sourceDomain,
    organizationName,
    category,
    countryCode: candidate.countryCode ?? null,
    adminArea: null as string | null,
    city: null as string | null,
    workMode: candidate.workMode ?? ("UNKNOWN" as const),
    contractingSector: candidate.contractingSector ?? ("UNKNOWN" as const),
    estimatedAmount,
    currency: payload?.amountCurrency ?? null,
    amountStatus: payload?.amountStatus ?? "UNKNOWN",
    amountEvidenceText: amountEvidence?.text ?? null,
    amountEvidenceUrl: amountEvidence?.url ?? null,
    publishedAt: payload?.publicationDate ? new Date(payload.publicationDate) : null,
    deadlineAt: payload?.deadline ? new Date(payload.deadline) : null,
    preliminaryScore: options?.preliminaryScore ?? null,
    verificationStatus: verification.status,
    verificationReason: verification.reason,
    titleConfirmed: verification.titleConfirmed,
    buyerConfirmed: verification.buyerConfirmed,
    amountConfirmed: verification.amountConfirmed,
    deadlineConfirmed: verification.deadlineConfirmed,
    sourceIsSpecific: verification.sourceIsSpecific,
    sourceIsGrounded: verification.sourceIsGrounded,
    fieldEvidence: verification.evidence,
    contentHash,
    rawData: {
      query: options?.query ?? null,
      domain: verification.sourceDomain,
      candidate,
      groundingSource: verification.sourceIsGrounded,
      sourceUrlValidation: verification.sourceUrlValidation,
      verifier: verification.verifier,
      verificationPromptVersion: "2026-07-16.1",
      verification: payload,
      discoveryMetadata: options?.discoveryMetadata ?? null,
    } as Record<string, unknown>,
  };
}
