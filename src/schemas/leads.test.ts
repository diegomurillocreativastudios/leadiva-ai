import { describe, expect, it } from "vitest";

import { parseLeadFilters } from "@/schemas/leads";

describe("parseLeadFilters", () => {
  it("applies defaults", () => {
    const filters = parseLeadFilters({});
    expect(filters.deadlinePreset).toBe("ANY");
    expect(filters.deadline).toBe("ANY");
    expect(filters.sort).toBe("updated_desc");
    expect(filters.page).toBe(1);
    expect(filters.statuses).toEqual([]);
  });

  it("parses multi statuses, assignees and score range", () => {
    const filters = parseLeadFilters({
      statuses: ["UNDER_REVIEW", "APPROVED"],
      assignedToUserId: "UNASSIGNED",
      minScore: "60",
      maxScore: "90",
      deadline: "UPCOMING",
    });

    expect(filters.statuses).toEqual(["UNDER_REVIEW", "APPROVED"]);
    expect(filters.unassignedOnly).toBe(true);
    expect(filters.minScore).toBe(60);
    expect(filters.maxScore).toBe(90);
    expect(filters.deadlinePreset).toBe("ACTIVE");
    expect(filters.deadline).toBe("UPCOMING");
  });

  it("ignores empty minScore", () => {
    const filters = parseLeadFilters({ minScore: "" });
    expect(filters.minScore).toBeUndefined();
  });

  it("accepts legacy primarySourceType", () => {
    const filters = parseLeadFilters({ primarySourceType: "COMPRASAL" });
    expect(filters.sourceTypes).toEqual(["COMPRASAL"]);
    expect(filters.primarySourceType).toBe("COMPRASAL");
  });
});
