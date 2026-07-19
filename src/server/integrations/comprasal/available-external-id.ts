export class ComprasalAvailableExternalIdError extends Error {
  constructor(message = "Invalid COMPRASAL available process identity") {
    super(message);
    this.name = "ComprasalAvailableExternalIdError";
  }
}

/** Parses only canonical identities produced by the available-process search. */
export function parseComprasalAvailableExternalId(externalId: string): number {
  const match = /^available:([1-9]\d*)$/.exec(externalId);
  if (!match) {
    throw new ComprasalAvailableExternalIdError();
  }

  const processId = Number(match[1]);
  if (!Number.isSafeInteger(processId) || processId <= 0) {
    throw new ComprasalAvailableExternalIdError();
  }

  return processId;
}

function readRawProcessId(rawData: Record<string, unknown> | null): number | null {
  if (!rawData || !("id" in rawData)) {
    return null;
  }

  const rawId = rawData.id;
  const processId =
    typeof rawId === "number"
      ? rawId
      : typeof rawId === "string" && /^[1-9]\d*$/.test(rawId)
        ? Number(rawId)
        : Number.NaN;

  if (!Number.isSafeInteger(processId) || processId <= 0) {
    throw new ComprasalAvailableExternalIdError(
      "Invalid COMPRASAL process identity in canonical raw data",
    );
  }

  return processId;
}

/** Resolves the canonical ID and rejects contradictory stored source data. */
export function resolveComprasalAvailableProcessId(params: {
  externalId: string;
  rawData: Record<string, unknown> | null;
}): number {
  const processId = parseComprasalAvailableExternalId(params.externalId);
  const rawProcessId = readRawProcessId(params.rawData);

  if (rawProcessId !== null && rawProcessId !== processId) {
    throw new ComprasalAvailableExternalIdError(
      "Contradictory COMPRASAL process identities",
    );
  }

  return processId;
}
