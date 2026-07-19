import {
  comprasalAwardReportResponseSchema,
  type ComprasalAwardReportResponse,
} from "./award-report-schemas";

export type ComprasalAwardReport = {
  summary: {
    contractName: string | null;
    contractingMethod: string | null;
    contractualTermDays: number | null;
    plannedAmount: string | null;
    certifiedAmount: string | null;
    publishedAt: string | null;
    openedAt: string | null;
    closesAt: string | null;
    signedAt: string | null;
    status: string | null;
    budgetCodes: string[];
  };
  bidders: Array<{
    name: string | null;
    submittedAt: string | null;
  }>;
  stages: Array<{
    name: string | null;
    amount: string | null;
    reportedAt: string | null;
  }>;
  payments: Array<{
    name: string | null;
    amount: string | null;
    reportedAt: string | null;
  }>;
  beneficiaries: Array<{
    name: string | null;
    country: string | null;
    reportedAt: string | null;
  }>;
  contractualModificationCount: number;
  message: string | null;
  hasAdditionalInformation: boolean;
  rawData: unknown;
};

export class ComprasalAwardReportContractError extends Error {
  constructor() {
    super("Invalid COMPRASAL award report payload");
    this.name = "ComprasalAwardReportContractError";
  }
}

function text(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

function amount(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === "number" ? String(value) : value;
}

function fullName(
  person:
    | NonNullable<
        NonNullable<ComprasalAwardReportResponse["data"]>["beneficiarios"]
      >[number]["persona"]
    | null
    | undefined,
): string | null {
  if (!person) return null;
  const parts = [
    person.primer_nombre,
    person.segundo_nombre,
    person.tercer_nombre,
    person.primer_apellido,
    person.segundo_apellido,
    person.apellido_casada,
  ].filter((part): part is string => Boolean(part));
  return parts.join(" ") || null;
}

export function normalizeComprasalAwardReport(
  payload: unknown,
): ComprasalAwardReport | null {
  const parsed = comprasalAwardReportResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ComprasalAwardReportContractError();
  }

  const response = parsed.data;
  const data = response.data;
  if (!data) return null;

  const summary = data.adjudicacion;
  const budgetCodes = (data.cifrados ?? [])
    .map((item) => text(item.cifrado_presupuestario))
    .filter((item): item is string => Boolean(item));
  const bidders = (data.ofertasOferentes ?? []).map((item) => ({
    name: text(item.nombre_comercial),
    submittedAt: text(item.fecha_carga),
  }));
  const stages = (data.etapas ?? []).map((item) => ({
    name: text(item.etapa),
    amount: amount(item.monto_total),
    reportedAt: text(item.fecha_mostrar),
  }));
  const payments = (data.pagos ?? []).map((item) => ({
    name: text(item.etapa),
    amount: amount(item.monto_total),
    reportedAt: text(item.fecha_mostrar),
  }));
  const beneficiaries = (data.beneficiarios ?? []).map((item) => ({
    name: fullName(item.persona),
    country: text(item.pais?.gentilicio),
    reportedAt: text(item.created_at),
  }));

  const normalizedSummary = {
    contractName: text(summary?.nombre_contrato),
    contractingMethod: text(summary?.forma_contratacion),
    contractualTermDays: summary?.plazo_contractual ?? null,
    plannedAmount: amount(summary?.monto_planificado),
    certifiedAmount: amount(summary?.monto_certificado),
    publishedAt: text(summary?.fecha_publicacion),
    openedAt: text(summary?.fecha_apertura),
    closesAt: text(summary?.fecha_cierre),
    signedAt: text(summary?.fecha_firma),
    status: text(summary?.estado_proceso),
    budgetCodes,
  };
  const hasSummary = Object.entries(normalizedSummary).some(
    ([key, value]) => key !== "budgetCodes" && value !== null,
  );

  return {
    summary: normalizedSummary,
    bidders,
    stages,
    payments,
    beneficiaries,
    contractualModificationCount:
      data.modificacionesContractuales?.length ?? 0,
    message: text(response.message),
    hasAdditionalInformation:
      hasSummary ||
      budgetCodes.length > 0 ||
      bidders.length > 0 ||
      stages.length > 0 ||
      payments.length > 0 ||
      beneficiaries.length > 0 ||
      (data.modificacionesContractuales?.length ?? 0) > 0,
    rawData: payload,
  };
}
