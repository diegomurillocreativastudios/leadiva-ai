import { describe, expect, it } from "vitest";

import {
  buildComprasalHomeSearchResultDetail,
  buildHomeSearchResultDetail,
  formatComprasalAmount,
} from "@/lib/home-search-result-detail";
import type { ComprasalAwardReport } from "@/server/integrations/comprasal/award-report-normalize";

function awardReport(): ComprasalAwardReport {
  return {
    summary: {
      contractName: "Contrato remoto",
      contractingMethod: null,
      contractualTermDays: 60,
      plannedAmount: "900719925474099312345.678900",
      certifiedAmount: null,
      publishedAt: "2024-10-07T20:44:54.000Z",
      openedAt: null,
      closesAt: "2024-10-09T23:59:00.000Z",
      signedAt: null,
      status: null,
      budgetCodes: [],
    },
    bidders: [],
    stages: [],
    payments: [],
    beneficiaries: [],
    contractualModificationCount: 0,
    message: "ok",
    hasAdditionalInformation: true,
    rawData: {},
  };
}

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

  it("keeps stored base data visible when the remote detail fails", () => {
    const detail = buildComprasalHomeSearchResultDetail({
      title: "Proceso almacenado",
      snippet: "Descripción almacenada",
      sourceUrl: "https://www.comprasal.gob.sv/procesos-publicos/135317",
      organizationName: "Institución almacenada",
      publishedAt: new Date("2026-07-01T12:00:00.000Z"),
      deadlineAt: new Date("2026-08-01T23:59:59.000Z"),
      estimatedAmount: null,
      currency: null,
      amountStatus: "NOT_PUBLISHED",
      preliminaryScore: 82,
      rawData: {
        codigo_proceso: "C-135317",
        estado_actual: "Recepción de ofertas",
        forma_contratacion: "Comparación de precios",
      },
      report: null,
      status: "TEMPORARY_ERROR",
    });

    expect(detail).toMatchObject({
      title: "Proceso almacenado",
      description: "Descripción almacenada",
      websiteLabel: "Ver proceso en COMPRASAL",
      comprasal: {
        code: "C-135317",
        institution: "Institución almacenada",
        processStatus: "Recepción de ofertas",
        contractingMethod: "Comparación de precios",
        emptyMessage:
          "No fue posible cargar temporalmente la información adicional.",
      },
    });
  });

  it("combines remote values over stored values without losing exact money", () => {
    const detail = buildComprasalHomeSearchResultDetail({
      title: "Proceso almacenado",
      snippet: null,
      sourceUrl: "https://www.comprasal.gob.sv/procesos-publicos/135317",
      organizationName: "Institución",
      publishedAt: null,
      deadlineAt: new Date("2026-08-01T23:59:59.000Z"),
      estimatedAmount: null,
      currency: null,
      amountStatus: "NOT_PUBLISHED",
      preliminaryScore: 82,
      rawData: { codigo_proceso: "C-135317" },
      report: awardReport(),
      status: "AVAILABLE",
    });

    expect(detail.title).toBe("Contrato remoto");
    expect(detail.comprasal?.deadlineAtLabel).toMatch(/05:59/);
    expect(detail.comprasal?.summaryFields).toContainEqual({
      label: "Monto planificado",
      value: "900,719,925,474,099,312,345.678900",
    });
  });

  it("never assumes a currency when formatting COMPRASAL amounts", () => {
    expect(formatComprasalAmount("8000.00", null)).toBe("8,000.00");
    expect(formatComprasalAmount("8000.00", "USD")).toBe("8,000.00 USD");
    expect(formatComprasalAmount(null, "USD")).toBeNull();
  });
});
