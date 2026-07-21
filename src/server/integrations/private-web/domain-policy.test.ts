import { describe, expect, it } from "vitest";

import { evaluatePrivateWebSource } from "./domain-policy";

const opportunity =
  "Solicitud de propuestas para contratar proveedor de desarrollo de software";

describe("private web domain policy", () => {
  it.each([
    ["https://comprasal.gob.sv/proceso/1", "PUBLIC_SECTOR"],
    ["https://www.mh.gob.sv/convocatoria", "PUBLIC_SECTOR"],
    ["https://www.ues.edu.sv/convocatoria", "PUBLIC_SECTOR"],
    ["https://www.minfin.gob.gt/convocatoria", "FOREIGN_PUBLIC_SECTOR"],
    ["https://www.usa.gov/contracts/software", "FOREIGN_PUBLIC_SECTOR"],
    ["https://www.un.org/procurement/software", "INTERGOVERNMENTAL"],
    ["https://www.worldbank.org/procurement/software", "INTERGOVERNMENTAL"],
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
      "https://asociacion.org.sv/compras/rfq-sistemas",
      "https://fundacion.org/elsalvador/rfp-software",
    ]) {
      expect(evaluatePrivateWebSource({ url, text: opportunity })).toEqual({
        allowed: true,
      });
    }
  });

  it("does not classify private NGOs, foundations or associations as public", () => {
    for (const organization of [
      "Fundación Empresarial invita a presentar ofertas",
      "Asociación Salvadoreña solicita propuestas",
      "ONG privada invita a proveedores",
    ]) {
      expect(
        evaluatePrivateWebSource({
          url: "https://organizacion.org.sv/convocatorias/software",
          title: organization,
          text: `${organization}. ${opportunity}`,
        }),
      ).toEqual({ allowed: true });
    }
  });

  it.each([
    [
      "https://portal.example.org/convocatoria",
      "Ministerio de Educación de Guatemala solicita propuestas",
      "FOREIGN_PUBLIC_SECTOR",
    ],
    [
      "https://portal.example.org/convocatoria",
      "Banco Interamericano de Desarrollo solicita propuestas",
      "INTERGOVERNMENTAL",
    ],
    [
      "https://portal.example.org/convocatoria",
      "Universidad de El Salvador solicita propuestas",
      "PUBLIC_SECTOR",
    ],
  ])("recognizes institutional buyers beyond their TLD", (url, text, reason) => {
    expect(evaluatePrivateWebSource({ url, text })).toEqual({
      allowed: false,
      reason,
    });
  });

  it("allows the specific Educo PDF but rejects its redirected homepage", () => {
    expect(
      evaluatePrivateWebSource({
        url: "https://educo.org.sv/wp-content/uploads/2021/05/TDR-Lineas-de-base-4-proyectos-2021.pdf",
        text: opportunity,
      }),
    ).toEqual({ allowed: true });
    expect(
      evaluatePrivateWebSource({
        url: "https://sv.educo.org/",
        text: opportunity,
      }),
    ).toEqual({ allowed: false, reason: "HOMEPAGE" });
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
