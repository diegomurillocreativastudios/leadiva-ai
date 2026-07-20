import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/services/search-execution.service", () => ({
  getUserAssociatedSearchResultDetail: vi.fn(),
}));

import type { UserAssociatedSearchResultDetail } from "@/server/services/search-execution.service";
import { createComprasalProcessDetailCache } from "./process-detail-cache";
import { ComprasalProcessDetailClientError } from "./process-detail-client";
import {
  loadUserComprasalPipDetail,
  type ComprasalProcessDetailServiceDependencies,
} from "./process-detail-service";

const EXECUTION_ID = "00000000-0000-4000-8000-000000000201";
const RESULT_ID = "00000000-0000-4000-8000-000000000101";
const USER_A = "00000000-0000-4000-8000-000000000401";
const USER_B = "00000000-0000-4000-8000-000000000402";
const NOW = new Date("2026-07-19T12:00:00.000Z");

function stage(name: string, id = 10) {
  return {
    id,
    nombre: name,
    fecha_hora_inicio: "2026-07-20T14:00:00.000Z",
    fecha_hora_fin: "2026-07-20T16:00:00.000Z",
  };
}

function canonicalResult(
  overrides: Partial<UserAssociatedSearchResultDetail> = {},
): UserAssociatedSearchResultDetail {
  return {
    id: RESULT_ID,
    searchExecutionId: EXECUTION_ID,
    sourceType: "COMPRASAL",
    externalId: "available:135317",
    title: "Proceso almacenado",
    snippet: null,
    sourceUrl: "https://www.comprasal.gob.sv/procesos-publicos/135317",
    organizationName: "Institución",
    publishedAt: null,
    deadlineAt: new Date("2026-07-20T16:00:00.000Z"),
    estimatedAmount: null,
    currency: null,
    amountStatus: "NOT_PUBLISHED",
    preliminaryScore: 82,
    rawData: {
      id: 135317,
      etapas: [stage("Etapa almacenada", 20)],
      EtapaPorProcesos: [stage("Recepción de ofertas")],
    },
    ...overrides,
  };
}

function remotePayload(stages = [stage("Recepción de ofertas")]) {
  return {
    data: { id: 135317, EtapaPorProcesos: stages },
    message: "Detalle cargado",
  };
}

function dependencies(params: {
  authorize?: ComprasalProcessDetailServiceDependencies["authorize"];
  fetchDetail?: ComprasalProcessDetailServiceDependencies["fetchDetail"];
}) {
  return {
    authorize:
      params.authorize ?? vi.fn().mockResolvedValue(canonicalResult()),
    fetchDetail:
      params.fetchDetail ?? vi.fn().mockResolvedValue(remotePayload()),
    cache: createComprasalProcessDetailCache({ ttlMs: 300_000 }),
    now: () => new Date(NOW),
    logError: vi.fn(),
    logWarn: vi.fn(),
    logInfo: vi.fn(),
  } satisfies ComprasalProcessDetailServiceDependencies;
}

const request = { executionId: EXECUTION_ID, resultId: RESULT_ID, userId: USER_A };

