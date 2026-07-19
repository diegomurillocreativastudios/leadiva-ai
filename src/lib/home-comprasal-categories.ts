import type { InterestCategory } from "@/server/db/schema/enums";

export const homeComprasalCategoryIds = [
  "SOFTWARE",
  "AI",
  "IT",
  "CONSULTING",
] as const satisfies readonly InterestCategory[];

export type HomeComprasalCategoryId = (typeof homeComprasalCategoryIds)[number];

export const HOME_COMPRASAL_CATEGORIES = [
  {
    id: "SOFTWARE",
    label: "Desarrollo de Software",
    queryTerm: "desarrollo de software",
    icon: "code",
  },
  {
    id: "AI",
    label: "Inteligencia Artificial",
    queryTerm: "inteligencia artificial",
    icon: "brain",
  },
  {
    id: "IT",
    label: "Infraestructura TI",
    queryTerm: "infraestructura tecnologica",
    icon: "server",
  },
  {
    id: "CONSULTING",
    label: "Consultoria de Software",
    queryTerm: "consultoria de software",
    icon: "briefcase",
  },
] as const satisfies ReadonlyArray<{
  id: HomeComprasalCategoryId;
  label: string;
  queryTerm: string;
  icon: "code" | "brain" | "server" | "briefcase";
}>;

const categoryById = new Map(
  HOME_COMPRASAL_CATEGORIES.map((category) => [category.id, category]),
);

export function isHomeComprasalCategoryId(
  value: string,
): value is HomeComprasalCategoryId {
  return categoryById.has(value as HomeComprasalCategoryId);
}

/** Joins selected category terms for the COMPRASAL available search. */
export function buildComprasalCategoryQuery(
  selected: readonly string[],
): string {
  const terms = selected.flatMap((id) => {
    const category = categoryById.get(id as HomeComprasalCategoryId);
    return category ? [category.queryTerm] : [];
  });
  return terms.join(" ");
}
