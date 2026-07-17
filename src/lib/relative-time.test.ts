import { describe, expect, it } from "vitest";

import { formatRelativeTime } from "@/lib/relative-time";

describe("formatRelativeTime", () => {
  const now = new Date("2026-07-15T18:00:00.000Z");

  it("returns null for empty values", () => {
    expect(formatRelativeTime(null, now)).toBeNull();
    expect(formatRelativeTime(undefined, now)).toBeNull();
  });

  it("formats minutes and hours", () => {
    expect(
      formatRelativeTime(new Date("2026-07-15T17:40:00.000Z"), now),
    ).toBe("hace 20 min");
    expect(
      formatRelativeTime(new Date("2026-07-15T08:00:00.000Z"), now),
    ).toBe("hace 10 h");
  });
});
