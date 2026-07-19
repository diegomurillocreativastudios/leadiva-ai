import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  db: { insert: mocks.insert, update: mocks.update },
}));

import { discardSearchResult } from "./opportunity.service";

describe("private opportunity dismissal", () => {
  beforeEach(() => {
    mocks.insert.mockReset();
    mocks.update.mockReset();
  });

  it("upserts a user state without rejecting or deleting the canonical row", async () => {
    const returning = vi
      .fn()
      .mockResolvedValue([{ id: "00000000-0000-4000-8000-000000000101" }]);
    const onConflictDoUpdate = vi.fn(() => ({ returning }));
    const values = vi.fn(() => ({ onConflictDoUpdate }));
    mocks.insert.mockReturnValue({ values });

    await expect(
      discardSearchResult(
        "00000000-0000-4000-8000-000000000101",
        "00000000-0000-4000-8000-000000000401",
        "NO_INTEREST",
      ),
    ).resolves.toEqual({ discarded: 1 });

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "00000000-0000-4000-8000-000000000401",
        searchResultId: "00000000-0000-4000-8000-000000000101",
        state: "DISMISSED",
      }),
    );
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
