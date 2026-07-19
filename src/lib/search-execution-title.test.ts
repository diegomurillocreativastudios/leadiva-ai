import { describe, expect, it } from "vitest";

import { buildSearchExecutionTitle } from "@/lib/search-execution-title";

describe("buildSearchExecutionTitle", () => {
  const at = new Date("2026-07-19T23:26:00.000Z");

  it("returns null for empty or too-short queries", () => {
    expect(
      buildSearchExecutionTitle({
        userQuery: undefined,
        sourceType: "COMPRASAL",
        at,
      }),
    ).toBeNull();
    expect(
      buildSearchExecutionTitle({
        userQuery: null,
        sourceType: "COMPRASAL",
        at,
      }),
    ).toBeNull();
    expect(
      buildSearchExecutionTitle({
        userQuery: "",
        sourceType: "COMPRASAL",
        at,
      }),
    ).toBeNull();
    expect(
      buildSearchExecutionTitle({
        userQuery: "  ab  ",
        sourceType: "COMPRASAL",
        at,
      }),
    ).toBeNull();
  });

  it("formats comprasal titles as source - query - dd/mm/yyyy hh:mm", () => {
    expect(
      buildSearchExecutionTitle({
        userQuery: "  desarrollo   de   software  ",
        sourceType: "COMPRASAL",
        at,
      }),
    ).toBe("Comprasal - desarrollo de software - 19/07/2026 17:26");
  });

  it("formats private and linkedin source labels", () => {
    expect(
      buildSearchExecutionTitle({
        userQuery: "RFP consultoría",
        sourceType: "PRIVATE_WEB",
        at,
      }),
    ).toBe("Sector privado - RFP consultoría - 19/07/2026 17:26");

    expect(
      buildSearchExecutionTitle({
        userQuery: "oportunidad LinkedIn",
        sourceType: "LINKEDIN",
        at,
      }),
    ).toBe("LinkedIn - oportunidad LinkedIn - 19/07/2026 17:26");
  });

  it("keeps an already formatted title unchanged", () => {
    const formatted =
      "Comprasal - desarrollo de software - 19/07/2026 17:26";

    expect(
      buildSearchExecutionTitle({
        userQuery: formatted,
        sourceType: "COMPRASAL",
        at: new Date("2026-01-01T00:00:00.000Z"),
      }),
    ).toBe(formatted);
  });

  it("truncates long query segments without dropping the suffix", () => {
    const longQuery = "oportunidad ".repeat(20).trim();
    const title = buildSearchExecutionTitle({
      userQuery: longQuery,
      sourceType: "COMPRASAL",
      at,
      maxLength: 60,
    });

    expect(title).not.toBeNull();
    expect(title!.length).toBeLessThanOrEqual(60);
    expect(title!.startsWith("Comprasal - ")).toBe(true);
    expect(title!.endsWith(" - 19/07/2026 17:26")).toBe(true);
    expect(title!.includes("…")).toBe(true);
  });
});
