import {
  buildProjectDetailFields,
  type ProjectDetailField,
  type ProjectDetailFieldInput,
} from "./project-detail-fields";

const HIGHLIGHT_LABEL_ORDER = [
  "Código",
  "Monto",
  "Presupuesto",
  "Etapa",
  "Adjudicación",
  "Plazo",
] as const;

const HIGHLIGHT_LABELS = new Set<string>(HIGHLIGHT_LABEL_ORDER);

export type ProjectDetailViewInput = ProjectDetailFieldInput & {
  title: string;
  snippet?: string | null;
  externalId?: string | null;
};

export type ProjectDetailViewModel = {
  displayTitle: string;
  highlights: ProjectDetailField[];
  fields: ProjectDetailField[];
  narrative: string | null;
};

export function formatDisplayTitle(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) {
    return trimmed;
  }

  const letters = trimmed.replace(/[^a-zA-ZÁÉÍÓÚÜÑáéíóúüñ]/gu, "");
  if (letters.length === 0) {
    return trimmed;
  }

  const upperCount = [...letters].filter(
    (char) => char === char.toLocaleUpperCase("es") && char !== char.toLocaleLowerCase("es"),
  ).length;

  if (upperCount / letters.length < 0.8) {
    return trimmed;
  }

  const lower = trimmed.toLocaleLowerCase("es");
  return lower.charAt(0).toLocaleUpperCase("es") + lower.slice(1);
}

export function parseKeyedSnippetFields(
  snippet: string | null | undefined,
): ProjectDetailField[] {
  const trimmed = snippet?.trim();
  if (!trimmed || !trimmed.includes("·") || !trimmed.includes(":")) {
    return [];
  }

  const parts = trimmed.split(/\s*·\s*/).filter(Boolean);
  if (parts.length < 2) {
    return [];
  }

  const fields: ProjectDetailField[] = [];
  for (const part of parts) {
    const separator = part.indexOf(":");
    if (separator <= 0) {
      return [];
    }

    const label = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!label || !value) {
      return [];
    }

    fields.push({ label, value });
  }

  return fields;
}

function mergeDetailFields(
  primary: ProjectDetailField[],
  secondary: ProjectDetailField[],
): ProjectDetailField[] {
  const merged: ProjectDetailField[] = [];
  const seen = new Set<string>();

  const hasMonto = primary.some((field) => field.label === "Monto");

  for (const field of [...primary, ...secondary]) {
    const key = field.label.toLocaleLowerCase("es");
    if (seen.has(key)) {
      continue;
    }

    if (hasMonto && field.label === "Presupuesto") {
      continue;
    }

    seen.add(key);
    merged.push(field);
  }

  return merged;
}

function splitHighlights(fields: ProjectDetailField[]): {
  highlights: ProjectDetailField[];
  rest: ProjectDetailField[];
} {
  const byLabel = new Map(fields.map((field) => [field.label, field]));
  const highlights: ProjectDetailField[] = [];

  for (const label of HIGHLIGHT_LABEL_ORDER) {
    const field = byLabel.get(label);
    if (field) {
      highlights.push(field);
      byLabel.delete(label);
    }
  }

  const rest = fields.filter((field) => !HIGHLIGHT_LABELS.has(field.label));
  return { highlights, rest };
}

export function buildProjectDetailViewModel(
  input: ProjectDetailViewInput,
): ProjectDetailViewModel {
  const keyed = parseKeyedSnippetFields(input.snippet);
  const baseFields = buildProjectDetailFields(input);

  const withCodigo =
    keyed.some((field) => field.label === "Código") || !input.externalId?.trim()
      ? keyed
      : [{ label: "Código", value: input.externalId.trim() }, ...keyed];

  if (keyed.length > 0) {
    const merged = mergeDetailFields(withCodigo, baseFields);
    const { highlights, rest } = splitHighlights(merged);
    return {
      displayTitle: formatDisplayTitle(input.title),
      highlights,
      fields: rest,
      narrative: null,
    };
  }

  const { highlights, rest } = splitHighlights(baseFields);
  const narrative = input.snippet?.trim() || null;

  return {
    displayTitle: formatDisplayTitle(input.title),
    highlights,
    fields: rest,
    narrative,
  };
}
