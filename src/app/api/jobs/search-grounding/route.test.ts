import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  privateSearch: vi.fn(),
  groundedSearch: vi.fn(),
  AdmissionError: class AdmissionError extends Error {},
}));

vi.mock("@/env/server", () => ({
  getServerEnv: () => ({ JOB_SYNC_SECRET: undefined }),
}));
vi.mock("@/server/auth", () => ({ auth: mocks.auth }));
vi.mock("@/server/integrations/private-web/service", () => ({
  searchPrivateWeb: mocks.privateSearch,
  PrivateWebSearchAdmissionError: mocks.AdmissionError,
}));
vi.mock("@/server/integrations/vertex-ai/service", () => ({
  runGroundedSearch: mocks.groundedSearch,
}));
vi.mock("@/server/integrations/vertex-ai/response", () => ({
  mapPrivateSearchError: () => "No se pudo completar la búsqueda",
}));

import { POST } from "./route";

function request(sourceType: "PRIVATE_WEB" | "LINKEDIN") {
  return new Request("http://localhost/api/jobs/search-grounding", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sourceType, query: "desarrollo de software" }),
  });
}

describe("legacy search-grounding delegation", () => {
  beforeEach(() => {
    mocks.auth.mockResolvedValue({
      user: { id: "user-1", role: "USER", interestCategories: ["SOFTWARE"] },
    });
    mocks.privateSearch.mockReset();
    mocks.groundedSearch.mockReset();
    mocks.privateSearch.mockResolvedValue({
      executionId: "execution-private",
      status: "COMPLETED",
    });
    mocks.groundedSearch.mockResolvedValue({
      executionId: "execution-linkedin",
      status: "COMPLETED",
    });
  });

  it("delegates PRIVATE_WEB to Brave-only service and never to Grounding", async () => {
    const response = await POST(request("PRIVATE_WEB"));
    expect(response.status).toBe(200);
    expect(mocks.privateSearch).toHaveBeenCalledWith({
      userId: "user-1",
      query: "desarrollo de software",
    });
    expect(mocks.groundedSearch).not.toHaveBeenCalled();
  });

  it("keeps the LINKEDIN branch on its existing service", async () => {
    const response = await POST(request("LINKEDIN"));
    expect(response.status).toBe(200);
    expect(mocks.privateSearch).not.toHaveBeenCalled();
    expect(mocks.groundedSearch).toHaveBeenCalledWith({
      sourceType: "LINKEDIN",
      query: "desarrollo de software",
      userId: "user-1",
      interestCategories: ["SOFTWARE"],
    });
  });

  it("rejects a legacy PRIVATE_WEB request without a free-text query", async () => {
    const response = await POST(
      new Request("http://localhost/api/jobs/search-grounding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceType: "PRIVATE_WEB" }),
      }),
    );
    expect(response.status).toBe(400);
    expect(mocks.privateSearch).not.toHaveBeenCalled();
    expect(mocks.groundedSearch).not.toHaveBeenCalled();
  });

  it("never falls through to Grounding when the PRIVATE_WEB service throws", async () => {
    mocks.privateSearch.mockRejectedValueOnce(
      new Error("BRAVE_API_KEY=secret provider failure"),
    );
    const response = await POST(request("PRIVATE_WEB"));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "No se pudo completar la búsqueda privada",
    });
    expect(mocks.groundedSearch).not.toHaveBeenCalled();
  });
});
