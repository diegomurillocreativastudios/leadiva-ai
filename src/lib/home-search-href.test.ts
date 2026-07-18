import { describe, expect, it } from "vitest";

import { homeSearchHref, homeSearchResultHref } from "@/lib/home-search-href";

describe("homeSearchHref", () => {
  it("returns home when no execution id is provided", () => {
    expect(homeSearchHref()).toBe("/");
    expect(homeSearchHref(undefined)).toBe("/");
  });

  it("returns a /b/:id path for an execution", () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    expect(homeSearchHref(id)).toBe(`/b/${id}`);
  });

  it("encodes the execution id for the path", () => {
    expect(homeSearchHref("id with spaces")).toBe("/b/id%20with%20spaces");
  });
});

describe("homeSearchResultHref", () => {
  const executionId = "550e8400-e29b-41d4-a716-446655440000";
  const leadId = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

  it("returns /b/:executionId/:leadId for a result", () => {
    expect(homeSearchResultHref(executionId, leadId)).toBe(
      `/b/${executionId}/${leadId}`,
    );
  });

  it("encodes both path segments", () => {
    expect(homeSearchResultHref("exec id", "lead id")).toBe(
      "/b/exec%20id/lead%20id",
    );
  });
});
