import { z } from "zod";

const ISO_8601_WITH_TIMEZONE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

export function isComprasalIsoDateTime(value: string): boolean {
  return (
    ISO_8601_WITH_TIMEZONE.test(value) && !Number.isNaN(Date.parse(value))
  );
}

const comprasalIsoDateTimeSchema = z
  .string()
  .trim()
  .refine(
    isComprasalIsoDateTime,
    "Expected an ISO 8601 timestamp with Z or an explicit offset",
  );

export const comprasalAvailableStageSchema = z
  .object({
    id: z.number().int(),
    nombre: z.string().trim().min(1),
    fecha_hora_fin: comprasalIsoDateTimeSchema,
    fecha_hora_inicio: comprasalIsoDateTimeSchema,
  })
  .passthrough();

const comprasalAvailableActivityDetailSchema = z
  .object({
    id: z.number().int(),
    nombre: z.string().trim().min(1),
    codigo: z.string().trim().min(1),
    id_tipo_actividad: z.number().int(),
  })
  .passthrough();

export const comprasalAvailableActivitySchema = z
  .object({
    id: z.number().int(),
    id_rubro: z.number().int(),
    id_proceso: z.number().int(),
    a: comprasalAvailableActivityDetailSchema,
  })
  .passthrough();

export const comprasalAvailableProcessSchema = z
  .object({
    id: z.number().int().positive(),
    nombre_proceso: z.string().trim().min(1),
    codigo_proceso: z.string().trim().min(1),
    version: z.number().int().nonnegative(),
    institucion: z.string().trim().min(1),
    estado_actual: z.string().trim().min(1),
    estado_actual_color: z.string().trim().min(1),
    forma_contratacion: z.string().trim().min(1),
    codigo_forma_contratacion: z.string().trim().min(1),
    id_estado_proceso: z.number().int(),
    estado_proceso: z.string().trim().min(1),
    EtapaPorProcesos: z.array(comprasalAvailableStageSchema),
    etapas: z.array(comprasalAvailableStageSchema),
    actividades: z.array(comprasalAvailableActivitySchema),
  })
  .passthrough();

export type ComprasalAvailableProcessRecord = z.infer<
  typeof comprasalAvailableProcessSchema
>;

export type ComprasalAvailablePage = {
  rows: unknown[];
  currentPage: number;
  perPage: number;
  totalRows: number;
  lastPage: number;
};

export class ComprasalAvailableContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ComprasalAvailableContractError";
  }
}

function parsePositiveHeader(headers: Headers, name: string): number {
  const raw = headers.get(name)?.trim() ?? "";
  if (!/^\d+$/.test(raw)) {
    throw new ComprasalAvailableContractError(
      `COMPRASAL missing or invalid ${name} header`,
    );
  }

  const value = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new ComprasalAvailableContractError(
      `COMPRASAL invalid ${name} header`,
    );
  }
  return value;
}

function parseTotalRowsHeader(headers: Headers): number {
  const raw = headers.get("total_rows")?.trim() ?? "";
  if (!/^\d+$/.test(raw)) {
    throw new ComprasalAvailableContractError(
      "COMPRASAL missing or invalid total_rows header",
    );
  }

  const value = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ComprasalAvailableContractError(
      "COMPRASAL invalid total_rows header",
    );
  }
  return value;
}

export function parseComprasalAvailableResponse(
  json: unknown,
  headers: Headers,
): ComprasalAvailablePage {
  if (!Array.isArray(json)) {
    throw new ComprasalAvailableContractError(
      "COMPRASAL available response must be an array",
    );
  }

  const currentPage = parsePositiveHeader(headers, "page");
  const perPage = parsePositiveHeader(headers, "per_page");
  const totalRows = parseTotalRowsHeader(headers);

  return {
    rows: json,
    currentPage,
    perPage,
    totalRows,
    lastPage: totalRows === 0 ? 0 : Math.ceil(totalRows / perPage),
  };
}
