import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HomeSearchResultDetail } from "./home-search-result-detail";
import type { HomeSearchResultDetailView } from "@/lib/home-search-result-detail";

function unavailableView(): HomeSearchResultDetailView {
  return {
    title: "Proceso almacenado",
    description: "Los datos base permanecen visibles",
    websiteUrl: "https://www.comprasal.gob.sv/procesos-publicos/135317",
    websiteLabel: "Ver proceso en COMPRASAL",
    deadlineLabel: "01 ago 2026, 05:59 p. m.",
    amountLabel: "Monto no publicado",
    comprasal: {
      loadStatus: "NOT_AVAILABLE",
      code: "C-135317",
      institution: "Institución pública",
      processStatus: "Publicado",
      contractingMethod: "Comparación de precios",
      publishedAtLabel: null,
      deadlineAtLabel: "01 ago 2026, 05:59 p. m.",
      scoreLabel: "82/100",
      summaryFields: [],
      relevantDates: [],
      bidders: [],
      stages: [],
      payments: [],
      beneficiaries: [],
      emptyMessage:
        "El informe de adjudicación todavía no está disponible.",
    },
  };
}

describe("COMPRASAL home result detail UI", () => {
  it("keeps base data and the official link when the report is unavailable", () => {
    const html = renderToStaticMarkup(
      createElement(HomeSearchResultDetail, {
        executionId: "00000000-0000-4000-8000-000000000201",
        detail: unavailableView(),
      }),
    );

    expect(html).toContain("Proceso almacenado");
    expect(html).toContain("C-135317");
    expect(html).toContain("Institución pública");
    expect(html).toContain("El informe de adjudicación todavía no está disponible.");
    expect(html).toContain("Ver proceso en COMPRASAL");
    expect(html).toContain(
      'href="https://www.comprasal.gob.sv/procesos-publicos/135317"',
    );
  });

  it("hides empty report sections", () => {
    const html = renderToStaticMarkup(
      createElement(HomeSearchResultDetail, {
        executionId: "00000000-0000-4000-8000-000000000201",
        detail: unavailableView(),
      }),
    );

    expect(html).not.toContain(">Oferentes<");
    expect(html).not.toContain(">Etapas reportadas<");
    expect(html).not.toContain(">Pagos reportados<");
    expect(html).not.toContain(">Beneficiarios reportados<");
    expect(html).not.toContain("undefined");
  });
});
