import { sourceTypeLabels } from "@/lib/filters/labels";

export type SearchExecutionOption = {
  id: string;
  status: string;
  candidatesFound: number;
  candidatesDiscarded?: number;
  createdAt: Date | string;
  sourceType: string | null;
  profileName: string | null;
};

const executionStatusLabels: Record<string, string> = {
  PENDING: "Pendiente",
  RUNNING: "En curso",
  COMPLETED: "Completada",
  PARTIALLY_COMPLETED: "Parcial",
  FAILED: "Fallida",
  CANCELLED: "Cancelada",
};

function formatCatalogCountLabel(execution: SearchExecutionOption): string {
  const found = execution.candidatesFound;
  const discarded = execution.candidatesDiscarded ?? 0;

  // Private searches count candidates before filtering; when all were
  // discarded nothing was persisted for that execution.
  if (found > 0 && discarded >= found) {
    return "0 en catálogo";
  }

  if (found === 1) {
    return "1 en catálogo";
  }

  return `${found} en catálogo`;
}

export function formatSearchExecutionLabel(
  execution: SearchExecutionOption,
  locale = "es-SV",
): string {
  const source =
    (execution.sourceType && sourceTypeLabels[execution.sourceType]) ||
    execution.profileName ||
    "Búsqueda";
  const when = new Date(execution.createdAt).toLocaleString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const status =
    executionStatusLabels[execution.status] ?? execution.status;

  return `${source} · ${when} · ${status} · ${formatCatalogCountLabel(execution)}`;
}
