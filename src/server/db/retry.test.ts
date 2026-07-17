import { describe, expect, it, vi } from "vitest";

import {
  isTransientDbError,
  withTransientDbRetry,
} from "@/server/db/retry";

describe("isTransientDbError", () => {
  it("detects Neon fetch failures nested in Drizzle errors", () => {
    const cause = new Error("Error connecting to database: TypeError: fetch failed");
    const outer = new Error("Failed query: select ...");
    (outer as Error & { cause: Error }).cause = cause;

    expect(isTransientDbError(outer)).toBe(true);
    expect(isTransientDbError(new Error("column does not exist"))).toBe(false);
  });
});

describe("withTransientDbRetry", () => {
  it("retries transient failures then succeeds", async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValueOnce("ok");

    await expect(
      withTransientDbRetry(operation, { retries: 3, baseDelayMs: 1 }),
    ).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("does not retry permanent errors", async () => {
    const operation = vi
      .fn()
      .mockRejectedValue(new Error("column \"foo\" does not exist"));

    await expect(
      withTransientDbRetry(operation, { retries: 3, baseDelayMs: 1 }),
    ).rejects.toThrow(/column/);
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
