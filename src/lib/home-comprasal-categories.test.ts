import { describe, expect, it } from "vitest";

import {
  HOME_COMPRASAL_CATEGORIES,
  buildComprasalCategoryQuery,
  homeComprasalCategoryIds,
} from "@/lib/home-comprasal-categories";

describe("home-comprasal-categories", () => {
  it("exposes the four Creativa interest categories with home labels", () => {
    expect(homeComprasalCategoryIds).toEqual([
      "SOFTWARE",
      "AI",
      "IT",
      "CONSULTING",
    ]);
    expect(HOME_COMPRASAL_CATEGORIES.map((category) => category.label)).toEqual([
      "Desarrollo de Software",
      "Inteligencia Artificial",
      "Infraestructura TI",
      "Consultoria de Software",
    ]);
  });

  it("builds a COMPRASAL query from selected category search terms", () => {
    expect(buildComprasalCategoryQuery(["SOFTWARE"])).toBe(
      "desarrollo de software",
    );
    expect(buildComprasalCategoryQuery(["AI", "IT"])).toBe(
      "inteligencia artificial infraestructura tecnologica",
    );
  });

  it("returns an empty query when nothing is selected", () => {
    expect(buildComprasalCategoryQuery([])).toBe("");
  });

  it("ignores unknown category ids", () => {
    expect(buildComprasalCategoryQuery(["SOFTWARE", "UNKNOWN"])).toBe(
      "desarrollo de software",
    );
  });
});
