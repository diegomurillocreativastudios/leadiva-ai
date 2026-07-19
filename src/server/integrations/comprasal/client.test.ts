import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchComprasalAvailablePage,
  fetchComprasalPage,
} from "@/server/integrations/comprasal/client";
import { parseComprasalListResponse } from "@/server/integrations/comprasal/parse-response";

vi.mock("@/env/server", () => ({
  getServerEnv: () => ({
    COMPRASAL_BASE_URL: "https://www.comprasal.gob.sv/api/v1",
    COMPRASAL_REQUEST_TIMEOUT_MS: 30_000,
    COMPRASAL_MAX_RETRIES: 2,
  }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

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

describe("COMPRASAL HTTP client", () => {
  it("keeps the historical sync on /procesos/publicos", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchComprasalPage({ page: 1, perPage: 50, maxRetries: 0 });
    const calledUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(new URL(calledUrl).pathname).toBe(
      "/api/v1/publico/obtener/procesos/publicos",
    );
  });

  it("uses the available endpoint and parses pagination response headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { total_rows: "0", page: "1", per_page: "1000" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchComprasalAvailablePage({
      page: 1,
      perPage: 1000,
      maxRetries: 0,
    });
    const calledUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(new URL(calledUrl).pathname).toBe(
      "/api/v1/publico/obtener/procesos/disponibles",
    );
    expect(result).toMatchObject({ currentPage: 1, totalRows: 0, lastPage: 0 });
  });

  it("retries timeout and retryable 5xx responses", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("timed out", "TimeoutError"))
      .mockResolvedValueOnce(new Response("failure", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { total_rows: "0", page: "1", per_page: "10" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchComprasalAvailablePage({ page: 1, perPage: 10, maxRetries: 2 }),
    ).resolves.toMatchObject({ rows: [] });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
