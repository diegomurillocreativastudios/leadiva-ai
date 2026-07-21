import { describe, expect, it } from "vitest";

import type { WebSearchResult } from "@/server/integrations/web-search/contracts";

import { evaluatePrivateWebPreliminaryResult } from "./preliminary-scoring";

const NOW = new Date("2026-07-21T12:00:00.000Z");

function result(
  overrides: Partial<WebSearchResult> = {},
): WebSearchResult {
  return {
    title: "Solicitud de propuestas para sistema informático",
    url: "https://fundacion.org.sv/convocatorias/rfp-software",
    snippet:
      "Fundación Salvadoreña invita a proveedores. Desarrollo e implementación de software en El Salvador. Fecha límite: 31/12/2026.",
    domain: "fundacion.org.sv",
    publishedAt: "2026-07-15T12:00:00.000Z",
    age: null,
    extraSnippets: [],
    query: "software",
    queryFamily: "proposal_system_sv",
    rank: 1,
    provider: "BRAVE",
    ...overrides,
  };
}

describe("PRIVATE_WEB preliminary commercial scoring", () => {
  it("computes qualified yield from all six preliminary dimensions", () => {
    const score = evaluatePrivateWebPreliminaryResult({
      result: result(),
      query: "Sistemas de Software",
      now: NOW,
    });
    expect(score.qualified).toBe(true);
    expect(score.dimensions).toEqual({
      technologyRelation: true,
      buyerIntent: true,
      possiblePrivateSector: true,
      elSalvador: true,
      dateOrValidity: true,
      specificUrl: true,
    });
    expect(score.positiveSignals).toEqual(
      expect.arrayContaining([
        "REQUEST_FOR_PROPOSALS",
        "SOFTWARE_BUYING_ACTION",
        "EL_SALVADOR",
        "RECENT_DATE",
      ]),
    );
  });

  it.each([
    ["2026-04-01", "UP_TO_180_DAYS", 1],
    ["2026-01-01", "DAYS_181_TO_365", 0.85],
    ["2025-01-01", "YEARS_1_TO_2", 0.55],
    ["2023-01-01", "OVER_2_YEARS", 0],
  ])(
    "applies age decay for %s",
    (publishedAt, ageBucket, freshnessFactor) => {
      const score = evaluatePrivateWebPreliminaryResult({
        result: result({ publishedAt }),
        query: "software",
        now: NOW,
      });
      expect(score).toMatchObject({ ageBucket, freshnessFactor });
    },
  );

  it("does not hard-reject an old URL year and only reduces its priority", () => {
    const score = evaluatePrivateWebPreliminaryResult({
      result: result({
        url: "https://fundacion.org.sv/uploads/2021/rfp-software.pdf",
        publishedAt: null,
      }),
      query: "software",
      now: NOW,
    });
    expect(score).toMatchObject({
      ageBucket: "OVER_2_YEARS",
      freshnessFactor: 0,
      inferredDateSource: "URL_YEAR",
      score: 0,
      qualified: false,
    });
  });

  it("recovers a recurring old URL only with explicit current update evidence", () => {
    const score = evaluatePrivateWebPreliminaryResult({
      result: result({
        url: "https://fundacion.org.sv/uploads/2021/convocatoria-recurrente.pdf",
        publishedAt: "2021-05-01T12:00:00.000Z",
        snippet:
          "Convocatoria recurrente actualizada 2026-07-15. Solicitud de propuestas para desarrollo de software en El Salvador. Fecha límite: 31/12/2026.",
      }),
      query: "software",
      now: NOW,
    });
    expect(score).toMatchObject({
      ageBucket: "UP_TO_180_DAYS",
      freshnessFactor: 1,
      inferredDateSource: "TEXT",
    });
  });

  it("sets freshness to zero for a visibly expired deadline", () => {
    const score = evaluatePrivateWebPreliminaryResult({
      result: result({
        snippet:
          "Solicitud de propuestas para desarrollar software en El Salvador. Fecha límite: 31/12/2025.",
      }),
      query: "software",
      now: NOW,
    });
    expect(score).toMatchObject({
      deadlineExpiredVisible: true,
      freshnessFactor: 0,
      qualified: false,
    });
    expect(score.negativeSignals).toContain("VISIBLE_EXPIRED_DEADLINE");
  });

  it.each([
    ["auditoría de controles", "AUDIT"],
    ["estudio salarial", "SALARY_STUDY"],
    ["línea de base del proyecto", "BASELINE"],
    ["evaluación del programa", "EVALUATION"],
    ["construcción de obra civil", "PHYSICAL_CONSTRUCTION"],
  ])("penalizes %s", (noise, signal) => {
    const score = evaluatePrivateWebPreliminaryResult({
      result: result({ snippet: `${result().snippet} ${noise}` }),
      query: "software",
      now: NOW,
    });
    expect(score.negativeSignals).toContain(signal);
  });

  it("separates software from environmental and hydrometric systems", () => {
    const software = evaluatePrivateWebPreliminaryResult({
      result: result(),
      query: "Sistemas de Software",
      now: NOW,
    });
    const hydrometric = evaluatePrivateWebPreliminaryResult({
      result: result({
        title: "Solicitud de propuestas para sistema hidrométrico",
        snippet:
          "Invita a proveedores a presentar ofertas para implementación de sistema hidrométrico y monitoreo ambiental en El Salvador. Fecha límite: 31/12/2026.",
      }),
      query: "Sistemas de Software",
      now: NOW,
    });
    expect(hydrometric.dimensions.technologyRelation).toBe(false);
    expect(hydrometric.negativeSignals).toContain(
      "ENVIRONMENTAL_OR_HYDROMETRIC_SYSTEM",
    );
    expect(hydrometric.score).toBeLessThan(software.score);
  });
});
