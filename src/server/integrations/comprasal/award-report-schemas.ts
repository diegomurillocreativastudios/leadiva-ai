import { z } from "zod";

import { isComprasalIsoDateTime } from "./available-schemas";

const nullableText = z.string().trim().nullable().optional();
const nullableDateTime = z
  .string()
  .trim()
  .refine(
    isComprasalIsoDateTime,
    "Expected an ISO 8601 timestamp with Z or an explicit offset",
  )
  .nullable()
  .optional();
const decimalString = z
  .string()
  .trim()
  .regex(/^-?\d+(?:\.\d+)?$/, "Expected an exact decimal string");
export const comprasalAwardAmountSchema = z
  .union([decimalString, z.number().finite()])
  .nullable()
  .optional();

const awardSummarySchema = z
  .object({
    nombre_contrato: nullableText,
    forma_contratacion: nullableText,
    plazo_contractual: z.number().int().nonnegative().nullable().optional(),
    monto_planificado: comprasalAwardAmountSchema,
    monto_certificado: comprasalAwardAmountSchema,
    fecha_publicacion: nullableDateTime,
    fecha_apertura: nullableDateTime,
    fecha_cierre: nullableDateTime,
    estado_proceso: nullableText,
    fecha_firma: nullableDateTime,
  })
  .passthrough();

const budgetCodeSchema = z
  .object({ cifrado_presupuestario: nullableText })
  .passthrough();

const bidderSchema = z
  .object({
    nombre_comercial: nullableText,
    fecha_carga: nullableDateTime,
  })
  .passthrough();

const stageOrPaymentSchema = z
  .object({
    etapa: nullableText,
    monto_total: comprasalAwardAmountSchema,
    fecha_mostrar: nullableDateTime,
  })
  .passthrough();

const personSchema = z
  .object({
    primer_nombre: nullableText,
    segundo_nombre: nullableText,
    tercer_nombre: nullableText,
    primer_apellido: nullableText,
    segundo_apellido: nullableText,
    apellido_casada: nullableText,
  })
  .passthrough();

const countrySchema = z
  .object({ gentilicio: nullableText })
  .passthrough();

const beneficiarySchema = z
  .object({
    created_at: nullableDateTime,
    persona: personSchema.nullable().optional(),
    pais: countrySchema.nullable().optional(),
  })
  .passthrough();

export const comprasalAwardReportDataSchema = z
  .object({
    adjudicacion: awardSummarySchema.nullable().optional(),
    cifrados: z.array(budgetCodeSchema).nullable().optional(),
    ofertasOferentes: z.array(bidderSchema).nullable().optional(),
    modificacionesContractuales: z.array(z.unknown()).nullable().optional(),
    etapas: z.array(stageOrPaymentSchema).nullable().optional(),
    pagos: z.array(stageOrPaymentSchema).nullable().optional(),
    beneficiarios: z.array(beneficiarySchema).nullable().optional(),
  })
  .passthrough();

export const comprasalAwardReportResponseSchema = z
  .object({
    data: comprasalAwardReportDataSchema.nullable(),
    message: z.string().trim().nullable().optional(),
  })
  .passthrough();

export type ComprasalAwardReportResponse = z.infer<
  typeof comprasalAwardReportResponseSchema
>;
