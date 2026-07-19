import { describe, expect, it, vi } from "vitest";

import { buildComprasalPublicProcessUrl, mapComprasalAvailableProcessToSearchResult } from "./available-mapper";
import { normalizeComprasalAvailableProcess } from "./available-normalize";
import {
  createComprasalAvailableSnapshotCache,
  loadComprasalAvailableSnapshot,
  type ComprasalAvailableSnapshot,
} from "./available-pagination";
import { parseComprasalAvailableResponse } from "./available-schemas";
import {
  hasSignificantComprasalQuery,
  searchComprasalAvailableProcesses,
} from "./available-search";

function availableRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 121645,
    nombre_proceso: "Licencias de software e IA",
    codigo_proceso: "COMPRASAL-2026-IA-01",
    version: 1,
    institucion: "Ministerio de Tecnología",
    estado_actual: "Recepción de ofertas",
    estado_actual_color: "#123456",
    forma_contratacion: "Licitación competitiva",
    codigo_forma_contratacion: "LC",
    id_estado_proceso: 4,
    estado_proceso: "PUBLICADO",
    EtapaPorProcesos: [
      {
        id: 31,
        nombre: "Recepción de ofertas",
        fecha_hora_inicio: "2026-07-17T14:00:00.000Z",
        fecha_hora_fin: "2026-08-01T23:59:59.000Z",
      },
    ],
    etapas: [
      {
        id: 30,
        nombre: "Publicación de convocatoria en COMPRASAL",
        fecha_hora_inicio: "2026-07-15T12:00:00.000Z",
        fecha_hora_fin: "2026-07-17T13:59:59.000Z",
      },
    ],
    actividades: [
      {
        id: 99,
        id_rubro: 5,
        id_proceso: 121645,
        a: { id: 5, nombre: "Desarrollo web", codigo: "WEB", id_tipo_actividad: 1 },
      },
    ],
    ...overrides,
  };
}

function page(rows: unknown[], currentPage: number, totalRows: number, perPage = 2) {
  return {
    rows,
    currentPage,
    totalRows,
    perPage,
    lastPage: totalRows === 0 ? 0 : Math.ceil(totalRows / perPage),
  };
}

function snapshot(): ComprasalAvailableSnapshot {
  const process = normalizeComprasalAvailableProcess(availableRow());
  if (!process) throw new Error("fixture must normalize");
  return {
    processes: [process],
    metrics: {
      pagesFetched: 1,
      rowsFetched: 1,
      invalidRows: 0,
      duplicateRows: 0,
      totalRows: 1,
      defensiveLimitReached: null,
    },
  };
}

describe("COMPRASAL available contract and normalization", () => {
  it("parses the real array root and pagination headers", () => {
    const headers = new Headers({ total_rows: "381", page: "2", per_page: "10" });
    expect(parseComprasalAvailableResponse([availableRow()], headers)).toMatchObject({
      currentPage: 2,
      perPage: 10,
      totalRows: 381,
      lastPage: 39,
    });
  });

  it("accepts an empty out-of-range page while retaining header pagination", () => {
    const headers = new Headers({ total_rows: "381", page: "999", per_page: "10" });
    expect(parseComprasalAvailableResponse([], headers).rows).toEqual([]);
  });

  it("rejects a non-array root or missing pagination headers", () => {
    expect(() => parseComprasalAvailableResponse({ data: [] }, new Headers())).toThrow(
      /must be an array/,
    );
  });

  it("normalizes only confirmed fields and uses the current stage end as deadline", () => {
    const normalized = normalizeComprasalAvailableProcess(availableRow());
    expect(normalized).toMatchObject({
      id: 121645,
      externalId: "121645",
      title: "Licencias de software e IA",
      institution: "Ministerio de Tecnología",
      deadlineAt: "2026-08-01T23:59:59.000Z",
      publishedAt: "2026-07-15T12:00:00.000Z",
      activityNames: ["Desarrollo web"],
    });
  });

  it("rejects rows without a valid current stage deadline", () => {
    expect(normalizeComprasalAvailableProcess(availableRow({ EtapaPorProcesos: [] }))).toBeNull();
  });
});

describe("COMPRASAL deterministic search", () => {
  const process = normalizeComprasalAvailableProcess(availableRow());
  if (!process) throw new Error("fixture must normalize");

  it.each(["IA", "AI", "TI"])("accepts the whitelisted short query %s as a whole word", (query) => {
    const row = availableRow({
      nombre_proceso: `Plataforma ${query}`,
      institucion: "Institución pública",
    });
    const normalized = normalizeComprasalAvailableProcess(row);
    expect(normalized && searchComprasalAvailableProcesses([normalized], query)).toHaveLength(1);
  });

  it("does not accept a short token outside the whitelist", () => {
    expect(hasSignificantComprasalQuery("xy")).toBe(false);
    expect(searchComprasalAvailableProcesses([process], "xy")).toEqual([]);
  });

  it("does not match a short whitelist token as a substring", () => {
    const normalized = normalizeComprasalAvailableProcess(
      availableRow({ nombre_proceso: "Materiales", codigo_proceso: "MATERIAL-01", actividades: [] }),
    );
    expect(normalized && searchComprasalAvailableProcesses([normalized], "IA")).toEqual([]);
  });

  it("normalizes accents, punctuation, case, partial words and term order", () => {
    expect(searchComprasalAvailableProcesses([process], "SOFT, tecnolo")).toHaveLength(1);
    expect(searchComprasalAvailableProcesses([process], "tecnología software")).toHaveLength(1);
  });

  it("allows one significant word at its field score and rejects irrelevant rows", () => {
    expect(searchComprasalAvailableProcesses([process], "software")).toHaveLength(1);
    expect(searchComprasalAvailableProcesses([process], "agricultura")).toEqual([]);
  });
});

