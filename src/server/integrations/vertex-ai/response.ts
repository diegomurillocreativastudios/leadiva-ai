/**
 * Extracts usable text from a Gemini / Vertex generateContent response.
 * `response.text` is often empty when the SDK only exposes parts, or when
 * the model returns grounding metadata without a text part on the first try.
 */
export function extractGenerateContentText(response: {
  text?: string | null;
  candidates?: Array<{
    finishReason?: string | null;
    content?: {
      parts?: Array<{
        text?: string | null;
        thought?: boolean | null;
      } | null> | null;
    } | null;
  } | null> | null;
}): {
  text: string;
  finishReason: string | null;
} {
  const finishReason = response.candidates?.[0]?.finishReason ?? null;
  const fromGetter = response.text?.trim() ?? "";
  if (fromGetter) {
    return { text: fromGetter, finishReason };
  }

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const fromParts = parts
    .filter((part) => part && !part.thought && typeof part.text === "string")
    .map((part) => part?.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n")
    .trim();

  return { text: fromParts, finishReason };
}

export function candidatesFromGroundingCitations(
  citations: Array<{ uri?: string; title?: string }>,
  maxCandidates: number,
): Array<{
  title: string;
  sourceUrl: string;
  snippet: string | null;
  organizationName: null;
  category: null;
}> {
  const seen = new Set<string>();
  const candidates: Array<{
    title: string;
    sourceUrl: string;
    snippet: string | null;
    organizationName: null;
    category: null;
  }> = [];

  for (const citation of citations) {
    if (!citation.uri || candidates.length >= maxCandidates) {
      break;
    }

    let normalized: string;
    try {
      normalized = new URL(citation.uri).toString();
    } catch {
      continue;
    }

    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);

    const title = citation.title?.trim() || normalized;
    if (title.length < 3) {
      continue;
    }

    candidates.push({
      title: title.slice(0, 500),
      sourceUrl: normalized,
      snippet: null,
      organizationName: null,
      category: null,
    });
  }

  return candidates;
}

export function isVertexRateLimitError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("resource_exhausted") ||
    normalized.includes("resource has been exhausted") ||
    /\b429\b/.test(normalized) ||
    message === "AI_RATE_LIMITED"
  );
}

export function mapPrivateSearchError(message: string): string {
  switch (message) {
    case "AI_RESPONSE_EMPTY":
      return "Gemini no devolvió texto útil. Reintenta en unos segundos.";
    case "AI_RESPONSE_BLOCKED":
      return "Gemini bloqueó la respuesta por seguridad. Ajusta la consulta e intenta de nuevo.";
    case "AI_RESPONSE_INVALID_JSON":
    case "AI_RESPONSE_INVALID":
      return "Gemini devolvió un formato inválido. Reintenta la búsqueda.";
    case "AI_RATE_LIMITED":
      return "Cuota de Vertex AI agotada. Espera unos minutos o reduce SEARCH_GROUNDING_PASSES / usa gemini-2.5-flash-lite.";
    case "PRIVATE_SEARCH_ALREADY_RUNNING":
      return "Ya hay una búsqueda de sector privado en curso";
    case "VERTEX_NOT_CONFIGURED":
      return "Vertex AI no está configurado. Revisa GCP_PROJECT_ID.";
    default:
      if (isVertexRateLimitError(message)) {
        return "Cuota de Vertex AI agotada. Espera unos minutos o reduce SEARCH_GROUNDING_PASSES / usa gemini-2.5-flash-lite.";
      }
      if (
        message.includes("invalid_value") ||
        message.includes("Too big") ||
        message.includes("Unrecognized key")
      ) {
        return "Gemini devolvió un formato inválido. Reintenta la búsqueda.";
      }
      return message;
  }
}
