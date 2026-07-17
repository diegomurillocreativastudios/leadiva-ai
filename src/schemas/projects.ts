import { z } from "zod";

import {
  deadlinePresetFromVigency,
  deadlinePresets,
  detectScorePreset,
  discoveredPresets,
  scorePresets,
  scoreRangeForPreset,
  vigencyFromDeadlinePreset,
  type DeadlinePreset,
  type ScorePreset,
} from "@/lib/filters/presets";
import { PROJECT_SYSTEM_DEFAULTS } from "@/lib/filters/project-defaults";
import {
  buildFilterQueryString,
  dedupeStrings,
  getParamValuesWithLegacy,
  getSingleParam,
  type SearchParamsInput,
} from "@/lib/filters/url-params";
import { projectSortOptions } from "@/lib/project-catalog";
import {
  projectCategories,
  sourceTypes,
  verificationStatuses,
  workModes,
} from "@/server/db/schema/enums";

export const vigencyFilters = ["ACTIVE", "EXPIRED", "ALL"] as const;
export const projectScopeFilters = ["INTERESTS", "ALL", "CUSTOM"] as const;
export type ProjectScopeFilter = (typeof projectScopeFilters)[number];

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

function parseVerificationStatuses(
  raw: string[] | undefined,
  cleared: boolean,
): Array<(typeof verificationStatuses)[number]> {
  if (cleared) {
    return [];
  }
  if (raw === undefined) {
    return [...PROJECT_SYSTEM_DEFAULTS.verificationStatuses];
  }
  if (raw.length === 0 || raw.includes("ALL")) {
    return [];
  }
  return filterEnumArray(verificationStatuses, raw);
}

function parseDeadlinePreset(
  raw: SearchParamsInput,
  cleared: boolean,
): DeadlinePreset {
  if (cleared) {
    return "ANY";
  }
  const explicit = getSingleParam(raw, "deadlinePreset");
  if (explicit && (deadlinePresets as readonly string[]).includes(explicit)) {
    return explicit as DeadlinePreset;
  }
  const fromVigency = deadlinePresetFromVigency(getSingleParam(raw, "vigency"));
  if (fromVigency) {
    return fromVigency;
  }
  // Key absent → system default; empty string handled by getSingleParam as undefined
  if (
    getSingleParam(raw, "deadlinePreset") === undefined &&
    getSingleParam(raw, "vigency") === undefined
  ) {
    return PROJECT_SYSTEM_DEFAULTS.deadlinePreset;
  }
  return "ANY";
}

export const projectFiltersSchema = z
  .object({
    q: z.union([z.string().trim().max(200), emptyToUndefined]).optional(),
    categories: z.array(z.enum(projectCategories)).default([]),
    sourceTypes: z.array(z.enum(sourceTypes)).default([]),
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
    verificationStatuses: z.array(z.enum(verificationStatuses)).default([]),
    deadlinePreset: z.enum(deadlinePresets).default("ANY"),
    deadlineFrom: optionalDateSchema,
    deadlineTo: optionalDateSchema,
    scope: z.enum(projectScopeFilters).default("ALL"),
    minScore: scoreSchema,
    maxScore: scoreSchema,
    discoveredPreset: z.enum(discoveredPresets).default("ANY"),
    discoveredFrom: optionalDateSchema,
    discoveredTo: optionalDateSchema,
    sort: z.enum(projectSortOptions).default("score_desc"),
    searchExecutionIds: z.array(z.string().uuid()).default([]),
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

    const scope: ProjectScopeFilter =
      value.scope === "CUSTOM" && value.categories.length === 0
        ? "INTERESTS"
        : value.categories.length > 0 && value.scope === "INTERESTS"
          ? "CUSTOM"
          : value.scope;

    const scorePreset = detectScorePreset(minScore, maxScore);

    return {
      q: value.q || undefined,
      categories: dedupeStrings(value.categories),
      sourceTypes: dedupeStrings(value.sourceTypes),
      countryCodes: dedupeStrings(value.countryCodes),
      workModes: dedupeStrings(value.workModes),
      verificationStatuses: dedupeStrings(value.verificationStatuses),
      deadlinePreset: value.deadlinePreset,
      deadlineFrom: value.deadlineFrom,
      deadlineTo: value.deadlineTo,
      vigency: vigencyFromDeadlinePreset(value.deadlinePreset),
      scope,
      minScore,
      maxScore,
      scorePreset,
      discoveredPreset: value.discoveredPreset,
      discoveredFrom: value.discoveredFrom,
      discoveredTo: value.discoveredTo,
      sort: value.sort,
      searchExecutionIds: dedupeStrings(value.searchExecutionIds),
      cleared: value.cleared,
      page: value.page,
      pageSize: value.pageSize,
    };
  });

