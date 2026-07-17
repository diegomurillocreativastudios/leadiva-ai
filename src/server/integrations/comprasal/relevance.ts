import { inferCategoryFromText } from "@/lib/normalization";
import type { InterestCategory } from "@/server/db/schema/enums";
import { interestCategories } from "@/server/db/schema/enums";

import type { ComprasalNormalizedProcess } from "./normalize";

/** Keywords that map each Creativa interest to COMPRASAL text. */
export const categoryKeywords = {
  SOFTWARE: [
    "software",
    "sistema informatico",
    "sistema informático",
    "aplicacion",
    "aplicación",
    "desarrollo de software",
    "desarrollo web",
    "plataforma digital",
    "plataforma web",
    "licencia de software",
    "erp",
    "crm",
    "sitio web",
    "pagina web",
    "página web",
  ],
  IT: [
    "tecnologia",
    "tecnología",
    "infraestructura tecnologica",
    "infraestructura tecnológica",
    "redes",
    "servidor",
    "cloud",
    "computo",
    "cómputo",
    "equipo de computo",
    "equipos de computo",
    "centro de datos",
    "data center",
    "ciberseguridad",
    "seguridad informatica",
    "seguridad informática",
  ],
  CONSULTING: [
    "consultoria",
    "consultoría",
    "asesoria",
    "asesoría",
    "servicios profesionales",
    "estudio tecnico",
    "estudio técnico",
  ],
  AI: [
    "inteligencia artificial",
    "machine learning",
    "automatizacion",
    "automatización",
    "chatbot",
    "analisis de datos",
    "análisis de datos",
  ],
} as const satisfies Record<InterestCategory, readonly string[]>;

export const defaultExcludedKeywords = [
  "cosmetolog",
  "acrilismo",
  "medicamento",
  "farmaceut",
  "alimentos",
  "viveres",
  "víveres",
  "mobiliario",
  "papeleria",
  "papelería",
  "combustibl",
  "vehicul",
  "vehícul",
  "obra civil",
  "construccion",
  "construcción",
  "mantenimiento de edific",
  "uniformes",
  "aseo",
  "limpieza",
] as const;

export type ComprasalRelevanceOptions = {
  /** Categories the sync should keep (Creativa interests). */
  allowedCategories: readonly InterestCategory[];
  /** Positive keywords (profile + category defaults). */
  keywords: readonly string[];
  /** Hard exclusions beyond noise filters. */
  excludedKeywords: readonly string[];
};

function normalizeInterestCategories(
  values: readonly string[] | null | undefined,
): InterestCategory[] {
  if (!values?.length) {
    return [...interestCategories];
  }

  const allowed = new Set<string>(interestCategories);
  const selected = values.filter((value): value is InterestCategory =>
    allowed.has(value),
  );

  return selected.length > 0 ? selected : [...interestCategories];
}

export function buildRelevanceOptions(params?: {
  interestCategories?: readonly string[] | null;
  profileKeywords?: readonly string[] | null;
  excludedKeywords?: readonly string[] | null;
}): ComprasalRelevanceOptions {
  const allowedCategories = normalizeInterestCategories(
    params?.interestCategories,
  );

  const fromCategories = allowedCategories.flatMap(
    (category) => categoryKeywords[category],
  );
  const fromProfile = (params?.profileKeywords ?? [])
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  const keywords = [...new Set([...fromCategories, ...fromProfile])];
  const excludedKeywords = [
    ...new Set([
      ...defaultExcludedKeywords,
      ...(params?.excludedKeywords ?? [])
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    ]),
  ];

  return {
    allowedCategories,
    keywords,
    excludedKeywords,
  };
}

function relevanceBlob(process: ComprasalNormalizedProcess): string {
  return [
    process.nombreProceso,
    process.descripcion,
    process.modalidad,
    process.estado,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function containsKeyword(blob: string, keyword: string): boolean {
  const needle = keyword.trim().toLowerCase();
  if (!needle) {
    return false;
  }
  return blob.includes(needle);
}

export function scoreComprasalRelevance(
  process: ComprasalNormalizedProcess,
  options: ComprasalRelevanceOptions,
): number {
  const blob = relevanceBlob(process);
  const hits = options.keywords.filter((keyword) =>
    containsKeyword(blob, keyword),
  ).length;

  if (hits === 0) {
    return 0;
  }

  const category = inferCategoryFromText(blob);
  const categoryBonus = options.allowedCategories.includes(
    category as InterestCategory,
  )
    ? 20
    : 0;

  return Math.min(100, hits * 15 + categoryBonus);
}

export type RelevanceDecision =
  | { accept: true; score: number; category: string }
  | { accept: false; detail: string };

/**
 * Keep only processes that look like Creativa commercial targets.
 */
export function assessComprasalRelevance(
  process: ComprasalNormalizedProcess,
  options: ComprasalRelevanceOptions,
): RelevanceDecision {
  const blob = relevanceBlob(process);

  for (const excluded of options.excludedKeywords) {
    if (containsKeyword(blob, excluded)) {
      return {
        accept: false,
        detail: `Fuera de interés Creativa (exclusión: ${excluded})`,
      };
    }
  }

  const category = inferCategoryFromText(blob);
  if (category === "OTHER") {
    return {
      accept: false,
      detail: "Sin relación clara con software, IT, consultoría o AI",
    };
  }

  if (
    !options.allowedCategories.includes(category as InterestCategory)
  ) {
    return {
      accept: false,
      detail: `Categoría ${category} fuera de tus intereses`,
    };
  }

  const score = scoreComprasalRelevance(process, options);
  if (score <= 0) {
    return {
      accept: false,
      detail: "No coincide con palabras clave de búsqueda",
    };
  }

  return { accept: true, score, category };
}
