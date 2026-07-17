import { describe, expect, it } from "vitest";

import { parseComprasalListResponse } from "@/server/integrations/comprasal/parse-response";

describe("parseComprasalListResponse", () => {
  it("parses paginated payload and skips invalid rows", () => {
    const result = parseComprasalListResponse(
      {
        data: [
          {
            id_proceso_compra: 11,
            nombre_proceso: "Compra de licencias",
            descripcion: "Software antivirus",
          },
          { foo: "bar" },
        ],
        meta: {
          current_page: 1,
          last_page: 3,
          per_page: 50,
          total: 120,
        },
      },
      1,
      50,
    );

    expect(result.items).toHaveLength(1);
    expect(result.invalidRows).toBe(1);
    expect(result.meta.hasMore).toBe(true);
    expect(result.meta.lastPage).toBe(3);
  });

  it("supports bare arrays without meta", () => {
    const result = parseComprasalListResponse(
      [
        {
          id_proceso_compra: 22,
          nombre_proceso: "Consultoría TI",
        },
      ],
      1,
      50,
    );

    expect(result.items).toHaveLength(1);
    expect(result.meta.hasMore).toBe(false);
  });

  it("normalizes nested award contracts from the public API", () => {
    const result = parseComprasalListResponse(
      {
        data: [
          {
            id: 468392,
            monto: 918.75,
            institucion: { nombre: "MUNICIPIO DE LA LIBERTAD COSTA" },
            proveedor: { nombre: "MILTON ERICK GONZALEZ GARCIA" },
            proceso_compra: {
              id: 134907,
              nombre_proceso: "COMPRA DE MATERIALES",
              codigo_proceso: "8556-2026-P0098",
              fecha_adjudicacion: "2026-07-15",
            },
          },
        ],
      },
      1,
      50,
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.recordKind).toBe("AWARD");
    expect(result.items[0]?.nombreProceso).toBe("COMPRA DE MATERIALES");
    expect(result.items[0]?.institucionNombre).toBe(
      "MUNICIPIO DE LA LIBERTAD COSTA",
    );
  });
});
