import { describe, expect, it, vi } from "vitest";

import { buildComprasalPublicProcessUrl, mapComprasalAvailableProcessToSearchResult } from "./available-mapper";
import { normalizeComprasalAvailableProcess } from "./available-normalize";
import { normalizeComprasalRecord } from "./normalize";
import {
  createComprasalAvailableSnapshotCache,
  loadComprasalAvailableSnapshot,
  type ComprasalAvailableSnapshot,
} from "./available-pagination";
import { parseComprasalAvailableResponse } from "./available-schemas";
import {
  hasSignificantComprasalQuery,
  parseComprasalSearchQuery,
  scoreComprasalAvailableProcess,
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
      requestsExecuted: 1,
      pagesFetched: 1,
      rowsFetched: 1,
      invalidRows: 0,
      duplicateRows: 0,
      totalRows: 1,
      defensiveLimitReached: null,
      snapshotIssue: null,
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
    expect(() =>
      parseComprasalAvailableResponse([], new Headers()),
    ).toThrow(/page header/);
    expect(() =>
      parseComprasalAvailableResponse(
        [],
        new Headers({ page: "1", per_page: "10" }),
      ),
    ).toThrow(/total_rows header/);
  });

  it("normalizes only confirmed fields and uses the current stage end as deadline", () => {
    const normalized = normalizeComprasalAvailableProcess(availableRow());
    expect(normalized).toMatchObject({
      id: 121645,
      externalId: "available:121645",
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

  it("rejects ambiguous external dates without a timezone", () => {
    const row = availableRow();
    const stages = structuredClone(row.EtapaPorProcesos);
    stages[0]!.fecha_hora_fin = "2026-08-01T23:59:59";
    expect(
      normalizeComprasalAvailableProcess(
        availableRow({ EtapaPorProcesos: stages }),
      ),
    ).toBeNull();
  });

  it("leaves publishedAt null when the expected publication stage is absent", () => {
    const normalized = normalizeComprasalAvailableProcess(
      availableRow({ etapas: [] }),
    );
    expect(normalized?.publishedAt).toBeNull();
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

  it("normalizes accents, punctuation, case, safe prefixes and term order", () => {
    expect(searchComprasalAvailableProcesses([process], "SOFTWA, tecnolo")).toHaveLength(1);
    expect(searchComprasalAvailableProcesses([process], "tecnología software")).toHaveLength(1);
  });

  it("allows one significant word at its field score and rejects irrelevant rows", () => {
    expect(searchComprasalAvailableProcesses([process], "software")).toHaveLength(1);
    expect(searchComprasalAvailableProcesses([process], "agricultura")).toEqual([]);
  });

  it("ignores natural-language intent fillers when parsing a layperson query", () => {
    expect(parseComprasalSearchQuery("Proyectos de software").terms).toEqual([
      "software",
    ]);
    expect(
      parseComprasalSearchQuery("Proyectos de software y consultoria").terms,
    ).toEqual(["software", "consultoria"]);
    expect(parseComprasalSearchQuery("Proyectos de IA").terms).toEqual(["ia"]);
  });

  it.each([
    "Proyectos de software",
    "proyectos de software y consultoria",
    "Proyectos de IA",
    "oportunidad de software",
    "necesito software",
  ])("accepts the natural-language query %s against a software title", (query) => {
    expect(searchComprasalAvailableProcesses([process], query)).toHaveLength(1);
  });

  it("still ranks a fuller phrase match above a single shared signal term", () => {
    const softwareOnly = process;
    const softwareAndConsulting = {
      ...process,
      id: 99,
      externalId: "available:99",
      code: "P-99",
      title: "Consultoria y software empresarial",
    };
    const ranked = searchComprasalAvailableProcesses(
      [softwareOnly, softwareAndConsulting],
      "proyectos de software y consultoria",
    );
    expect(ranked.map((match) => match.process.id)).toEqual([99, process.id]);
  });

  it("keeps intent-only queries searchable when no signal term remains", () => {
    expect(hasSignificantComprasalQuery("proyectos")).toBe(true);
    expect(parseComprasalSearchQuery("proyectos").terms).toEqual(["proyectos"]);
  });

  it("does not match mini inside Ministerio", () => {
    expect(searchComprasalAvailableProcesses([process], "mini")).toEqual([]);
  });

  it.each(["licencia", "software", "API", "IA"])(
    "keeps the useful one-word query %s",
    (query) => {
      const normalized = normalizeComprasalAvailableProcess(
        availableRow({
          nombre_proceso: "Licencias de software API IA",
          actividades: [],
        }),
      );
      expect(
        normalized && searchComprasalAvailableProcesses([normalized], query),
      ).toHaveLength(1);
    },
  );

  it("finds an exact process code", () => {
    expect(
      searchComprasalAvailableProcesses([process], "COMPRASAL-2026-IA-01"),
    ).toHaveLength(1);
  });

  it("rejects a one-word match found only weakly in the institution", () => {
    expect(searchComprasalAvailableProcesses([process], "ministerio")).toEqual(
      [],
    );
  });

  it("always clamps the score between zero and one hundred", () => {
    for (const query of ["software", "COMPRASAL-2026-IA-01", "missing"]) {
      const score = scoreComprasalAvailableProcess(process, query).score;
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  it("uses process id as a deterministic final ordering tie-breaker", () => {
    const second = { ...process, id: 2, externalId: "available:2", code: "P-2" };
    const first = { ...process, id: 1, externalId: "available:1", code: "P-1" };
    expect(
      searchComprasalAvailableProcesses([second, first], "software").map(
        (match) => match.process.id,
      ),
    ).toEqual([1, 2]);
  });
});

describe("COMPRASAL full snapshot pagination", () => {
  it("counts an HTTP retry separately from the logical page", async () => {
    const result = await loadComprasalAvailableSnapshot({
      config: { perPage: 2, maxPages: 10, maxRows: 20 },
      fetchPage: vi.fn(async (_page, _perPage, recordRetry) => {
        recordRetry();
        return page([availableRow()], 1, 1);
      }),
    });
    expect(result.metrics).toMatchObject({
      requestsExecuted: 2,
      pagesFetched: 1,
    });
  });

  it("walks sequentially through the last page and deduplicates by id/code", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(
        page(
          [availableRow(), availableRow({ id: 2, version: 2 })],
          1,
          3,
        ),
      )
      .mockResolvedValueOnce(
        page([availableRow({ id: 3, codigo_proceso: "P-3" })], 2, 3),
      );
    const result = await loadComprasalAvailableSnapshot({
      config: { perPage: 2, maxPages: 10, maxRows: 20 },
      fetchPage,
    });
    expect(fetchPage.mock.calls.map((call) => call.slice(0, 2))).toEqual([
      [1, 2],
      [2, 2],
    ]);
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

  it("rejects an empty body when total_rows is positive", async () => {
    await expect(
      loadComprasalAvailableSnapshot({
        config: { perPage: 2, maxPages: 10, maxRows: 20 },
        fetchPage: vi.fn().mockResolvedValue(page([], 1, 2)),
      }),
    ).rejects.toMatchObject({
      metrics: { snapshotIssue: "TRUNCATED_LAST_PAGE" },
    });
  });

  it("rejects a truncated last page", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(
        page([availableRow(), availableRow({ id: 2, codigo_proceso: "P-2" })], 1, 3),
      )
      .mockResolvedValueOnce(page([], 2, 3));
    await expect(
      loadComprasalAvailableSnapshot({
        config: { perPage: 2, maxPages: 10, maxRows: 20 },
        fetchPage,
      }),
    ).rejects.toMatchObject({
      metrics: { snapshotIssue: "TRUNCATED_LAST_PAGE" },
    });
  });

  it("rejects totals that change between pages", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(
        page([availableRow(), availableRow({ id: 2, codigo_proceso: "P-2" })], 1, 4),
      )
      .mockResolvedValueOnce(
        page([availableRow({ id: 3, codigo_proceso: "P-3" })], 2, 3),
      );
    await expect(
      loadComprasalAvailableSnapshot({
        config: { perPage: 2, maxPages: 10, maxRows: 20 },
        fetchPage,
      }),
    ).rejects.toMatchObject({ metrics: { snapshotIssue: "TOTAL_CHANGED" } });
  });

  it("rejects contradictory pagination headers", async () => {
    await expect(
      loadComprasalAvailableSnapshot({
        config: { perPage: 2, maxPages: 10, maxRows: 20 },
        fetchPage: vi.fn().mockResolvedValue(page([availableRow()], 2, 1)),
      }),
    ).rejects.toMatchObject({
      metrics: { snapshotIssue: "PAGINATION_HEADERS_MISMATCH" },
    });
  });

  it("reports invalid rows as a usable but incomplete snapshot", async () => {
    await expect(
      loadComprasalAvailableSnapshot({
        config: { perPage: 2, maxPages: 10, maxRows: 20 },
        fetchPage: vi
          .fn()
          .mockResolvedValue(page([availableRow(), { id: "invalid" }], 1, 2)),
      }),
    ).rejects.toMatchObject({
      metrics: { invalidRows: 1, snapshotIssue: "INVALID_ROWS" },
      partialSnapshot: { processes: [{ id: 121645 }] },
    });
  });

  it("protects against a pagination cycle with no new identities", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(
        page([availableRow(), availableRow({ id: 2, codigo_proceso: "P-2" })], 1, 6),
      )
      .mockResolvedValueOnce(
        page([availableRow(), availableRow({ id: 2, codigo_proceso: "P-2" })], 2, 6),
      );
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

  it("fails safely when the total snapshot time budget is exhausted", async () => {
    const now = vi.spyOn(Date, "now");
    now
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_002);
    await expect(
      loadComprasalAvailableSnapshot({
        config: {
          perPage: 2,
          maxPages: 10,
          maxRows: 20,
          timeBudgetMs: 1,
        },
        fetchPage: vi.fn().mockResolvedValue(page([availableRow()], 1, 1)),
      }),
    ).rejects.toMatchObject({
      metrics: {
        pagesFetched: 1,
        snapshotIssue: "TIME_BUDGET_EXCEEDED",
      },
    });
    now.mockRestore();
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

  it("does not cache an incomplete snapshot", async () => {
    const incomplete = Object.assign(new Error("partial"), {
      partialSnapshot: snapshot(),
    });
    const load = vi
      .fn()
      .mockRejectedValueOnce(incomplete)
      .mockResolvedValueOnce(snapshot());
    const cache = createComprasalAvailableSnapshotCache({ ttlMs: 100 });
    await expect(cache.get(load)).rejects.toThrow("partial");
    await expect(cache.get(load)).resolves.toMatchObject({ cacheHit: false });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("returns isolated clones instead of a mutable cached snapshot", async () => {
    const cache = createComprasalAvailableSnapshotCache({ ttlMs: 100 });
    const first = await cache.get(async () => snapshot());
    first.snapshot.processes[0]!.title = "mutated by caller";
    const second = await cache.get(async () => snapshot());
    expect(second.snapshot.processes[0]?.title).toBe(
      "Licencias de software e IA",
    );
  });
});

describe("COMPRASAL available mapping", () => {
  it("keeps available and historical process identities in separate namespaces", () => {
    const available = normalizeComprasalAvailableProcess(availableRow());
    const historical = normalizeComprasalRecord({
      id_proceso_compra: 121645,
      nombre_proceso: "Licencias de software e IA",
      nombre_institucion: "Ministerio de Tecnología",
    });
    expect(available?.externalId).toBe("available:121645");
    expect(historical?.externalId).toBe("121645");
    expect(available?.externalId).not.toBe(historical?.externalId);
  });

  it("uses the smoke-tested official URL and confirmed mapping", () => {
    expect(buildComprasalPublicProcessUrl(121645)).toBe(
      "https://www.comprasal.gob.sv/procesos-publicos/121645",
    );
    const process = normalizeComprasalAvailableProcess(availableRow());
    if (!process) throw new Error("fixture must normalize");
    expect(mapComprasalAvailableProcessToSearchResult(process, 72)).toMatchObject({
      externalId: "available:121645",
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

  it("changes contentHash when code or active stage changes", () => {
    const original = normalizeComprasalAvailableProcess(availableRow());
    const changedCode = normalizeComprasalAvailableProcess(
      availableRow({ codigo_proceso: "COMPRASAL-2026-OTHER" }),
    );
    const changedStage = normalizeComprasalAvailableProcess(
      availableRow({
        EtapaPorProcesos: [
          {
            id: 32,
            nombre: "Evaluación",
            fecha_hora_inicio: "2026-08-02T00:00:00.000Z",
            fecha_hora_fin: "2026-08-10T00:00:00.000Z",
          },
        ],
      }),
    );
    if (!original || !changedCode || !changedStage) {
      throw new Error("fixtures must normalize");
    }
    const originalHash = mapComprasalAvailableProcessToSearchResult(
      original,
      50,
    ).contentHash;
    expect(
      mapComprasalAvailableProcessToSearchResult(changedCode, 50).contentHash,
    ).not.toBe(originalHash);
    expect(
      mapComprasalAvailableProcessToSearchResult(changedStage, 50).contentHash,
    ).not.toBe(originalHash);
  });

  it("preserves the exact UTC instant in mapped timestamps", () => {
    const normalized = normalizeComprasalAvailableProcess(
      availableRow({
        EtapaPorProcesos: [
          {
            id: 31,
            nombre: "Recepción de ofertas",
            fecha_hora_inicio: "2026-07-17T08:00:00-06:00",
            fecha_hora_fin: "2026-08-01T17:59:59-06:00",
          },
        ],
      }),
    );
    if (!normalized) throw new Error("fixture must normalize");
    const mapped = mapComprasalAvailableProcessToSearchResult(normalized, 50);
    expect(mapped.deadlineAt.toISOString()).toBe(
      "2026-08-01T23:59:59.000Z",
    );
  });
});
