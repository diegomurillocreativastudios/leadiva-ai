import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/services/search-execution.service", () => ({
  getUserAssociatedSearchResultDetail: vi.fn(),
}));

import { createComprasalAwardReportCache } from "./award-report-cache";
import {
  loadUserComprasalAwardReportDetail,
  type ComprasalAwardReportServiceDependencies,
} from "./award-report-service";
import { ComprasalAwardReportClientError } from "./client";
import type { UserAssociatedSearchResultDetail } from "@/server/services/search-execution.service";

const EXECUTION_ID = "00000000-0000-4000-8000-000000000201";
const RESULT_ID = "00000000-0000-4000-8000-000000000101";
const USER_A = "00000000-0000-4000-8000-000000000401";
const USER_B = "00000000-0000-4000-8000-000000000402";

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
    deadlineAt: new Date("2026-08-01T23:59:59.000Z"),
    estimatedAmount: null,
    currency: null,
    amountStatus: "NOT_PUBLISHED",
    preliminaryScore: 82,
    rawData: { id: 135317, codigo_proceso: "C-1" },
    ...overrides,
  };
}

function validPayload() {
  return {
    data: {
      adjudicacion: {
        nombre_contrato: "Informe remoto",
        fecha_cierre: "2026-08-01T23:59:59.000Z",
      },
      ofertasOferentes: [],
      etapas: [],
      pagos: [],
      beneficiarios: [],
      cifrados: [],
      modificacionesContractuales: [],
    },
    message: "ok",
  };
}

function dependencies(params: {
  authorize: ComprasalAwardReportServiceDependencies["authorize"];
  fetchReport?: ComprasalAwardReportServiceDependencies["fetchReport"];
}) {
  return {
    authorize: params.authorize,
    fetchReport: params.fetchReport ?? vi.fn().mockResolvedValue(validPayload()),
    cache: createComprasalAwardReportCache({ ttlMs: 300_000 }),
    logError: vi.fn(),
    logInfo: vi.fn(),
  } satisfies ComprasalAwardReportServiceDependencies;
}

