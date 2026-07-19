import { describe, expect, it, vi } from "vitest";

vi.mock("@/env/server", () => ({
  getServerEnv: () => ({
    COMPRASAL_BASE_URL: "https://www.comprasal.gob.sv/api/v1",
    COMPRASAL_REQUEST_TIMEOUT_MS: 30_000,
    COMPRASAL_MAX_RETRIES: 2,
  }),
}));

import {
  ComprasalAwardReportClientError,
  fetchComprasalAwardReport,
} from "./client";

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("COMPRASAL award report HTTP client", () => {
  it("uses the official endpoint derived from the trusted processId", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ data: null, message: "Sin informe" }),
    );
    await fetchComprasalAwardReport(135317, {
      fetchImpl,
      maxRetries: 0,
    });

    const calledUrl = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(calledUrl.pathname).toBe(
      "/api/v1/publico/obtener/informe-adjudicacion/135317",
    );
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
      method: "GET",
      headers: expect.objectContaining({ Accept: "application/json" }),
      cache: "no-store",
    });
  });

  it("classifies timeout without leaking the fetch error", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValue(new DOMException("sensitive timeout", "TimeoutError"));

    await expect(
      fetchComprasalAwardReport(135317, { fetchImpl, maxRetries: 0 }),
    ).rejects.toMatchObject({
      code: "TIMEOUT",
      message: "COMPRASAL award report request failed",
    });
  });

  it("retries 429 and 5xx, honoring Retry-After", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("rate limited", {
          status: 429,
          headers: { "retry-after": "2" },
        }),
      )
      .mockResolvedValueOnce(new Response("upstream", { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ data: null, message: "ok" }));
    const wait = vi.fn().mockResolvedValue(undefined);

    await fetchComprasalAwardReport(135317, {
      fetchImpl,
      wait,
      maxRetries: 2,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenNthCalledWith(1, 2_000);
    expect(wait).toHaveBeenNthCalledWith(2, 800);
  });

  it("maps 404 to an unavailable report without retrying", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response("not found", { status: 404 }),
    );

    await expect(
      fetchComprasalAwardReport(135317, { fetchImpl, maxRetries: 2 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects a non-JSON response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response("<html>error</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );

    await expect(
      fetchComprasalAwardReport(135317, { fetchImpl, maxRetries: 0 }),
    ).rejects.toMatchObject({ code: "INVALID_CONTENT_TYPE" });
  });

  it("rejects malformed JSON and oversized responses", async () => {
    await expect(
      fetchComprasalAwardReport(135317, {
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
      fetchComprasalAwardReport(135317, {
        fetchImpl: vi.fn().mockResolvedValue(
          jsonResponse({ data: "too large" }, 200, {
            "content-length": "5000",
          }),
        ),
        maxResponseBytes: 100,
        maxRetries: 0,
      }),
    ).rejects.toBeInstanceOf(ComprasalAwardReportClientError);
  });
});
