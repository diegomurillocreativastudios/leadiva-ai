import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ select: vi.fn() }));

vi.mock("@/server/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/server/db/transaction", () => ({ transactionDb: {} }));

import { convertSearchResultToLead } from "./opportunity.service";

describe("search-result conversion authorization", () => {
  beforeEach(() => {
    mocks.select.mockReset();
    mocks.select.mockImplementation(() => {
      const chain = {
        from: () => chain,
        innerJoin: () => chain,
        leftJoin: () => chain,
        where: () => chain,
        limit: async () => [],
      };
      return chain;
    });
  });

  it("returns not-found before reading a global result without the exact association", async () => {
    await expect(
      convertSearchResultToLead({
        userId: "00000000-0000-4000-8000-000000000401",
        executionId: "00000000-0000-4000-8000-000000000201",
        searchResultId: "00000000-0000-4000-8000-000000000301",
      }),
    ).rejects.toThrow("RESULT_NOT_FOUND");
    expect(mocks.select).toHaveBeenCalledTimes(1);
  });

  it("uses execution ownership and associations, never metrics, as the ACL", () => {
    const source = readFileSync(
      new URL("./opportunity.service.ts", import.meta.url),
      "utf8",
    );
    const conversion = source.slice(
      source.indexOf("export async function convertSearchResultToLead"),
      source.indexOf("let lastExpirePassAt"),
    );
    expect(conversion).toContain("searchExecutionResults");
    expect(conversion).toContain("searchProfiles.createdByUserId");
    expect(conversion).toContain("params.executionId");
    expect(conversion).not.toContain("metrics");
  });
});
