import { describe, expect, it } from "vitest";

import { buildProjectDetailFields } from "./project-detail-fields";

describe("buildProjectDetailFields", () => {
  it("always shows presupuesto even when amount is missing", () => {
    expect(
      buildProjectDetailFields({
        category: null,
        countryCode: null,
        adminArea: null,
        city: null,
        workMode: "UNKNOWN",
        publishedAt: null,
        deadlineAt: null,
        estimatedAmount: null,
        currency: null,
        contractingSector: null,
      }),
    ).toEqual([{ label: "Presupuesto", value: "Monto no disponible" }]);
  });

  it("formats category and work mode labels and groups location", () => {
    expect(
      buildProjectDetailFields({
        category: "SOFTWARE",
        countryCode: "SV",
        adminArea: "San Salvador",
        city: "San Salvador",
        workMode: "REMOTE",
        publishedAt: new Date("2026-03-10T15:00:00.000Z"),
        deadlineAt: new Date("2026-04-01T00:00:00.000Z"),
        estimatedAmount: "145000.00",
        currency: "USD",
        contractingSector: "PUBLIC",
      }),
    ).toEqual([
      { label: "Categoría", value: "Desarrollo de software" },
      { label: "Sector", value: "Público" },
      { label: "Presupuesto", value: "$145,000 USD" },
      { label: "Ubicación", value: "San Salvador, San Salvador, SV" },
      { label: "Modalidad", value: "Remoto" },
      {
        label: "Publicado",
        value: new Date("2026-03-10T15:00:00.000Z").toLocaleDateString("es-SV"),
      },
      {
        label: "Plazo",
        value: new Date("2026-04-01T00:00:00.000Z").toLocaleDateString("es-SV"),
      },
    ]);
  });

  it("shows monto no publicado when amount status is explicit", () => {
    expect(
      buildProjectDetailFields({
        category: "AI",
        countryCode: null,
        adminArea: null,
        city: null,
        workMode: "HYBRID",
        publishedAt: null,
        deadlineAt: null,
        estimatedAmount: null,
        currency: null,
        amountStatus: "NOT_PUBLISHED",
        contractingSector: "PRIVATE",
      }),
    ).toEqual([
      { label: "Categoría", value: "IA" },
      { label: "Sector", value: "Privado" },
      { label: "Presupuesto", value: "Monto no publicado" },
      { label: "Modalidad", value: "Híbrido" },
    ]);
  });
});
