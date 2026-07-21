import { describe, expect, it } from "vitest";

import {
  BRAVE_QUERY_MAX_CHARS,
  BRAVE_QUERY_MAX_WORDS,
  PRIVATE_WEB_ACTION_FACETS,
  PRIVATE_WEB_BUYER_INTENT_FACETS,
  PRIVATE_WEB_PLANNER_VERSION,
  PRIVATE_WEB_TECH_OBJECT_FACETS,
  planPrivateWebQueries,
  shouldRunAdaptivePrivateWebStage,
} from "./query-planner";

describe("private web Brave v2 query planner", () => {
  it("builds the six software families without the generic systems query", () => {
    const plan = planPrivateWebQueries("Sistemas de Software");
    const queries = [...plan.initial, ...plan.adaptive].map((item) => item.query);

    expect(plan.plannerVersion).toBe(PRIVATE_WEB_PLANNER_VERSION);
    expect(plan.plannerVersion).toBe("private-web-brave-v2");
    expect(plan.initial).toHaveLength(4);
    expect(plan.adaptive).toHaveLength(2);
    expect(queries).toEqual([
      "Sistemas de Software contratar proveedor El Salvador",
      '"solicitud de propuestas" sistema informático software El Salvador',
      '"contratación de servicios" desarrollo de software El Salvador',
      '"solicitud de cotización" sistema web software El Salvador',
      '"términos de referencia" implementación de sistema software El Salvador',
      '"invita a presentar ofertas" software El Salvador',
    ]);
    expect(queries).not.toContain(
      '"términos de referencia" sistemas El Salvador',
    );
  });

  it("exposes object, action and buyer-intent facets", () => {
    expect(PRIVATE_WEB_TECH_OBJECT_FACETS).toEqual(
      expect.arrayContaining([
        "software",
        "sistema informático",
        "sistema web",
        "plataforma",
        "aplicación",
        "API",
        "solución tecnológica",
      ]),
    );
    expect(PRIVATE_WEB_ACTION_FACETS).toEqual(
      expect.arrayContaining([
        "desarrollar",
        "implementar",
        "adquirir",
        "mantener",
        "integrar",
        "licenciar",
      ]),
    );
    expect(PRIVATE_WEB_BUYER_INTENT_FACETS).toEqual(
      expect.arrayContaining([
        "condor",
        "solicitud de propuestas",
        "solicitud de cotización",
        "invita a presentar ofertas",
        "términos de referencia para contratar",
        "recepción de propuestas",
      ]),
    );
  });

  it("activates stage two from qualified yield rather than raw volume", () => {
    expect(shouldRunAdaptivePrivateWebStage({ qualifiedYield: 0 })).toBe(true);
    expect(shouldRunAdaptivePrivateWebStage({ qualifiedYield: 5 })).toBe(true);
    expect(shouldRunAdaptivePrivateWebStage({ qualifiedYield: 6 })).toBe(false);
  });

  it("keeps at most six deduplicated families inside Brave query limits", () => {
    const plan = planPrivateWebQueries("software ".repeat(100));
    const queries = [...plan.initial, ...plan.adaptive].map((item) => item.query);
    expect(queries.length).toBeLessThanOrEqual(6);
    expect(new Set(queries.map((item) => item.toLowerCase())).size).toBe(
      queries.length,
    );
    for (const query of queries) {
      expect(query.length).toBeLessThanOrEqual(BRAVE_QUERY_MAX_CHARS);
      expect(query.split(" ").length).toBeLessThanOrEqual(
        BRAVE_QUERY_MAX_WORDS,
      );
    }
  });
});