describe("authorized COMPRASAL award report service", () => {
  it("does not call COMPRASAL when execution ownership fails", async () => {
    const deps = dependencies({ authorize: vi.fn().mockResolvedValue(null) });
    await expect(
      loadUserComprasalAwardReportDetail(
        { executionId: EXECUTION_ID, resultId: RESULT_ID, userId: USER_B },
        deps,
      ),
    ).resolves.toBeNull();
    expect(deps.fetchReport).not.toHaveBeenCalled();
  });

  it("does not call COMPRASAL for a result not associated with the execution", async () => {
    const deps = dependencies({ authorize: vi.fn().mockResolvedValue(null) });
    await loadUserComprasalAwardReportDetail(
      { executionId: EXECUTION_ID, resultId: RESULT_ID, userId: USER_A },
      deps,
    );
    expect(deps.fetchReport).not.toHaveBeenCalled();
  });

  it("does not enrich a non-COMPRASAL result", async () => {
    const deps = dependencies({
      authorize: vi
        .fn()
        .mockResolvedValue(canonicalResult({ sourceType: "PRIVATE_WEB" })),
    });
    await expect(
      loadUserComprasalAwardReportDetail(
        { executionId: EXECUTION_ID, resultId: RESULT_ID, userId: USER_A },
        deps,
      ),
    ).resolves.toMatchObject({ kind: "NOT_COMPRASAL" });
    expect(deps.fetchReport).not.toHaveBeenCalled();
  });

  it("fails safely and logs an externalId/rawData mismatch", async () => {
    const deps = dependencies({
      authorize: vi.fn().mockResolvedValue(
        canonicalResult({ rawData: { id: 999999 } }),
      ),
    });
    await expect(
      loadUserComprasalAwardReportDetail(
        { executionId: EXECUTION_ID, resultId: RESULT_ID, userId: USER_A },
        deps,
      ),
    ).resolves.toMatchObject({
      kind: "COMPRASAL",
      status: "IDENTITY_ERROR",
      report: null,
    });
    expect(deps.fetchReport).not.toHaveBeenCalled();
    expect(deps.logError).toHaveBeenCalledWith(
      "COMPRASAL_AWARD_REPORT_IDENTITY_ERROR",
      expect.objectContaining({ resultId: RESULT_ID }),
    );
  });

  it("returns a normalized report and cache metrics", async () => {
    const authorize = vi.fn().mockResolvedValue(canonicalResult());
    const deps = dependencies({ authorize });
    const params = {
      executionId: EXECUTION_ID,
      resultId: RESULT_ID,
      userId: USER_A,
    };

    await expect(loadUserComprasalAwardReportDetail(params, deps)).resolves.toMatchObject({
      kind: "COMPRASAL",
      status: "AVAILABLE",
      cacheHit: false,
      report: { summary: { contractName: "Informe remoto" } },
    });
    await expect(loadUserComprasalAwardReportDetail(params, deps)).resolves.toMatchObject({
      cacheHit: true,
      cacheAgeMs: expect.any(Number),
    });
    expect(deps.fetchReport).toHaveBeenCalledTimes(1);
    expect(authorize).toHaveBeenCalledTimes(2);
    expect(deps.logInfo).toHaveBeenLastCalledWith(
      "COMPRASAL_AWARD_REPORT_LOADED",
      expect.objectContaining({ cacheHit: true, cacheAgeMs: expect.any(Number) }),
    );
  });

  it("does not deliver a cached public report before authorizing another user", async () => {
    const authorize = vi.fn(async ({ userId }: { userId: string }) =>
      userId === USER_A ? canonicalResult() : null,
    );
    const deps = dependencies({ authorize });
    await loadUserComprasalAwardReportDetail(
      { executionId: EXECUTION_ID, resultId: RESULT_ID, userId: USER_A },
      deps,
    );
    await expect(
      loadUserComprasalAwardReportDetail(
        { executionId: EXECUTION_ID, resultId: RESULT_ID, userId: USER_B },
        deps,
      ),
    ).resolves.toBeNull();
    expect(deps.fetchReport).toHaveBeenCalledTimes(1);
  });

  it("maps 404 to not available and invalid payloads to a generic failure", async () => {
    const unavailable = dependencies({
      authorize: vi.fn().mockResolvedValue(canonicalResult()),
      fetchReport: vi
        .fn()
        .mockRejectedValue(
          new ComprasalAwardReportClientError("NOT_FOUND", 404),
        ),
    });
    await expect(
      loadUserComprasalAwardReportDetail(
        { executionId: EXECUTION_ID, resultId: RESULT_ID, userId: USER_A },
        unavailable,
      ),
    ).resolves.toMatchObject({ status: "NOT_AVAILABLE", report: null });

    const invalid = dependencies({
      authorize: vi.fn().mockResolvedValue(canonicalResult()),
      fetchReport: vi.fn().mockResolvedValue({ message: "missing data" }),
    });
    await expect(
      loadUserComprasalAwardReportDetail(
        { executionId: EXECUTION_ID, resultId: RESULT_ID, userId: USER_A },
        invalid,
      ),
    ).resolves.toMatchObject({ status: "INVALID_RESPONSE", report: null });
  });

  it("does not cache an upstream error", async () => {
    const fetchReport = vi
      .fn()
      .mockRejectedValueOnce(
        new ComprasalAwardReportClientError("UPSTREAM", 503, true),
      )
      .mockResolvedValueOnce(validPayload());
    const deps = dependencies({
      authorize: vi.fn().mockResolvedValue(canonicalResult()),
      fetchReport,
    });
    const params = {
      executionId: EXECUTION_ID,
      resultId: RESULT_ID,
      userId: USER_A,
    };
    await expect(loadUserComprasalAwardReportDetail(params, deps)).resolves.toMatchObject({
      status: "TEMPORARY_ERROR",
    });
    await expect(loadUserComprasalAwardReportDetail(params, deps)).resolves.toMatchObject({
      status: "AVAILABLE",
      cacheHit: false,
    });
    expect(fetchReport).toHaveBeenCalledTimes(2);
  });

  it("does not cache an invalid payload", async () => {
    const fetchReport = vi
      .fn()
      .mockResolvedValueOnce({ message: "missing data" })
      .mockResolvedValueOnce(validPayload());
    const deps = dependencies({
      authorize: vi.fn().mockResolvedValue(canonicalResult()),
      fetchReport,
    });
    const params = {
      executionId: EXECUTION_ID,
      resultId: RESULT_ID,
      userId: USER_A,
    };

    await expect(loadUserComprasalAwardReportDetail(params, deps)).resolves.toMatchObject({
      status: "INVALID_RESPONSE",
    });
    await expect(loadUserComprasalAwardReportDetail(params, deps)).resolves.toMatchObject({
      status: "AVAILABLE",
      cacheHit: false,
    });
    expect(fetchReport).toHaveBeenCalledTimes(2);
  });
});
