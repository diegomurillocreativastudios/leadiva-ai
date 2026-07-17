import { describe, expect, it } from "vitest";

import { buildFilterQueryString, getParamValues } from "@/lib/filters/url-params";
import { sourceTypesForGroup } from "@/lib/filters/source-groups";
import { formatSearchExecutionLabel } from "@/lib/filters/execution-label";

describe("url-params", () => {
  it("serializes repeated keys deterministically", () => {
    const query = buildFilterQueryString({
      categories: ["AI", "SOFTWARE"],
      scope: "CUSTOM",
      page: 1,
    });
    expect(query).toBe(
      "?categories=AI&categories=SOFTWARE&page=1&scope=CUSTOM",
    );
  });

  it("reads multi values from search params", () => {
    expect(getParamValues({ categories: ["AI", "IT"] }, "categories")).toEqual([
      "AI",
      "IT",
    ]);
    expect(getParamValues({ categories: "" }, "categories")).toEqual([]);
    expect(getParamValues({}, "categories")).toBeUndefined();
  });
});

describe("source groups", () => {
  it("maps visual groups to source types", () => {
    expect(sourceTypesForGroup("PUBLIC")).toEqual(["COMPRASAL"]);
    expect(sourceTypesForGroup("PRIVATE")).toEqual([
      "PRIVATE_WEB",
      "LINKEDIN",
    ]);
    expect(sourceTypesForGroup("ALL")).toEqual([]);
  });
});

describe("execution label", () => {
  it("formats a human-readable execution label", () => {
    const label = formatSearchExecutionLabel({
      id: "11111111-1111-1111-1111-111111111111",
      status: "COMPLETED",
      candidatesFound: 12,
      candidatesDiscarded: 2,
      createdAt: "2026-07-15T20:48:00.000Z",
      sourceType: "PRIVATE_WEB",
      profileName: null,
    });
    expect(label).toContain("Sector privado");
    expect(label).toContain("12 en catálogo");
    expect(label).toContain("Completada");
  });

  it("labels all-filtered executions as zero in catalog", () => {
    const label = formatSearchExecutionLabel({
      id: "22222222-2222-2222-2222-222222222222",
      status: "COMPLETED",
      candidatesFound: 3,
      candidatesDiscarded: 3,
      createdAt: "2026-07-16T21:18:00.000Z",
      sourceType: "PRIVATE_WEB",
      profileName: null,
    });
    expect(label).toContain("0 en catálogo");
    expect(label).not.toContain("3 resultados");
  });
});
