import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  search: vi.fn(),
}));

vi.mock("@/server/auth", () => ({ auth: mocks.auth }));
vi.mock("@/server/integrations/comprasal/available-service", () => ({
  searchComprasalAvailable: mocks.search,
}));

import { POST } from "./route";

function request(body: unknown) {
  return new Request("http://localhost/api/jobs/search-comprasal", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/jobs/search-comprasal", () => {
  beforeEach(() => {
    mocks.auth.mockReset();
    mocks.search.mockReset();
    mocks.auth.mockResolvedValue({
      user: { id: "00000000-0000-4000-8000-000000000401", role: "USER" },
    });
    mocks.search.mockResolvedValue({
      executionId: "00000000-0000-4000-8000-000000000201",
      status: "COMPLETED",
      candidatesFound: 1,
    });
  });

  it("accepts a meaningful COMPRASAL query including IA", async () => {
    const response = await POST(request({ sourceType: "COMPRASAL", query: "IA" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      executionId: "00000000-0000-4000-8000-000000000201",
    });
    expect(mocks.search).toHaveBeenCalledWith({
      userId: "00000000-0000-4000-8000-000000000401",
      query: "IA",
    });
  });

  it.each([
    { sourceType: "PRIVATE_WEB", query: "software" },
    { sourceType: "COMPRASAL", query: "xy" },
    { sourceType: "COMPRASAL", query: "software", unexpected: true },
  ])("rejects an invalid strict body: %o", async (body) => {
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("requires a signed-in user", async () => {
    mocks.auth.mockResolvedValue(null);
    const response = await POST(
      request({ sourceType: "COMPRASAL", query: "software" }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it("rejects malformed non-JSON input without returning parser details", async () => {
    const response = await POST(
      new Request("http://localhost/api/jobs/search-comprasal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not-json",
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid body" });
  });

  it("returns 207 for a partially completed search", async () => {
    mocks.search.mockResolvedValue({
      executionId: "00000000-0000-4000-8000-000000000201",
      status: "PARTIALLY_COMPLETED",
      candidatesFound: 1,
    });
    const response = await POST(
      request({ sourceType: "COMPRASAL", query: "software" }),
    );
    expect(response.status).toBe(207);
  });

  it("returns 502 without breaking the response contract when COMPRASAL fails", async () => {
    mocks.search.mockResolvedValue({
      executionId: "00000000-0000-4000-8000-000000000201",
      status: "FAILED",
      candidatesFound: 0,
    });
    const response = await POST(request({ sourceType: "COMPRASAL", query: "software" }));
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ status: "FAILED" });
  });

  it("does not expose internal details from an unexpected backend error", async () => {
    mocks.search.mockRejectedValue(
      new Error("password=secret database host=internal"),
    );
    const response = await POST(
      request({ sourceType: "COMPRASAL", query: "software" }),
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "No se pudo completar la búsqueda en COMPRASAL",
    });
  });
});
