export type SearchHttpPayload = Record<string, unknown> & {
  executionId?: string;
  error?: string;
  message?: string;
  status?: string;
  configured?: boolean;
  candidatesFound?: number;
  candidatesVerified?: number;
};

export async function readSearchHttpPayload(
  response: Response,
): Promise<SearchHttpPayload> {
  try {
    const value: unknown = await response.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const source = value as Record<string, unknown>;
    const payload: SearchHttpPayload = {};
    for (const key of ["error", "message", "status"] as const) {
      const field = source[key];
      if (typeof field === "string") payload[key] = field.slice(0, 500);
    }
    if (
      typeof source.executionId === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        source.executionId,
      )
    ) {
      payload.executionId = source.executionId;
    }
    if (typeof source.configured === "boolean") {
      payload.configured = source.configured;
    }
    for (const key of ["candidatesFound", "candidatesVerified"] as const) {
      const field = source[key];
      if (typeof field === "number" && Number.isFinite(field)) {
        payload[key] = field;
      }
    }
    return payload;
  } catch {
    return {};
  }
}

export function isPartialSearchResponse(
  responseStatus: number,
  payloadStatus?: string,
): boolean {
  return responseStatus === 207 || payloadStatus === "PARTIALLY_COMPLETED";
}
