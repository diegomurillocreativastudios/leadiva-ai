import { describe, expect, it } from "vitest";

import { homeSearchResultSector } from "@/lib/home-search-result-sector";

describe("homeSearchResultSector", () => {
  it("labels public-sector filtered candidates as Público", () => {
    expect(
      homeSearchResultSector({ reasonCode: "PUBLIC_SECTOR", category: null }),
    ).toBe("Público");
  });

  it("uses an explicit PUBLIC or PRIVATE category when present", () => {
    expect(
      homeSearchResultSector({ reasonCode: null, category: "PUBLIC" }),
    ).toBe("Público");
    expect(
      homeSearchResultSector({ reasonCode: null, category: "PRIVATE" }),
    ).toBe("Privado");
  });

  it("defaults private-web candidates to Privado", () => {
    expect(
      homeSearchResultSector({ reasonCode: null, category: "SOFTWARE" }),
    ).toBe("Privado");
  });
});
