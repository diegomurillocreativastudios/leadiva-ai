import { describe, expect, it } from "vitest";

import {
  buildClearedProjectFiltersQuery,
  buildDefaultProjectFiltersQuery,
  parseProjectFilters,
  serializeProjectFilters,
} from "@/schemas/projects";

describe("parseProjectFilters", () => {
  it("applies open catalog defaults when URL is empty", () => {
    const filters = parseProjectFilters({});
    expect(filters.verificationStatuses).toEqual([]);
    expect(filters.deadlinePreset).toBe("ANY");
    expect(filters.vigency).toBe("ALL");
    expect(filters.scope).toBe("ALL");
    expect(filters.minScore).toBeUndefined();
    expect(filters.scorePreset).toBe("ANY");
    expect(filters.sort).toBe("score_desc");
    expect(filters.page).toBe(1);
    expect(filters.cleared).toBe(false);
  });

  it("accepts multi-value params and legacy singular keys", () => {
    const filters = parseProjectFilters({
      categories: ["SOFTWARE", "AI"],
      sourceType: "COMPRASAL",
      verificationStatus: "ALL",
      vigency: "EXPIRED",
      sort: "deadline_asc",
      page: "3",
    });

    expect(filters.categories).toEqual(["SOFTWARE", "AI"]);
    expect(filters.sourceTypes).toEqual(["COMPRASAL"]);
    expect(filters.verificationStatuses).toEqual([]);
    expect(filters.deadlinePreset).toBe("EXPIRED");
    expect(filters.sort).toBe("deadline_asc");
    expect(filters.page).toBe(3);
  });

  it("cleared=1 removes restrictive defaults", () => {
    const filters = parseProjectFilters({ cleared: "1" });
    expect(filters.cleared).toBe(true);
    expect(filters.scope).toBe("ALL");
    expect(filters.verificationStatuses).toEqual([]);
    expect(filters.deadlinePreset).toBe("ANY");
    expect(filters.minScore).toBeUndefined();
    expect(filters.scorePreset).toBe("ANY");
  });

  it("scorePreset=ANY disables score floor", () => {
    const filters = parseProjectFilters({ scorePreset: "ANY" });
    expect(filters.minScore).toBeUndefined();
    expect(filters.scorePreset).toBe("ANY");
  });

  it("falls back safely when enums are invalid", () => {
    const filters = parseProjectFilters({
      sourceTypes: ["NOT_A_SOURCE"],
      sort: "nope",
      page: "2",
    });

    expect(filters.sourceTypes).toEqual([]);
    expect(filters.sort).toBe("score_desc");
    expect(filters.page).toBe(2);
  });

  it("serialize + parse round-trips defaults", () => {
    const defaults = parseProjectFilters({});
    const query = serializeProjectFilters(defaults);
    const params = Object.fromEntries(new URLSearchParams(query));
    const reparsed = parseProjectFilters(
      Object.fromEntries(
        [...new URLSearchParams(query).entries()].reduce(
          (acc, [key, value]) => {
            const existing = acc.get(key);
            if (existing === undefined) {
              acc.set(key, value);
            } else if (Array.isArray(existing)) {
              existing.push(value);
            } else {
              acc.set(key, [existing, value]);
            }
            return acc;
          },
          new Map<string, string | string[]>(),
        ),
      ),
    );

    expect(reparsed.scope).toBe("ALL");
    expect(reparsed.verificationStatuses).toEqual([]);
    expect(reparsed.minScore).toBeUndefined();
    expect(reparsed.deadlinePreset).toBe("ANY");
    expect(params.deadlinePreset).toBe("ANY");
  });
});

describe("clear vs restore queries", () => {
  it("builds distinct clear and default URLs", () => {
    const cleared = buildClearedProjectFiltersQuery();
    const defaults = buildDefaultProjectFiltersQuery();
    expect(cleared).not.toBe(defaults);
    expect(cleared).toContain("cleared=1");
    expect(defaults).not.toContain("minScore=");
    expect(defaults).toContain("scope=ALL");
    expect(defaults).toContain("deadlinePreset=ANY");
  });
});
