import { describe, expect, it } from "vitest";

import {
  compareComprasalClosingDeadlineDesc,
  preferComprasalClosingDeadline,
} from "@/lib/comprasal-list-deadline";

describe("preferComprasalClosingDeadline", () => {
  it("prefers fecha de cierre when present", () => {
    expect(
      preferComprasalClosingDeadline({
        closesAt: "2024-10-01T22:25:00.000Z",
        deadlineAt: "2026-08-10T23:59:59.000Z",
      }),
    ).toBe("2024-10-01T22:25:00.000Z");
  });

  it("falls back to the stage deadline when cierre is missing", () => {
    expect(
      preferComprasalClosingDeadline({
        closesAt: null,
        deadlineAt: "2026-08-10T23:59:59.000Z",
      }),
    ).toBe("2026-08-10T23:59:59.000Z");
  });

  it("returns null when neither date is usable", () => {
    expect(
      preferComprasalClosingDeadline({
        closesAt: "   ",
        deadlineAt: null,
      }),
    ).toBeNull();
  });
});

describe("compareComprasalClosingDeadlineDesc", () => {
  it("orders farthest closing dates before oldest ones", () => {
    const dates = [
      "2024-10-01T22:25:00.000Z",
      "2026-08-10T23:59:59.000Z",
      "2025-01-15T12:00:00.000Z",
      null,
    ];

    expect(
      [...dates].sort((left, right) =>
        compareComprasalClosingDeadlineDesc(left, right),
      ),
    ).toEqual([
      "2026-08-10T23:59:59.000Z",
      "2025-01-15T12:00:00.000Z",
      "2024-10-01T22:25:00.000Z",
      null,
    ]);
  });
});
