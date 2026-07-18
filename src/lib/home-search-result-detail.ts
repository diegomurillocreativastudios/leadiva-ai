import { formatProjectBudgetLabel } from "@/features/projects/project-detail-fields";

export type HomeSearchResultDetailInput = {
  title: string;
  snippet: string | null;
  sourceUrl: string | null;
  deadlineAt: Date | string | null;
  estimatedAmount: string | number | null;
  currency: string | null;
  amountStatus: string | null;
};

export type HomeSearchResultDetailView = {
  title: string;
  description: string;
  websiteUrl: string | null;
  websiteLabel: string;
  deadlineLabel: string;
  amountLabel: string;
};

function formatDeadlineLabel(value: Date | string | null): string {
  if (!value) {
    return "Sin fecha límite";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Sin fecha límite";
  }

  return date.toLocaleDateString("es-SV", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function websiteLabelFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    return `${parsed.hostname}${path}${parsed.search}`;
  } catch {
    return url;
  }
}

/** Builds the labeled fields for the home lead detail screen. */
export function buildHomeSearchResultDetail(
  input: HomeSearchResultDetailInput,
): HomeSearchResultDetailView {
  const description = input.snippet?.trim() || "Sin descripción disponible";
  const websiteUrl = input.sourceUrl?.trim() || null;

  return {
    title: input.title.trim() || "Oportunidad sin título",
    description,
    websiteUrl,
    websiteLabel: websiteUrl
      ? websiteLabelFromUrl(websiteUrl)
      : "Sin sitio web",
    deadlineLabel: formatDeadlineLabel(input.deadlineAt),
    amountLabel: formatProjectBudgetLabel(
      input.estimatedAmount,
      input.currency,
      input.amountStatus,
    ),
  };
}

/** Builds detail fields from a home/search-execution candidate (trace or persisted). */
export function buildHomeSearchResultDetailFromCandidate(candidate: {
  title: string | null;
  summary: string | null;
  organizationName: string | null;
  officialSourceUrl: string | null;
  applicationUrl: string | null;
  deadlineAt: string | null;
}): HomeSearchResultDetailView {
  return buildHomeSearchResultDetail({
    title: candidate.title ?? "Oportunidad sin título",
    snippet:
      candidate.summary ?? candidate.organizationName ?? null,
    sourceUrl:
      candidate.officialSourceUrl ?? candidate.applicationUrl ?? null,
    deadlineAt: candidate.deadlineAt,
    estimatedAmount: null,
    currency: null,
    amountStatus: "UNKNOWN",
  });
}
