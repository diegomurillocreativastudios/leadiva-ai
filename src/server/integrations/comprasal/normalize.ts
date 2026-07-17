import { z } from "zod";

const namedEntitySchema = z
  .object({
    id: z.union([z.number(), z.string()]).optional(),
    nombre: z.string().optional().nullable(),
    name: z.string().optional().nullable(),
    nombre_comercial: z.string().optional().nullable(),
    codigo: z.string().optional().nullable(),
  })
  .passthrough();

const procesoCompraSchema = z
  .object({
    id: z.union([z.number(), z.string()]).optional(),
    nombre_proceso: z.string().optional().nullable(),
    codigo_proceso: z.string().optional().nullable(),
    fecha_adjudicacion: z.string().optional().nullable(),
    Institucion: namedEntitySchema.optional().nullable(),
    sp: z
      .object({
        nombre: z.string().optional().nullable(),
      })
      .passthrough()
      .optional()
      .nullable(),
  })
  .passthrough();

/** Public list payload: awarded contracts (adjudicaciones). */
export const comprasalAwardRecordSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    monto: z.union([z.number(), z.string()]).optional().nullable(),
    institucion: namedEntitySchema.optional().nullable(),
    proveedor: namedEntitySchema.optional().nullable(),
    proceso_compra: procesoCompraSchema,
  })
  .passthrough();

/** Legacy/flat process shape (still supported for fixtures). */
export const comprasalFlatProcessSchema = z
  .object({
    id: z.union([z.number(), z.string()]).optional(),
    id_proceso_compra: z.union([z.number(), z.string()]).optional(),
    codigo_proceso: z.string().optional().nullable(),
    nombre_proceso: z.string().optional().nullable(),
    descripcion: z.string().optional().nullable(),
    estado: z.string().optional().nullable(),
    institucion: z
      .union([z.string(), namedEntitySchema])
      .optional()
      .nullable(),
    nombre_institucion: z.string().optional().nullable(),
    id_institucion: z.union([z.number(), z.string()]).optional().nullable(),
    fecha_publicacion: z.string().optional().nullable(),
    fecha_adjudicacion: z.string().optional().nullable(),
    fecha_inicio: z.string().optional().nullable(),
    fecha_limite_ofertas: z.string().optional().nullable(),
    fecha_recepcion_ofertas: z.string().optional().nullable(),
    fecha_cierre: z.string().optional().nullable(),
    numero_lote: z.union([z.number(), z.string()]).optional().nullable(),
    lote: z.union([z.number(), z.string()]).optional().nullable(),
    modalidad: z
      .union([
        z.string(),
        z.object({ nombre: z.string().optional().nullable() }).passthrough(),
      ])
      .optional()
      .nullable(),
    url: z.string().optional().nullable(),
    link: z.string().optional().nullable(),
  })
  .passthrough()
  .refine(
    (value) =>
      value.id_proceso_compra !== undefined ||
      value.id !== undefined ||
      Boolean(value.codigo_proceso?.trim()) ||
      Boolean(value.nombre_proceso?.trim()),
    { message: "Proceso COMPRASAL sin identidad usable" },
  );

export type ComprasalRecordKind = "AWARD" | "PROCESS";

export type ComprasalNormalizedProcess = {
  recordKind: ComprasalRecordKind;
  externalId: string;
  awardId: string | null;
  processId: string | null;
  codigoProceso: string | null;
  nombreProceso: string;
  descripcion: string | null;
  estado: string | null;
  institucionNombre: string | null;
  proveedorNombre: string | null;
  monto: number | null;
  fechaAdjudicacion: string | null;
  fechaPublicacion: string | null;
  fechaInicio: string | null;
  fechaLimiteOfertas: string | null;
  fechaRecepcionOfertas: string | null;
  fechaCierre: string | null;
  numeroLote: string | null;
  modalidad: string | null;
  url: string | null;
  raw: Record<string, unknown>;
};

function entityName(
  value: string | z.infer<typeof namedEntitySchema> | null | undefined,
): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (!value || typeof value !== "object") {
    return null;
  }
  const name = value.nombre ?? value.name ?? value.nombre_comercial ?? null;
  return name?.trim() || null;
}

function asId(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const id = String(value).trim();
  return id || null;
}

function asAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function modalidadName(
  value: z.infer<typeof comprasalFlatProcessSchema>["modalidad"],
): string | null {
  if (typeof value === "string") {
    return value.trim() || null;
  }
  if (value && typeof value === "object") {
    return value.nombre?.trim() || null;
  }
  return null;
}