describe("authorized COMPRASAL PIP service", () => {
  it("prefers valid remote stages over the stored snapshot", async () => {
    const deps = dependencies({});
    await expect(loadUserComprasalPipDetail(request, deps)).resolves.toMatchObject({
      status: "AVAILABLE",
      processId: 135317,
      pip: {
        source: "REMOTE_DETAIL",
        stages: [{ name: "Recepción de ofertas" }],
      },
    });
    expect(deps.fetchDetail).toHaveBeenCalledWith(135317);
  });

  it("uses rawData.etapas when a valid remote response is empty", async () => {
    const deps = dependencies({
      fetchDetail: vi.fn().mockResolvedValue(remotePayload([])),
    });
    const detail = await loadUserComprasalPipDetail(request, deps);
    expect(detail).toMatchObject({
      status: "FALLBACK",
      pip: { source: "STORED_SNAPSHOT" },
    });
    if (detail?.kind !== "COMPRASAL") throw new Error("expected COMPRASAL");
    expect(detail.pip?.stages.map((item) => item.name)).toContain(
      "Etapa almacenada",
    );
  });

  it("uses the stored snapshot when the remote request fails", async () => {
    const deps = dependencies({
      fetchDetail: vi
        .fn()
        .mockRejectedValue(
          new ComprasalProcessDetailClientError("UPSTREAM", 503, true),
        ),
    });
    await expect(loadUserComprasalPipDetail(request, deps)).resolves.toMatchObject({
      status: "FALLBACK",
      pip: { source: "STORED_SNAPSHOT" },
    });
  });

  it("returns EMPTY when both remote and stored sources have no stages", async () => {
    const deps = dependencies({
      authorize: vi.fn().mockResolvedValue(
        canonicalResult({ rawData: { id: 135317, etapas: [], EtapaPorProcesos: [] } }),
      ),
      fetchDetail: vi.fn().mockResolvedValue(remotePayload([])),
    });
    await expect(loadUserComprasalPipDetail(request, deps)).resolves.toMatchObject({
      status: "EMPTY",
      pip: null,
    });
  });

  it("does not fetch on externalId/rawData mismatch and uses only validated stored stages", async () => {
    const deps = dependencies({
      authorize: vi.fn().mockResolvedValue(
        canonicalResult({ rawData: { id: 999999, etapas: [stage("Fallback")] } }),
      ),
    });
    await expect(loadUserComprasalPipDetail(request, deps)).resolves.toMatchObject({
      status: "FALLBACK",
      identityMismatch: true,
      pip: { source: "STORED_SNAPSHOT", stages: [{ name: "Fallback" }] },
    });
    expect(deps.fetchDetail).not.toHaveBeenCalled();
    expect(deps.logError).toHaveBeenCalledWith(
      "COMPRASAL_PIP_IDENTITY_MISMATCH",
      expect.objectContaining({ processId: 135317 }),
    );
  });

  it("rejects historical identities without fetching or returning stored PIP", async () => {
    const deps = dependencies({
      authorize: vi
        .fn()
        .mockResolvedValue(canonicalResult({ externalId: "135317" })),
    });
    await expect(loadUserComprasalPipDetail(request, deps)).resolves.toMatchObject({
      status: "IDENTITY_ERROR",
      pip: null,
    });
    expect(deps.fetchDetail).not.toHaveBeenCalled();
  });

  it.each([
    "cross-user execution",
    "result not associated",
    "result dismissed by the user",
  ])("stops before network for %s", async () => {
    const deps = dependencies({ authorize: vi.fn().mockResolvedValue(null) });
    await expect(
      loadUserComprasalPipDetail({ ...request, userId: USER_B }, deps),
    ).resolves.toBeNull();
    expect(deps.fetchDetail).not.toHaveBeenCalled();
  });

  it("does not fetch for a non-COMPRASAL result", async () => {
    const deps = dependencies({
      authorize: vi
        .fn()
        .mockResolvedValue(canonicalResult({ sourceType: "PRIVATE_WEB" })),
    });
    await expect(loadUserComprasalPipDetail(request, deps)).resolves.toMatchObject({
      kind: "NOT_COMPRASAL",
    });
    expect(deps.fetchDetail).not.toHaveBeenCalled();
  });

  it("warns on deadline discrepancy without changing the stored result", async () => {
    const result = canonicalResult({
      deadlineAt: new Date("2026-07-21T16:00:00.000Z"),
    });
    const deps = dependencies({
      authorize: vi.fn().mockResolvedValue(result),
    });
    await expect(loadUserComprasalPipDetail(request, deps)).resolves.toMatchObject({
      status: "AVAILABLE",
      deadlineMismatch: true,
    });
    expect(result.deadlineAt?.toISOString()).toBe("2026-07-21T16:00:00.000Z");
    expect(deps.logWarn).toHaveBeenCalledWith(
      "COMPRASAL_PIP_DEADLINE_MISMATCH",
      expect.objectContaining({
        storedDeadlineAt: "2026-07-21T16:00:00.000Z",
        remoteDeadlineAt: "2026-07-20T16:00:00.000Z",
      }),
    );
  });

  it("authorizes each request before returning a cache hit", async () => {
    const authorize = vi.fn().mockResolvedValue(canonicalResult());
    const deps = dependencies({ authorize });
    await loadUserComprasalPipDetail(request, deps);
    await expect(loadUserComprasalPipDetail(request, deps)).resolves.toMatchObject({
      cacheHit: true,
      cacheAgeMs: expect.any(Number),
    });
    expect(authorize).toHaveBeenCalledTimes(2);
    expect(deps.fetchDetail).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      label: "upstream error",
      first: new ComprasalProcessDetailClientError("UPSTREAM", 503, true),
    },
    {
      label: "404",
      first: new ComprasalProcessDetailClientError("NOT_FOUND", 404),
    },
  ])("does not cache $label", async ({ first }) => {
    const fetchDetail = vi
      .fn()
      .mockRejectedValueOnce(first)
      .mockResolvedValueOnce(remotePayload());
    const deps = dependencies({
      authorize: vi.fn().mockResolvedValue(
        canonicalResult({ rawData: { id: 135317, etapas: [], EtapaPorProcesos: [] } }),
      ),
      fetchDetail,
    });
    await loadUserComprasalPipDetail(request, deps);
    await expect(loadUserComprasalPipDetail(request, deps)).resolves.toMatchObject({
      status: "AVAILABLE",
      cacheHit: false,
    });
    expect(fetchDetail).toHaveBeenCalledTimes(2);
  });

  it("does not cache an invalid payload", async () => {
    const fetchDetail = vi
      .fn()
      .mockResolvedValueOnce({ data: { id: 135317, EtapaPorProcesos: "bad" } })
      .mockResolvedValueOnce(remotePayload());
    const deps = dependencies({
      authorize: vi.fn().mockResolvedValue(
        canonicalResult({ rawData: { id: 135317, etapas: [], EtapaPorProcesos: [] } }),
      ),
      fetchDetail,
    });
    await expect(loadUserComprasalPipDetail(request, deps)).resolves.toMatchObject({
      status: "INVALID_RESPONSE",
    });
    await expect(loadUserComprasalPipDetail(request, deps)).resolves.toMatchObject({
      status: "AVAILABLE",
      cacheHit: false,
    });
    expect(fetchDetail).toHaveBeenCalledTimes(2);
  });
});
