import { z } from "zod";

import { interestCategories, opportunityStatuses } from "@/server/db/schema/enums";

export const registerSchema = z
  .object({
    firstName: z.string().trim().min(1).max(120),
    lastName: z.string().trim().min(1).max(120),
    email: z.string().trim().email().max(255),
    password: z.string().min(8).max(128),
    confirmPassword: z.string().min(8).max(128),
  })
  .strict()
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

export const loginSchema = z
  .object({
    email: z.string().trim().email().max(255),
    password: z.string().min(1).max(128),
  })
  .strict();

export const updateProfileSchema = z
  .object({
    firstName: z
      .string()
      .trim()
      .min(1, "El nombre es obligatorio")
      .max(120, "El nombre es demasiado largo"),
    lastName: z
      .string()
      .trim()
      .min(1, "El apellido es obligatorio")
      .max(120, "El apellido es demasiado largo"),
  })
  .strict();

export const onboardingSchema = z
  .object({
    interestCategories: z
      .array(z.enum(interestCategories))
      .min(1, "Selecciona al menos una categoría"),
  })
  .strict();

export const convertToLeadSchema = z
  .object({
    searchResultId: z.string().uuid(),
    executionId: z.string().uuid(),
  })
  .strict();

export const updateOpportunityStatusSchema = z
  .object({
    opportunityId: z.string().uuid(),
    status: z.enum(opportunityStatuses),
    reason: z.string().trim().max(1000).optional(),
  })
  .strict();

export const addNoteSchema = z
  .object({
    opportunityId: z.string().uuid(),
    content: z.string().trim().min(1).max(5000),
  })
  .strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type OnboardingInput = z.infer<typeof onboardingSchema>;

export {
  parseProjectFilters,
  projectFiltersSchema,
  type ProjectFiltersInput,
} from "@/schemas/projects";
