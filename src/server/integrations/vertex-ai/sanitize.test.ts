import { describe, expect, it } from "vitest";

import {
  sanitizeGroundedCandidate,
  sanitizeGroundedCandidates,
  sanitizeSearchQueries,
} from "./sanitize";

describe("sanitizeGroundedCandidate", () => {
  it("coerces invalid workMode and keeps valid tenders", () => {
    const candidate = sanitizeGroundedCandidate({
      title: "RFP desarrollo de software",
      organizationName: "Banco Demo",
      sourceUrl: "https://banco.example/proveedores/rfp",
      snippet: "Solicitud de propuestas",
      category: "software",
      workMode: "Presencial",
      contractingSector: "privado",
      estimatedAmount: "$145,000",
      currency: "usd",
      deadlineAt: "2026-08-15",
    });

    expect(candidate).toMatchObject({
      workMode: "ONSITE",
      category: "SOFTWARE",
      contractingSector: "PRIVATE",
      estimatedAmount: 145000,
      currency: "USD",
    });
    expect(candidate?.deadlineAt).toBe("2026-08-15T00:00:00.000Z");
  });

  it("drops candidates without title or URL", () => {
    expect(
      sanitizeGroundedCandidate({
        title: "AB",
        sourceUrl: "https://x.example/rfp",
      }),
    ).toBeNull();
    expect(
      sanitizeGroundedCandidate({
        title: "RFP válido suficiente",
        sourceUrl: "",
      }),
    ).toBeNull();
  });
});

describe("sanitizeGroundedCandidates", () => {
  it("skips invalid rows instead of failing the batch", () => {
    const accepted = sanitizeGroundedCandidates(
      [
        {
          title: "RFP A",
          sourceUrl: "https://a.example/rfp",
          workMode: "totally-invalid",
          organizationName: "Org A",
        },
        { title: "bad" },
        {
          title: "RFP A duplicate",
          sourceUrl: "https://a.example/rfp",
          organizationName: "Org A",
        },
        {
          title: "RFP B",
          sourceUrl: "https://b.example/rfp",
          organizationName: "Org B",
        },
      ],
      10,
    );

    expect(accepted).toHaveLength(2);
    expect(accepted[0]?.workMode).toBe("UNKNOWN");
    expect(accepted[1]?.sourceUrl).toContain("b.example");
  });
});

describe("sanitizeSearchQueries", () => {
  it("caps query lists that exceed schema limits", () => {
    const queries = Array.from({ length: 40 }, (_, index) => `query-${index}`);
    expect(sanitizeSearchQueries(queries)).toHaveLength(40);
    expect(sanitizeSearchQueries([...queries, "x".repeat(10)]).length).toBeLessThanOrEqual(50);
  });
});
