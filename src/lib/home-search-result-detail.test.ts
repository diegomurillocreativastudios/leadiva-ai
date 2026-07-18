import { describe, expect, it } from "vitest";

import { buildHomeSearchResultDetail } from "@/lib/home-search-result-detail";

describe("buildHomeSearchResultDetail", () => {
  it("maps the fields shown on the home lead detail view", () => {
    expect(
      buildHomeSearchResultDetail({
        title: "Convenio Marco de Servicios TI",
        snippet:
          "La Dirección ChileCompra convoca a la nueva licitación del Convenio Marco.",
        sourceUrl: "https://example.com/licitacion",
        deadlineAt: new Date("2026-09-10T12:00:00.000Z"),
        estimatedAmount: "150000.00",
        currency: "USD",
        amountStatus: "PUBLISHED",
      }),
    ).toEqual({
      title: "Convenio Marco de Servicios TI",
      description:
        "La Dirección ChileCompra convoca a la nueva licitación del Convenio Marco.",
      websiteUrl: "https://example.com/licitacion",
      websiteLabel: "example.com/licitacion",
      deadlineLabel: "10/09/2026",
      amountLabel: expect.stringMatching(/150[,.]?000/),
    });
  });

  it("uses fallbacks when optional fields are missing", () => {
    expect(
      buildHomeSearchResultDetail({
        title: "Sin extras",
        snippet: null,
        sourceUrl: "https://portal.example.org/a",
        deadlineAt: null,
        estimatedAmount: null,
        currency: null,
        amountStatus: "UNKNOWN",
      }),
    ).toEqual({
      title: "Sin extras",
      description: "Sin descripción disponible",
      websiteUrl: "https://portal.example.org/a",
      websiteLabel: "portal.example.org/a",
      deadlineLabel: "Sin fecha límite",
      amountLabel: "Monto no disponible",
    });
  });

  it("supports candidates without a website url", () => {
    expect(
      buildHomeSearchResultDetail({
        title: "Sin URL",
        snippet: "Solo título y descripción",
        sourceUrl: null,
        deadlineAt: null,
        estimatedAmount: null,
        currency: null,
        amountStatus: null,
      }),
    ).toMatchObject({
      title: "Sin URL",
      description: "Solo título y descripción",
      websiteUrl: null,
      websiteLabel: "Sin sitio web",
      amountLabel: "Monto no disponible",
    });
  });
});
