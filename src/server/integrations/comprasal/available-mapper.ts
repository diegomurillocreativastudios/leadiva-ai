import { hashContent } from "@/lib/content-hash";
import {
  inferCategoryFromText,
  normalizeUrl,
} from "@/lib/normalization";
import type { ComprasalAvailableProcess } from "./available-normalize";

const COMPRASAL_PUBLIC_BASE_URL = "https://www.comprasal.gob.sv";

export function buildComprasalPublicProcessUrl(
  processId: number | string,
): string {
  const normalizedId = String(processId).trim();
  if (!/^\d+$/.test(normalizedId)) {
    throw new Error("Invalid COMPRASAL public process id");
  }
  return `${COMPRASAL_PUBLIC_BASE_URL}/procesos-publicos/${normalizedId}`;
}

export function mapComprasalAvailableProcessToSearchResult(
  process: ComprasalAvailableProcess,
  preliminaryScore: number,
) {
  const sourceUrl = buildComprasalPublicProcessUrl(process.id);
  const searchableText = [
    process.title,
    process.code,
    process.institution,
    process.contractingMethod,
    process.contractingMethodCode,
    ...process.activityNames,
  ].join(" ");
  const contentHash = hashContent([
    "COMPRASAL_AVAILABLE_PROCESS_V2",
    "AVAILABLE_PROCESS",
    String(process.id),
    process.externalId,
    String(process.version),
    process.code,
    process.title,
    process.institution,
    process.currentState,
    process.processState,
    String(process.currentStage.id),
    process.currentStage.name,
    process.currentStage.startsAt,
    process.currentStage.endsAt,
    process.contractingMethod,
    process.contractingMethodCode,
    process.publicationStage ? String(process.publicationStage.id) : null,
    process.publicationStage?.name,
    process.publicationStage?.startsAt,
    process.publicationStage?.endsAt,
    ...[...process.activityNames].sort(),
  ]);

  return {
    sourceType: "COMPRASAL" as const,
    externalId: process.externalId,
    title: process.title,
    snippet: null,
    sourceUrl,
    normalizedUrl: normalizeUrl(sourceUrl),
    sourceDomain: "www.comprasal.gob.sv",
    organizationName: process.institution,
    category: inferCategoryFromText(searchableText),
    countryCode: "SV" as const,
    adminArea: null,
    city: null,
    workMode: "UNKNOWN" as const,
    contractingSector: "PUBLIC" as const,
    estimatedAmount: null,
    currency: null,
    amountStatus: "NOT_PUBLISHED" as const,
    publishedAt: process.publishedAt ? new Date(process.publishedAt) : null,
    deadlineAt: new Date(process.deadlineAt),
    preliminaryScore,
    verificationStatus: "VERIFIED" as const,
    titleConfirmed: true,
    buyerConfirmed: true,
    amountConfirmed: false,
    deadlineConfirmed: true,
    sourceIsSpecific: true,
    sourceIsGrounded: false,
    contentHash,
    rawData: process.rawData,
  };
}

export type MappedComprasalAvailableSearchResult = ReturnType<
  typeof mapComprasalAvailableProcessToSearchResult
>;
