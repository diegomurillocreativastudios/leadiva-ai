import { describe, expect, it } from "vitest";

import { isGenericOrListingSourceUrl } from "./source-url-specificity";

describe("isGenericOrListingSourceUrl", () => {
  it("flags homepages and tender indexes", () => {
    expect(isGenericOrListingSourceUrl("https://www.comprasal.gob.sv/")).toBe(
      true,
    );
    expect(
      isGenericOrListingSourceUrl(
        "https://www.mineducyt.gob.sv/index.php/compras-y-contrataciones/licitaciones-publicas",
      ),
    ).toBe(true);
    expect(
      isGenericOrListingSourceUrl("https://buyer.example/procurement"),
    ).toBe(true);
  });

  it("flags category, search, tag, archive and contractor-profile pages", () => {
    expect(
      isGenericOrListingSourceUrl(
        "https://tendios.com/licitaciones/desarrollo-software",
      ),
    ).toBe(true);
    expect(
      isGenericOrListingSourceUrl("https://buyer.example/search?q=software"),
    ).toBe(true);
    expect(
      isGenericOrListingSourceUrl("https://buyer.example/tags/software"),
    ).toBe(true);
    expect(
      isGenericOrListingSourceUrl(
        "https://buyer.example/perfil-del-contratante",
      ),
    ).toBe(true);
  });

  it("accepts process-specific convocatoria URLs", () => {
    expect(
      isGenericOrListingSourceUrl("https://www.comprasal.gob.sv/proceso/12345"),
    ).toBe(false);
    expect(
      isGenericOrListingSourceUrl(
        "https://minsal.example/proveedores/licitacion-ece-2026",
      ),
    ).toBe(false);
    expect(
      isGenericOrListingSourceUrl(
        "https://buyer.example/procurement/rfp-plataforma-2026",
      ),
    ).toBe(false);
  });

  it("treats invalid URLs as non-specific", () => {
    expect(isGenericOrListingSourceUrl("not-a-url")).toBe(true);
  });
});
