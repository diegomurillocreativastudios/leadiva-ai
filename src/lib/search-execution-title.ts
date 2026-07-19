import { homeSearchSourceLabel, type HomeSearchSourceId } from "@/lib/home-search-source";

const SEARCH_EXECUTION_TITLE_TIMEZONE = "America/El_Salvador";
const FORMATTED_TITLE_PATTERN =
  /^.+ - .+ - \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/;

const knownSourceIds = new Set<string>([
  "COMPRASAL",
  "PRIVATE_WEB",
  "LINKEDIN",
]);

export type BuildSearchExecutionTitleInput = {
  userQuery: string | null | undefined;
  sourceType: string | null | undefined;
  at?: Date | string | null;
  maxLength?: number;
};

function resolveSourceLabel(sourceType: string | null | undefined): string {
  if (sourceType && knownSourceIds.has(sourceType)) {
    return homeSearchSourceLabel(sourceType as HomeSearchSourceId);
  }
  return "Búsqueda";
}

function formatSearchExecutionTimestamp(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: SEARCH_EXECUTION_TITLE_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(value);

  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
}

function truncateSegment(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

function isFormattedSearchExecutionTitle(value: string): boolean {
  return FORMATTED_TITLE_PATTERN.test(value);
}

/**
 * Builds a human-readable search history title:
 * `{source} - {query} - dd/mm/yyyy hh:mm`
 */
export function buildSearchExecutionTitle(
  input: BuildSearchExecutionTitleInput,
): string | null {
  const { userQuery, sourceType, at = null, maxLength = 160 } = input;

  if (!userQuery) {
    return null;
  }

  const normalized = userQuery.trim().replace(/\s+/g, " ");
  if (normalized.length < 3) {
    return null;
  }

  if (isFormattedSearchExecutionTitle(normalized)) {
    return truncateSegment(normalized, maxLength);
  }

  const sourceLabel = resolveSourceLabel(sourceType);
  const when = formatSearchExecutionTimestamp(
    at instanceof Date ? at : at ? new Date(at) : new Date(),
  );
  const prefix = `${sourceLabel} - `;
  const suffix = ` - ${when}`;
  const queryBudget = Math.max(3, maxLength - prefix.length - suffix.length);
  const queryPart = truncateSegment(normalized, queryBudget);

  return `${prefix}${queryPart}${suffix}`;
}
