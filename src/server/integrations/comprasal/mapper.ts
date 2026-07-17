import { hashContent } from "@/lib/content-hash";
import { inferCategoryFromText, normalizeUrl } from "@/lib/normalization";
import { isGenericOrListingSourceUrl } from "@/lib/source-url-specificity";
import type { ComprasalNormalizedProcess } from "./normalize";

function parseDate(value?: string | null): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatAmount(monto: number | null): string | null {
  if (monto === null || Number.isNaN(monto)) {
    return null;
  }
  return monto.toFixed(2);
}

function resolveComprasalSourceUrl(params: {
  processUrl: string | null;
  processPathId: string | null;
  title: string;
}): { sourceUrl: string; sourceIsSpecific: boolean } {
  const officialUrl = params.processUrl?.trim() || null;
  if (officialUrl) {
    return {
      sourceUrl: officialUrl,
      sourceIsSpecific: !isGenericOrListingSourceUrl(officialUrl),
    };
  }

  if (params.processPathId) {
    const sourceUrl = `https://www.comprasal.gob.sv/proceso/${encodeURIComponent(params.processPathId)}`;
    return { sourceUrl, sourceIsSpecific: true };
  }

  const slug = params.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const sourceUrl = `https://www.comprasal.gob.sv/proceso/sin-referencia/${slug || "desconocido"}`;
  return { sourceUrl, sourceIsSpecific: false };
}

export function mapComprasalProcessToSearchResult(
  process: ComprasalNormalizedProcess,
  options?: { preliminaryScore?: number | null },
) {
  const externalId = process.externalId.trim();
  const title = process.nombreProceso.trim() || `Proceso COMPRASAL ${externalId || "sin id"}`;
  const org = process.institucionNombre;

  const processPathId =
    (process.processId ?? externalId)?.trim() || null;
  const { sourceUrl, sourceIsSpecific } = resolveComprasalSourceUrl({
    processUrl: process.url,
    processPathId,
    title,
  });

  const deadlineAt =
    parseDate(process.fechaLimiteOfertas) ??
    parseDate(process.fechaRecepcionOfertas) ??
    parseDate(process.fechaCierre);

  const publishedAt =
    parseDate(process.fechaPublicacion) ??
    parseDate(process.fechaInicio) ??
    parseDate(process.fechaAdjudicacion);

  const textBlob = [
    title,
    process.descripcion,
    org,
    process.estado,
    process.proveedorNombre,
    process.modalidad,
  ]
    .filter(Boolean)
    .join(" ");

  // Process-scoped hash: awards under the same proceso_compra share identity.
  const contentHash = hashContent([
    "COMPRASAL",
    process.processId ?? externalId,
    process.codigoProceso,
    title,
    org,
    publishedAt?.toISOString(),
    deadlineAt?.toISOString(),
    process.numeroLote,
  ]);

  const estimatedAmount = formatAmount(process.monto);

  return {
    sourceType: "COMPRASAL" as const,
    externalId: externalId || null,
    title,
    snippet: process.descripcion,
    sourceUrl,
    normalizedUrl: normalizeUrl(sourceUrl),
    organizationName: org,
    category: inferCategoryFromText(textBlob),
    countryCode: "SV" as const,
    adminArea: null as string | null,
    city: null as string | null,
    workMode: "UNKNOWN" as const,
    contractingSector: "PUBLIC" as const,
    estimatedAmount,
    currency: estimatedAmount ? ("USD" as const) : null,
    amountStatus: estimatedAmount
      ? ("PUBLISHED" as const)
      : ("NOT_PUBLISHED" as const),
    sourceIsSpecific,
    publishedAt,
    deadlineAt,
    preliminaryScore: options?.preliminaryScore ?? null,
    verificationStatus: "PENDING" as const,
    contentHash,
    rawData: process.raw,
  };
}

export type MappedComprasalSearchResult = ReturnType<
  typeof mapComprasalProcessToSearchResult
>;
