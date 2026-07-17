import { describe, expect, it } from "vitest";

import {
  batchDedupeKey,
  classifyComprasalProcess,
} from "@/server/integrations/comprasal/filters";
import { normalizeComprasalRecord } from "@/server/integrations/comprasal/normalize";
import type { ComprasalNormalizedProcess } from "@/server/integrations/comprasal/normalize";

const now = new Date("2026-07-15T12:00:00.000Z");

function process(
  partial: Partial<ComprasalNormalizedProcess> & {
    nombreProceso?: string;
  } = {},
): ComprasalNormalizedProcess {
  return {
    recordKind: "PROCESS",
    externalId: "100",
    awardId: null,
    processId: "100",
    codigoProceso: null,
    nombreProceso: "Adquisición de software institucional",
    descripcion: "Desarrollo e implementación de sistema",
    estado: null,
    institucionNombre: null,
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

describe("classifyComprasalProcess", () => {
  it("accepts active software processes", () => {
    const decision = classifyComprasalProcess(process({}), now);
    expect(decision.accept).toBe(true);
    if (decision.accept) {
      expect(decision.score).toBeGreaterThan(0);
    }
  });

  it("accepts nested public-API awards for display", () => {
    const award = normalizeComprasalRecord({
      id: 467074,
      monto: 36,
      institucion: { nombre: "MUNICIPIO DE AHUACHAPÁN CENTRO" },
      proveedor: { nombre: "Belleza y Cosméticos SA de CV" },
      proceso_compra: {
        id: 134120,
        nombre_proceso: "Adquisición de software municipal",
        codigo_proceso: "8152-2026-P0129",
        fecha_adjudicacion: "2026-07-02",
        sp: { nombre: "Contratación" },
      },
    });

    expect(award).not.toBeNull();
    const decision = classifyComprasalProcess(award!, now);
    expect(decision.accept).toBe(true);
    if (decision.accept) {
      expect(decision.score).toBeGreaterThan(0);
    }
  });

  it("rejects processes without id", () => {
    const decision = classifyComprasalProcess(
      process({
        externalId: "",
        processId: null,
        codigoProceso: null,
      }),
      now,
    );
    expect(decision.accept).toBe(false);
    if (!decision.accept) {
      expect(decision.reason).toBe("INVALID");
    }
  });

  it("rejects historical flat processes with award date", () => {
    const adjudicated = classifyComprasalProcess(
      process({ fechaAdjudicacion: "2025-01-01" }),
      now,
    );
    expect(adjudicated.accept).toBe(false);

    const closed = classifyComprasalProcess(
      process({ estado: "Proceso adjudicado" }),
      now,
    );
    expect(closed.accept).toBe(false);
  });

  it("rejects employment and course noise", () => {
    expect(
      classifyComprasalProcess(
        process({ nombreProceso: "Contratación de personal TI" }),
        now,
      ).accept,
    ).toBe(false);

    expect(
      classifyComprasalProcess(
        process({ descripcion: "Curso de capacitación en Excel" }),
        now,
      ).accept,
    ).toBe(false);

    expect(
      classifyComprasalProcess(
        process({
          nombreProceso:
            "Adquisición de insumos para el desarrollo de Cursos de Cosmetología",
        }),
        now,
      ).accept,
    ).toBe(false);
  });

  it("rejects cosmetology-style awards as course noise", () => {
    const award = normalizeComprasalRecord({
      id: 467074,
      monto: 36,
      institucion: { nombre: "MUNICIPIO DE AHUACHAPÁN CENTRO" },
      proveedor: { nombre: "Belleza y Cosméticos SA de CV" },
      proceso_compra: {
        id: 134120,
        nombre_proceso:
          "Adquisición de insumos para el desarrollo de Cursos de Cosmetología y Acrilismo - Municipio de Ahuachapán Centro",
        codigo_proceso: "8152-2026-P0129",
        fecha_adjudicacion: "2026-07-02",
        sp: { nombre: "Contratación" },
      },
    });

    expect(award).not.toBeNull();
    const decision = classifyComprasalProcess(award!, now);
    expect(decision.accept).toBe(false);
    if (!decision.accept) {
      expect(decision.reason).toBe("NOISE");
    }
  });

  it("rejects expired offer deadlines", () => {
    const decision = classifyComprasalProcess(
      process({ fechaLimiteOfertas: "2026-07-01T00:00:00.000Z" }),
      now,
    );
    expect(decision.accept).toBe(false);
    if (!decision.accept) {
      expect(decision.reason).toBe("HISTORICAL");
    }
  });
});

describe("batchDedupeKey", () => {
  it("prefers process id over award/external id", () => {
    expect(
      batchDedupeKey(
        process({ externalId: "55", processId: "55", codigoProceso: "ABC" }),
      ),
    ).toBe("process:55");
  });

  it("collapses awards that share the same process id", () => {
    const awardA = process({
      recordKind: "AWARD",
      externalId: "134120",
      awardId: "467074",
      processId: "134120",
    });
    const awardB = process({
      recordKind: "AWARD",
      externalId: "134120",
      awardId: "467099",
      processId: "134120",
    });

    expect(batchDedupeKey(awardA)).toBe("process:134120");
    expect(batchDedupeKey(awardB)).toBe(batchDedupeKey(awardA));
  });

  it("falls back to org + title + lote", () => {
    expect(
      batchDedupeKey(
        process({
          externalId: "",
          processId: null,
          codigoProceso: null,
          nombreProceso: "Lote Software",
          institucionNombre: "MINSAL",
          numeroLote: "2",
        }),
      ),
    ).toBe("org:minsal|title:lote software|lote:2");
  });
});