function normalizeAward(
  award: z.infer<typeof comprasalAwardRecordSchema>,
): ComprasalNormalizedProcess | null {
  const awardId = asId(award.id);
  const processId = asId(award.proceso_compra.id);
  const codigoProceso = award.proceso_compra.codigo_proceso?.trim() || null;
  const nombreProceso =
    award.proceso_compra.nombre_proceso?.trim() ||
    codigoProceso ||
    (awardId ? `Adjudicación COMPRASAL ${awardId}` : "");

  if (!awardId && !processId && !codigoProceso && !nombreProceso) {
    return null;
  }

  const institucionNombre =
    entityName(award.institucion) ??
    entityName(award.proceso_compra.Institucion);
  const proveedorNombre = entityName(award.proveedor);
  const monto = asAmount(award.monto);
  const fechaAdjudicacion =
    award.proceso_compra.fecha_adjudicacion?.trim() || null;
  const estado = award.proceso_compra.sp?.nombre?.trim() || null;

  const snippetParts = [
    codigoProceso ? `Código: ${codigoProceso}` : null,
    fechaAdjudicacion ? `Adjudicación: ${fechaAdjudicacion}` : null,
    monto !== null
      ? `Monto: $${monto.toLocaleString("es-SV", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`
      : null,
    proveedorNombre ? `Proveedor: ${proveedorNombre}` : null,
    estado ? `Etapa: ${estado}` : null,
  ].filter(Boolean);

  return {
    recordKind: "AWARD",
    // One catalog row per purchase process; keep awardId for audit/raw.
    externalId: processId ?? codigoProceso ?? awardId ?? nombreProceso,
    awardId,
    processId,
    codigoProceso,
    nombreProceso,
    descripcion: snippetParts.join(" · ") || null,
    estado,
    institucionNombre,
    proveedorNombre,
    monto,
    fechaAdjudicacion,
    fechaPublicacion: null,
    fechaInicio: null,
    fechaLimiteOfertas: null,
    fechaRecepcionOfertas: null,
    fechaCierre: null,
    numeroLote: null,
    modalidad: null,
    url: null,
    raw: award as Record<string, unknown>,
  };
}

function normalizeFlat(
  process: z.infer<typeof comprasalFlatProcessSchema>,
): ComprasalNormalizedProcess | null {
  const processId = asId(process.id_proceso_compra ?? process.id);
  const codigoProceso = process.codigo_proceso?.trim() || null;
  const nombreProceso =
    process.nombre_proceso?.trim() ||
    codigoProceso ||
    (processId ? `Proceso COMPRASAL ${processId}` : "");

  if (!processId && !codigoProceso && !nombreProceso) {
    return null;
  }

  return {
    recordKind: "PROCESS",
    externalId: processId ?? codigoProceso ?? nombreProceso,
    awardId: null,
    processId,
    codigoProceso,
    nombreProceso,
    descripcion: process.descripcion?.trim() || null,
    estado: process.estado?.trim() || null,
    institucionNombre:
      entityName(process.institucion) ??
      (process.nombre_institucion?.trim() || null),
    proveedorNombre: null,
    monto: null,
    fechaAdjudicacion: process.fecha_adjudicacion?.trim() || null,
    fechaPublicacion: process.fecha_publicacion?.trim() || null,
    fechaInicio: process.fecha_inicio?.trim() || null,
    fechaLimiteOfertas: process.fecha_limite_ofertas?.trim() || null,
    fechaRecepcionOfertas: process.fecha_recepcion_ofertas?.trim() || null,
    fechaCierre: process.fecha_cierre?.trim() || null,
    numeroLote:
      process.numero_lote !== undefined && process.numero_lote !== null
        ? String(process.numero_lote)
        : process.lote !== undefined && process.lote !== null
          ? String(process.lote)
          : null,
    modalidad: modalidadName(process.modalidad),
    url: process.url?.trim() || process.link?.trim() || null,
    raw: process as Record<string, unknown>,
  };
}

/**
 * Normalizes COMPRASAL public API rows.
 * The main list endpoint returns nested award/contract objects, not open RFPs.
 */
export function normalizeComprasalRecord(
  row: unknown,
): ComprasalNormalizedProcess | null {
  if (!row || typeof row !== "object") {
    return null;
  }

  const asRecord = row as Record<string, unknown>;

  if (
    asRecord.proceso_compra &&
    typeof asRecord.proceso_compra === "object"
  ) {
    const award = comprasalAwardRecordSchema.safeParse(row);
    if (!award.success) {
      return null;
    }
    return normalizeAward(award.data);
  }

  const flat = comprasalFlatProcessSchema.safeParse(row);
  if (!flat.success) {
    return null;
  }
  return normalizeFlat(flat.data);
}
