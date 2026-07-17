import { describe, expect, it } from "vitest";

import {
  buildProjectDetailViewModel,
  formatDisplayTitle,
  parseKeyedSnippetFields,
} from "./project-detail-display";

describe("formatDisplayTitle", () => {
  it("softens all-caps titles for readability", () => {
    expect(
      formatDisplayTitle(
        "COMPRA DE MATERIALES PARA LA ELABORACION DE 60 LOKERS",
      ),
    ).toBe("Compra de materiales para la elaboracion de 60 lokers");
  });

  it("keeps mixed-case titles unchanged", () => {
    expect(
      formatDisplayTitle("Solicitud de propuestas para plataforma web"),
    ).toBe("Solicitud de propuestas para plataforma web");
  });
});

describe("parseKeyedSnippetFields", () => {
  it("parses COMPRASAL delimited key-value snippets", () => {
    expect(
      parseKeyedSnippetFields(
        "Código: 8556-2026-P0080 · Adjudicación: 2026-07-15 · Monto: $2,533.55 · Proveedor: International Consulting Institute, S.A. DE C.V. · Etapa: Contratación",
      ),
    ).toEqual([
      { label: "Código", value: "8556-2026-P0080" },
      { label: "Adjudicación", value: "2026-07-15" },
      { label: "Monto", value: "$2,533.55" },
      {
        label: "Proveedor",
        value: "International Consulting Institute, S.A. DE C.V.",
      },
      { label: "Etapa", value: "Contratación" },
    ]);
  });

  it("returns empty when snippet is narrative prose", () => {
    expect(
      parseKeyedSnippetFields(
        "Solicitud de propuestas para implementar una plataforma de software.",
      ),
    ).toEqual([]);
  });
});

describe("buildProjectDetailViewModel", () => {
  it("promotes keyed snippet facts and avoids empty presupuesto when monto exists", () => {
    const view = buildProjectDetailViewModel({
      title: "COMPRA DE MATERIALES PARA LA ELABORACION DE 60 LOKERS",
      snippet:
        "Código: 8556-2026-P0080 · Adjudicación: 2026-07-15 · Monto: $2,533.55 · Proveedor: International Consulting Institute, S.A. DE C.V. · Etapa: Contratación",
      category: "OTHER",
      countryCode: "SV",
      adminArea: null,
      city: null,
      workMode: "UNKNOWN",
      publishedAt: new Date("2026-07-14T12:00:00.000Z"),
      deadlineAt: null,
      estimatedAmount: null,
      currency: null,
      amountStatus: "NOT_PUBLISHED",
      contractingSector: "PUBLIC",
      externalId: "133671",
    });

    expect(view.displayTitle).toBe(
      "Compra de materiales para la elaboracion de 60 lokers",
    );
    expect(view.narrative).toBeNull();
    expect(view.highlights).toEqual([
      { label: "Código", value: "8556-2026-P0080" },
      { label: "Monto", value: "$2,533.55" },
      { label: "Etapa", value: "Contratación" },
      { label: "Adjudicación", value: "2026-07-15" },
    ]);
    expect(view.fields.map((field) => field.label)).toEqual([
      "Proveedor",
      "Categoría",
      "Sector",
      "Ubicación",
      "Publicado",
    ]);
    expect(view.fields.some((field) => field.label === "Presupuesto")).toBe(
      false,
    );
  });

  it("keeps narrative snippet when not keyed", () => {
    const view = buildProjectDetailViewModel({
      title: "RFP desarrollo de software",
      snippet: "Solicitud de propuestas para plataforma web.",
      category: "SOFTWARE",
      countryCode: "SV",
      adminArea: null,
      city: null,
      workMode: "REMOTE",
      publishedAt: null,
      deadlineAt: null,
      estimatedAmount: "50000",
      currency: "USD",
      amountStatus: "PUBLISHED",
      contractingSector: "PRIVATE",
      externalId: null,
    });

    expect(view.narrative).toBe(
      "Solicitud de propuestas para plataforma web.",
    );
    expect(view.highlights.map((field) => field.label)).toContain(
      "Presupuesto",
    );
  });
});
