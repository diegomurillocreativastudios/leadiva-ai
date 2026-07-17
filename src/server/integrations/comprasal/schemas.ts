import { z } from "zod";

import {
  comprasalAwardRecordSchema,
  comprasalFlatProcessSchema,
  type ComprasalNormalizedProcess,
} from "./normalize";

/** @deprecated Prefer ComprasalNormalizedProcess via normalizeComprasalRecord. */
export const comprasalProcessSchema = comprasalFlatProcessSchema;

export const comprasalListResponseSchema = z
  .object({
    data: z.array(z.unknown()).optional(),
    meta: z
      .object({
        current_page: z.number().optional(),
        last_page: z.number().optional(),
        per_page: z.number().optional(),
        total: z.number().optional(),
      })
      .passthrough()
      .optional(),
    current_page: z.number().optional(),
    last_page: z.number().optional(),
    per_page: z.number().optional(),
    total: z.number().optional(),
  })
  .passthrough();

export type ComprasalProcess = ComprasalNormalizedProcess;
export type { ComprasalNormalizedProcess };

export { comprasalAwardRecordSchema, comprasalFlatProcessSchema };

export type ComprasalPageMeta = {
  currentPage: number;
  lastPage: number | null;
  perPage: number;
  total: number | null;
  hasMore: boolean;
};
