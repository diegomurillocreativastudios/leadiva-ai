import { z } from "zod";

import {
  deadlinePresets,
  type DeadlinePreset,
} from "@/lib/filters/presets";
import {
  buildFilterQueryString,
  dedupeStrings,
  getParamValues,
  getParamValuesWithLegacy,
  getSingleParam,
  type SearchParamsInput,
} from "@/lib/filters/url-params";
import { leadSortOptions } from "@/lib/lead-pipeline";
import {
  opportunityStatuses,
  projectCategories,
  sourceTypes,
  workModes,
} from "@/server/db/schema/enums";

const emptyToUndefined = z.literal("").transform(() => undefined);

const scoreSchema = z.preprocess(
  (value) =>
    value === "" || value === null || value === undefined ? undefined : value,
  z.coerce.number().int().min(0).max(100).optional(),
);

const optionalDateSchema = z.preprocess(
  (value) =>
    value === "" || value === null || value === undefined ? undefined : value,
  z
    .string()
    .trim()
    .refine((value) => !Number.isNaN(Date.parse(value)), {
      message: "Fecha inválida",
    })
    .optional(),
);

function filterEnumArray<T extends readonly [string, ...string[]]>(
  values: T,
  input: string[] | undefined,
): Array<T[number]> {
  if (!input || input.length === 0) {
    return [];
  }
  const allowed = new Set<string>(values);
  return dedupeStrings(input).filter((item): item is T[number] =>
    allowed.has(item),
  );
}

/** Legacy deadline filter values still accepted. */
type LegacyDeadlineFilter = "ANY" | "UPCOMING" | "OVERDUE" | "NONE";

function mapLegacyDeadline(
  value: string | undefined,
): DeadlinePreset | undefined {
  if (!value) return undefined;
  if ((deadlinePresets as readonly string[]).includes(value)) {
    return value as DeadlinePreset;
  }
  if (value === "UPCOMING") return "ACTIVE";
  if (value === "OVERDUE") return "EXPIRED";
  if (value === "NONE") return "NONE";
  if (value === "ANY") return "ANY";
  return undefined;
}

export const leadFiltersSchema = z
  .object({
    q: z.union([z.string().trim().max(200), emptyToUndefined]).optional(),
    statuses: z.array(z.enum(opportunityStatuses)).default([]),
    sourceTypes: z.array(z.enum(sourceTypes)).default([]),
    assignedToUserIds: z
      .array(z.union([z.string().uuid(), z.literal("UNASSIGNED")]))
      .default([]),
    categories: z.array(z.enum(projectCategories)).default([]),
    countryCodes: z
      .array(
        z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-Z]{2}$/),
      )
      .default([]),
    workModes: z.array(z.enum(workModes)).default([]),
    organization: z
      .union([z.string().trim().max(200), emptyToUndefined])
      .optional(),
    deadlinePreset: z.enum(deadlinePresets).default("ANY"),
    deadlineFrom: optionalDateSchema,
    deadlineTo: optionalDateSchema,
    minScore: scoreSchema,
    maxScore: scoreSchema,
    createdFrom: optionalDateSchema,
    createdTo: optionalDateSchema,
    updatedFrom: optionalDateSchema,
    updatedTo: optionalDateSchema,
    lastActivityFrom: optionalDateSchema,
    lastActivityTo: optionalDateSchema,
    unassignedOnly: z.boolean().default(false),
    noDeadline: z.boolean().default(false),
    sort: z.enum(leadSortOptions).default("updated_desc"),
    cleared: z.boolean().default(false),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  })
  .transform((value) => {
    let minScore = value.minScore;
    let maxScore = value.maxScore;
    if (
      minScore !== undefined &&
      maxScore !== undefined &&
      minScore > maxScore
    ) {
      [minScore, maxScore] = [maxScore, minScore];
    }

    // Legacy single-field mirrors for pagination / gradual UI migration
    const status = value.statuses.length === 1 ? value.statuses[0] : undefined;
    const primarySourceType =
      value.sourceTypes.length === 1 ? value.sourceTypes[0] : undefined;
    const assignedToUserId =
      value.assignedToUserIds.length === 1
        ? value.assignedToUserIds[0]
        : undefined;

    let deadline: LegacyDeadlineFilter = "ANY";
    if (value.noDeadline || value.deadlinePreset === "NONE") {
      deadline = "NONE";
    } else if (value.deadlinePreset === "ACTIVE") {
      deadline = "UPCOMING";
    } else if (value.deadlinePreset === "EXPIRED") {
      deadline = "OVERDUE";
    }

    return {
      q: value.q || undefined,
      statuses: dedupeStrings(value.statuses),
      sourceTypes: dedupeStrings(value.sourceTypes),
      assignedToUserIds: dedupeStrings(value.assignedToUserIds),
      categories: dedupeStrings(value.categories),
      countryCodes: dedupeStrings(value.countryCodes),
      workModes: dedupeStrings(value.workModes),
      organization: value.organization || undefined,
      deadlinePreset: value.deadlinePreset,
      deadlineFrom: value.deadlineFrom,
      deadlineTo: value.deadlineTo,
      minScore,
      maxScore,
      createdFrom: value.createdFrom,
      createdTo: value.createdTo,
      updatedFrom: value.updatedFrom,
      updatedTo: value.updatedTo,
      lastActivityFrom: value.lastActivityFrom,
      lastActivityTo: value.lastActivityTo,
      unassignedOnly: value.unassignedOnly,
      noDeadline: value.noDeadline,
      sort: value.sort,
      cleared: value.cleared,
      page: value.page,
      pageSize: value.pageSize,
      // Legacy mirrors
      status,
      primarySourceType,
      assignedToUserId,
      deadline,
    };
  });

