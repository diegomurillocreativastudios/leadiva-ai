import type { ComprasalNormalizedProcess } from "./normalize";
import {
  assessComprasalRelevance,
  buildRelevanceOptions,
  type ComprasalRelevanceOptions,
} from "./relevance";

export type { ComprasalRelevanceOptions };

export const comprasalDiscardReasons = [
  "INVALID",
  "HISTORICAL",
  "NOISE",
  "IRRELEVANT",
  "DUPLICATE_IN_BATCH",
] as const;

export type ComprasalDiscardReason = (typeof comprasalDiscardReasons)[number];

export type ComprasalFilterDecision =
  | { accept: true; score?: number }
  | { accept: false; reason: ComprasalDiscardReason; detail: string };

function textBlob(process: ComprasalNormalizedProcess): string {
  return [
    process.nombreProceso,
    process.descripcion,
    process.estado,
    process.codigoProceso,
    process.modalidad,
    process.proveedorNombre,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function hasId(process: ComprasalNormalizedProcess): boolean {
  return Boolean(
    process.externalId ||
      process.awardId ||
      process.processId ||
      process.codigoProceso,
  );
}

/**
 * Deterministic filters before Gemini / persistence.
 * COMPRASAL data must not go through Google Search.
 *
 * Note: the public list API returns awards (adjudicaciones). Those are accepted
 * for market intelligence when relevant to Creativa interests; only flat
 * "process" rows with award/expired signals are treated as historical.
 */
export function classifyComprasalProcess(
  process: ComprasalNormalizedProcess,
  now: Date = new Date(),
  relevance: ComprasalRelevanceOptions = buildRelevanceOptions(),
): ComprasalFilterDecision {
  if (!hasId(process)) {
    return {
      accept: false,
      reason: "INVALID",
      detail: "Proceso sin identificador oficial",
    };
  }

  const blob = textBlob(process);

  if (
    /\b(empleo|vacante|contrataci[oó]n de personal|plaza\b|recursos humanos)\b/.test(
      blob,
    )
  ) {
    return {
      accept: false,
      reason: "NOISE",
      detail: "Descartado: parece convocatoria de empleo",
    };
  }

  if (
    /\b(cursos?|diplomados?|capacitaci[oó]n(?:es)?|talleres?|seminarios?)\b/.test(
      blob,
    )
  ) {
    return {
      accept: false,
      reason: "NOISE",
      detail: "Descartado: parece curso/capacitación",
    };
  }

  if (process.recordKind === "PROCESS" && process.fechaAdjudicacion) {
    return {
      accept: false,
      reason: "HISTORICAL",
      detail: "Proceso histórico (tiene fecha de adjudicación)",
    };
  }

  const historicalPattern =
    /\b(adjudicado|adjudicada|adjudicados|adjudicadas|cerrado|cerrada|cerrados|finalizado|finalizada|cancelado|cancelada|desierto|desierta|anulado|anulada|hist[oó]rico|hist[oó]rica)\b/;

  if (
    process.recordKind === "PROCESS" &&
    ((process.estado && historicalPattern.test(process.estado.toLowerCase())) ||
      historicalPattern.test(blob))
  ) {
    return {
      accept: false,
      reason: "HISTORICAL",
      detail: "Proceso no activo según estado/texto",
    };
  }

  if (process.fechaLimiteOfertas || process.fechaRecepcionOfertas) {
    const deadlineRaw =
      process.fechaLimiteOfertas ?? process.fechaRecepcionOfertas;
    const deadline = deadlineRaw ? new Date(deadlineRaw) : null;
    if (deadline && !Number.isNaN(deadline.getTime()) && deadline < now) {
      return {
        accept: false,
        reason: "HISTORICAL",
        detail: "Proceso con plazo de ofertas vencido",
      };
    }
  }

  const relevanceDecision = assessComprasalRelevance(process, relevance);
  if (!relevanceDecision.accept) {
    return {
      accept: false,
      reason: "IRRELEVANT",
      detail: relevanceDecision.detail,
    };
  }

  return { accept: true, score: relevanceDecision.score };
}

export function batchDedupeKey(process: ComprasalNormalizedProcess): string {
  if (process.processId) {
    return `process:${process.processId}`;
  }

  const codigo = process.codigoProceso?.trim().toLowerCase();
  if (codigo) {
    return `codigo:${codigo}`;
  }

  if (process.externalId) {
    return `id:${process.externalId}`;
  }

  const title = process.nombreProceso.trim().toLowerCase();
  const org = (process.institucionNombre ?? "").trim().toLowerCase();
  const lote = process.numeroLote ?? "";

  return `org:${org}|title:${title}|lote:${String(lote).trim().toLowerCase()}`;
}
