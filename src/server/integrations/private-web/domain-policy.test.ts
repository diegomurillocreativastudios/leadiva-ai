import { describe, expect, it } from "vitest";

import { evaluatePrivateWebSource } from "./domain-policy";

const opportunity =
  "Solicitud de propuestas para contratar proveedor de desarrollo de software";

describe("private web domain policy", () => {
  it.each([
    ["https://comprasal.gob.sv/proceso/1", "PUBLIC_SECTOR_DOMAIN"],
    ["https://www.mh.gob.sv/convocatoria", "PUBLIC_SECTOR_DOMAIN"],
    ["https://linkedin.com/jobs/view/1", "LINKEDIN_BLOCKED"],
    ["https://tecoloco.com/empleos/1", "JOB_BOARD"],
    ["https://empresa.com/careers/backend", "JOB_PAGE"],
    ["https://scribd.com/document/1", "AGGREGATOR"],
    ["https://facebook.com/empresa/posts/1", "SOCIAL_MEDIA"],
    ["https://empresa.com/", "HOMEPAGE"],
    ["https://empresa.com/search?q=rfp", "GENERIC_LISTING"],
    ["https://empresa.com/directorio/proveedores", "GENERIC_LISTING"],
  ])("rejects %s as %s", (url, reason) => {
    expect(evaluatePrivateWebSource({ url, text: opportunity })).toEqual({
      allowed: false,
      reason,
    });
  });

  it("keeps specific com.sv, org.sv and edu.sv opportunities", () => {
    for (const url of [
      "https://empresa.com.sv/proveedores/rfp-2026",
      "https://fundacion.org.sv/convocatorias/tdr-software.pdf",
      "https://universidad.edu.sv/compras/rfq-sistemas",
    ]) {
      expect(evaluatePrivateWebSource({ url, text: opportunity })).toEqual({
        allowed: true,
      });
    }
  });

  it("rejects marketing and pages without a concrete call", () => {
    expect(
      evaluatePrivateWebSource({
        url: "https://agencia.com.sv/servicios/software",
        text: "Somos una agencia. Nuestros servicios ayudan a tu empresa. Contáctanos.",
      }),
    ).toMatchObject({ allowed: false, reason: "MARKETING_PAGE" });
    expect(
      evaluatePrivateWebSource({
        url: "https://empresa.com.sv/noticias/transformacion",
        text: "La empresa anunció su estrategia de transformación digital.",
      }),
    ).toMatchObject({ allowed: false, reason: "NO_OPPORTUNITY_SIGNAL" });
  });
});
