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
      pip: {
        loadStatus: "EMPTY",
        source: null,
        sourceNotice: null,
        offerDeadlineLabel: null,
        deadlineMismatch: false,
        emptyMessage:
          "COMPRASAL no publicó el Plan de Implementación para este proceso.",
        showOfficialDuration: false,
        stages: [],
      },
    },
  };
}

function pipView(): HomeSearchResultDetailView {
  const view = unavailableView();
  if (!view.comprasal) throw new Error("fixture must be COMPRASAL");
  view.comprasal.pip = {
    loadStatus: "AVAILABLE",
    source: "REMOTE_DETAIL",
    sourceNotice: null,
    offerDeadlineLabel: "20 de julio de 2026, 10:00 a. m.",
    deadlineMismatch: false,
    emptyMessage: null,
    showOfficialDuration: false,
    stages: [
      {
        name: "Recepción de ofertas",
        order: 1,
        startsAtLabel: "20 de julio de 2026, 8:00 a. m.",
        endsAtLabel: "20 de julio de 2026, 10:00 a. m.",
        officialDurationLabel: null,
        temporalStatus: "CURRENT",
        temporalStatusLabel: "Etapa actual según fechas",
        isCurrent: true,
      },
    ],
  };
  return view;
}

describe("COMPRASAL home result detail UI", () => {
  it("keeps base data and the official link when the report is unavailable", () => {
    const html = renderToStaticMarkup(
      createElement(HomeSearchResultDetail, {
        detail: unavailableView(),
      }),
    );

    expect(html).toContain("Proceso almacenado");
    expect(html).not.toContain("Volver a resultados");
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
        detail: unavailableView(),
      }),
    );

    expect(html).not.toContain(">Oferentes<");
    expect(html).not.toContain(">Etapas reportadas<");
    expect(html).not.toContain(">Pagos reportados<");
    expect(html).not.toContain(">Beneficiarios reportados<");
    expect(html).not.toContain("undefined");
  });

  it("renders a semantic desktop PIP table and a mobile ordered presentation", () => {
    const html = renderToStaticMarkup(
      createElement(HomeSearchResultDetail, {
        detail: pipView(),
      }),
    );
    expect(html).toContain("Plan de Implementación del Proceso");
    expect(html).toContain("<table");
    expect(html).toContain('scope="col"');
    expect(html).toContain("hidden overflow-x-auto");
    expect(html).toContain('<ol class="mt-4 space-y-3 md:hidden">');
    expect(html).toContain("Recepción de ofertas");
  });

  it("makes the current stage accessible without relying only on color", () => {
    const html = renderToStaticMarkup(
      createElement(HomeSearchResultDetail, {
        detail: pipView(),
      }),
    );
    expect(html).toContain('aria-current="step"');
    expect(html).toContain("Etapa actual según fechas");
  });

  it("does not render an invented official duration", () => {
    const html = renderToStaticMarkup(
      createElement(HomeSearchResultDetail, {
        detail: pipView(),
      }),
    );
    expect(html).not.toContain("Duración oficial");
  });

  it("shows the required empty PIP state", () => {
    const html = renderToStaticMarkup(
      createElement(HomeSearchResultDetail, {
        detail: unavailableView(),
      }),
    );
    expect(html).toContain(
      "COMPRASAL no publicó el Plan de Implementación para este proceso.",
    );
  });

  it("keeps the initial summary fixed and scrolls only the detail body", () => {
    const html = renderToStaticMarkup(
      createElement(HomeSearchResultDetail, {
        detail: pipView(),
      }),
    );

    expect(html).toContain('data-testid="home-search-result-detail-header"');
    expect(html).toContain('data-testid="home-search-result-detail-scroll"');
    expect(html).toContain("shrink-0 border-b border-surface-border");
    expect(html).toContain("min-h-0 flex-1 overflow-y-auto");
    expect(html).toContain("Plan de Implementación del Proceso");
    expect(html.indexOf("home-search-result-detail-header")).toBeLessThan(
      html.indexOf("home-search-result-detail-scroll"),
    );
    expect(html.indexOf("C-135317")).toBeLessThan(
      html.indexOf("Plan de Implementación del Proceso"),
    );
  });
});