export type ProjectFiltersInput = z.infer<typeof projectFiltersSchema>;

/** Filters after applying the signed-in user's interest categories. */
export type ProjectFiltersResolved = ProjectFiltersInput & {
  interestCategories?: string[];
};

/**
 * Parse URL / form raw params into typed project filters.
 * Supports legacy singular keys and `cleared=1` (no restrictive defaults).
 */
export function parseProjectFilters(
  raw: SearchParamsInput | Record<string, unknown>,
): ProjectFiltersInput {
  const params = raw as SearchParamsInput;
  const cleared =
    getSingleParam(params, "cleared") === "1" ||
    getSingleParam(params, "cleared") === "true";

  const categories = filterEnumArray(
    projectCategories,
    getParamValuesWithLegacy(params, "categories", "category"),
  );
  const sourceTypeValues = filterEnumArray(
    sourceTypes,
    getParamValuesWithLegacy(params, "sourceTypes", "sourceType"),
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
  const verificationStatusesParsed = parseVerificationStatuses(
    getParamValuesWithLegacy(
      params,
      "verificationStatuses",
      "verificationStatus",
    ),
    cleared,
  );
  const searchExecutionIds = dedupeStrings(
    getParamValuesWithLegacy(
      params,
      "searchExecutionIds",
      "searchExecutionId",
    ) ?? [],
  ).filter((id) => z.string().uuid().safeParse(id).success);

  let scopeRaw = getSingleParam(params, "scope");
  if (
    !scopeRaw ||
    !(projectScopeFilters as readonly string[]).includes(scopeRaw)
  ) {
    scopeRaw = cleared
      ? "ALL"
      : categories.length > 0
        ? "CUSTOM"
        : PROJECT_SYSTEM_DEFAULTS.scope;
  }

  const scorePresetRaw = getSingleParam(params, "scorePreset");
  let scorePreset: ScorePreset | undefined =
    scorePresetRaw && (scorePresets as readonly string[]).includes(scorePresetRaw)
      ? (scorePresetRaw as ScorePreset)
      : undefined;

  let minScoreRaw: unknown = getSingleParam(params, "minScore");
  let maxScoreRaw: unknown = getSingleParam(params, "maxScore");

  if (cleared || scorePreset === "ANY") {
    minScoreRaw = undefined;
    maxScoreRaw = undefined;
    scorePreset = "ANY";
  } else if (scorePreset && scorePreset !== "CUSTOM") {
    const range = scoreRangeForPreset(scorePreset);
    minScoreRaw = range.minScore;
    maxScoreRaw = range.maxScore;
  } else if (
    !paramsHasKey(params, "minScore") &&
    !paramsHasKey(params, "maxScore") &&
    !paramsHasKey(params, "scorePreset")
  ) {
    minScoreRaw = PROJECT_SYSTEM_DEFAULTS.minScore;
    maxScoreRaw = undefined;
    scorePreset =
      PROJECT_SYSTEM_DEFAULTS.minScore === undefined ? "ANY" : "RELEVANT";
  }

  const deadlinePreset = parseDeadlinePreset(params, cleared);

  let discoveredPreset = getSingleParam(params, "discoveredPreset") ?? "ANY";
  if (!(discoveredPresets as readonly string[]).includes(discoveredPreset)) {
    discoveredPreset = "ANY";
  }

  const sortRaw = getSingleParam(params, "sort");
  const sort =
    sortRaw && (projectSortOptions as readonly string[]).includes(sortRaw)
      ? sortRaw
      : PROJECT_SYSTEM_DEFAULTS.sort;

  const parsed = projectFiltersSchema.safeParse({
    q: getSingleParam(params, "q"),
    categories,
    sourceTypes: sourceTypeValues,
    countryCodes,
    workModes: workModeValues,
    verificationStatuses: verificationStatusesParsed,
    deadlinePreset,
    deadlineFrom: getSingleParam(params, "deadlineFrom"),
    deadlineTo: getSingleParam(params, "deadlineTo"),
    scope: scopeRaw,
    minScore: minScoreRaw,
    maxScore: maxScoreRaw,
    discoveredPreset,
    discoveredFrom: getSingleParam(params, "discoveredFrom"),
    discoveredTo: getSingleParam(params, "discoveredTo"),
    sort,
    searchExecutionIds,
    cleared,
    page: getSingleParam(params, "page") ?? "1",
    pageSize: getSingleParam(params, "pageSize"),
  });

  if (parsed.success) {
    return parsed.data;
  }

  const fallback = projectFiltersSchema.safeParse({
    cleared,
    page: getSingleParam(params, "page") ?? "1",
    pageSize: getSingleParam(params, "pageSize"),
    verificationStatuses: cleared
      ? []
      : [...PROJECT_SYSTEM_DEFAULTS.verificationStatuses],
    deadlinePreset: cleared ? "ANY" : PROJECT_SYSTEM_DEFAULTS.deadlinePreset,
    scope: cleared ? "ALL" : PROJECT_SYSTEM_DEFAULTS.scope,
    minScore: cleared ? undefined : PROJECT_SYSTEM_DEFAULTS.minScore,
  });

  if (fallback.success) {
    return fallback.data;
  }

  return projectFiltersSchema.parse({
    verificationStatuses: [...PROJECT_SYSTEM_DEFAULTS.verificationStatuses],
    deadlinePreset: PROJECT_SYSTEM_DEFAULTS.deadlinePreset,
    scope: PROJECT_SYSTEM_DEFAULTS.scope,
    minScore: PROJECT_SYSTEM_DEFAULTS.minScore,
  });
}

function paramsHasKey(params: SearchParamsInput, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(params, key);
}

/** Serialize filters for URL navigation (deterministic key order). */
export function serializeProjectFilters(
  filters: ProjectFiltersInput,
  patch?: Partial<ProjectFiltersInput>,
): string {
  const next: ProjectFiltersInput = {
    ...filters,
    ...patch,
    page: patch?.page ?? 1,
  };

  const verificationStatuses =
    next.verificationStatuses.length === 0
      ? next.cleared
        ? []
        : ["ALL"]
      : next.verificationStatuses;

  const scorePreset = next.scorePreset ?? detectScorePreset(next.minScore, next.maxScore);

  return buildFilterQueryString({
    q: next.q,
    categories: next.categories,
    sourceTypes: next.sourceTypes,
    countryCodes: next.countryCodes,
    workModes: next.workModes,
    verificationStatuses,
    deadlinePreset: next.deadlinePreset,
    deadlineFrom:
      next.deadlinePreset === "CUSTOM" ? next.deadlineFrom : undefined,
    deadlineTo: next.deadlinePreset === "CUSTOM" ? next.deadlineTo : undefined,
    // Keep vigency for older bookmarks / analytics
    vigency: next.vigency,
    scope: next.scope,
    scorePreset,
    minScore: scorePreset === "ANY" ? undefined : next.minScore,
    maxScore: scorePreset === "ANY" ? undefined : next.maxScore,
    discoveredPreset:
      next.discoveredPreset !== "ANY" ? next.discoveredPreset : undefined,
    discoveredFrom:
      next.discoveredPreset === "CUSTOM" ? next.discoveredFrom : undefined,
    discoveredTo:
      next.discoveredPreset === "CUSTOM" ? next.discoveredTo : undefined,
    sort: next.sort,
    searchExecutionIds: next.searchExecutionIds,
    cleared: next.cleared ? true : undefined,
    page: next.page > 1 ? next.page : undefined,
    pageSize: next.pageSize !== 20 ? next.pageSize : undefined,
  });
}

export function buildClearedProjectFiltersQuery(): string {
  return buildFilterQueryString({
    cleared: true,
    scope: "ALL",
    deadlinePreset: "ANY",
    verificationStatuses: ["ALL"],
    sort: PROJECT_SYSTEM_DEFAULTS.sort,
  });
}

export function buildDefaultProjectFiltersQuery(): string {
  return buildFilterQueryString({
    scope: PROJECT_SYSTEM_DEFAULTS.scope,
    verificationStatuses:
      PROJECT_SYSTEM_DEFAULTS.verificationStatuses.length === 0
        ? ["ALL"]
        : [...PROJECT_SYSTEM_DEFAULTS.verificationStatuses],
    deadlinePreset: PROJECT_SYSTEM_DEFAULTS.deadlinePreset,
    sort: PROJECT_SYSTEM_DEFAULTS.sort,
  });
}

export const discardProjectSchema = z
  .object({
    searchResultId: z.string().uuid(),
    reason: z.string().trim().min(3).max(1000),
  })
  .strict();

export const bulkDiscardProjectsSchema = z
  .object({
    searchResultIds: z.array(z.string().uuid()).min(1).max(50),
    reason: z.string().trim().min(3).max(1000),
  })
  .strict();

export const bulkConvertProjectsSchema = z
  .object({
    searchResultIds: z.array(z.string().uuid()).min(1).max(50),
  })
  .strict();
