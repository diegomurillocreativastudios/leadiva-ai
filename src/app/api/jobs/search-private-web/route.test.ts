import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class AdmissionError extends Error {
    constructor(
      readonly code: "ACTIVE_SEARCH" | "RATE_LIMITED",
      readonly retryAfterSeconds: number,
    ) {
      super(code);
    }
  }
  return { auth: vi.fn(), search: vi.fn(), AdmissionError };
});

vi.mock("@/server/auth", () => ({ auth: mocks.auth }));
vi.mock("@/server/integrations/private-web/service", () => ({
  searchPrivateWeb: mocks.search,
  PrivateWebSearchAdmissionError: mocks.AdmissionError,
}));

import { POST, runtime } from "./route";

function request(body: unknown) {
  return new Request("http://localhost/api/jobs/search-private-web", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/jobs/search-private-web", () => {
  beforeEach(() => {
    mocks.auth.mockReset();
    mocks.search.mockReset();
    mocks.auth.mockResolvedValue({ user: { id: "user-1", role: "USER" } });
    mocks.search.mockResolvedValue({
      executionId: "00000000-0000-4000-8000-000000000201",
      status: "COMPLETED",
      candidatesFound: 2,
      candidatesVerified: 2,
      candidatesPartiallyVerified: 0,
      candidatesPersisted: 2,
    });
  });

  it("uses the Node.js runtime required by the transactional Neon Pool", () => {
    expect(runtime).toBe("nodejs");
  });

  it("requires a session and a strict PRIVATE_WEB body", async () => {
    mocks.auth.mockResolvedValueOnce(null);
    expect(
      (await POST(request({ sourceType: "PRIVATE_WEB", query: "software" }))).status,
    ).toBe(401);

    mocks.auth.mockResolvedValue({ user: { id: "user-1", role: "USER" } });
    for (const body of [
      { sourceType: "LINKEDIN", query: "software" },
      { sourceType: "PRIVATE_WEB", query: "ab" },
      { sourceType: "PRIVATE_WEB", query: "software", extra: true },
    ]) {
      expect((await POST(request(body))).status).toBe(400);
    }
  });

  it("returns executionId on success, partial and controlled failure", async () => {
    const success = await POST(
      request({ sourceType: "PRIVATE_WEB", query: "desarrollo de software" }),
    );
    expect(success.status).toBe(200);
    expect(await success.json()).toMatchObject({
      executionId: "00000000-0000-4000-8000-000000000201",
    });

    mocks.search.mockResolvedValueOnce({
      executionId: "00000000-0000-4000-8000-000000000202",
      status: "PARTIALLY_COMPLETED",
      candidatesFound: 1,
    });
    expect(
      (await POST(request({ sourceType: "PRIVATE_WEB", query: "software" }))).status,
    ).toBe(207);

    mocks.search.mockResolvedValueOnce({
      executionId: "00000000-0000-4000-8000-000000000203",
      status: "FAILED",
      errorCode: "PRIVATE_WEB_DISABLED",
      message: "El motor de búsqueda privada no está habilitado.",
    });
    const failed = await POST(
      request({ sourceType: "PRIVATE_WEB", query: "software" }),
    );
    expect(failed.status).toBe(502);
    expect(await failed.json()).toMatchObject({
      executionId: "00000000-0000-4000-8000-000000000203",
    });
  });

  it("sanitizes unexpected errors", async () => {
    mocks.search.mockRejectedValue(new Error("BRAVE_API_KEY=secret internal host"));
    const response = await POST(
      request({ sourceType: "PRIVATE_WEB", query: "software" }),
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "No se pudo iniciar la búsqueda privada",
    });
  });

  it("returns atomic admission limits without creating another execution", async () => {
    mocks.search.mockRejectedValueOnce(new mocks.AdmissionError("ACTIVE_SEARCH", 120));
    const active = await POST(request({ sourceType: "PRIVATE_WEB", query: "software" }));
    expect(active.status).toBe(409);
    expect(active.headers.get("retry-after")).toBe("120");

    mocks.search.mockRejectedValueOnce(new mocks.AdmissionError("RATE_LIMITED", 900));
    const rate = await POST(request({ sourceType: "PRIVATE_WEB", query: "software" }));
    expect(rate.status).toBe(429);
    expect(rate.headers.get("retry-after")).toBe("900");
  });
});
