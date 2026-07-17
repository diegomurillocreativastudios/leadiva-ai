import type { GroundedCandidate } from "../schemas";

export const VERIFY_OPPORTUNITY_SOURCE_PROMPT_VERSION = "2026-07-16.1";

export function buildVerifyOpportunitySourcePrompt(params: {
  candidate: GroundedCandidate;
  sourceUrl: string;
  fallbackPageText?: string | null;
}): string {
  const fallback = params.fallbackPageText
    ? `\nCONTENIDO HTTP RECUPERADO (puede estar truncado; no inventes fuera de este texto):\n${params.fallbackPageText}\n`
    : "";

  return `Eres un verificador estricto de oportunidades de contratación. Analiza SOLAMENTE la URL indicada. Si está disponible, usa URL Context para leerla. No busques otras páginas ni completes datos por conocimiento previo.

URL A VERIFICAR: ${params.sourceUrl}

CANDIDATO PRELIMINAR (no es evidencia):
- nombre esperado: ${params.candidate.title}
- comprador esperado: ${params.candidate.organizationName ?? "desconocido"}
- categoría preliminar: ${params.candidate.category ?? "desconocida"}
- descripción preliminar: ${params.candidate.snippet ?? "sin descripción"}
- monto preliminar: ${params.candidate.estimatedAmount ?? "no publicado"} ${params.candidate.currency ?? ""}

Decide si la URL representa UNA oportunidad concreta. Rechaza homepages, índices de licitaciones, categorías, resultados de búsqueda, perfiles institucionales, marketing de proveedores y páginas con múltiples oportunidades sin una identificada.

Extrae únicamente información explícita y respaldada por la URL. No inventes fechas, comprador, categoría ni monto. Un préstamo, presupuesto de programa o monto institucional amplio NO es monto del contrato. Si no se publica monto, usa amountStatus NOT_PUBLISHED y todos los importes null. Si la fuente no permite saberlo, usa UNKNOWN.

Devuelve JSON válido sin Markdown con exactamente los campos solicitados por el schema. Cada evidencia debe ser un texto corto literal o una paráfrasis muy cercana a la fuente, con esta misma URL. La razón de rechazo debe ser concreta cuando corresponda.${fallback}`;
}
