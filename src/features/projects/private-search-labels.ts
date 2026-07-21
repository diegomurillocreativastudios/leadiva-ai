const PRIVATE_SEARCH_OUTCOME_LABELS: Record<string, string> = {
  COMPLETED: "Completado",
  PARTIALLY_COMPLETED: "Completado parcialmente",
  FAILED: "Fallido",
  RESULTS_FOUND: "Resultados encontrados",
  ALL_FILTERED: "Todos los candidatos filtrados",
  NO_DISCOVERY_RESULTS: "Sin resultados de descubrimiento",
  NO_VERIFIED_RESULTS: "Sin resultados verificados",
  COMPLETED_WITH_RESULTS: "Completado con resultados",
  COMPLETED_NO_GROUNDING_SOURCES: "Sin fuentes de Grounding",
  COMPLETED_EMPTY_DISCOVERY_RESPONSE: "Respuesta de descubrimiento vacía",
  COMPLETED_NO_NORMALIZED_CANDIDATES: "Sin candidatos normalizados",
  COMPLETED_ALL_FILTERED: "Todos los candidatos filtrados",
  COMPLETED_ALL_UNVERIFIED: "Ninguno verificable",
  COMPLETED_ALL_DUPLICATES: "Todos duplicados",
  COMPLETED_ALL_UNCHANGED: "Sin cambios en persistencia",
  COMPLETED_WITH_PERSISTED_RESULTS: "Resultados persistidos",
  FAILED_DISCOVERY: "Falló el descubrimiento",
  FAILED_NORMALIZATION: "Falló la normalización",
  FAILED_PERSISTENCE: "Falló la persistencia",
  VERTEX_NOT_CONFIGURED: "Vertex no configurado",
  PROVIDER_NOT_CONFIGURED: "Proveedor web no configurado",
  COMPLETED_NO_PROVIDER_RESULTS: "Sin resultados web",
  COMPLETED_NO_UNIQUE_URLS: "Sin URLs únicas",
  COMPLETED_NO_RELEVANT_SEARCH_RESULTS: "Sin resultados web relevantes",
  COMPLETED_NO_FETCHABLE_DOCUMENTS: "Sin documentos recuperables",
  COMPLETED_NO_EXTRACTED_CANDIDATES: "Sin candidatos extraídos",
  FAILED_PROVIDER_AUTH: "Falló la autenticación del proveedor",
  FAILED_PROVIDER_RATE_LIMIT: "Límite del proveedor alcanzado",
  FAILED_PROVIDER: "Falló el proveedor web",
  FAILED_DOCUMENT_FETCH: "Falló la recuperación de documentos",
  FAILED_EXTRACTION: "Falló la extracción de documentos",
};

const DISCARD_REASON_LABELS: Record<string, string> = {
  INVALID: "Inválido",
  NOISE: "Ruido / empleo / curso",
  PUBLIC_SECTOR: "Sector público",
  INTERGOVERNMENTAL: "Organismo intergubernamental",
  FOREIGN_PUBLIC_SECTOR: "Sector público extranjero",
  IRRELEVANT: "Irrelevante",
  EXPIRED: "Vencido",
  DUPLICATE_IN_BATCH: "Duplicado en lote",
  UNREACHABLE: "Inalcanzable",
  UNGROUNDED_SOURCE: "Sin fuente Grounding",
  REJECTED: "Rechazado en verificación",
  PARTIALLY_VERIFIED: "Verificación parcial",
  PERSIST_ERROR: "Error al guardar",
  ROBOTS_DISALLOWED: "Bloqueado por robots.txt",
  FETCH_FAILED: "No se pudo recuperar",
  NETWORK_ERROR: "Error de red",
  HTTP_ERROR: "Error HTTP",
  TIMEOUT: "Tiempo de espera agotado",
  MISSING_DEADLINE: "Sin fecha límite confirmada",
  MISSING_APPLICATION_METHOD: "Sin método de aplicación",
  NO_CONTRACTING_SIGNAL: "Sin señal de contratación",
  AGGREGATOR_INDEX_PAGE: "Página índice / agregadora",
  OFFICIAL_LINK_NOT_FOUND: "Sin enlace oficial específico",
  SPECIFIC_OPPORTUNITY_NOT_FOUND: "Sin oportunidad concreta",
  VERIFICATION_SOURCE_MISMATCH: "Fuente de verificación no coincide",
};

export function formatPrivateSearchOutcome(outcome: string | undefined | null) {
  if (!outcome) {
    return null;
  }
  return PRIVATE_SEARCH_OUTCOME_LABELS[outcome] ?? outcome;
}

export function formatDiscardReason(reason: string) {
  return DISCARD_REASON_LABELS[reason] ?? reason;
}

export function topDiscardReasons(
  discardCounts: Record<string, number> | undefined | null,
  limit = 5,
): Array<{ reason: string; label: string; count: number }> {
  if (!discardCounts) {
    return [];
  }

  return Object.entries(discardCounts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([reason, count]) => ({
      reason,
      label: formatDiscardReason(reason),
      count,
    }));
}

/** Copy for the opportunities empty state when a private search already ran. */
export function describePrivateSearchCatalogEmpty(params: {
  outcome?: string | null;
  candidatesFound: number;
  candidatesVerified: number;
  candidatesFiltered: number;
  funnelLine: string;
  topDiscardLabel?: string | null;
}): { title: string; description: string } {
  const outcome = params.outcome ?? null;
  const discardHint = params.topDiscardLabel
    ? ` Motivo principal: ${params.topDiscardLabel}.`
    : "";

  if (
    outcome === "COMPLETED_ALL_FILTERED" ||
    outcome === "ALL_FILTERED" ||
    params.candidatesFiltered > 0
  ) {
    return {
      title: "Todavía no hay oportunidades verificadas",
      description: `${params.funnelLine}.${discardHint} Revisa la actividad de la búsqueda o inicia otra.`,
    };
  }

  if (
    outcome === "COMPLETED_ALL_UNVERIFIED" ||
    (params.candidatesFound > 0 && params.candidatesVerified === 0)
  ) {
    return {
      title: "Todavía no hay oportunidades verificadas",
      description: `${params.funnelLine}. La última búsqueda encontró candidatos, pero ninguno superó la verificación.`,
    };
  }

  if (params.candidatesFound === 0) {
    return {
      title: "Todavía no hay oportunidades verificadas",
      description: `${params.funnelLine}. La última búsqueda no produjo candidatos normalizados. Puedes revisar su actividad o iniciar otra búsqueda.`,
    };
  }

  return {
    title: "Todavía no hay oportunidades verificadas",
    description: `${params.funnelLine}.${discardHint}`,
  };
}
