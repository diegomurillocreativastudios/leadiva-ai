import type { DeadlinePreset } from "@/lib/filters/presets";
import type { ProjectSortOption } from "@/lib/project-catalog";
import type { VerificationStatus } from "@/server/db/schema/enums";

export type ProjectSystemDefaults = {
  scope: "ALL";
  verificationStatuses: readonly VerificationStatus[];
  deadlinePreset: Extract<DeadlinePreset, "ANY">;
  minScore: undefined;
  sort: Extract<ProjectSortOption, "score_desc">;
};

/**
 * Open catalog by default — no restrictive chips on `/projects`.
 * Users can still apply interests, score, vigency, etc. from the filter panel.
 */
export const PROJECT_SYSTEM_DEFAULTS: ProjectSystemDefaults = {
  scope: "ALL",
  verificationStatuses: [],
  deadlinePreset: "ANY",
  minScore: undefined,
  sort: "score_desc",
};

/** Open catalog: no restrictive filters (Limpiar filtros). */
export const PROJECT_CLEARED_FILTERS = {
  cleared: true as const,
  scope: "ALL" as const,
  categories: [] as string[],
  sourceTypes: [] as string[],
  countryCodes: [] as string[],
  workModes: [] as string[],
  verificationStatuses: [] as string[],
  deadlinePreset: "ANY" as const,
  deadlineFrom: undefined as string | undefined,
  deadlineTo: undefined as string | undefined,
  minScore: undefined as number | undefined,
  maxScore: undefined as number | undefined,
  discoveredPreset: "ANY" as const,
  discoveredFrom: undefined as string | undefined,
  discoveredTo: undefined as string | undefined,
  searchExecutionIds: [] as string[],
  q: undefined as string | undefined,
  sort: "score_desc" as const,
  page: 1,
};
