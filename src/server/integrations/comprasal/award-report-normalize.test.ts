import { describe, expect, it } from "vitest";

import fixture from "./fixtures/award-report-135317.sanitized.json";
import {
  ComprasalAwardReportContractError,
  normalizeComprasalAwardReport,
} from "./award-report-normalize";

describe("COMPRASAL award report contract", () => {
  it("normalizes the sanitized real payload", () => {
    const report = normalizeComprasalAwardReport(fixture);

    expect(report).toMatchObject({
      summary: {
        contractName: "SERVICIO DE TRANSPORTE PARA EVENTOS",
        plannedAmount: "8000.00",
        certifiedAmount: "8000",
        publishedAt: "2024-10-07T20:44:54.000Z",
      },
      stages: [{ name: "Etapa 1", amount: "8000" }],
      payments: [{ name: "Etapa 1", amount: "8000" }],
      contractualModificationCount: 0,
      hasAdditionalInformation: true,
    });
    expect(report?.bidders[0]).toEqual({
      name: "PROVEEDOR A",
      submittedAt: "2024-10-09T21:10:28.848Z",
    });
  });

  it("handles empty arrays and nullable fields without inventing sections", () => {
    const report = normalizeComprasalAwardReport({
      data: {
        adjudicacion: {
          nombre_contrato: null,
          monto_planificado: null,
          fecha_firma: null,
        },
        cifrados: [],
        ofertasOferentes: [],
        modificacionesContractuales: [],
        etapas: [],
        pagos: [],
        beneficiarios: [
          {
            created_at: null,
            persona: {
              primer_nombre: "ANA",
              segundo_nombre: null,
              tercer_nombre: null,
              primer_apellido: "PÉREZ",
              segundo_apellido: null,
              apellido_casada: null,
            },
            pais: null,
          },
        ],
      },
      message: null,
    });

    expect(report?.summary.contractName).toBeNull();
    expect(report?.bidders).toEqual([]);
    expect(report?.beneficiaries[0]).toEqual({
      name: "ANA PÉREZ",
      country: null,
      reportedAt: null,
    });
  });

  it("preserves timezone-bearing timestamps exactly", () => {
    const timestamp = "2024-10-09T16:30:00.123-06:00";
    const report = normalizeComprasalAwardReport({
      data: { adjudicacion: { fecha_cierre: timestamp } },
      message: "ok",
    });
    expect(report?.summary.closesAt).toBe(timestamp);
  });

  it("preserves decimal strings beyond safe integer precision", () => {
    const preciseAmount = "900719925474099312345.678900";
    const report = normalizeComprasalAwardReport({
      data: { adjudicacion: { monto_certificado: preciseAmount } },
      message: "ok",
    });
    expect(report?.summary.certifiedAmount).toBe(preciseAmount);
  });

  it("accepts data: null as a valid unavailable report", () => {
    expect(
      normalizeComprasalAwardReport({ data: null, message: "Sin informe" }),
    ).toBeNull();
  });

  it("rejects ambiguous dates and invalid payloads", () => {
    expect(() =>
      normalizeComprasalAwardReport({
        data: { adjudicacion: { fecha_cierre: "2024-10-09 16:30:00" } },
        message: "ok",
      }),
    ).toThrow(ComprasalAwardReportContractError);
    expect(() => normalizeComprasalAwardReport({ message: "missing data" })).toThrow(
      ComprasalAwardReportContractError,
    );
  });
});
