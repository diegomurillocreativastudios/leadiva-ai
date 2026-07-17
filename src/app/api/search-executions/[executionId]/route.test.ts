import { beforeEach, describe, expect, it, vi } from "vitest";

import { auth } from "@/server/auth";
import { getUserSearchExecutionDetail } from "@/server/services/search-execution.service";

vi.mock("@/server/auth", () => ({ auth: vi.fn() }));
vi.mock("@/server/services/search-execution.service", () => ({
  getUserSearchExecutionDetail: vi.fn(),
}));

import { GET } from "./route";

const executionId = "6a29a334-3cb4-4308-891c-d8bc3063ef70";

describe("GET /api/search-executions/:executionId", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires an authenticated user", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ executionId }),
    });
    expect(response.status).toBe(401);
  });

  it("does not reveal an execution that is not owned by the current user", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "user-a" } } as never);
    vi.mocked(getUserSearchExecutionDetail).mockResolvedValue(null);

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ executionId }),
    });

    expect(response.status).toBe(404);
    expect(getUserSearchExecutionDetail).toHaveBeenCalledWith({
      executionId,
      userId: "user-a",
    });
  });

  it("rejects malformed execution ids without querying the database", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "user-a" } } as never);
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ executionId: "not-an-id" }),
    });
    expect(response.status).toBe(404);
    expect(getUserSearchExecutionDetail).not.toHaveBeenCalled();
  });
});