export type LeadFiltersInput = z.infer<typeof leadFiltersSchema>;

export function parseLeadFilters(
  raw: SearchParamsInput | Record<string, unknown>,
): LeadFiltersInput {
  const params = raw as SearchParamsInput;
  const cleared =
    getSingleParam(params, "cleared") === "1" ||
    getSingleParam(params, "cleared") === "true";

  const statuses = filterEnumArray(
    opportunityStatuses,
    getParamValuesWithLegacy(params, "statuses", "status"),
  );
  const sourceTypeValues = filterEnumArray(
    sourceTypes,
    getParamValuesWithLegacy(params, "sourceTypes", "primarySourceType"),
  );

  const assigneeRaw =
    getParamValuesWithLegacy(
      params,
      "assignedToUserIds",
      "assignedToUserId",
    ) ?? [];
  const assignedToUserIds = dedupeStrings(assigneeRaw).filter(
    (id) => id === "UNASSIGNED" || z.string().uuid().safeParse(id).success,
  );

  const categories = filterEnumArray(
    projectCategories,
    getParamValues(params, "categories") ??
      getParamValues(params, "category"),
  );
  const countryCodes = dedupeStrings(
    (getParamValuesWithLegacy(params, "countryCodes", "countryCode") ?? []).map(
      (code) => code.toUpperCase(),
    ),
  ).filter((code) => /^[A-Z]{2}$/.test(code));
  const workModeValues = filterEnumArray(
    workModes,
    getParamValuesWithLegacy(params, "workModes", "workMode"),
  );

  const deadlinePreset =
    mapLegacyDeadline(getSingleParam(params, "deadlinePreset")) ??
    mapLegacyDeadline(getSingleParam(params, "deadline")) ??
    "ANY";

  const unassignedOnly =
    getSingleParam(params, "unassignedOnly") === "1" ||
    assignedToUserIds.includes("UNASSIGNED");
  const noDeadline =
    getSingleParam(params, "noDeadline") === "1" ||
    deadlinePreset === "NONE";

  const parsed = leadFiltersSchema.safeParse({
    q: getSingleParam(params, "q"),
    statuses,
    sourceTypes: sourceTypeValues,
    assignedToUserIds: unassignedOnly
      ? ["UNASSIGNED"]
      : assignedToUserIds.filter((id) => id !== "UNASSIGNED"),
    categories,
    countryCodes,
    workModes: workModeValues,
    organization: getSingleParam(params, "organization"),
    deadlinePreset: noDeadline && deadlinePreset === "ANY" ? "NONE" : deadlinePreset,
    deadlineFrom: getSingleParam(params, "deadlineFrom"),
    deadlineTo: getSingleParam(params, "deadlineTo"),
    minScore: cleared ? undefined : getSingleParam(params, "minScore"),
    maxScore: cleared ? undefined : getSingleParam(params, "maxScore"),
    createdFrom: getSingleParam(params, "createdFrom"),
    createdTo: getSingleParam(params, "createdTo"),
    updatedFrom: getSingleParam(params, "updatedFrom"),
    updatedTo: getSingleParam(params, "updatedTo"),
    lastActivityFrom: getSingleParam(params, "lastActivityFrom"),
    lastActivityTo: getSingleParam(params, "lastActivityTo"),
    unassignedOnly,
    noDeadline,
    sort: getSingleParam(params, "sort"),
    cleared,
    page: getSingleParam(params, "page") ?? "1",
    pageSize: getSingleParam(params, "pageSize"),
  });

  if (parsed.success) {
    return parsed.data;
  }

  const fallback = leadFiltersSchema.safeParse({
    page: getSingleParam(params, "page") ?? "1",
    pageSize: getSingleParam(params, "pageSize"),
  });
  if (fallback.success) {
    return fallback.data;
  }

  return leadFiltersSchema.parse({});
}

