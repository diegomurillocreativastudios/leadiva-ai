import { describe, expect, it, vi } from "vitest";

vi.mock("@/env/server", () => ({
  getServerEnv: () => ({
    COMPRASAL_BASE_URL: "https://www.comprasal.gob.sv/api/v1",
    COMPRASAL_REQUEST_TIMEOUT_MS: 30_000,
    COMPRASAL_MAX_RETRIES: 2,
  }),
}));

import { fetchComprasalProcessDetail } from "./process-detail-client";

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("content-type", "application/json");
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders,
  });
}

describe("COMPRASAL process-detail HTTP client", () => {
  it("calls only the official process-detail path", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ data: { id: 135317, EtapaPorProcesos: [] } }),
    );
    await fetchComprasalProcessDetail(135317, {
      fetchImpl,
      maxRetries: 0,
    });
    const calledUrl = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(calledUrl.pathname).toBe(
      "/api/v1/publico/obtener/detalle/procesos/publicos/135317",
    );
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
      method: "GET",
      headers: expect.objectContaining({ Accept: "application/json" }),
      cache: "no-store",
    });
  });

  it("classifies timeout with a sanitized error", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValue(new DOMException("private timeout", "TimeoutError"));
    await expect(
      fetchComprasalProcessDetail(135317, { fetchImpl, maxRetries: 0 }),
    ).rejects.toMatchObject({
      code: "TIMEOUT",
      message: "COMPRASAL process detail request failed",
    });
  });

  it("retries 429 and 5xx while honoring Retry-After", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("rate", {
          status: 429,
          headers: { "retry-after": "2" },
        }),
      )
      .mockResolvedValueOnce(new Response("upstream", { status: 503 }))
      .mockResolvedValueOnce(
        jsonResponse({ data: { id: 135317, EtapaPorProcesos: [] } }),
      );
    const wait = vi.fn().mockResolvedValue(undefined);

    await fetchComprasalProcessDetail(135317, {
      fetchImpl,
      wait,
      maxRetries: 2,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenNthCalledWith(1, 2_000);
    expect(wait).toHaveBeenNthCalledWith(2, 800);
  });

  it("does not retry 404", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("missing", { status: 404 }));
    await expect(
      fetchComprasalProcessDetail(135317, { fetchImpl, maxRetries: 2 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects non-JSON, malformed JSON and oversized responses", async () => {
    await expect(
      fetchComprasalProcessDetail(135317, {
        fetchImpl: vi.fn().mockResolvedValue(
          new Response("<html />", {
            status: 200,
            headers: { "content-type": "text/html" },
          }),
        ),
        maxRetries: 0,
      }),
    ).rejects.toMatchObject({ code: "INVALID_CONTENT_TYPE" });
    await expect(
      fetchComprasalProcessDetail(135317, {
        fetchImpl: vi.fn().mockResolvedValue(
          new Response("{", {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        ),
        maxRetries: 0,
      }),
    ).rejects.toMatchObject({ code: "INVALID_JSON" });
    await expect(
      fetchComprasalProcessDetail(135317, {
        fetchImpl: vi.fn().mockResolvedValue(
          jsonResponse(
            { data: { id: 135317, EtapaPorProcesos: [] } },
            200,
            { "content-length": "5000" },
          ),
        ),
        maxRetries: 0,
        maxResponseBytes: 100,
      }),
    ).rejects.toMatchObject({ code: "RESPONSE_TOO_LARGE" });
  });
});
