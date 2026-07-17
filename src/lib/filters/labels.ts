import type { SourceType, WorkMode } from "@/server/db/schema/enums";
import { verificationStatuses } from "@/server/db/schema/enums";

export const sourceTypeLabels: Record<string, string> = {
  COMPRASAL: "COMPRASAL",
  PRIVATE_WEB: "Sector privado",
  LINKEDIN: "LinkedIn",
  MANUAL: "Manual",
};

/** Review-oriented labels for search_results.verification_status (Phase 1). */
export const reviewStatusLabels: Record<
  (typeof verificationStatuses)[number],
  string
> = {
  PENDING: "Pendientes",
  PARTIALLY_VERIFIED: "En revisión",
  VERIFIED: "Convertidas",
  REJECTED: "Descartadas",
};

export const workModeLabels: Record<WorkMode, string> = {
  ONSITE: "Presencial",
  REMOTE: "Remoto",
  HYBRID: "Híbrido",
  UNKNOWN: "Sin definir",
};

export function labelSourceType(value: string): string {
  return sourceTypeLabels[value] ?? value;
}

export function labelSourceTypes(values: readonly SourceType[]): string {
  return values.map(labelSourceType).join(", ");
}
