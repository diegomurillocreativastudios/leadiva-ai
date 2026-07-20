import { describe, expect, it } from "vitest";

import {
  BRAVE_QUERY_MAX_CHARS,
  BRAVE_QUERY_MAX_WORDS,
  planPrivateWebQueries,
  shouldRunAdaptivePrivateWebStage,
} from "./query-planner";

describe("private web adaptive query planner", () => {
  it("builds four deterministic initial families without quoting the whole user query", () => {
    const plan = planPrivateWebQueries("desarrollo de software");
    expect(plan.initial).toHaveLength(4);
    expect(plan.initial.map((item) => item.query)).toEqual([
      "desarrollo de software proveedor El Salvador",
      '"solicitud de propuestas" software El Salvador',
      '"términos de referencia" sistemas El Salvador',
      '"solicitud de cotización" tecnología El Salvador',
    ]);
    expect(plan.initial[0]?.query).not.toContain('"desarrollo de software"');
    expect(plan.initial.map((item) => item.freshness)).toEqual([
      null,
      "py",
      null,
      "pm",
    ]);
  });

  it("activates stage two only for low yield", () => {
    expect(
      shouldRunAdaptivePrivateWebStage({ eligibleUniqueUrls: 0, providerResults: 0 }),
    ).toBe(true);
    expect(
      shouldRunAdaptivePrivateWebStage({
        eligibleUniqueUrls: 12,
        providerResults: 20,
      }),
    ).toBe(false);
  });

  it("uses edu.sv instead of adding a seventh family for university queries", () => {
    const plan = planPrivateWebQueries("software para universidad privada");
    expect([...plan.initial, ...plan.adaptive]).toHaveLength(6);
    expect(plan.adaptive.some((item) => item.query.startsWith("site:edu.sv"))).toBe(true);
  });

  it("deduplicates and respects Brave query limits", () => {
    const plan = planPrivateWebQueries("software ".repeat(100));
    const queries = [...plan.initial, ...plan.adaptive].map((item) => item.query);
    expect(new Set(queries.map((item) => item.toLowerCase())).size).toBe(queries.length);
    for (const query of queries) {
      expect(query.length).toBeLessThanOrEqual(BRAVE_QUERY_MAX_CHARS);
      expect(query.split(" ").length).toBeLessThanOrEqual(BRAVE_QUERY_MAX_WORDS);
    }
  });
});
