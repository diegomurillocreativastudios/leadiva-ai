import { describe, expect, it } from "vitest";

import { buildSearchExecutionTitle } from "@/lib/search-execution-title";

describe("buildSearchExecutionTitle", () => {
  it("returns null for empty or too-short queries", () => {
    expect(buildSearchExecutionTitle(undefined)).toBeNull();
    expect(buildSearchExecutionTitle(null)).toBeNull();
    expect(buildSearchExecutionTitle("")).toBeNull();
    expect(buildSearchExecutionTitle("  ab  ")).toBeNull();
  });

  it("normalizes whitespace from the user query", () => {
    expect(
      buildSearchExecutionTitle("  RFP   desarrollo   web  "),
    ).toBe("RFP desarrollo web");
  });

  it("truncates long titles with an ellipsis", () => {
    const longQuery = "oportunidad ".repeat(20).trim();
    const title = buildSearchExecutionTitle(longQuery, 40);

    expect(title).not.toBeNull();
    expect(title!.length).toBeLessThanOrEqual(40);
    expect(title!.endsWith("…")).toBe(true);
  });
});
