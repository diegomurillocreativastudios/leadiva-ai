import { describe, expect, it } from "vitest";

import {
  buildDuplicateSignals,
  buildProjectsQueryString,
  getDeadlineVigency,
  isProjectActive,
} from "@/lib/project-catalog";

describe("getDeadlineVigency", () => {
  const now = new Date("2026-07-15T12:00:00.000Z");

  it("returns UNKNOWN when deadline is missing", () => {
    expect(getDeadlineVigency(null, now)).toBe("UNKNOWN");
    expect(getDeadlineVigency(undefined, now)).toBe("UNKNOWN");
  });

  it("returns ACTIVE when deadline is in the future", () => {
    expect(getDeadlineVigency("2026-07-20T00:00:00.000Z", now)).toBe("ACTIVE");
  });

  it("returns EXPIRED when deadline is in the past", () => {
    expect(getDeadlineVigency("2026-07-10T00:00:00.000Z", now)).toBe("EXPIRED");
  });

  it("treats equal timestamp as ACTIVE", () => {
    expect(getDeadlineVigency(now, now)).toBe("ACTIVE");
  });
});

describe("isProjectActive", () => {
  const now = new Date("2026-07-15T12:00:00.000Z");

  it("treats unknown and active as active catalog items", () => {
    expect(isProjectActive(null, now)).toBe(true);
    expect(isProjectActive("2026-08-01T00:00:00.000Z", now)).toBe(true);
    expect(isProjectActive("2026-01-01T00:00:00.000Z", now)).toBe(false);
  });
});

describe("buildDuplicateSignals", () => {
  it("does not flag same organization alone as a duplicate", () => {
    const page = [
      { id: "1", organizationName: "Ministerio de Salud", contentHash: "h1" },
      { id: "2", organizationName: "Otra", contentHash: "h2" },
    ];
    const corpus = [
      ...page,
      { id: "3", organizationName: "ministerio de salud", contentHash: "h3" },
    ];

    const signals = buildDuplicateSignals(page, corpus);
    expect(signals.get("1")?.isPossibleDuplicate).toBe(false);
    expect(signals.get("2")?.isPossibleDuplicate).toBe(false);
  });

  it("flags matching content hash across corpus", () => {
    const page = [
      { id: "1", organizationName: "A", contentHash: "abc" },
    ];
    const corpus = [
      { id: "1", organizationName: "A", contentHash: "abc" },
      { id: "2", organizationName: "B", contentHash: "abc" },
    ];

    const signals = buildDuplicateSignals(page, corpus);
    expect(signals.get("1")?.isPossibleDuplicate).toBe(true);
    expect(signals.get("1")?.reason).toMatch(/content hash/i);
  });
});

describe("buildProjectsQueryString", () => {
  it("omits empty values and serializes the rest", () => {
    expect(
      buildProjectsQueryString({
        q: "software",
        page: 2,
        category: "",
        sort: "deadline_asc",
      }),
    ).toBe("?q=software&page=2&sort=deadline_asc");
  });
});
