import { describe, expect, it } from "vitest";

import { normalizeComprasalRecord } from "@/server/integrations/comprasal/normalize";
import type { ComprasalNormalizedProcess } from "@/server/integrations/comprasal/normalize";
import { prepareComprasalBatch } from "@/server/integrations/comprasal/prepare";

const now = new Date("2026-07-15T12:00:00.000Z");

function process(
  partial: Partial<ComprasalNormalizedProcess> = {},
): ComprasalNormalizedProcess {
  return {
    recordKind: "PROCESS",
    externalId: "10",
    awardId: null,
    processId: "10",
    codigoProceso: null,
    nombreProceso: "Adquisición de sistema web",
    descripcion: "Desarrollo de software",
    estado: null,
    institucionNombre: "Ministerio de Hacienda",
    proveedorNombre: null,
    monto: null,
    fechaAdjudicacion: null,
    fechaPublicacion: null,
    fechaInicio: null,
    fechaLimiteOfertas: null,
    fechaRecepcionOfertas: null,
    fechaCierre: null,
    numeroLote: null,
    modalidad: null,
    url: null,
    raw: {},
    ...partial,
  };
}

describe("prepareComprasalBatch", () => {
  it("keeps active candidates and maps them", () => {
    const result = prepareComprasalBatch(
      [
        process({ externalId: "1", processId: "1" }),
        process({ externalId: "2", processId: "2" }),
      ],
      now,
    );

    expect(result.accepted).toHaveLength(2);
    expect(result.accepted[0]?.mapped.sourceType).toBe("COMPRASAL");
    expect(result.accepted[0]?.mapped.contentHash).toBeTruthy();
    expect(result.accepted[0]?.mapped.countryCode).toBe("SV");
  });

  it("maps nested software awards with real titles and snippets", () => {
    const award = normalizeComprasalRecord({
      id: 468392,
      monto: 918.75,
      institucion: { nombre: "MUNICIPIO DE LA LIBERTAD COSTA" },
      proveedor: {
        nombre: "MILTON ERICK GONZALEZ GARCIA",
        nombre_comercial: "Proveeduría de Bienes y Servicios",
      },
      proceso_compra: {
        id: 134907,
        nombre_proceso: "COMPRA DE SOFTWARE INSTITUCIONAL 202604",
        codigo_proceso: "8556-2026-P0098",
        fecha_adjudicacion: "2026-07-15",
        sp: { nombre: "Contratación" },
      },
    });

    expect(award).not.toBeNull();
    const result = prepareComprasalBatch([award!], now);

    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]?.mapped.title).toContain("SOFTWARE");
    expect(result.accepted[0]?.mapped.organizationName).toBe(
      "MUNICIPIO DE LA LIBERTAD COSTA",
    );
    expect(result.accepted[0]?.mapped.snippet).toContain("Monto:");
    expect(result.accepted[0]?.mapped.snippet).toContain("Proveedor:");
    expect(result.accepted[0]?.mapped.preliminaryScore).toBeGreaterThan(0);
    expect(result.accepted[0]?.mapped.publishedAt?.toISOString()).toContain(
      "2026-07-15",
    );
  });

  it("discards awards outside Creativa interests", () => {
    const award = normalizeComprasalRecord({
      id: 468393,
      monto: 100,
      institucion: { nombre: "MUNICIPIO DE AHUACHAPÁN CENTRO" },
      proveedor: { nombre: "Proveedor X" },
      proceso_compra: {
        id: 134908,
        nombre_proceso: "COMPRA DE MATERIALES DE CONSTRUCCIÓN",
        codigo_proceso: "8556-2026-P0099",
        fecha_adjudicacion: "2026-07-15",
        sp: { nombre: "Contratación" },
      },
    });

    expect(award).not.toBeNull();
    const result = prepareComprasalBatch([award!], now);
    expect(result.accepted).toHaveLength(0);
    expect(result.discardCounts.IRRELEVANT).toBeGreaterThan(0);
  });

  it("dedupes by official id inside the batch", () => {
    const result = prepareComprasalBatch(
      [
        process({ externalId: "77", processId: "77" }),
        process({
          externalId: "77",
          processId: "77",
          nombreProceso: "Misma compra duplicada",
        }),
      ],
      now,
    );

    expect(result.accepted).toHaveLength(1);
    expect(result.discardCounts.DUPLICATE_IN_BATCH).toBe(1);
  });

  it("collapses multiple awards of the same purchase process", () => {
    const awardA = normalizeComprasalRecord({
      id: 468001,
      monto: 100,
      institucion: { nombre: "MUNICIPIO DE LA LIBERTAD COSTA" },
      proveedor: { nombre: "Proveedor A" },
      proceso_compra: {
        id: 134907,
        nombre_proceso: "COMPRA DE SOFTWARE INSTITUCIONAL",
        codigo_proceso: "8556-2026-P0098",
        fecha_adjudicacion: "2026-07-15",
        sp: { nombre: "Contratación" },
      },
    });
    const awardB = normalizeComprasalRecord({
      id: 468002,
      monto: 200,
      institucion: { nombre: "MUNICIPIO DE LA LIBERTAD COSTA" },
      proveedor: { nombre: "Proveedor B" },
      proceso_compra: {
        id: 134907,
        nombre_proceso: "COMPRA DE SOFTWARE INSTITUCIONAL",
        codigo_proceso: "8556-2026-P0098",
        fecha_adjudicacion: "2026-07-15",
        sp: { nombre: "Contratación" },
      },
    });

    expect(awardA).not.toBeNull();
    expect(awardB).not.toBeNull();

    const result = prepareComprasalBatch([awardA!, awardB!], now);

    expect(result.accepted).toHaveLength(1);
    expect(result.discardCounts.DUPLICATE_IN_BATCH).toBe(1);
    expect(result.accepted[0]?.mapped.externalId).toBe("134907");
  });

  it("discards historical flat processes before mapping", () => {
    const result = prepareComprasalBatch(
      [
        process({
          fechaAdjudicacion: "2024-01-01",
          externalId: "9",
          processId: "9",
        }),
      ],
      now,
    );

    expect(result.accepted).toHaveLength(0);
    expect(result.discardCounts.HISTORICAL).toBe(1);
  });
});
