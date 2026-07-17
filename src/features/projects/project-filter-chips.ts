import {
  deadlinePresetLabels,
  discoveredPresetLabels,
  type DeadlinePreset,
  type DiscoveredPreset,
} from "@/lib/filters/presets";
import { reviewStatusLabels, sourceTypeLabels, workModeLabels } from "@/lib/filters/labels";
import { formatSearchExecutionLabel, type SearchExecutionOption } from "@/lib/filters/execution-label";
import {
  serializeProjectFilters,
  type ProjectFiltersInput,
} from "@/schemas/projects";
import type { VerificationStatus } from "@/server/db/schema/enums";

export type FilterChip = {
  key: string;
  label: string;
  href: string;
};

function href(
  filters: ProjectFiltersInput,
  patch: Partial<ProjectFiltersInput>,
): string {
  return `/projects${serializeProjectFilters(filters, { ...patch, page: 1 })}`;
}

/**
 * Active filter chips — includes system defaults so they are always removable.
 */
export function buildProjectFilterChips(
  filters: ProjectFiltersInput,
  executions: SearchExecutionOption[],
): FilterChip[] {
  const chips: FilterChip[] = [];

  if (filters.q) {
    chips.push({
      key: "q",
      label: `“${filters.q}”`,
      href: href(filters, { q: undefined }),
    });
  }

  if (filters.scope === "INTERESTS") {
    chips.push({
      key: "scope",
      label: "Solo mis intereses",
      href: href(filters, { scope: "ALL", categories: [] }),
    });
  } else if (filters.scope === "CUSTOM" && filters.categories.length > 0) {
    for (const category of filters.categories) {
      chips.push({
        key: `category-${category}`,
        label: category,
        href: href(filters, {
          categories: filters.categories.filter((item) => item !== category),
          scope:
            filters.categories.length <= 1 ? "ALL" : filters.scope,
        }),
      });
    }
  } else if (filters.scope === "ALL" && !filters.cleared) {
    // only show when user explicitly chose ALL while other defaults remain
  }

  if (filters.categories.length > 0 && filters.scope !== "CUSTOM") {
    for (const category of filters.categories) {
      chips.push({
        key: `category-${category}`,
        label: category,
        href: href(filters, {
          categories: filters.categories.filter((item) => item !== category),
        }),
      });
    }
  }

  for (const source of filters.sourceTypes) {
    chips.push({
      key: `source-${source}`,
      label: sourceTypeLabels[source] ?? source,
      href: href(filters, {
        sourceTypes: filters.sourceTypes.filter((item) => item !== source),
      }),
    });
  }

  for (const code of filters.countryCodes) {
    chips.push({
      key: `country-${code}`,
      label: code,
      href: href(filters, {
        countryCodes: filters.countryCodes.filter((item) => item !== code),
      }),
    });
  }

  for (const mode of filters.workModes) {
    chips.push({
      key: `work-${mode}`,
      label: workModeLabels[mode],
      href: href(filters, {
        workModes: filters.workModes.filter((item) => item !== mode),
      }),
    });
  }

  if (filters.verificationStatuses.length === 0 && !filters.cleared) {
    // all statuses — no chip
  } else if (
    filters.verificationStatuses.length === 1 &&
    filters.verificationStatuses[0] === "PENDING"
  ) {
    chips.push({
      key: "verification",
      label: "Pendientes",
      href: href(filters, { verificationStatuses: [] }),
    });
  } else {
    for (const status of filters.verificationStatuses) {
      chips.push({
        key: `verification-${status}`,
        label:
          reviewStatusLabels[status as VerificationStatus] ?? status,
        href: href(filters, {
          verificationStatuses: filters.verificationStatuses.filter(
            (item) => item !== status,
          ),
        }),
      });
    }
  }

  if (filters.deadlinePreset !== "ANY") {
    chips.push({
      key: "deadline",
      label: deadlinePresetLabels[filters.deadlinePreset as DeadlinePreset],
      href: href(filters, {
        deadlinePreset: "ANY",
        deadlineFrom: undefined,
        deadlineTo: undefined,
      }),
    });
  }

  if (filters.scorePreset !== "ANY" && filters.minScore !== undefined) {
    const label =
      filters.maxScore !== undefined
        ? `Score ${filters.minScore}–${filters.maxScore}`
        : `Score ≥ ${filters.minScore}`;
    chips.push({
      key: "score",
      label,
      href: href(filters, {
        minScore: undefined,
        maxScore: undefined,
        scorePreset: "ANY",
      }),
    });
  }

  if (filters.discoveredPreset !== "ANY") {
    chips.push({
      key: "discovered",
      label:
        discoveredPresetLabels[
          filters.discoveredPreset as DiscoveredPreset
        ],
      href: href(filters, {
        discoveredPreset: "ANY",
        discoveredFrom: undefined,
        discoveredTo: undefined,
      }),
    });
  }

  for (const executionId of filters.searchExecutionIds) {
    const execution = executions.find((item) => item.id === executionId);
    chips.push({
      key: `execution-${executionId}`,
      label: execution
        ? formatSearchExecutionLabel(execution)
        : "Ejecución",
      href: href(filters, {
        searchExecutionIds: filters.searchExecutionIds.filter(
          (item) => item !== executionId,
        ),
      }),
    });
  }

  return chips;
}

export function projectFiltersAreRestrictive(
  filters: ProjectFiltersInput,
): boolean {
  return Boolean(
    filters.q ||
      filters.categories.length ||
      filters.sourceTypes.length ||
      filters.countryCodes.length ||
      filters.workModes.length ||
      filters.verificationStatuses.length ||
      filters.deadlinePreset !== "ANY" ||
      filters.minScore !== undefined ||
      filters.maxScore !== undefined ||
      filters.discoveredPreset !== "ANY" ||
      filters.searchExecutionIds.length ||
      filters.scope === "INTERESTS" ||
      filters.scope === "CUSTOM",
  );
}
