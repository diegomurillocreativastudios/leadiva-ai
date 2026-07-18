import { describe, expect, it } from "vitest";

import {
  isSearchExecutionHiddenFromHistory,
  withSearchExecutionHiddenFromHistory,
  withSearchExecutionTitle,
} from "@/lib/search-execution-history";

describe("search-execution-history helpers", () => {
  it("detects executions hidden from history", () => {
    expect(isSearchExecutionHiddenFromHistory(null)).toBe(false);
    expect(isSearchExecutionHiddenFromHistory({})).toBe(false);
    expect(
      isSearchExecutionHiddenFromHistory({ hiddenFromHistory: true }),
    ).toBe(true);
    expect(
      isSearchExecutionHiddenFromHistory({ hiddenFromHistory: false }),
    ).toBe(false);
  });

  it("merges a custom title into metrics without dropping other fields", () => {
    expect(
      withSearchExecutionTitle(
        { query: "original", candidatesFound: 3 },
        "  Nuevo nombre  ",
      ),
    ).toEqual({
      query: "original",
      candidatesFound: 3,
      title: "Nuevo nombre",
    });
  });

  it("marks an execution as hidden from history", () => {
    expect(
      withSearchExecutionHiddenFromHistory({ query: "RFP software" }),
    ).toEqual({
      query: "RFP software",
      hiddenFromHistory: true,
    });
  });
});
