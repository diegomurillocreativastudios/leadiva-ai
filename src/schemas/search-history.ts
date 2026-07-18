import { z } from "zod";

export const renameSearchExecutionSchema = z
  .object({
    executionId: z.uuid(),
    title: z
      .string()
      .trim()
      .min(1, "El nombre no puede estar vacío")
      .max(160, "El nombre es demasiado largo"),
  })
  .strict();

export const deleteSearchExecutionSchema = z
  .object({
    executionId: z.uuid(),
  })
  .strict();

export type RenameSearchExecutionInput = z.infer<
  typeof renameSearchExecutionSchema
>;
export type DeleteSearchExecutionInput = z.infer<
  typeof deleteSearchExecutionSchema
>;
