import { describe, expect, it } from "vitest";

import { normalizeComprasalRecord } from "@/server/integrations/comprasal/normalize";

const awardFixture = {
  id: 467074,
  monto: 36,
  institucion: {
    id: 522,
    nombre: "MUNICIPIO DE AHUACHAPÁN CENTRO",
  },
  proveedor: {
    id: 4816,
    nombre: "Belleza y Cosméticos SA de CV",
    nombre_comercial: "Belleza y Cosmeticos SA de CV",
  },
  proceso_compra: {
    id: 134120,
    codigo_proceso: "8152-2026-P0129",
    nombre_proceso:
      "Adquisición de insumos para el desarrollo de Cursos de Cosmetología y Acrilismo - Municipio de Ahuachapán Centro",
    fecha_adjudicacion: "2026-07-02",
    Institucion: {
      id: 522,
      codigo: "8152",
      nombre: "MUNICIPIO DE AHUACHAPÁN CENTRO",
    },
    sp: {
      id: 5,
      nombre: "Contratación",
    },
  },
};

describe("normalizeComprasalRecord", () => {
  it("flattens nested award/contract records from the public API", () => {
    const normalized = normalizeComprasalRecord(awardFixture);

    expect(normalized).not.toBeNull();
    expect(normalized?.recordKind).toBe("AWARD");
    // Catalog identity is the purchase process, not each contract/award id.
    expect(normalized?.externalId).toBe("134120");
    expect(normalized?.awardId).toBe("467074");
    expect(normalized?.processId).toBe("134120");
    expect(normalized?.nombreProceso).toContain("Adquisición de insumos");
    expect(normalized?.codigoProceso).toBe("8152-2026-P0129");
    expect(normalized?.institucionNombre).toBe(
      "MUNICIPIO DE AHUACHAPÁN CENTRO",
    );
    expect(normalized?.proveedorNombre).toBe("Belleza y Cosméticos SA de CV");
    expect(normalized?.monto).toBe(36);
    expect(normalized?.fechaAdjudicacion).toBe("2026-07-02");
    expect(normalized?.estado).toBe("Contratación");
  });

  it("keeps flat process-shaped records", () => {
    const normalized = normalizeComprasalRecord({
      id_proceso_compra: 11,
      nombre_proceso: "Compra de licencias",
      descripcion: "Software antivirus",
      nombre_institucion: "MINSAL",
    });

    expect(normalized?.recordKind).toBe("PROCESS");
    expect(normalized?.externalId).toBe("11");
    expect(normalized?.nombreProceso).toBe("Compra de licencias");
    expect(normalized?.institucionNombre).toBe("MINSAL");
  });

  it("returns null for unusable rows", () => {
    expect(normalizeComprasalRecord({ foo: "bar" })).toBeNull();
  });
});