export function serializeLeadFilters(
  filters: LeadFiltersInput,
  patch?: Partial<LeadFiltersInput>,
): string {
  const next: LeadFiltersInput = {
    ...filters,
    ...patch,
    page: patch?.page ?? 1,
  };

  return buildFilterQueryString({
    q: next.q,
    statuses: next.statuses,
    sourceTypes: next.sourceTypes,
    assignedToUserIds: next.unassignedOnly
      ? ["UNASSIGNED"]
      : next.assignedToUserIds,
    categories: next.categories,
    countryCodes: next.countryCodes,
    workModes: next.workModes,
    organization: next.organization,
    deadlinePreset:
      next.deadlinePreset !== "ANY" ? next.deadlinePreset : undefined,
    deadlineFrom:
      next.deadlinePreset === "CUSTOM" ? next.deadlineFrom : undefined,
    deadlineTo: next.deadlinePreset === "CUSTOM" ? next.deadlineTo : undefined,
    minScore: next.minScore,
    maxScore: next.maxScore,
    createdFrom: next.createdFrom,
    createdTo: next.createdTo,
    updatedFrom: next.updatedFrom,
    updatedTo: next.updatedTo,
    lastActivityFrom: next.lastActivityFrom,
    lastActivityTo: next.lastActivityTo,
    unassignedOnly: next.unassignedOnly ? true : undefined,
    noDeadline: next.noDeadline ? true : undefined,
    sort: next.sort,
    cleared: next.cleared ? true : undefined,
    page: next.page > 1 ? next.page : undefined,
    pageSize: next.pageSize !== 20 ? next.pageSize : undefined,
  });
}

export function buildClearedLeadFiltersQuery(): string {
  return buildFilterQueryString({
    cleared: true,
    deadlinePreset: "ANY",
    sort: "updated_desc",
  });
}

export function buildDefaultLeadFiltersQuery(): string {
  return buildFilterQueryString({
    sort: "updated_desc",
  });
}

export const assignLeadSchema = z
  .object({
    opportunityId: z.string().uuid(),
    assignedToUserId: z.union([z.string().uuid(), z.literal("")]),
  })
  .strict();

const optionalDateInput = z.union([
  z.literal(""),
  z
    .string()
    .trim()
    .min(1)
    .refine((value) => !Number.isNaN(new Date(value).getTime()), {
      message: "Fecha inválida",
    }),
]);

export const updateLeadDetailsSchema = z
  .object({
    opportunityId: z.string().uuid(),
    nextAction: z.string().trim().max(1000).optional(),
    nextActionAt: optionalDateInput.optional(),
    deadlineAt: optionalDateInput.optional(),
    estimatedAmount: z.union([z.string().trim().max(40), z.literal("")]).optional(),
    currency: z
      .union([
        z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-Z]{3}$/),
        z.literal(""),
      ])
      .optional(),
  })
  .strict();

export const updateNoteSchema = z
  .object({
    noteId: z.string().uuid(),
    opportunityId: z.string().uuid(),
    content: z.string().trim().min(1).max(5000),
  })
  .strict();

export const deleteNoteSchema = z
  .object({
    noteId: z.string().uuid(),
    opportunityId: z.string().uuid(),
  })
  .strict();
