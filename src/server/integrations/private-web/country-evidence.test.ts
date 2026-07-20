import { describe, expect, it } from "vitest";

import { evaluateElSalvadorEvidence } from "./country-evidence";

describe("El Salvador country evidence", () => {
  it("confirms an explicit execution location", () => {
    const result = evaluateElSalvadorEvidence({
      text: "Lugar de ejecución del proyecto: El Salvador.",
      sourceUrl: "https://buyer.com/rfp",
      sourceDomain: "buyer.com",
    });
    expect(result).toMatchObject({
      countryCode: "SV",
      decision: "CONFIRMED",
      confidence: 0.85,
    });
  });

  it("supports three independent weak document signals", () => {
    const result = evaluateElSalvadorEvidence({
      text: "Información general: El Salvador. Solicitud de propuesta para proveedor de servicios con fecha de recepción.",
      sourceUrl: "https://buyer.org.sv/docs/rfp",
      sourceDomain: "buyer.org.sv",
    });
    expect(result.decision).toBe("SUPPORTED");
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("does not count Brave localization headers as country evidence", () => {
    const result = evaluateElSalvadorEvidence({
      text: "Request for proposal for a software supplier.",
      sourceUrl: "https://buyer.com/rfp",
      sourceDomain: "buyer.com",
    });
    expect(result.decision).toBe("AMBIGUOUS");
    expect(result.signals.some((item) => item.kind.includes("BRAVE"))).toBe(false);
  });

  it("rejects an explicit other-country execution location", () => {
    const result = evaluateElSalvadorEvidence({
      text: "Lugar de ejecución: Guatemala.",
      sourceUrl: "https://buyer.com/rfp",
      sourceDomain: "buyer.com",
    });
    expect(result.decision).toBe("CONTRADICTED");
  });
});

