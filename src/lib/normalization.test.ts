import { describe, expect, it } from "vitest";

import {
  isEmailDomainAllowed,
  parseAllowedEmailDomains,
} from "@/lib/email-domains";
import {
  inferCategoryFromText,
  normalizeUrl,
  resolveOpportunityCategory,
  slugify,
} from "@/lib/normalization";
import { mapComprasalProcessToSearchResult } from "@/server/integrations/comprasal/mapper";

describe("normalizeUrl", () => {
  it("strips tracking params and trailing slash", () => {
    expect(
      normalizeUrl(
        "https://Example.com/path/?utm_source=x&utm_medium=y&id=1",
      ),
    ).toBe("https://example.com/path?id=1");
  });
});

describe("slugify", () => {
  it("creates url-safe slugs", () => {
    expect(slugify("Ministerio de Hacienda")).toBe("ministerio-de-hacienda");
  });
});

describe("inferCategoryFromText", () => {
  it("detects software and AI", () => {
    expect(inferCategoryFromText("Desarrollo de software web")).toBe(
      "SOFTWARE",
    );
    expect(
      inferCategoryFromText("Plataforma con inteligencia artificial"),
    ).toBe("AI");
  });

  it("does not treat bare desarrollo as software", () => {
    expect(
      inferCategoryFromText(
        "Adquisición de insumos para el desarrollo de Cursos de Cosmetología",
      ),
    ).toBe("OTHER");
  });

  it("classifies consulting and IT separately", () => {
    expect(inferCategoryFromText("Servicios de consultoría de software")).toBe(
      "CONSULTING",
    );
    expect(inferCategoryFromText("Renovación de infraestructura de redes IT")).toBe(
      "IT",
    );
  });

  it("detects desarrollo/mantenimiento de software, servicios profesionales TI y cloud", () => {
    expect(
      inferCategoryFromText("Servicios de desarrollo de software institucional"),
    ).toBe("SOFTWARE");
    expect(
      inferCategoryFromText("Contrato de mantenimiento de software legacy"),
    ).toBe("SOFTWARE");
    expect(
      inferCategoryFromText("Mantención de Software corporativo"),
    ).toBe("SOFTWARE");
    expect(
      inferCategoryFromText("Servicios Profesionales TI para banca"),
    ).toBe("CONSULTING");
    expect(inferCategoryFromText("Cloud Computing managed services")).toBe(
      "IT",
    );
  });
});

describe("resolveOpportunityCategory", () => {
  it("re-infers from text when the model emitted OTHER", () => {
    expect(
      resolveOpportunityCategory({
        category: "OTHER",
        text: "Convenio Marco para Servicios de Desarrollo y Mantención de Software",
      }),
    ).toBe("SOFTWARE");
  });
});

describe("mapComprasalProcessToSearchResult", () => {
  it("maps a process to a search result", () => {
    const mapped = mapComprasalProcessToSearchResult({
      recordKind: "PROCESS",
      externalId: "123",
      awardId: null,
      processId: "123",
      codigoProceso: null,
      nombreProceso: "Adquisición de sistema de gestión",
      descripcion: "Software institucional",
      estado: null,
      institucionNombre: "Ministerio de Salud",
      proveedorNombre: null,
      monto: null,
      fechaAdjudicacion: null,
      fechaPublicacion: "2026-01-15",
      fechaInicio: null,
      fechaLimiteOfertas: null,
      fechaRecepcionOfertas: null,
      fechaCierre: null,
      numeroLote: null,
      modalidad: null,
      url: null,
      raw: {},
    });

    expect(mapped.sourceType).toBe("COMPRASAL");
    expect(mapped.externalId).toBe("123");
    expect(mapped.countryCode).toBe("SV");
    expect(mapped.category).toBe("SOFTWARE");
    expect(mapped.organizationName).toBe("Ministerio de Salud");
    expect(mapped.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(mapped.deadlineAt).toBeNull();
    expect(mapped.estimatedAmount).toBeNull();
    expect(mapped.amountStatus).toBe("NOT_PUBLISHED");
    expect(mapped.sourceUrl).toBe("https://www.comprasal.gob.sv/proceso/123");
    expect(mapped.sourceIsSpecific).toBe(true);
  });

  it("persists award amount as estimatedAmount", () => {
    const mapped = mapComprasalProcessToSearchResult({
      recordKind: "AWARD",
      externalId: "proc-9",
      awardId: "aw-1",
      processId: "proc-9",
      codigoProceso: "LP-01",
      nombreProceso: "Sistema de certificacion",
      descripcion: "Monto: $145,000.00",
      estado: null,
      institucionNombre: "MINEDUCYT",
      proveedorNombre: null,
      monto: 145000,
      fechaAdjudicacion: null,
      fechaPublicacion: null,
      fechaInicio: null,
      fechaLimiteOfertas: null,
      fechaRecepcionOfertas: null,
      fechaCierre: null,
      numeroLote: null,
      modalidad: null,
      url: "https://www.comprasal.gob.sv/proceso/proc-9",
      raw: {},
    });

    expect(mapped.estimatedAmount).toBe("145000.00");
    expect(mapped.currency).toBe("USD");
    expect(mapped.amountStatus).toBe("PUBLISHED");
    expect(mapped.sourceIsSpecific).toBe(true);
  });

  it("does not fall back to the COMPRASAL homepage", () => {
    const mapped = mapComprasalProcessToSearchResult({
      recordKind: "PROCESS",
      externalId: "",
      awardId: null,
      processId: null,
      codigoProceso: null,
      nombreProceso: "Proceso sin id",
      descripcion: null,
      estado: null,
      institucionNombre: null,
      proveedorNombre: null,
      monto: null,
      fechaAdjudicacion: null,
      fechaPublicacion: null,
      fechaInicio: null,
      fechaLimiteOfertas: null,
      fechaRecepcionOfertas: null,
      fechaCierre: null,
      numeroLote: null,
      modalidad: null,
      url: null,
      raw: {},
    });

    expect(mapped.sourceUrl).not.toBe("https://www.comprasal.gob.sv/");
    expect(mapped.sourceIsSpecific).toBe(false);
  });

  it("maps offer deadline from COMPRASAL fields", () => {
    const mapped = mapComprasalProcessToSearchResult({
      recordKind: "PROCESS",
      externalId: "9",
      awardId: null,
      processId: "9",
      codigoProceso: null,
      nombreProceso: "Consultoría",
      descripcion: null,
      estado: null,
      institucionNombre: null,
      proveedorNombre: null,
      monto: null,
      fechaAdjudicacion: null,
      fechaPublicacion: null,
      fechaInicio: null,
      fechaLimiteOfertas: "2026-08-01T00:00:00.000Z",
      fechaRecepcionOfertas: null,
      fechaCierre: null,
      numeroLote: null,
      modalidad: null,
      url: null,
      raw: {},
    });

    expect(mapped.deadlineAt?.toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });
});

describe("email domains", () => {
  it("allows Creativa domains", () => {
    const allowed = parseAllowedEmailDomains(
      "creativastudios.us,creativaconsultores.com,creativatechstudios.com",
    );
    expect(isEmailDomainAllowed("ana@creativastudios.us", allowed)).toBe(true);
    expect(isEmailDomainAllowed("bob@gmail.com", allowed)).toBe(false);
  });
});
