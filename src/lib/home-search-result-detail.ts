import { formatProjectBudgetLabel } from "@/features/projects/project-detail-fields";
import type { ComprasalAwardReportLoadStatus } from "@/server/integrations/comprasal/award-report-service";
import type { ComprasalAwardReport } from "@/server/integrations/comprasal/award-report-normalize";

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
  comprasal?: ComprasalAwardReportView;
};

export type ComprasalAwardReportView = {
  loadStatus: ComprasalAwardReportLoadStatus;
  code: string | null;
  institution: string | null;
  processStatus: string | null;
  contractingMethod: string | null;
  publishedAtLabel: string | null;
  deadlineAtLabel: string | null;
  scoreLabel: string | null;
  summaryFields: Array<{ label: string; value: string }>;
  relevantDates: Array<{ label: string; value: string }>;
  bidders: Array<{ name: string; submittedAtLabel: string | null }>;
  stages: Array<{
    name: string;
    amountLabel: string | null;
    reportedAtLabel: string | null;
  }>;
  payments: Array<{
    name: string;
    amountLabel: string | null;
    reportedAtLabel: string | null;
  }>;
  beneficiaries: Array<{
    name: string;
    country: string | null;
    reportedAtLabel: string | null;
  }>;
  emptyMessage: string | null;
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

function storedText(
  rawData: Record<string, unknown> | null,
  key: string,
): string | null {
  const value = rawData?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function formatComprasalDateTime(
  value: Date | string | null,
): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("es-SV", {
    timeZone: "America/El_Salvador",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatComprasalAmount(
  value: string | null,
  currency: string | null,
): string | null {
  if (!value || !/^-?\d+(?:\.\d+)?$/.test(value)) return null;
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [integer = "0", fraction] = unsigned.split(".");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const amount = `${negative ? "-" : ""}${grouped}${fraction === undefined ? "" : `.${fraction}`}`;
  const code = currency?.trim().toUpperCase();
  return code ? `${amount} ${code}` : amount;
}

function reportEmptyMessage(status: ComprasalAwardReportLoadStatus): string | null {
  if (status === "NOT_AVAILABLE") {
    return "El informe de adjudicación todavía no está disponible.";
  }
  if (status === "EMPTY") {
    return "COMPRASAL no publicó información adicional para este proceso.";
  }
  if (status === "TEMPORARY_ERROR") {
    return "No fue posible cargar temporalmente la información adicional.";
  }
  if (status === "INVALID_RESPONSE" || status === "IDENTITY_ERROR") {
    return "No fue posible cargar la información adicional.";
  }
  return null;
}

function makeReportView(params: {
  status: ComprasalAwardReportLoadStatus;
  report: ComprasalAwardReport | null;
  rawData: Record<string, unknown> | null;
  organizationName: string | null;
  publishedAt: Date | null;
  deadlineAt: Date | null;
  preliminaryScore: number | null;
  currency: string | null;
}): ComprasalAwardReportView {
  const report = params.report;
  const summary = report?.summary;
  const summaryFields: Array<{ label: string; value: string }> = [];
  const certifiedAmount = formatComprasalAmount(
    summary?.certifiedAmount ?? null,
    params.currency,
  );
  const plannedAmount = formatComprasalAmount(
    summary?.plannedAmount ?? null,
    params.currency,
  );
  if (certifiedAmount) {
    summaryFields.push({ label: "Monto certificado", value: certifiedAmount });
  }
  if (plannedAmount) {
    summaryFields.push({ label: "Monto planificado", value: plannedAmount });
  }
  if (summary?.contractualTermDays !== null && summary?.contractualTermDays !== undefined) {
    summaryFields.push({
      label: "Plazo contractual",
      value: `${summary.contractualTermDays} días`,
    });
  }
  if (summary?.budgetCodes.length) {
    summaryFields.push({
      label: "Cifrado presupuestario",
      value: summary.budgetCodes.join(", "),
    });
  }
  if ((report?.contractualModificationCount ?? 0) > 0) {
    summaryFields.push({
      label: "Modificaciones contractuales",
      value: String(report?.contractualModificationCount),
    });
  }

  const relevantDates = [
    ["Publicación", summary?.publishedAt],
    ["Apertura", summary?.openedAt],
    ["Cierre", summary?.closesAt],
    ["Firma", summary?.signedAt],
  ].flatMap(([label, value]) => {
    const formatted = formatComprasalDateTime(value ?? null);
    return formatted ? [{ label: label ?? "Fecha", value: formatted }] : [];
  });

  return {
    loadStatus: params.status,
    code: storedText(params.rawData, "codigo_proceso"),
    institution:
      params.organizationName ?? storedText(params.rawData, "institucion"),
    processStatus:
      summary?.status ?? storedText(params.rawData, "estado_actual"),
    contractingMethod:
      summary?.contractingMethod ??
      storedText(params.rawData, "forma_contratacion"),
    publishedAtLabel: formatComprasalDateTime(
      summary?.publishedAt ?? params.publishedAt,
    ),
    deadlineAtLabel: formatComprasalDateTime(
      summary?.closesAt ?? params.deadlineAt,
    ),
    scoreLabel:
      params.preliminaryScore === null
        ? null
        : `${params.preliminaryScore}/100`,
    summaryFields,
    relevantDates,
    bidders: (report?.bidders ?? []).flatMap((bidder) =>
      bidder.name
        ? [
            {
              name: bidder.name,
              submittedAtLabel: formatComprasalDateTime(bidder.submittedAt),
            },
          ]
        : [],
    ),
    stages: (report?.stages ?? []).flatMap((stage) =>
      stage.name || stage.amount || stage.reportedAt
        ? [
            {
              name: stage.name ?? "Etapa sin nombre",
              amountLabel: formatComprasalAmount(stage.amount, params.currency),
              reportedAtLabel: formatComprasalDateTime(stage.reportedAt),
            },
          ]
        : [],
    ),
    payments: (report?.payments ?? []).flatMap((payment) =>
      payment.name || payment.amount || payment.reportedAt
        ? [
            {
              name: payment.name ?? "Pago sin etapa",
              amountLabel: formatComprasalAmount(payment.amount, params.currency),
              reportedAtLabel: formatComprasalDateTime(payment.reportedAt),
            },
          ]
        : [],
    ),
    beneficiaries: (report?.beneficiaries ?? []).flatMap((beneficiary) =>
      beneficiary.name
        ? [
            {
              name: beneficiary.name,
              country: beneficiary.country,
              reportedAtLabel: formatComprasalDateTime(beneficiary.reportedAt),
            },
          ]
        : [],
    ),
    emptyMessage: reportEmptyMessage(params.status),
  };
}

export function buildComprasalHomeSearchResultDetail(params: {
  title: string;
  snippet: string | null;
  sourceUrl: string | null;
  organizationName: string | null;
  publishedAt: Date | null;
  deadlineAt: Date | null;
  estimatedAmount: string | null;
  currency: string | null;
  amountStatus: string;
  preliminaryScore: number | null;
  rawData: Record<string, unknown> | null;
  report: ComprasalAwardReport | null;
  status: ComprasalAwardReportLoadStatus;
}): HomeSearchResultDetailView {
  const title = params.report?.summary.contractName ?? params.title;
  const deadline = params.report?.summary.closesAt ?? params.deadlineAt;
  const detail = buildHomeSearchResultDetail({
    title,
    snippet: params.snippet,
    sourceUrl: params.sourceUrl,
    deadlineAt: deadline,
    estimatedAmount: params.estimatedAmount,
    currency: params.currency,
    amountStatus: params.amountStatus,
  });

  return {
    ...detail,
    websiteLabel: "Ver proceso en COMPRASAL",
    deadlineLabel: formatComprasalDateTime(deadline) ?? "Sin fecha límite",
    comprasal: makeReportView(params),
  };
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
