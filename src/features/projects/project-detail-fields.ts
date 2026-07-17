const categoryLabels: Record<string, string> = {
  SOFTWARE: "Desarrollo de software",
  IT: "IT",
  CONSULTING: "Consultoría de software",
  AI: "IA",
  OTHER: "Otro",
};

const workModeLabels: Record<string, string> = {
  ONSITE: "Presencial",
  REMOTE: "Remoto",
  HYBRID: "Híbrido",
};

const contractingSectorLabels: Record<string, string> = {
  PUBLIC: "Público",
  PRIVATE: "Privado",
};

export type ProjectDetailFieldInput = {
  category: string | null;
  countryCode: string | null;
  adminArea: string | null;
  city: string | null;
  workMode: string;
  publishedAt: Date | string | null;
  deadlineAt: Date | string | null;
  estimatedAmount?: string | number | null;
  currency?: string | null;
  amountStatus?: string | null;
  contractingSector?: string | null;
};

export type ProjectDetailField = {
  label: string;
  value: string;
};

function formatDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString("es-SV");
}

export function formatCategoryLabel(category: string): string {
  return categoryLabels[category] ?? category;
}

function formatWorkMode(workMode: string): string | null {
  if (workMode === "UNKNOWN") {
    return null;
  }
  return workModeLabels[workMode] ?? workMode;
}

function formatContractingSector(sector: string | null | undefined): string | null {
  if (!sector || sector === "UNKNOWN") {
    return null;
  }
  return contractingSectorLabels[sector] ?? sector;
}

export function formatProjectBudget(
  amount: string | number | null | undefined,
  currency: string | null | undefined,
): string | null {
  if (amount === null || amount === undefined || amount === "") {
    return null;
  }

  const numeric =
    typeof amount === "number" ? amount : Number.parseFloat(amount);
  if (Number.isNaN(numeric)) {
    return null;
  }

  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency?.trim() || "USD",
    maximumFractionDigits: 0,
  }).format(numeric);

  const code = (currency?.trim() || "USD").toUpperCase();
  // Intl already includes $; append ISO code for clarity like TenderPulse.
  if (formatted.includes(code)) {
    return formatted;
  }
  return `${formatted} ${code}`;
}

export function formatProjectBudgetLabel(
  amount: string | number | null | undefined,
  currency: string | null | undefined,
  amountStatus?: string | null,
): string {
  const budget = formatProjectBudget(amount, currency);
  if (budget) {
    return budget;
  }
  if (amountStatus === "NOT_PUBLISHED") {
    return "Monto no publicado";
  }
  return "Monto no disponible";
}

function formatLocation(input: ProjectDetailFieldInput): string | null {
  const parts = [input.city, input.adminArea, input.countryCode].filter(
    (part): part is string => Boolean(part?.trim()),
  );

  if (parts.length === 0) {
    return null;
  }

  return parts.join(", ");
}

export function buildProjectDetailFields(
  input: ProjectDetailFieldInput,
): ProjectDetailField[] {
  const fields: ProjectDetailField[] = [];

  if (input.category?.trim()) {
    fields.push({
      label: "Categoría",
      value: formatCategoryLabel(input.category.trim()),
    });
  }

  const sector = formatContractingSector(input.contractingSector);
  if (sector) {
    fields.push({ label: "Sector", value: sector });
  }

  fields.push({
    label: "Presupuesto",
    value: formatProjectBudgetLabel(
      input.estimatedAmount,
      input.currency,
      input.amountStatus,
    ),
  });

  const location = formatLocation(input);
  if (location) {
    fields.push({ label: "Ubicación", value: location });
  }

  const workMode = formatWorkMode(input.workMode);
  if (workMode) {
    fields.push({ label: "Modalidad", value: workMode });
  }

  if (input.publishedAt) {
    fields.push({
      label: "Publicado",
      value: formatDate(input.publishedAt),
    });
  }

  if (input.deadlineAt) {
    fields.push({
      label: "Plazo",
      value: formatDate(input.deadlineAt),
    });
  }

  return fields;
}
