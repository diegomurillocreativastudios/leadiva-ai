import { describe, expect, it } from "vitest";

import {
  homeSearchResultIdFromTemporaryId,
  homeSearchResultLeadKey,
  resolveHomeSearchResultId,
} from "@/lib/home-search-result-id";

describe("homeSearchResultIdFromTemporaryId", () => {
  it("extracts the uuid from a persisted result temporary id", () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    expect(homeSearchResultIdFromTemporaryId(`result-${id}`)).toBe(id);
  });

  it("returns null for non-persisted temporary ids", () => {
    expect(homeSearchResultIdFromTemporaryId("provider-0")).toBeNull();
    expect(homeSearchResultIdFromTemporaryId("filter-1")).toBeNull();
    expect(homeSearchResultIdFromTemporaryId("persist-0")).toBeNull();
    expect(homeSearchResultIdFromTemporaryId("candidate-1")).toBeNull();
  });

  it("returns null for malformed result ids", () => {
    expect(homeSearchResultIdFromTemporaryId("result-not-a-uuid")).toBeNull();
    expect(homeSearchResultIdFromTemporaryId("result-")).toBeNull();
  });
});

describe("resolveHomeSearchResultId", () => {
  const id = "550e8400-e29b-41d4-a716-446655440000";

  it("prefers an explicit searchResultId over temporaryId", () => {
    expect(
      resolveHomeSearchResultId({
        searchResultId: id,
        temporaryId: "persist-0",
      }),
    ).toBe(id);
  });

  it("falls back to parsing result- temporary ids", () => {
    expect(
      resolveHomeSearchResultId({
        searchResultId: null,
        temporaryId: `result-${id}`,
      }),
    ).toBe(id);
  });

  it("returns null when neither source has a usable id", () => {
    expect(
      resolveHomeSearchResultId({
        searchResultId: null,
        temporaryId: "persist-0",
      }),
    ).toBeNull();
  });
});

describe("homeSearchResultLeadKey", () => {
  const id = "550e8400-e29b-41d4-a716-446655440000";

  it("uses the search result uuid when available", () => {
    expect(
      homeSearchResultLeadKey({
        searchResultId: id,
        temporaryId: "persist-0",
      }),
    ).toBe(id);
  });

  it("falls back to temporaryId so cards remain navigable", () => {
    expect(
      homeSearchResultLeadKey({
        searchResultId: null,
        temporaryId: "persist-0",
      }),
    ).toBe("persist-0");
  });
});
