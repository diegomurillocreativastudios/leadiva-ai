import { describe, expect, it } from "vitest";

import { normalizeComprasalRecord } from "@/server/integrations/comprasal/normalize";
import {
  assessComprasalRelevance,
  buildRelevanceOptions,
} from "@/server/integrations/comprasal/relevance";

describe("buildRelevanceOptions", () => {
  it("defaults to all Creativa interest categories", () => {
    const options = buildRelevanceOptions();
    expect(options.allowedCategories).toEqual([
      "SOFTWARE",
      "IT",
      "CONSULTING",
      "AI",
    ]);
    expect(options.keywords.length).toBeGreaterThan(5);
  });

  it("narrows keywords to selected interests", () => {
    const options = buildRelevanceOptions({
      interestCategories: ["AI"],
    });
    expect(options.allowedCategories).toEqual(["AI"]);
    expect(options.keywords.some((keyword) => keyword.includes("artificial"))).toBe(
      true,
    );
  });
});

describe("assessComprasalRelevance", () => {
  const options = buildRelevanceOptions({
    interestCategories: ["SOFTWARE", "IT", "CONSULTING", "AI"],
  });

  it("accepts software purchases", () => {
    const award = normalizeComprasalRecord({
      id: 1,
      monto: 10,
      institucion: { nombre: "MINSAL" },
      proveedor: { nombre: "Acme" },
      proceso_compra: {
        id: 10,
        nombre_proceso: "Adquisición de software municipal",
        codigo_proceso: "A-1",
        fecha_adjudicacion: "2026-07-02",
      },
    });

    expect(award).not.toBeNull();
    const decision = assessComprasalRelevance(award!, options);
    expect(decision.accept).toBe(true);
    if (decision.accept) {
      expect(decision.score).toBeGreaterThan(0);
      expect(decision.category).toBe("SOFTWARE");
    }
  });

  it("rejects construction materials", () => {
    const award = normalizeComprasalRecord({
      id: 2,
      monto: 10,
      institucion: { nombre: "MINSAL" },
      proveedor: { nombre: "Acme" },
      proceso_compra: {
        id: 11,
        nombre_proceso: "Compra de materiales de construcción",
        codigo_proceso: "A-2",
        fecha_adjudicacion: "2026-07-02",
      },
    });

    expect(award).not.toBeNull();
    const decision = assessComprasalRelevance(award!, options);
    expect(decision.accept).toBe(false);
  });
});
