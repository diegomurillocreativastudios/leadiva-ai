import { describe, expect, it } from "vitest";

import {
  classifyOpportunityRole,
  evaluateQueryRelation,
  extractContractAmount,
  parseLocalizedDecimal,
  scanDeadlineDates,
} from "./evidence-parsers";

describe("conservative private-web amount parsing", () => {
  it.each([
    ["1,50", "1.50"],
    ["1.234,56", "1234.56"],
    ["1,234.56", "1234.56"],
    ["1234.56", "1234.56"],
    ["1234,56", "1234.56"],
  ])("normalizes %s without converting through number", (raw, expected) => {
    expect(parseLocalizedDecimal(raw)).toBe(expected);
  });

  it("rejects ambiguous or non-contractual values", () => {
    expect(parseLocalizedDecimal("1,234")).toBeNull();
    expect(extractContractAmount("Presupuesto general del programa: USD 9,000.00")).toBeNull();
    expect(extractContractAmount("Salario mensual: USD 1,500.00")).toBeNull();
    expect(extractContractAmount("Monto del contrato: 1500.00")).toBeNull();
    expect(
      extractContractAmount(
        "Monto del contrato: USD 1,500.00\nValor estimado del contrato: USD 2,000.00",
      ),
    ).toBeNull();
  });

  it("requires one clearly contextualized amount and currency", () => {
    expect(extractContractAmount("Monto del contrato: USD 1,50")).toEqual({
      amount: "1.50",
      currency: "USD",
      evidence: "Monto del contrato: USD 1,50",
    });
  });
});

describe("deadline scanning", () => {
  it("uses El Salvador end-of-day only when no time is present", () => {
    expect(scanDeadlineDates("Fecha límite: 31/12/2027")).toMatchObject({
      status: "SINGLE",
      deadlines: [{ iso: "2028-01-01T05:59:59.999Z", precision: "DATE" }],
    });
  });

  it("preserves explicit local and zoned times", () => {
    expect(scanDeadlineDates("Recepción de ofertas: 31/12/2027 a las 14:30")).toMatchObject({
      deadlines: [{ iso: "2027-12-31T20:30:00.000Z", precision: "LOCAL_TIME" }],
    });
    expect(scanDeadlineDates("Proposals due: 2027-12-31T14:30-05:00")).toMatchObject({
      deadlines: [{ iso: "2027-12-31T19:30:00.000Z", precision: "ZONED_TIME" }],
    });
  });

  it("does not choose silently among conflicting deadlines", () => {
    expect(
      scanDeadlineDates("Fecha límite: 30/12/2027\nDeadline: 2027-12-31"),
    ).toMatchObject({ status: "AMBIGUOUS" });
    expect(
      scanDeadlineDates(
        "Fecha límite original: 30/12/2027; fecha extendida: 31/12/2027",
      ),
    ).toMatchObject({ status: "AMBIGUOUS" });
  });

  it("finds a labeled deadline on the following line", () => {
    expect(scanDeadlineDates("Fecha límite:\n31/12/2027 a las 14:30")).toMatchObject({
      status: "SINGLE",
      deadlines: [{ iso: "2027-12-31T20:30:00.000Z" }],
    });
  });
});

describe("buyer role and query relation", () => {
  it("distinguishes procurement from seller marketing", () => {
    expect(classifyOpportunityRole("Invita a proveedores a presentar ofertas")).toBe("BUYER");
    expect(
      classifyOpportunityRole(
        "Ofrecemos software. Solicite una cotización con nosotros y conozca nuestros precios.",
      ),
    ).toBe("SELLER");
    expect(
      classifyOpportunityRole(
        "Ofrecemos software y nuestros servicios incluyen preparar solicitudes de propuestas. Invitamos a proveedores a presentar ofertas.",
      ),
    ).toBe("AMBIGUOUS");
    expect(classifyOpportunityRole("Publicamos una propuesta de valor")).toBe("AMBIGUOUS");
  });

  it("matches short tokens as whole words and requires query coverage", () => {
    const relation = (query: string, text: string, title = "Convocatoria") =>
      evaluateQueryRelation({
        query,
        title,
        scope: text,
        documentText: text,
        minCoverage: 0.6,
      });
    expect(relation("IA", "Consultoría de inteligencia artificial").related).toBe(true);
    expect(relation("IA", "Consultoría financiera diaria").related).toBe(false);
    expect(relation("API", "Desarrollo de API para integración").related).toBe(true);
    expect(relation("software", "Mantenimiento de software").related).toBe(true);
    expect(relation("servicios digitales", "Convocatoria para servicios digitales").related).toBe(true);
    expect(relation("tecnología", "La organización trabaja con tecnología").related).toBe(false);
    expect(relation("desarrollo software", "Software para desarrollo de plataforma").related).toBe(true);
    expect(
      evaluateQueryRelation({
        query: "software",
        title: "Convocatoria",
        scope: "Gestión administrativa",
        documentText: "Fundación Software invita a proveedores",
        minCoverage: 0.6,
      }).related,
    ).toBe(false);
  });
});
