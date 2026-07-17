import { describe, expect, it } from "vitest";

import { mapGroundedCandidate } from "./mapper";

describe("mapGroundedCandidate", () => {
  it("maps TenderPulse-style tender fields onto search_results shape", () => {
    const mapped = mapGroundedCandidate(
      "PRIVATE_WEB",
      {
        title:
          "Desarrollo de Sistema de Expediente Clínico Electrónico para la Red Nacional de Hospitales",
        organizationName: "Ministerio de Salud (MINSAL)",
        sourceUrl: "https://minsal.example/proveedores/licitacion-ece-2026",
        snippet:
          "Desarrollo, implementación, migración de datos y capacitación para expediente clínico electrónico nacional.",
        category: "SOFTWARE",
        countryCode: "SV",
        contractingSector: "PUBLIC",
        estimatedAmount: 145000,
        currency: "USD",
        deadlineAt: "2026-08-15T00:00:00.000Z",
      },
      { preliminaryScore: 82, query: "licitación software El Salvador" },
    );

    expect(mapped).toMatchObject({
      sourceType: "PRIVATE_WEB",
      title: expect.stringContaining("Expediente Clínico"),
      organizationName: "Ministerio de Salud (MINSAL)",
      contractingSector: "PUBLIC",
      estimatedAmount: "145000.00",
      currency: "USD",
      category: "SOFTWARE",
      countryCode: "SV",
    });
    expect(mapped.deadlineAt?.toISOString()).toBe("2026-08-15T00:00:00.000Z");
    expect(mapped.rawData).toMatchObject({
      discoveryOnly: true,
      notVerifiedByGoogleAlone: true,
    });
  });
});
