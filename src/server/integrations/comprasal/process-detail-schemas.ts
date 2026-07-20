import { z } from "zod";

import { isComprasalIsoDateTime } from "./available-schemas";

const nullableZonedDateTime = z
  .string()
  .trim()
  .refine(
    isComprasalIsoDateTime,
    "Expected an ISO 8601 timestamp with Z or an explicit offset",
  )
  .nullable();

export const comprasalPipStageRecordSchema = z
  .object({
    id: z.number().int().positive(),
    nombre: z.string().trim().min(1),
    fecha_hora_inicio: nullableZonedDateTime,
    fecha_hora_fin: nullableZonedDateTime,
  })
  .passthrough();

export const comprasalPipStageArraySchema = z.array(
  comprasalPipStageRecordSchema,
);

const comprasalProcessDetailDataSchema = z
  .object({
    id: z.number().int().positive(),
    EtapaPorProcesos: comprasalPipStageArraySchema,
  })
  .passthrough();

export const comprasalProcessDetailResponseSchema = z
  .object({
    data: comprasalProcessDetailDataSchema.nullable(),
    message: z.string().trim().nullable().optional(),
  })
  .passthrough();

export type ComprasalPipStageRecord = z.infer<
  typeof comprasalPipStageRecordSchema
>;