describe("COMPRASAL full snapshot pagination", () => {
  it("walks sequentially through the last page and deduplicates by id/code", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(page([availableRow(), availableRow({ id: 2, codigo_proceso: "P-2" })], 1, 3))
      .mockResolvedValueOnce(page([availableRow({ id: 2, codigo_proceso: "P-2" })], 2, 3));
    const result = await loadComprasalAvailableSnapshot({
      config: { perPage: 2, maxPages: 10, maxRows: 20 },
      fetchPage,
    });
    expect(fetchPage.mock.calls).toEqual([[1, 2], [2, 2]]);
    expect(result.processes).toHaveLength(2);
    expect(result.metrics).toMatchObject({ pagesFetched: 2, rowsFetched: 3, duplicateRows: 1 });
  });

  it("stops on an empty page", async () => {
    const result = await loadComprasalAvailableSnapshot({
      config: { perPage: 2, maxPages: 10, maxRows: 20 },
      fetchPage: vi.fn().mockResolvedValue(page([], 1, 0)),
    });
    expect(result.processes).toEqual([]);
  });

  it("protects against a pagination cycle with no new identities", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(page([availableRow()], 1, 5))
      .mockResolvedValueOnce(page([availableRow()], 2, 5));
    await expect(
      loadComprasalAvailableSnapshot({
        config: { perPage: 2, maxPages: 10, maxRows: 20 },
        fetchPage,
      }),
    ).rejects.toThrow(/no identity progress/);
  });

  it("rejects a partial snapshot that exceeds maxRows", async () => {
    await expect(
      loadComprasalAvailableSnapshot({
        config: { perPage: 2, maxPages: 10, maxRows: 2 },
        fetchPage: vi.fn().mockResolvedValue(page([availableRow()], 1, 3)),
      }),
    ).rejects.toMatchObject({
      metrics: { defensiveLimitReached: "MAX_ROWS" },
    });
  });

  it("rejects a partial snapshot that exceeds maxPages", async () => {
    await expect(
      loadComprasalAvailableSnapshot({
        config: { perPage: 2, maxPages: 1, maxRows: 20 },
        fetchPage: vi.fn().mockResolvedValue(page([availableRow()], 1, 4)),
      }),
    ).rejects.toMatchObject({
      metrics: { defensiveLimitReached: "MAX_PAGES" },
    });
  });
});

describe("COMPRASAL snapshot cache", () => {
  it("shares a promise in flight and never loads the same snapshot twice", async () => {
    let resolve!: (value: ComprasalAvailableSnapshot) => void;
    const load = vi.fn(() => new Promise<ComprasalAvailableSnapshot>((done) => { resolve = done; }));
    const cache = createComprasalAvailableSnapshotCache({ ttlMs: 300_000 });
    const first = cache.get(load);
    const second = cache.get(load);
    resolve(snapshot());
    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(firstResult.cacheHit).toBe(false);
    expect(secondResult.cacheHit).toBe(true);
  });

  it("reloads an expired snapshot", async () => {
    let now = 1_000;
    const load = vi.fn(async () => snapshot());
    const cache = createComprasalAvailableSnapshotCache({ ttlMs: 100, now: () => now });
    await cache.get(load);
    now += 101;
    const result = await cache.get(load);
    expect(load).toHaveBeenCalledTimes(2);
    expect(result.cacheHit).toBe(false);
  });

  it("does not cache errors", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(snapshot());
    const cache = createComprasalAvailableSnapshotCache({ ttlMs: 100 });
    await expect(cache.get(load)).rejects.toThrow("network");
    await expect(cache.get(load)).resolves.toMatchObject({ cacheHit: false });
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe("COMPRASAL available mapping", () => {
  it("uses the smoke-tested official URL and confirmed mapping", () => {
    expect(buildComprasalPublicProcessUrl(121645)).toBe(
      "https://www.comprasal.gob.sv/procesos-publicos/121645",
    );
    const process = normalizeComprasalAvailableProcess(availableRow());
    if (!process) throw new Error("fixture must normalize");
    expect(mapComprasalAvailableProcessToSearchResult(process, 72)).toMatchObject({
      externalId: "121645",
      sourceType: "COMPRASAL",
      organizationName: "Ministerio de Tecnología",
      countryCode: "SV",
      contractingSector: "PUBLIC",
      workMode: "UNKNOWN",
      estimatedAmount: null,
      currency: null,
      amountStatus: "NOT_PUBLISHED",
      verificationStatus: "VERIFIED",
      sourceIsSpecific: true,
      sourceIsGrounded: false,
    });
  });

  it("changes contentHash for relevant activity changes", () => {
    const first = normalizeComprasalAvailableProcess(availableRow());
    const second = normalizeComprasalAvailableProcess(
      availableRow({ actividades: [{ id: 100, id_rubro: 6, id_proceso: 121645, a: { id: 6, nombre: "API", codigo: "API", id_tipo_actividad: 1 } }] }),
    );
    if (!first || !second) throw new Error("fixtures must normalize");
    expect(mapComprasalAvailableProcessToSearchResult(first, 50).contentHash).not.toBe(
      mapComprasalAvailableProcessToSearchResult(second, 50).contentHash,
    );
  });
});
